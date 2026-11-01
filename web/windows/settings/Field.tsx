// One setting: label and key on the left, its control on the right.
//
// A number that switches itself off at 0 shows a checkbox next to the field;
// checking it disables the field, and unticking it puts the number back that
// was there before. A secret field stays empty on screen, and the placeholder
// tells whether the table holds a value.

import type { SettingField } from "@shared/types/settings";
import { type Ref, useEffect, useRef } from "react";

import { FIELD_TEXT, TEXT } from "./labels";

// The look of a value field.
const input =
  "h-[26px] shrink-0 rounded-lg border border-hair-8 bg-glass-3 px-2 text-[11px] outline-none focus:border-acc1/50 disabled:opacity-40";
// Slot behind a number: the unit sits at the same edge in every row.
const unit = "w-[46px] shrink-0 text-[10px] text-muted-foreground";
// The look of a checkbox.
const check = "size-[13px] shrink-0 cursor-pointer accent-acc1";
// The look of a small action button.
const small =
  "shrink-0 cursor-pointer rounded-lg border border-hair-8 bg-glass-3 px-2 py-1 text-[11px] transition hover:bg-white/8";

type Props = {
  field: SettingField;
  /** Value as it stands in the table, or the field's starting value. */
  value: string;
  onChange(next: string): void;
  /** True for a secret key that has a stored value. */
  secretSet?: boolean;
  /** Opens the folder picker for a path field. */
  onBrowse?(): void;
  /** Lets the window insert a placeholder into the last format field used. */
  formatRef?: Ref<HTMLInputElement>;
  /** Notes which format field holds the focus. */
  onFormatFocus?(): void;
};

/** One row of the settings table: label, key and the control of its kind. */
export function Field({
  field,
  value,
  onChange,
  secretSet,
  onBrowse,
  formatRef,
  onFormatFocus,
}: Props) {
  const text = FIELD_TEXT[field.key] ?? { label: field.key };
  // A number field switched off at 0.
  const offValue = field.zeroMeansOff === true && value === "0";

  // Held while a number is switched off, so unticking puts it back.
  const kept = useRef(value);
  useEffect(() => {
    if (!offValue) kept.current = value;
  }, [offValue, value]);

  // The input type the kind asks for.
  const type = field.kind === "number" ? "number" : field.kind === "secret" ? "password" : "text";

  // Field width by kind; the same column edge for every row.
  const width = field.kind === "number" ? "w-[92px]" : "w-[268px]";

  return (
    <div
      className="grid grid-cols-[300px_minmax(0,1fr)] gap-x-3 px-3 py-[3px] transition hover:bg-white/4"
      title={text.hint}
    >
      <div className="flex min-w-0 items-baseline gap-2 py-[4px]">
        <span className="min-w-0 truncate text-[11px]">{text.label}</span>
        <span className="min-w-0 shrink font-mono text-[10px] text-muted-foreground">
          {field.key}
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        {field.kind === "switch" ? (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className={check}
              checked={value === "1"}
              onChange={(event) => onChange(event.target.checked ? "1" : "0")}
            />
          </label>
        ) : (
          <>
            <input
              ref={formatRef}
              type={type}
              className={`${input} ${width}`}
              min={field.min}
              value={offValue ? "0" : value}
              disabled={offValue}
              placeholder={
                field.kind === "secret" ? (secretSet ? TEXT.set : TEXT.notSet) : undefined
              }
              onFocus={onFormatFocus}
              onChange={(event) => onChange(event.target.value)}
            />

            <span className={unit}>{text.unit ?? ""}</span>

            {field.zeroMeansOff && (
              <label className="flex shrink-0 items-center" title={TEXT.off}>
                <input
                  type="checkbox"
                  className={check}
                  checked={offValue}
                  onChange={(event) =>
                    onChange(event.target.checked ? "0" : kept.current === "0" ? "" : kept.current)
                  }
                />
              </label>
            )}

            {field.kind === "path" && (
              <button type="button" className={small} onClick={onBrowse}>
                {TEXT.browse}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
