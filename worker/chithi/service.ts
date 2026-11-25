import { desc, eq } from "drizzle-orm";

import type { ChithiDb } from "./db.ts";
import { chithis, type ChithiRow } from "./schema.ts";

export class SlotTakenError extends Error {
  constructor() {
    super("Chithi slot is already taken");
    this.name = "SlotTakenError";
  }
}

export type CreateChithiInput = {
  content: string;
  source?: "manual" | "ai";
  generatedFor?: number | null;
  paperStyle?: string;
};

export type PatchChithiInput = { content: string };

export function listChithis(db: ChithiDb, limit: number): Promise<ChithiRow[]> {
  return db.select().from(chithis).orderBy(desc(chithis.created_at)).limit(limit);
}

export async function getChithi(db: ChithiDb, id: string): Promise<ChithiRow | null> {
  const rows = await db.select().from(chithis).where(eq(chithis.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createChithi(db: ChithiDb, input: CreateChithiInput): Promise<ChithiRow> {
  const generatedFor = input.generatedFor ?? null;
  if (generatedFor !== null && (!Number.isInteger(generatedFor) || generatedFor % 3_600_000 !== 0)) {
    throw new Error("generatedFor must be an hour-aligned epoch in milliseconds");
  }
  if (generatedFor !== null) {
    const taken = await db.select().from(chithis)
      .where(eq(chithis.generated_for, generatedFor)).limit(1);
    if (taken.length > 0) throw new SlotTakenError();
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  await db.insert(chithis).values({
    id,
    content: input.content,
    source: input.source ?? "manual",
    generated_for: generatedFor,
    paper_style: input.paperStyle ?? "classic",
    created_at: now,
    updated_at: now,
  });
  return (await getChithi(db, id))!;
}

export async function updateChithi(
  db: ChithiDb,
  id: string,
  patch: PatchChithiInput,
): Promise<ChithiRow | null> {
  if (!await getChithi(db, id)) return null;
  await db.update(chithis)
    .set({ content: patch.content, updated_at: Date.now() })
    .where(eq(chithis.id, id));
  return getChithi(db, id);
}

export async function deleteChithi(db: ChithiDb, id: string): Promise<boolean> {
  if (!await getChithi(db, id)) return false;
  await db.delete(chithis).where(eq(chithis.id, id));
  return true;
}
