import { z } from "zod";

// Mirrors the rule in worker/chithi/validation.ts (content trimmed, 1-600 chars,
// paper style enum, hour-aligned slot). Kept client-side: src/ tsconfig cannot
// import from worker/.
export const paperStyles = ["classic", "modern", "minimal"] as const;

export const chithiSchema = z.object({
  content: z.string().trim().min(1, "Write a letter").max(600, "Up to 600 characters"),
  paperStyle: z.enum(paperStyles),
  slot: z.string().refine(
    (value) => value === "" || (/^\d+$/.test(value) && Number(value) % 3_600_000 === 0),
    "Choose an available hour",
  ),
});

export type ChithiFormValues = z.infer<typeof chithiSchema>;
