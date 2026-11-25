import { BrowserRouter, Routes, Route } from "react-router";

import "./App.css";

import { QueryClientProvider } from "@/lib/query";
import { ChatRoute } from "@/routes/chat-route";
import { ChithiRoute } from "@/routes/chithi-route";

export default function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider>
        <Routes>
          <Route path="/" element={<ChatRoute />} />
          <Route path="/chithi" element={<ChithiRoute />} />
        </Routes>
      </QueryClientProvider>
    </BrowserRouter>
  );
}
