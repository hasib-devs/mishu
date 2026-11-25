import * as React from "react";
import { QueryClientProvider as ReactQueryProvider } from "@tanstack/react-query";

import { createQueryClient } from "@/lib/query-client";

export function QueryClientProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(createQueryClient);
  return <ReactQueryProvider client={client}>{children}</ReactQueryProvider>;
}
