import { useEffect, useRef, useState } from "react";

/** A stored value as text; an absent one reads "NULL". */
function shown(value: unknown): string {
  return value === null || value === undefined ? "NULL" : String(value);
}

/** Input field of the edit state; selects its content right away. */
function Editor({
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  onChange(next: string): void;
  onCommit(): void;
  onCancel(): void;
}) {
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    field.current?.select();
  }, []);

  return (
    <input
      ref={field}
      className="min-h-6 w-full rounded-md border border-acc1/60 bg-acc1/10 px-2 py-1 font-mono text-[11px] text-white outline-none"
      spellCheck={false}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onCommit();
        if (event.key === "Escape") onCancel();
      }}
      onBlur={onCommit}
    />
  );
}

type Props = {
  /** Stored value. Unused in draft mode. */
  value?: unknown;
  /** Stores the new value; empty input means null. */
  onSave?(next: unknown): void;
  /**
   * Draft mode for the new row: value and callbacks come from outside, and the cell
   * stays in the edit state until the caller leaves it.
   */
  draft?: {
    value: string;
    onChange(next: string): void;
    onCommit(): void;
    onCancel(): void;
  };
};

/**
 * Editable cell. Monospace, hair border, ellipsis; `NULL` stays dim. One click edits
 * in place, `Enter` or leaving the field stores — empty text stores null — and `Esc`
 * discards.
 */
export default function DataCell({ value, onSave, draft }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");

  if (draft) {
    return (
      <Editor
        value={draft.value}
        onChange={draft.onChange}
        onCommit={draft.onCommit}
        onCancel={draft.onCancel}
      />
    );
  }

  if (editing) {
    return (
      <Editor
        value={text}
        onChange={setText}
        onCommit={() => {
          setEditing(false);
          onSave?.(text.trim() === "" ? null : text);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const empty = value === null || value === undefined;

  return (
    <button
      type="button"
      title={shown(value)}
      className={`min-h-6 w-full cursor-text truncate rounded-md border border-transparent px-2 py-1 text-left font-mono text-[11px] transition ${
        empty ? "text-white/30" : "text-white/85 hover:border-acc1/40 hover:bg-acc1/5"
      }`}
      onClick={() => {
        setText(empty ? "" : String(value));
        setEditing(true);
      }}
    >
      {shown(value)}
    </button>
  );
}
