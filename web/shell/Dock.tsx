import { cn } from "@web/lib/utils";
import { Fragment } from "react";
import { useWindows } from "./window-context";
import { WINDOWS } from "./window-registry";

/**
 * One icon per registered window in the middle of the status bar.
 *
 * The click branches on the minimized set: a minimized id goes back to its old
 * frame at its old place, every other id opens its window once.
 */
export default function Dock() {
  const { open, restore, activeId, minimizedIds } = useWindows();

  return (
    <div data-slot="dock" className="flex items-center gap-1">
      {/* The registered windows that ask for a dock slot, in registry order. */}
      {WINDOWS.filter((def) => def.inDock).map((def) => (
        <Fragment key={def.id}>
          {/* A divider splits the dock into blocks. */}
          {def.divider && <span className="mx-1 h-4 w-px shrink-0 bg-hair-12" />}
          <button
            type="button"
            title={def.title}
            className={cn(
              "relative flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-lg border text-[14px] transition",
              activeId === def.id
                ? "border-acc1/45 bg-acc1/16"
                : "border-transparent hover:bg-white/8",
            )}
            onClick={() => {
              if (minimizedIds.has(def.id)) restore(def.id);
              else open(def.id);
            }}
          >
            <def.icon className="size-[15px]" strokeWidth={1.75} />
            {/* The dot marks a window whose frame is open and minimized. */}
            {minimizedIds.has(def.id) && (
              <span className="absolute bottom-px left-1/2 size-1 -translate-x-1/2 rounded-full bg-white" />
            )}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
