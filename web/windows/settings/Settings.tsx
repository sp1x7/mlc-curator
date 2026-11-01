// Settings window: one area at a time, its fields in groups, one save per area.
//
// The field map in `shared/types/settings.ts` builds the form, so the keys of that
// map are the keys on screen. Changes sit in a draft until the area is saved;
// leaving an area with a draft asks first and drops it. A secret field starts empty,
// and a value reaches the server once it was typed.
//
// Below the fields: the run of that area (board sign-in, board snapshot,
// library scan) with the numbers of its last run, and the save.

import type { SettingField, SettingsArea } from "@shared/types/settings";
import {
  NAME_PLACEHOLDERS,
  SETTING_FIELDS,
  SETTINGS_AREAS,
  settingGroupsOf,
  settingKeysOf,
} from "@shared/types/settings";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KEYS } from "@web/lib/queries";
import { useRef, useState } from "react";
import { AreaList } from "./AreaList";
import { settingsApi } from "./api";
import { Field } from "./Field";
import { FolderPicker } from "./FolderPicker";
import { AREA_LABELS, GROUP_LABELS, TEXT } from "./labels";

// The look of a footer button.
const button =
  "shrink-0 cursor-pointer rounded-lg border border-hair-8 bg-glass-3 px-2 py-1 text-[11px] transition hover:bg-white/8 disabled:cursor-default disabled:opacity-40";
// The save button.
const primary = `${button} border-acc1/30 bg-acc1/16 text-acc1 hover:bg-acc1/24`;
// The look of a placeholder chip.
const chip =
  "cursor-pointer rounded-md border border-hair-8 bg-glass-3 px-[6px] py-[2px] font-mono text-[10px] transition hover:bg-white/8";

// The area ids in the order of the field map.
const AREAS = SETTINGS_AREAS.map((area) => area.id);

/** `14:32` out of an ISO stamp; null stays empty. */
function clock(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** The window: area list, the fields of one area, and the run row of that area. */
export default function Settings() {
  const client = useQueryClient();

  const [area, setArea] = useState<SettingsArea>("credentials");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [browse, setBrowse] = useState<{ key: string; start: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The stored values, the board session, and the two runs that report progress.
  const saved = useQuery({ queryKey: KEYS.settings.values, queryFn: settingsApi.values });
  const session = useQuery({ queryKey: KEYS.settings.session, queryFn: settingsApi.session });
  const sync = useQuery({
    queryKey: KEYS.settings.sync,
    queryFn: settingsApi.sync,
    refetchInterval: (query) => (query.state.data?.sync.running ? 1000 : false),
  });
  const scan = useQuery({
    queryKey: KEYS.settings.scan,
    queryFn: settingsApi.scan,
    refetchInterval: (query) => (query.state.data?.stand.scan.running ? 1000 : false),
  });

  const keys = settingKeysOf(area);
  const groups = settingGroupsOf(area);

  /** Row value, or the value the field starts with while there is no row. */
  const stored = (key: string): string => {
    const field: SettingField = SETTING_FIELDS[key] ?? { key, kind: "text" };
    if (field.kind === "secret") return "";
    return saved.data?.values[key] ?? field.initial ?? (field.kind === "switch" ? "0" : "");
  };

  /** What the field shows: the draft once it was touched, the row before that. */
  const shown = (key: string): string => draft[key] ?? stored(key);

  // The keys whose value differs from the row; a secret counts once it holds text.
  const changed = keys.filter((key) => {
    const field: SettingField = SETTING_FIELDS[key] ?? { key, kind: "text" };
    return field.kind === "secret" ? (draft[key] ?? "") !== "" : shown(key) !== stored(key);
  });

  /** Switches area, asking first while a draft stands. */
  const pick = (next: SettingsArea): void => {
    if (next === area) return;
    if (changed.length > 0 && !window.confirm(TEXT.discard)) return;
    setDraft({});
    setNotice(null);
    setError(null);
    setBrowse(null);
    setArea(next);
  };

  /** Puts one value in the draft. */
  const write = (key: string, value: string): void => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  /** Level the picker opens on: a subfolder starts inside the download folder. */
  const startOf = (key: string): string => {
    if (key.startsWith("subdir_")) return shown("download_folder") || "/";
    return shown(key) || "/";
  };

  /** A folder under the download folder is kept as its name below it. */
  const picked = (key: string, path: string): string => {
    if (!key.startsWith("subdir_")) return path;
    const root = shown("download_folder").replace(/\/$/, "");
    return root !== "" && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
  };

  /** Sends the changed keys, then clears the draft. */
  const store = async (): Promise<void> => {
    setError(null);
    const values: Record<string, string> = {};
    for (const key of changed) values[key] = shown(key);

    try {
      const fresh = await settingsApi.save({ values });
      client.setQueryData(["settings"], fresh);
      setDraft({});
      setNotice(`${Object.keys(values).length} ${TEXT.saved}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  /** Starts one server run and reloads its stand afterwards. */
  const run = async (start: () => Promise<unknown>, again: () => void): Promise<void> => {
    setError(null);
    setNotice(null);
    try {
      await start();
      again();
    } catch {
      // A run that failed leaves the button ready and the last numbers alone.
    }
  };

  // Placeholder chips land in the format field the cursor last rested in.
  const formats = useRef(new Map<string, HTMLInputElement>());
  const lastFormat = useRef<string | null>(null);

  /** Puts a placeholder at the cursor of the format field that had focus last. */
  const insert = (placeholder: string): void => {
    const key = lastFormat.current;
    if (key === null) return;

    const node = formats.current.get(key);
    const at = node?.selectionStart ?? shown(key).length;
    const next = `${shown(key).slice(0, at)}${placeholder}${shown(key).slice(at)}`;

    write(key, next);
    requestAnimationFrame(() => {
      const field = formats.current.get(key);
      if (!field) return;
      field.focus();
      field.setSelectionRange(at + placeholder.length, at + placeholder.length);
    });
  };

  // The stand of the board snapshot and of the library pass.
  const board = sync.data?.sync ?? null;
  const pass = scan.data?.stand.scan ?? null;

  return (
    <div className="flex h-full min-h-0">
      {/* The area list, with the dot of open keys. */}
      <AreaList areas={AREAS} active={area} open={changed.length} onPick={pick} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* The area name and the count of open keys. */}
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-hair-8 px-3">
          <span className="text-[11px]">{AREA_LABELS[area]}</span>
          {changed.length > 0 && (
            <span className="text-[11px] text-muted-foreground">{changed.length} open</span>
          )}
        </div>

        {/* The folder picker in place of the fields, while it is open. */}
        {browse !== null ? (
          <FolderPicker
            start={browse.start}
            onPick={(path) => {
              write(browse.key, picked(browse.key, path));
              setBrowse(null);
            }}
            onCancel={() => setBrowse(null)}
          />
        ) : (
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto py-2">
            {groups.map((group) => (
              <section key={group.id} className="mb-1">
                <div className="flex h-[26px] items-center border-t border-hair-8 bg-glass-2 px-3">
                  <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    {GROUP_LABELS[group.id] ?? group.id}
                  </span>
                </div>

                {group.fields.map((field) => (
                  <Field
                    key={field.key}
                    field={field}
                    value={shown(field.key)}
                    secretSet={saved.data?.secrets[field.key] ?? false}
                    onChange={(next) => write(field.key, next)}
                    onBrowse={() => setBrowse({ key: field.key, start: startOf(field.key) })}
                    formatRef={
                      group.placeholders
                        ? (node) => {
                            if (node) formats.current.set(field.key, node);
                            else formats.current.delete(field.key);
                          }
                        : undefined
                    }
                    onFormatFocus={
                      group.placeholders ? () => (lastFormat.current = field.key) : undefined
                    }
                  />
                ))}

                {/* The chips that fill a placeholder into the format field. */}
                {group.placeholders && (
                  <div className="flex flex-wrap gap-[5px] px-3 pt-1">
                    {NAME_PLACEHOLDERS.map((placeholder) => (
                      <button
                        key={placeholder}
                        type="button"
                        className={chip}
                        onClick={() => insert(placeholder)}
                      >
                        {placeholder}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}

        {/* The run row of the area, the answer of the last action and the save. */}
        <div className="flex h-[42px] shrink-0 items-center gap-2 border-t border-hair-8 bg-glass-2 px-3">
          {area === "credentials" && (
            <div className="contents">
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {session.data?.cookieSet ? TEXT.signedIn(session.data.user) : TEXT.signedOut}
              </span>
              <button
                type="button"
                className={button}
                onClick={() =>
                  void run(settingsApi.signIn, () => {
                    void client.invalidateQueries({ queryKey: KEYS.settings.session });
                    setNotice(TEXT.signInDone);
                  })
                }
              >
                {TEXT.signIn}
              </button>
              <button
                type="button"
                className={button}
                onClick={() =>
                  void run(settingsApi.signOut, () => {
                    void client.invalidateQueries({ queryKey: KEYS.settings.session });
                    setNotice(TEXT.signOutDone);
                  })
                }
              >
                {TEXT.signOut}
              </button>
            </div>
          )}

          {area === "board" && (
            <div className="contents">
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {board
                  ? `${board.forumsDone}/${board.forumsTotal} forums · ${board.seen} threads · ${board.added} new · ${clock(board.finishedAt)}`
                  : ""}
              </span>
              <button
                type="button"
                className={button}
                disabled={board?.running === true}
                onClick={() => void run(settingsApi.startSync, () => void sync.refetch())}
              >
                {board?.running ? TEXT.syncRunning : TEXT.syncNow}
              </button>
            </div>
          )}

          {area === "library" && (
            <div className="contents">
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {pass
                  ? `${pass.folders} folders · ${pass.files} files · ${pass.titles} titles · ${clock(scan.data?.stand.scannedAt ?? null)}`
                  : ""}
              </span>
              <button
                type="button"
                className={button}
                disabled={pass?.running === true}
                onClick={() => void run(settingsApi.startScan, () => void scan.refetch())}
              >
                {pass?.running ? TEXT.scanRunning : TEXT.scanNow}
              </button>
            </div>
          )}

          {area === "upgrades" && (
            <button
              type="button"
              className={button}
              onClick={() => void run(settingsApi.startCheck, () => {})}
            >
              {TEXT.checkNow}
            </button>
          )}

          <div className="contents">
            {notice && <span className="shrink-0 text-[11px] text-acc1">{notice}</span>}
            {error && (
              <span className="min-w-0 truncate text-[11px] text-err" title={error}>
                {error}
              </span>
            )}
            <button
              type="button"
              className={`${primary} ml-auto`}
              disabled={changed.length === 0}
              onClick={() => void store()}
            >
              {TEXT.save}
              {changed.length > 0 ? ` (${changed.length})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
