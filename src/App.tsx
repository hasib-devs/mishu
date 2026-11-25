import "./App.css";
import * as React from "react";

import ChatBox from "./components/ChatBox";
import { ThreadSidebar } from "./components/thread-sidebar";
import type { ChatMessage } from "@/lib/chat-transport";
import {
  createThread,
  deleteThread,
  getThread,
  listThreads,
  type ThreadSummary,
} from "@/lib/thread-api";
import { toChatMessages } from "@/lib/thread-messages";

function threadIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("thread");
}

function writeThreadToUrl(id: string | null, replace: boolean): void {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("thread", id);
  else url.searchParams.delete("thread");
  window.history[replace ? "replaceState" : "pushState"]({}, "", url);
}

function App() {
  const [threads, setThreads] = React.useState<ThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = React.useState<string | null>(threadIdFromUrl);
  const [chatKey, setChatKey] = React.useState(() => threadIdFromUrl() ?? "draft");
  const [title, setTitle] = React.useState("New chat");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [loading, setLoading] = React.useState(() => threadIdFromUrl() !== null);

  const loadThread = React.useCallback(async (id: string): Promise<boolean> => {
    try {
      const detail = await getThread(id);
      setTitle(detail.title);
      setMessages(toChatMessages(detail.messages));
      return true;
    } catch {
      return false;
    }
  }, []);

  const newChat = React.useCallback(() => {
    writeThreadToUrl(null, false);
    setActiveThreadId(null);
    setChatKey("draft");
    setTitle("New chat");
    setMessages([]);
  }, []);

  const selectThread = React.useCallback((id: string) => {
    writeThreadToUrl(id, false);
    setActiveThreadId(id);
    setChatKey(id);
    setLoading(true);
    void loadThread(id).then((found) => {
      if (!found) {
        writeThreadToUrl(null, true);
        setActiveThreadId(null);
        setChatKey("draft");
        setTitle("New chat");
        setMessages([]);
      }
    }).finally(() => setLoading(false));
  }, [loadThread]);

  const ensureThread = React.useCallback(async (): Promise<string> => {
    if (activeThreadId) return activeThreadId;
    const created = await createThread();
    setThreads((current) => [created, ...current]);
    writeThreadToUrl(created.id, false);
    setActiveThreadId(created.id);
    setTitle(created.title);
    return created.id;
  }, [activeThreadId]);

  const removeThread = React.useCallback(async (id: string) => {
    await deleteThread(id).catch(() => undefined);
    setThreads((current) => current.filter((thread) => thread.id !== id));
    if (activeThreadId === id) newChat();
  }, [activeThreadId, newChat]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await listThreads().catch(() => [] as ThreadSummary[]);
      if (cancelled) return;
      setThreads(list);

      const id = threadIdFromUrl();
      if (id) {
        const found = await loadThread(id);
        if (cancelled) return;
        if (!found) {
          writeThreadToUrl(null, true);
          setActiveThreadId(null);
          setChatKey("draft");
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadThread]);

  React.useEffect(() => {
    const onPopState = () => {
      const id = threadIdFromUrl();
      setActiveThreadId(id);
      setChatKey(id ?? "draft");
      setLoading(true);
      if (id) {
        void loadThread(id).finally(() => setLoading(false));
      } else {
        setTitle("New chat");
        setMessages([]);
        setLoading(false);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [loadThread]);

  return (
    <div className="flex h-dvh w-full bg-background">
      <ThreadSidebar
        threads={threads}
        activeId={activeThreadId}
        onSelect={selectThread}
        onNew={newChat}
        onDelete={(id) => void removeThread(id)}
      />
      <main className="m-2 min-w-0 flex-1 overflow-hidden rounded-2xl border">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading conversation…
          </div>
        ) : (
          <ChatBox
            key={chatKey}
            title={title}
            initialMessages={messages}
            ensureThread={ensureThread}
            onDeleted={() => {
              if (activeThreadId) void removeThread(activeThreadId);
              else newChat();
            }}
          />
        )}
      </main>
    </div>
  );
}

export default App;
