import { STATUS_BAR_H } from "./constants";
import Dock from "./Dock";

/**
 * The bar along the bottom edge: 30 px high, 12 px away from the screen edge.
 * Three slots in one grid — counts at the left, the window icons in the middle,
 * connection and running jobs at the right. The two outer slots are empty divs
 * that carry a `data-slot` for whoever fills them.
 */
export default function StatusBar() {
  return (
    <div
      data-slot="status-bar"
      className="fixed inset-x-4 bottom-3 z-[9000] rounded-2xl border border-hair-8 bg-glass-3 backdrop-blur-[22px]"
      style={{ height: STATUS_BAR_H }}
    >
      {/* The middle column takes its width from the dock, the outer two share the
          rest. */}
      <div className="grid h-full grid-cols-[1fr_auto_1fr] items-center gap-3 px-3.5">
        <div data-slot="status-left" className="label text-muted-foreground" />

        <Dock />

        <div data-slot="status-right" className="label text-right text-muted-foreground" />
      </div>
    </div>
  );
}
