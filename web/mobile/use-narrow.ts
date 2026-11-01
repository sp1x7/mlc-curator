import { useEffect, useState } from "react";

// The media query the phone layout answers to: 720 px wide and below.
const PHONE = "(max-width: 720px)";

/** Reads the query on mount and follows every later change of the viewport. */
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(PHONE).matches);

  useEffect(() => {
    const query = window.matchMedia(PHONE);
    const onChange = (event: MediaQueryListEvent) => setNarrow(event.matches);
    setNarrow(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return narrow;
}
