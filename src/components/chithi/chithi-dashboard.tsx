"use client";

import * as React from "react";
import { Link, useLocation } from "react-router";

import { PenLineIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useChithis, useDeleteChithiMutation } from "@/lib/query-hooks";
import { type Chithi } from "@/lib/chithi-api";

import { ChithiFormDialog } from "./chithi-form-dialog";

export function ChithiDashboard() {
  const location = useLocation();
  const chithisQuery = useChithis();
  const deleteMutation = useDeleteChithiMutation();

  const items = chithisQuery.data ?? [];
  const loading = chithisQuery.isLoading;
  const queryError = chithisQuery.isError
    ? chithisQuery.error instanceof Error
      ? chithisQuery.error.message
      : "Could not load letters"
    : null;

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Chithi | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<Chithi | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(item: Chithi) {
    setEditing(item);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync(target.id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete the letter");
    }
  }

  const displayError = queryError ?? deleteError;

  return (
    <div className="h-dvh w-full overflow-y-auto bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Chithi</h1>
            <p className="text-sm text-muted-foreground">Your letters, one page.</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link to={{ pathname: "/", search: location.search }}>
                  Back to chat
                </Link>
              }
            />
            <Button onClick={openCreate}>
              <PlusIcon className="size-4" />
              New Chithi
            </Button>
          </div>
        </header>

        {displayError && (
          <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
            {displayError}
          </p>
        )}

        {loading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Loading letters…</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed py-20 text-center">
            <p className="text-sm text-muted-foreground">No letters yet.</p>
            <Button className="mt-4" variant="outline" onClick={openCreate}>
              Write the first one
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <article
                key={item.id}
                className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm"
              >
                <div className="relative min-h-40 overflow-hidden rounded-xl bg-gradient-to-br from-neutral-100 to-neutral-200 p-5 shadow-inner dark:from-neutral-800 dark:to-neutral-950">
                  <span className="absolute top-2 right-3 font-serif text-3xl opacity-15">
                    চিঠি
                  </span>
                  <p className="line-clamp-5 font-serif text-lg leading-relaxed break-words whitespace-pre-wrap">
                    {item.content}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {new Date(item.created_at).toLocaleString("bn-BD", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                  {item.source === "ai" && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                      AI
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(item)}>
                    <PenLineIcon className="size-4" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete letter from ${item.created_at}`}
                    onClick={() => setPendingDelete(item)}
                  >
                    <Trash2Icon className="size-4" />
                    Delete
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {formOpen && (
        <ChithiFormDialog
          open={formOpen}
          initial={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => void chithisQuery.refetch()}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete Chithi?"
        description="This letter will be removed permanently. This cannot be undone."
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

export default ChithiDashboard;
