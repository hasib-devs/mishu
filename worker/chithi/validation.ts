import { z } from "zod";

const content = z.string().trim().min(1).max(600);

export const createChithiSchema = z.object({ content });

export const patchChithiSchema = z.object({ content });

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
