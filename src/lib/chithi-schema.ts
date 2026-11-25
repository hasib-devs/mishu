import { z } from "zod";

// Mirrors the rule in worker/chithi/validation.ts (content trimmed, 1-600 chars).
// Kept client-side: src/ tsconfig cannot import from worker/.
export const chithiSchema = z.object({
  content: z.string().trim().min(1, "Write a letter").max(600, "Up to 600 characters"),
});

export type ChithiFormValues = z.infer<typeof chithiSchema>;
