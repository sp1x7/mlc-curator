import type { TableInfo } from "@shared/types/db";

/** Every table, the picked one and the picker. */
type Props = {
  tables: TableInfo[];
  active: string | null;
  onPick(name: string): void;
};

/** The table list: every name in mono, its row count at the right edge. */
export function Tables({ tables, active, onPick }: Props) {
  return (
    <aside className="scroll-thin flex w-[220px] shrink-0 flex-col overflow-y-auto border-r border-hair-8 bg-glass-2">
      <div className="px-3 pt-2 pb-1 text-[11px] text-muted-foreground">Tabellen</div>

      {tables.map((table) => {
        // The line of the table whose rows stand on screen.
        const on = table.name === active;
        return (
          <button
            key={table.name}
            type="button"
            className={`flex cursor-pointer items-center gap-2 px-3 py-[5px] text-left transition ${
              on ? "bg-acc1/16 text-acc1" : "hover:bg-white/6"
            }`}
            onClick={() => onPick(table.name)}
          >
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{table.name}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{table.count}</span>
          </button>
        );
      })}
    </aside>
  );
}
