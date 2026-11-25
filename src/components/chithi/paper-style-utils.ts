import type { PaperStyle } from "@/lib/chithi-api";

export const PAPER_CLASSES: Record<PaperStyle, string> = {
  classic:
    "bg-gradient-to-br from-neutral-100 to-neutral-200 shadow-inner dark:from-neutral-800 dark:to-neutral-950",
  modern:
    "bg-gradient-to-br from-violet-100 via-white to-sky-100 shadow-inner dark:from-violet-950 dark:via-neutral-900 dark:to-sky-950",
  minimal: "bg-background border border-dashed",
};

export function paperClass(style: string): string {
  return PAPER_CLASSES[style as PaperStyle] ?? PAPER_CLASSES.classic;
}