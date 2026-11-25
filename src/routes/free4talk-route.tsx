import { ErrorBoundary } from "react-error-boundary";

import { Free4TalkPage } from "@/pages/free4talk-page";

export function Free4TalkRoute() {
  return (
    <ErrorBoundary
      fallbackRender={({ error }) => (
        <div className="flex h-dvh w-full items-center justify-center bg-background p-6 text-sm text-destructive">
          Could not load community. {error instanceof Error ? error.message : ""}
        </div>
      )}
    >
      <Free4TalkPage />
    </ErrorBoundary>
  );
}
