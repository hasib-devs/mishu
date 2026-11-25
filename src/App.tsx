import "./App.css";
import * as React from "react";

import ChatBox from "./components/ChatBox";
import { ChithiDashboard } from "./components/chithi/chithi-dashboard.tsx";
import { ConfirmDialog } from "./components/confirm-dialog";
import { ThreadSidebar } from "./components/thread-sidebar";
import type { ChatMessage } from "@/lib/chat-transport";
import {
  createThread,
  deleteThread,
  getThread,
  listThreads,
  type ThreadSummary,
} from "@/lib/thread-api";
import { isChithiPath } from "@/lib/app-route.ts";
import { createLoadToken } from "@/lib/thread-load-token";
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
  const [chithiView, setChithiView] = React.useState(() =>
    isChithiPath(window.location.pathname),
  );
  const [activeThreadId, setActiveThreadId] = React.useState<string | null>(
    threadIdFromUrl,
  );
  const [chatKey, setChatKey] = React.useState(
    () => threadIdFromUrl() ?? "draft",
  );
  const [sessionNonce, setSessionNonce] = React.useState(0);
  const [title, setTitle] = React.useState("New chat");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [loading, setLoading] = React.useState(
    () => threadIdFromUrl() !== null,
  );
  const [pendingDelete, setPendingDelete] = React.useState<{
    id: string | null;
    title: string;
  } | null>(null);

  const activeThreadIdRef = React.useRef<string | null>(activeThreadId);
  const loadToken = React.useMemo(() => createLoadToken(), []);

  React.useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

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

  const refreshTitles = React.useCallback(async () => {
    const list = await listThreads().catch(() => [] as ThreadSummary[]);
    setThreads(list);
    const id = activeThreadIdRef.current;
    if (id) {
      const current = list.find((thread) => thread.id === id);
      if (current) setTitle(current.title);
    }
  }, []);

  const clearToDraft = React.useCallback((replaceUrl: boolean) => {
    writeThreadToUrl(null, replaceUrl);
    setActiveThreadId(null);
    setChatKey("draft");
    setSessionNonce((current) => current + 1);
    setTitle("New chat");
    setMessages([]);
  }, []);

  const newChat = React.useCallback(() => clearToDraft(false), [clearToDraft]);

  const selectThread = React.useCallback(
    (id: string) => {
      const token = loadToken.next();
      writeThreadToUrl(id, false);
      setActiveThreadId(id);
      setChatKey(id);
      setLoading(true);
      void loadThread(id)
        .then((found) => {
          if (!loadToken.isCurrent(token)) return;
          if (!found) clearToDraft(true);
        })
        .finally(() => {
          if (loadToken.isCurrent(token)) setLoading(false);
        });
    },
    [clearToDraft, loadThread, loadToken],
  );

  const ensureThread = React.useCallback(async (): Promise<string> => {
    if (activeThreadId) return activeThreadId;
    const created = await createThread();
    setThreads((current) => [created, ...current]);
    writeThreadToUrl(created.id, false);
    activeThreadIdRef.current = created.id;
    setActiveThreadId(created.id);
    setTitle(created.title);
    return created.id;
  }, [activeThreadId]);

  const removeThread = React.useCallback(
    async (id: string) => {
      await deleteThread(id).catch(() => undefined);
      setThreads((current) => current.filter((thread) => thread.id !== id));
      if (activeThreadId === id) clearToDraft(false);
    },
    [activeThreadId, clearToDraft],
  );

  const requestDelete = React.useCallback((id: string | null) => {
    const thread = id ? threads.find((item) => item.id === id) : undefined;
    setPendingDelete({
      id,
      title: thread?.title ?? (id ? "This conversation" : "New chat"),
    });
  }, [threads]);

  const confirmDelete = React.useCallback(() => {
    if (!pendingDelete) return;
    if (pendingDelete.id) void removeThread(pendingDelete.id);
    else newChat();
    setPendingDelete(null);
  }, [newChat, pendingDelete, removeThread]);

  React.useEffect(() => {
    const token = loadToken.next();
    let cancelled = false;
    void (async () => {
      const list = await listThreads().catch(() => [] as ThreadSummary[]);
      if (cancelled || !loadToken.isCurrent(token)) return;
      setThreads(list);

      const id = threadIdFromUrl();
      if (id) {
        const found = await loadThread(id);
        if (cancelled || !loadToken.isCurrent(token)) return;
        if (!found) clearToDraft(true);
      }
      if (loadToken.isCurrent(token)) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clearToDraft, loadThread, loadToken]);

  React.useEffect(() => {
    const onPopState = () => {
      setChithiView(isChithiPath(window.location.pathname));
      const token = loadToken.next();
      const id = threadIdFromUrl();
      setActiveThreadId(id);
      setChatKey(id ?? "draft");
      setLoading(true);
      if (id) {
        void loadThread(id)
          .then((found) => {
            if (!loadToken.isCurrent(token)) return;
            if (!found) clearToDraft(true);
          })
          .finally(() => {
            if (loadToken.isCurrent(token)) setLoading(false);
          });
      } else {
        setTitle("New chat");
        setMessages([]);
        setLoading(false);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [clearToDraft, loadThread, loadToken]);

  if (chithiView) return <ChithiDashboard />;

  return (
    <div className="flex h-dvh w-full bg-background">
      <ThreadSidebar
        threads={threads}
        activeId={activeThreadId}
        onSelect={selectThread}
        onNew={newChat}
        onDelete={(id) => requestDelete(id)}
      />
      <main className="m-2 min-w-0 flex-1 overflow-hidden rounded-2xl border">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading conversation…
          </div>
        ) : (
          <ChatBox
            key={`${chatKey}-${sessionNonce}`}
            title={title}
            threadId={activeThreadId}
            initialMessages={messages}
            ensureThread={ensureThread}
            onSaved={() => void refreshTitles()}
            onDeleted={() => requestDelete(activeThreadId)}
          />
        )}
      </main>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete conversation?"
        description={`“${pendingDelete?.title ?? "This conversation"}” and all its messages will be removed. This cannot be undone.`}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

export default App;
