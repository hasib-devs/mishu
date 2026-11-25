import { z } from "zod";

const content = z.string().trim().min(1).max(600);

export const paperStyleSchema = z.enum(["classic", "modern", "minimal"]);

const generatedFor = z
  .number()
  .int()
  .refine((value) => value % 3_600_000 === 0, "Must be an hour-aligned epoch in milliseconds");

export const createChithiSchema = z.object({
  content,
  paper_style: paperStyleSchema.optional(),
  generated_for: generatedFor.nullable().optional(),
});

export const patchChithiSchema = z
  .object({
    content: content.optional(),
    paper_style: paperStyleSchema.optional(),
    generated_for: generatedFor.nullable().optional(),
  })
  .refine(
    (value) =>
      value.content !== undefined ||
      value.paper_style !== undefined ||
      value.generated_for !== undefined,
    "Provide content, paper_style or generated_for",
  );

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
