import { cn } from "@web/lib/utils";
import type { ReactNode } from "react";

/** One tab: id, label and an optional count badge. */
export type ToolbarTab = { id: string; label: string; badge?: number };

/**
 * Tab strip in a window's header row: the tabs on the left, the actions pushed to
 * the right. The row is 44 px high and does not shrink, so switching a view
 * leaves the content area at the same height.
 */
export default function Toolbar({
  tabs,
  active,
  onSelect,
  children,
}: {
  tabs: ToolbarTab[];
  active: string;
  onSelect(id: string): void;
  children?: ReactNode;
}) {
  return (
    <div
      data-slot="toolbar"
      className="flex h-11 shrink-0 items-center gap-1 border-b border-hair-8 px-2.5"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={cn(
            "flex h-7 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold whitespace-nowrap transition",
            active === tab.id ? "bg-acc1/16 text-acc1" : "text-muted-foreground hover:bg-white/6",
          )}
          onClick={() => onSelect(tab.id)}
        >
          <span>{tab.label}</span>
          {/* A badge counting 0 stays off the button. */}
          {tab.badge !== undefined && tab.badge > 0 && (
            <span className="tabular-nums rounded-md bg-glass-8 px-1 text-[9px] font-bold text-muted-foreground">
              {tab.badge}
            </span>
          )}
        </button>
      ))}

      {/* ml-auto pushes the actions to the right edge of the row. */}
      <div className="ml-auto flex items-center gap-1.5">{children}</div>
    </div>
  );
}
