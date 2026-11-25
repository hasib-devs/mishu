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
import {
  useCreateChithiMutation,
  useUpdateChithiMutation,
} from "@/lib/query-hooks";
import { chithiSchema, type ChithiFormValues } from "@/lib/chithi-schema";
import type { Chithi } from "@/lib/chithi-api";

type ChithiFormDialogProps = {
  open: boolean;
  initial: Chithi | null;
  letters: Chithi[];
  onClose: () => void;
};

export function ChithiFormDialog({ open, initial, letters, onClose }: ChithiFormDialogProps) {
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
    defaultValues: {
      content: initial?.content ?? "",
      paperStyle: initial?.paper_style ?? "classic",
      slot: initial?.generated_for ? String(initial.generated_for) : "",
    },
  });

  React.useEffect(() => {
    reset({
      content: initial?.content ?? "",
      paperStyle: initial?.paper_style ?? "classic",
      slot: initial?.generated_for ? String(initial.generated_for) : "",
    });
  }, [initial, reset]);

  const content = useWatch({ control, name: "content" }) ?? "";
  const length = content.trim().length;
  const invalid = length === 0 || length > 600;

  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const [now] = React.useState(() => Date.now());

  const availableSlots = React.useMemo(() => {
    const currentHour = Math.floor(now / 3_600_000) * 3_600_000;
    const occupied = new Set(
      letters
        .map((letter) => letter.generated_for)
        .filter((value): value is number => value !== null && value !== initial?.generated_for),
    );
    return Array.from({ length: 24 }, (_, index) => currentHour + index * 3_600_000)
      .filter((hour) => !occupied.has(hour))
      .map((hour) => ({
        value: String(hour),
        label: new Date(hour).toLocaleString("bn-BD", {
          dateStyle: "medium",
          timeStyle: "short",
        }),
      }));
  }, [letters, initial?.generated_for, now]);

  async function submit(values: ChithiFormValues) {
    setSubmitError(null);
    const generatedFor = values.slot === "" ? null : Number(values.slot);
    try {
      if (initial) {
        await updateMutation.mutateAsync({
          id: initial.id,
          content: values.content,
          paperStyle: values.paperStyle,
          generatedFor,
        });
      } else {
        await createMutation.mutateAsync({
          content: values.content,
          paperStyle: values.paperStyle,
          generatedFor,
        });
      }
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save the letter. Please try again.";
      const lower = message.toLowerCase();
      setSubmitError(
        lower.includes("slot is already taken") || lower.includes("409")
          ? "That hour is already taken. Choose another slot."
          : message,
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
            rows={15}
            placeholder="আপনার চিঠি লিখুন…"
            className="min-h-25"
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
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Paper style
              <select
                {...register("paperStyle")}
                className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
              >
                <option value="classic">Classic</option>
                <option value="modern">Modern</option>
                <option value="minimal">Minimal</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Schedule to hour
              <select
                {...register("slot")}
                className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
              >
                <option value="">No schedule</option>
                {availableSlots.map((slot) => (
                  <option key={slot.value} value={slot.value}>
                    {slot.label}
                  </option>
                ))}
                {initial?.generated_for && !availableSlots.some((s) => s.value === String(initial.generated_for)) && (
                  <option value={String(initial.generated_for)}>
                    {new Date(initial.generated_for).toLocaleString("bn-BD", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </option>
                )}
              </select>
            </label>
          </div>
          {errors.slot && (
            <p className="text-sm text-destructive">{errors.slot.message}</p>
          )}
          {errors.paperStyle && (
            <p className="text-sm text-destructive">{errors.paperStyle.message}</p>
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
