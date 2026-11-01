import { cn } from "@web/lib/utils";
import { childrenOf, type LibraryNode } from "./node";

/** The folder tree: one line per folder, the caret opens or closes a branch. */
export default function Tree({
  roots,
  expanded,
  openedPath,
  selectedPath,
  onOpen,
  onToggle,
}: {
  roots: LibraryNode[];
  // Paths whose children are shown.
  expanded: Set<string>;
  openedPath: string | null;
  selectedPath: string | null;
  onOpen(node: LibraryNode): void;
  onToggle(path: string): void;
}) {
  // The flat list of visible rows, each with its depth and its caret.
  const rows: Array<{ node: LibraryNode; depth: number; caret: string }> = [];

  // Lines come from groups, titles and seasons; files and plain folders stay out.
  const walk = (node: LibraryNode, depth: number): void => {
    const children = childrenOf(node).filter(
      (child) => child.type === "root-folder" || child.type === "title" || child.type === "season",
    );

    rows.push({
      node,
      depth,
      caret: children.length === 0 ? "" : expanded.has(node.path) ? "▾" : "▸",
    });

    if (!expanded.has(node.path)) return;
    for (const child of children) walk(child, depth + 1);
  };

  for (const root of roots) walk(root, 0);

  return (
    <div className="py-1.5 pr-1 pl-1.5">
      {rows.map(({ node, depth, caret }) => (
        <div
          key={node.path}
          className={cn(
            "flex items-center gap-1.5 rounded-md transition",
            openedPath === node.path ? "bg-acc1/16 text-acc1" : "hover:bg-white/6",
            selectedPath === node.path && openedPath !== node.path && "bg-glass-8",
          )}
          style={{ paddingLeft: 4 + depth * 12 }}
        >
          <button
            type="button"
            className="w-4 shrink-0 cursor-pointer py-[3px] text-center text-[9px] text-muted-foreground"
            aria-label={expanded.has(node.path) ? "Zweige zuklappen" : "Zweige aufklappen"}
            aria-expanded={caret !== ""}
            disabled={caret === ""}
            onClick={() => onToggle(node.path)}
          >
            {caret}
          </button>
          <button
            type="button"
            className="min-w-0 flex-1 cursor-pointer rounded-md py-[3px] pr-1.5 text-left text-[12px] whitespace-nowrap"
            onClick={() => onOpen(node)}
          >
            <span className="block truncate">{node.name}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
