// Folder picker for a path field: one directory level at a time, from the root
// of the server down. The level is the one asked for, so the picker can walk
// up through its parent and back down through its entries.

import { useQuery } from "@tanstack/react-query";
import { KEYS } from "@web/lib/queries";
import { useState } from "react";

import { settingsApi } from "./api";
import { TEXT } from "./labels";

// The look of a picker button.
const button =
  "shrink-0 cursor-pointer rounded-lg border border-hair-8 bg-glass-3 px-2 py-1 text-[11px] transition hover:bg-white/8 disabled:cursor-default disabled:opacity-40";
// The button that carries the choice.
const primary = `${button} border-acc1/30 bg-acc1/16 text-acc1 hover:bg-acc1/24`;

type Props = {
  /** Level the picker opens on. */
  start: string;
  onPick(path: string): void;
  /** Closes the picker with the path left as it was. */
  onCancel(): void;
};

/** One directory level of the server: the way up, the path, and the folders below. */
export function FolderPicker({ start, onPick, onCancel }: Props) {
  const [path, setPath] = useState(start);
  // The level the picker stands on.
  const level = useQuery({
    queryKey: KEYS.settings.fs(path),
    queryFn: () => settingsApi.folder(path),
  });

  // The answer for that level: path, parent and folder names.
  const page = level.data;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-hair-8 px-3">
        <button
          type="button"
          className={button}
          disabled={!page?.parent}
          onClick={() => page?.parent && setPath(page.parent)}
        >
          {TEXT.up}
        </button>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{path}</span>
        <button type="button" className={button} onClick={onCancel}>
          {TEXT.cancel}
        </button>
        <button type="button" className={primary} onClick={() => onPick(path)}>
          {TEXT.choose}
        </button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {level.isFetching && (
          <div className="px-3 py-[5px] text-[11px] text-muted-foreground">{path}</div>
        )}

        {/* One button per folder below the level. */}
        {(page?.dirs ?? []).map((name) => (
          <button
            key={name}
            type="button"
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-[4px] text-left transition hover:bg-white/6"
            onClick={() => setPath(`${page?.path ?? "/"}/${name}`)}
          >
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{name}</span>
          </button>
        ))}

        {!level.isFetching && (page?.dirs.length ?? 0) === 0 && (
          <div className="px-3 py-[5px] text-[11px] text-muted-foreground">
            {path} holds no folder
          </div>
        )}
      </div>
    </div>
  );
}
