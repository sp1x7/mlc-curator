/** Status line: the table name at the left, the row count of the whole table at the
 *  right. */
export function StatusFooter({ table, total }: { table: string | null; total: number }) {
  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-hair-8 px-3 text-[11px] text-muted-foreground">
      <span className="truncate font-mono">{table ?? "—"}</span>
      {/* The German plural: one Zeile, several Zeilen. */}
      <span className="shrink-0">
        {total} Zeile{total === 1 ? "" : "n"}
      </span>
    </footer>
  );
}
