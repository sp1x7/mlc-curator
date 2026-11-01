import type { Category } from "@shared/types/catalog";
import { cn } from "@web/lib/utils";
import { useState } from "react";

/** The categories with their forums, the picked pair and the picker. */
type Props = {
  categories: Category[];
  category: string;
  forum: number | null;
  onPick: (category: string, forum: number | null) => void;
};

// The row shared by category and forum lines.
const ROW = "flex items-center gap-1.5 rounded-md transition";
// The caret column: opens and closes the subforums of a category.
const CARET =
  "w-4 shrink-0 cursor-pointer py-[3px] text-center text-[9px] text-muted-foreground disabled:cursor-default";
// The clickable name: full width, one line, truncated.
const LABEL =
  "min-w-0 flex-1 cursor-pointer rounded-md py-[3px] pr-1.5 text-left text-[12px] whitespace-nowrap";

// The board tree: one line per category, its forums indented underneath.
export function CategoryNav({ categories, category, forum, onPick }: Props) {
  // The categories whose forums are shown; the active one starts open.
  const [open, setOpen] = useState<Set<string>>(new Set([category]));

  /** Opens or closes the forum list of one category. */
  const toggle = (name: string): void => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <nav className="w-[230px] shrink-0 overflow-auto border-r border-hair-8 bg-glass-2 scroll-thin">
      <div className="py-1.5 pr-1 pl-1.5">
        {categories.map((entry) => {
          // The line of the category the list is reading.
          const active = entry.name === category;

          return (
            <div key={entry.id}>
              <div
                className={cn(ROW, active ? "bg-acc1/16 text-acc1" : "hover:bg-white/6")}
                style={{ paddingLeft: 4 }}
              >
                <button
                  type="button"
                  className={CARET}
                  aria-label={
                    open.has(entry.name) ? "Unterforen zuklappen" : "Unterforen aufklappen"
                  }
                  aria-expanded={open.has(entry.name)}
                  disabled={entry.forums.length === 0}
                  onClick={() => toggle(entry.name)}
                >
                  {entry.forums.length === 0 ? "" : open.has(entry.name) ? "▾" : "▸"}
                </button>
                <button type="button" className={LABEL} onClick={() => onPick(entry.name, null)}>
                  <span className="block truncate">{entry.name}</span>
                </button>
              </div>

              {/* The forums of an open category, indented by one step. */}
              {open.has(entry.name) &&
                entry.forums.map((sub) => (
                  <div
                    key={sub.id}
                    className={cn(
                      ROW,
                      active && forum === sub.id
                        ? "bg-acc1/16 text-acc1"
                        : forum === sub.id
                          ? "bg-glass-8"
                          : "hover:bg-white/6",
                    )}
                    style={{ paddingLeft: 16 }}
                  >
                    <span className="w-4 shrink-0" />
                    <button
                      type="button"
                      className={LABEL}
                      onClick={() => onPick(entry.name, sub.id)}
                    >
                      <span className="block truncate">{sub.name}</span>
                    </button>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
