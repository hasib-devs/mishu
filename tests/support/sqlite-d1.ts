import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

type Row = Record<string, unknown>;

const MIGRATIONS = [
  fileURLToPath(new URL("../../migrations/0004_free4talk.sql", import.meta.url)),
  fileURLToPath(new URL("../../migrations/0005_chithi_links.sql", import.meta.url)),
  fileURLToPath(new URL("../../migrations/0006_chithi_quote_history.sql", import.meta.url)),
];

/** Values accepted by node:sqlite's bind parameters. */
type BindValue = null | number | bigint | string | Uint8Array;

function toBindValue(value: unknown): BindValue {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "string" ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  throw new TypeError(`Unsupported SQLite bind value: ${typeof value}`);
}

interface Statement {
  bind(...args: unknown[]): Statement;
  all(): Promise<{ results: Row[] }>;
  first(): Promise<Row | null>;
  run(): Promise<{ success: boolean; meta: { last_row_id: number } }>;
}

/**
 * Minimal D1-shaped shim backed by node:sqlite, loaded with the real free4talk
 * migration. Supports prepare().bind(...), all(), first(), run() and batch()
 * (executed as one transaction). Foreign keys are enabled so ON DELETE CASCADE
 * behaves like D1.
 */
export function createSqliteD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const migration of MIGRATIONS) {
    sqlite.exec(readFileSync(migration, "utf8"));
  }

  function makeStatement(sql: string, args: unknown[]): Statement {
    const runSync = () => sqlite.prepare(sql).run(...args.map(toBindValue));

    return {
      bind(...more: unknown[]): Statement {
        return makeStatement(sql, [...args, ...more]);
      },
      async all() {
        // node:sqlite returns null-prototype rows; D1 returns plain objects.
        return {
          results: sqlite
            .prepare(sql)
            .all(...args.map(toBindValue))
            .map((row: Row) => ({ ...row })),
        };
      },
      async first() {
        const row = sqlite.prepare(sql).get(...args.map(toBindValue));
        return row ? { ...row } : null;
      },
      async run() {
        const info = runSync();
        return {
          success: true,
          meta: { last_row_id: Number(info.lastInsertRowid) },
        };
      },
    };
  }

  const db = {
    prepare(sql: string) {
      return makeStatement(sql, []);
    },
    async batch(statements: Statement[]) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) {
          results.push(await statement.run());
        }
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };

  return { db, sqlite, close: () => sqlite.close() };
}
