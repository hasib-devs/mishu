import * as React from "react";
import { useNavigate, useSearchParams } from "react-router";

import ChatBox from "@/components/ChatBox";
import { ThreadSidebar } from "@/components/thread-sidebar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { createThread, type ThreadSummary } from "@/lib/thread-api";
import { toChatMessages } from "@/lib/thread-messages";
import { useThreads, useThread, useDeleteThreadMutation } from "@/lib/query-hooks";

export function ChatRoute() {
  const [searchParams] = useSearchParams();
  const threadId = searchParams.get("thread");
  const navigate = useNavigate();

  const threadsQuery = useThreads();
  const threadQuery = useThread(threadId);
  const deleteThreadMutation = useDeleteThreadMutation();

  const [sessionNonce, setSessionNonce] = React.useState(0);
  // A new thread is created when the first message is sent, but the URL only
  // changes once that message has been saved. Navigating mid-send would remount
  // ChatBox and abort the stream. The key stays URL-derived so Back/Forward
  // and deep links always show the thread named in the URL.
  const createdThreadIdRef = React.useRef<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<{
    id: string | null;
    title: string;
  } | null>(null);

  const title = threadQuery.data?.title ?? "New chat";
  const messages = React.useMemo(
    () => (threadQuery.data ? toChatMessages(threadQuery.data.messages) : []),
    [threadQuery.data],
  );

  const ensureThread = React.useCallback(async (): Promise<string> => {
    if (threadId) return threadId;
    const created = await createThread();
    createdThreadIdRef.current = created.id;
    return created.id;
  }, [threadId]);

  const handleSaved = React.useCallback(() => {
    void threadsQuery.refetch();
    const created = createdThreadIdRef.current;
    if (!threadId && created) {
      createdThreadIdRef.current = null;
      navigate({ pathname: "/", search: `?thread=${created}` }, { replace: true });
    }
  }, [threadId, navigate, threadsQuery]);

  const newChat = React.useCallback(() => {
    createdThreadIdRef.current = null;
    navigate({ pathname: "/", search: "" });
    setSessionNonce((current) => current + 1);
  }, [navigate]);

  const selectThread = React.useCallback(
    (id: string) => {
      createdThreadIdRef.current = null;
      navigate({ pathname: "/", search: `?thread=${id}` });
    },
    [navigate],
  );

  const requestDelete = React.useCallback(
    (id: string | null) => {
      const thread = id ? threadsQuery.data?.find((item) => item.id === id) : undefined;
      setPendingDelete({
        id,
        title: thread?.title ?? (id ? "This conversation" : "New chat"),
      });
    },
    [threadsQuery.data],
  );

  const confirmDelete = React.useCallback(() => {
    if (!pendingDelete) return;
    if (pendingDelete.id) {
      void deleteThreadMutation.mutateAsync(pendingDelete.id).catch(() => undefined);
      if (pendingDelete.id === threadId) newChat();
    } else {
      newChat();
    }
    setPendingDelete(null);
  }, [pendingDelete, threadId, newChat, deleteThreadMutation]);

  const threads: ThreadSummary[] = threadsQuery.data ?? [];

  const loading = threadQuery.isLoading && threadId !== null;

  return (
    <div className="flex h-dvh w-full bg-background">
      <ThreadSidebar
        threads={threads}
        activeId={threadId}
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
            key={`${threadId ?? "draft"}-${sessionNonce}`}
            title={title}
            threadId={threadId}
            initialMessages={messages}
            ensureThread={ensureThread}
            onSaved={handleSaved}
            onDeleted={() => requestDelete(threadId)}
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
