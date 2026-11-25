import { ErrorBoundary } from "react-error-boundary";

import { ChithiDashboard } from "@/components/chithi/chithi-dashboard";

export function ChithiRoute() {
  return (
    <ErrorBoundary
      fallbackRender={({ error }) => (
        <div className="flex h-dvh w-full items-center justify-center bg-background p-6 text-sm text-destructive">
          Could not load letters. {error instanceof Error ? error.message : ""}
        </div>
      )}
    >
      <ChithiDashboard />
    </ErrorBoundary>
  );
}

