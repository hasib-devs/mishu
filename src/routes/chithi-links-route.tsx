import { ErrorBoundary } from "react-error-boundary";

import { ChithiLinksPage } from "@/pages/chithi-links-page";

export function ChithiLinksRoute() {
  return (
    <ErrorBoundary
      fallbackRender={({ error }) => (
        <div className="flex h-dvh w-full items-center justify-center bg-background p-6 text-sm text-destructive">
          Could not load chithi links. {error instanceof Error ? error.message : ""}
        </div>
      )}
    >
      <ChithiLinksPage />
    </ErrorBoundary>
  );
}
