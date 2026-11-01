import { QueryClientProvider } from "@tanstack/react-query";
import { useEventBridge } from "@web/data/event-client";
import { queryClient } from "@web/data/query-client";
import MobileApp from "@web/mobile/MobileApp";
import { useNarrow } from "@web/mobile/use-narrow";
import Background from "@web/shell/Background";
import StatusBar from "@web/shell/StatusBar";
import WindowManager from "@web/shell/WindowManager";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Shell />
    </QueryClientProvider>
  );
}

/** Below the provider: `useEventBridge` needs the query client to invalidate. */
function Shell() {
  useEventBridge();
  const narrow = useNarrow();

  // A narrow screen switches to the phone surface. The desktop shell needs the
  // background, the window layer and the status bar around it.
  if (narrow) return <MobileApp />;

  return (
    <>
      <Background />
      <WindowManager>
        <StatusBar />
      </WindowManager>
    </>
  );
}
