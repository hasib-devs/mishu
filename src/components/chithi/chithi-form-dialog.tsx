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
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateChithiMutation, useUpdateChithiMutation } from "@/lib/query-hooks";
import { chithiSchema, type ChithiFormValues } from "@/lib/chithi-schema";
import type { Chithi } from "@/lib/chithi-api";

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
  const createMutation = useCreateChithiMutation();
  const updateMutation = useUpdateChithiMutation();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ChithiFormValues>({
    resolver: zodResolver(chithiSchema),
    defaultValues: { content: initial?.content ?? "" },
  });

  React.useEffect(() => {
    reset({ content: initial?.content ?? "" });
  }, [initial, reset]);

  const content = useWatch({ control, name: "content" }) ?? "";
  const length = content.trim().length;
  const invalid = length === 0 || length > 600;

  const [submitError, setSubmitError] = React.useState<string | null>(null);

  async function submit(values: ChithiFormValues) {
    setSubmitError(null);
    try {
      if (initial) {
        await updateMutation.mutateAsync({ id: initial.id, content: values.content });
      } else {
        await createMutation.mutateAsync(values.content);
      }
      onSaved();
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Could not save the letter. Please try again.",
      );
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

        <form onSubmit={handleSubmit(submit)} className="space-y-2">
          <Textarea
            aria-label="Chithi message"
            autoFocus
            rows={8}
            placeholder="আপনার চিঠি লিখুন…"
            {...register("content")}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Write a short letter…</span>
            <span className={length > 600 ? "text-destructive" : undefined}>
              {length}/600
            </span>
          </div>
          {errors.content && (
            <p className="text-sm text-destructive">{errors.content.message}</p>
          )}
          {submitError && (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={invalid || isSubmitting}>
              {isSubmitting ? "Saving…" : "Save letter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default ChithiFormDialog;
