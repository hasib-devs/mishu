"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { createChithi, updateChithi, type Chithi } from "@/lib/chithi-api";

type ChithiFormDialogProps = {
  open: boolean;
  initial: Chithi | null;
  onClose: () => void;
  onSaved: () => void;
};

export function ChithiFormDialog({
  open,
  initial,
  onClose,
  onSaved,
}: ChithiFormDialogProps) {
  const key = initial ? `${initial.id}:${initial.updated_at}` : "new";
  const [draft, setDraft] = React.useState({ key, content: initial?.content ?? "" });
  const [saving, setSaving] = React.useState(false);
  const [errorState, setErrorState] = React.useState<{
    key: string;
    message: string | null;
  }>({ key, message: null });
  const content = draft.key === key ? draft.content : (initial?.content ?? "");
  const error = errorState.key === key ? errorState.message : null;

  const length = content.trim().length;
  const invalid = length === 0 || length > 600;

  async function submit() {
    setSaving(true);
    setErrorState({ key, message: null });
    try {
      if (initial) await updateChithi(initial.id, content);
      else await createChithi(content);
      onSaved();
      onClose();
    } catch (err) {
      setErrorState({
        key,
        message: err instanceof Error ? err.message : "Could not save the letter",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Chithi" : "New Chithi"}</DialogTitle>
          <DialogDescription>
            Write a short letter. Up to 600 characters.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Textarea
            aria-label="Chithi message"
            autoFocus
            rows={8}
            value={content}
            onChange={(event) => setDraft({ key, content: event.target.value })}
            placeholder="আপনার চিঠি লিখুন…"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Write a short letter…</span>
            <span className={length > 600 ? "text-destructive" : undefined}>
              {length}/600
            </span>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={invalid || saving} onClick={() => void submit()}>
            {saving ? "Saving…" : "Save letter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ChithiFormDialog;
