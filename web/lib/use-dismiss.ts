import { type RefObject, useEffect } from "react";

/** Call `dismiss` on a pointer press outside `root`. */
export function useDismiss(
  active: boolean,
  dismiss: () => void,
  root: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) dismiss();
    };
    // The listener sits on document, so a press in every other element counts as
    // leaving.
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [active, dismiss, root]);
}
