import { BrowserRouter, Routes, Route } from "react-router";

import "./App.css";

import { QueryClientProvider } from "@/lib/query";
import { ChatRoute } from "@/routes/chat-route";
import { ChithiRoute } from "@/routes/chithi-route";
import { Free4TalkRoute } from "@/routes/free4talk-route";
import { ChithiLinksRoute } from "@/routes/chithi-links-route";
export default function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider>
        <Routes>
          <Route path="/" element={<ChatRoute />} />
          <Route path="/chithi" element={<ChithiRoute />} />
          <Route path="/free4talk" element={<Free4TalkRoute />} />
          <Route path="/chithi-links" element={<ChithiLinksRoute />} />
        </Routes>
      </QueryClientProvider>
    </BrowserRouter>
  );
}
