import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const chithis = sqliteTable(
  "chithis",
  {
    id: text("id").primaryKey(),
    content: text("content").notNull(),
    source: text("source").notNull().default("manual"),
    generated_for: integer("generated_for"),
    paper_style: text("paper_style").notNull().default("classic"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [uniqueIndex("idx_chithis_generated_for").on(table.generated_for)],
);

export type ChithiRow = typeof chithis.$inferSelect;
export type NewChithi = typeof chithis.$inferInsert;
