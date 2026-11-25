import * as React from "react";
import { Link, useLocation } from "react-router";

import { FeatherIcon, MenuIcon, MessageSquareTextIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { groupThreads } from "@/lib/thread-groups";
import type { ThreadSummary } from "@/lib/thread-api";

type ThreadSidebarProps = {
  threads: ThreadSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
};

export function ThreadSidebar({
  threads,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: ThreadSidebarProps) {
  const [open, setOpen] = React.useState(false);
  const location = useLocation();

  const panel = (
    <div className="flex h-full w-full flex-col gap-3 bg-muted/30 p-3">
      <div className="mb-4">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          size={"lg"}
          onClick={() => {
            onNew();
            setOpen(false);
          }}
        >
          <PlusIcon className="size-4" />
          New chat
        </Button>
      </div>

      <Link
        to={{ pathname: "/chithi", search: location.search }}
        onClick={() => setOpen(false)}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <FeatherIcon className="size-4" />
        Chithi
      </Link>

      <div className="thread-list min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {threads.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No conversations yet
          </p>
        ) : (
          groupThreads(threads).map((group) => (
            <div key={group.label} className="space-y-1">
              <div className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {group.label}
              </div>
              {group.threads.map((thread) => (
                <div
                  key={thread.id}
                  className={`group flex items-center gap-1 rounded-lg text-sm ${
                    activeId === thread.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/60"
                  }`}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
                    onClick={() => {
                      onSelect(thread.id);
                      setOpen(false);
                    }}
                  >
                    <MessageSquareTextIcon className="size-4 shrink-0 opacity-70" />
                    <span className="truncate">{thread.title}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${thread.title}`}
                    className="mr-1 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                    onClick={() => onDelete(thread.id)}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open conversations"
        className="fixed top-3 left-3 z-40 md:hidden"
        onClick={() => setOpen(true)}
      >
        <MenuIcon />
      </Button>

      <aside className="hidden w-75 shrink-0 border-r md:block">{panel}</aside>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[min(20rem,85vw)] border-r bg-background">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close conversations"
              className="absolute top-3 right-3 z-10"
              onClick={() => setOpen(false)}
            >
              <XIcon />
            </Button>
            {panel}
          </aside>
        </div>
      )}
    </>
  );
}

export default ThreadSidebar;
