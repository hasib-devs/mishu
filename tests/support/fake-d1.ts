type Row = Record<string, unknown>;

/**
 * Minimal in-memory D1 stand-in for the SQL used by worker/index.ts and the
 * Drizzle chithi queries. Statements are bound through `prepare(sql).bind(...args)`;
 * batch runs them in order.
 */
export function createFakeD1(
  seed: { threads: Row[]; messages: Row[]; chithis?: Row[] },
  now = 1000,
) {
  const threads: Row[] = seed.threads.map((row) => ({ ...row }));
  const messages: Row[] = seed.messages.map((row) => ({ ...row }));
  const chithis: Row[] = (seed.chithis ?? []).map((row) => ({ ...row }));

  function selectChithis(sql: string, args: unknown[]): Row[] {
    let rows: Array<Row & { __index: number }> = chithis.map((row, index) => ({ ...row, __index: index }));

    const id = /where\s+.*?"id"\s*=\s*\?/i.test(sql) ? args[0] : undefined;
    if (id !== undefined) rows = rows.filter((row) => row.id === id);

    const slot = /where\s+.*?"generated_for"\s*=\s*\?/i.test(sql) ? args[0] : undefined;
    if (slot !== undefined) rows = rows.filter((row) => row.generated_for === slot);

    if (/order\s+by\s+.*?"created_at"\s+desc/i.test(sql)) {
      rows.sort((a, b) =>
        Number(b.created_at) - Number(a.created_at) || Number(b.__index) - Number(a.__index)
      );
    }

    if (/limit\s+\?/i.test(sql)) {
      rows = rows.slice(0, Number(args[args.length - 1]));
    }

    return rows.map(({ __index: _ignored, ...row }) => row);
  }

  function select(sql: string, args: unknown[]): Row[] {
    if (/from\s+"?chithis"?/i.test(sql)) return selectChithis(sql, args);
    if (sql.includes("FROM threads")) {
      const id = args[0];
      return threads.filter((row) => id === undefined || row.id === id).map((row) => ({ ...row }));
    }
    if (sql.includes("FROM messages")) {
      const threadId = args[0];
      return messages
        .filter((row) => threadId === undefined || row.thread_id === threadId)
        .sort((a, b) => Number(a.created_at) - Number(b.created_at))
        .map((row) => ({ ...row }));
    }
    return [];
  }

  function apply(sql: string, args: unknown[]): void {
    if (/^insert\s+into\s+"?chithis"?/i.test(sql)) {
      const columns =
        sql.match(/insert\s+into\s+"?chithis"?\s*\(([^)]+)\)/i)?.[1]
          .split(",")
          .map((column) => column.trim().replace(/"/g, "")) ?? [];
      const row: Row = {};
      columns.forEach((column, index) => {
        row[column] = args[index];
      });
      chithis.push(row);
      return;
    }
    if (/^update\s+"?chithis"?/i.test(sql)) {
      const assignments =
        sql.match(/set\s+(.+?)\s+where\s+.*?"id"\s*=\s*\?/i)?.[1]
          .split(",")
          .map((part) => part.trim().match(/^"?(\w+)"?\s*=\s*\?$/)?.[1]) ?? [];
      const id = args[args.length - 1];
      const row = chithis.find((item) => item.id === id);
      if (row) {
        assignments.forEach((column, index) => {
          if (column) row[column] = args[index];
        });
      }
      return;
    }
    if (/^delete\s+from\s+"?chithis"?/i.test(sql)) {
      const index = chithis.findIndex((row) => row.id === args[0]);
      if (index !== -1) chithis.splice(index, 1);
      return;
    }
    if (sql.startsWith("DELETE FROM messages")) {
      const threadId = args[0];
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i].thread_id === threadId) messages.splice(i, 1);
      }
      return;
    }
    if (sql.startsWith("DELETE FROM threads")) {
      const id = args[0];
      const index = threads.findIndex((row) => row.id === id);
      if (index !== -1) threads.splice(index, 1);
      return;
    }
    if (sql.startsWith("INSERT INTO messages")) {
      const columns = sql.match(/INSERT INTO messages \(([^)]+)\)/)?.[1].split(",").map((c) => c.trim()) ?? [];
      const row: Row = {};
      columns.forEach((column, index) => {
        row[column] = args[index];
      });
      messages.push(row);
      return;
    }
    if (sql.startsWith("INSERT INTO threads")) {
      const columns = sql.match(/INSERT INTO threads \(([^)]+)\)/)?.[1].split(",").map((c) => c.trim()) ?? [];
      const row: Row = {};
      columns.forEach((column, index) => {
        row[column] = args[index];
      });
      threads.push(row);
      return;
    }
    if (sql.includes("SET title = CASE")) {
      const title = args[0];
      const id = args[args.length - 1];
      const thread = threads.find((row) => row.id === id);
      if (thread && thread.title === "New Thread" && typeof title === "string" && title.length > 0) {
        thread.title = title;
      }
      return;
    }
    if (sql.includes("UPDATE threads SET updated_at")) {
      const thread = threads.find((row) => row.id === args[1]);
      if (thread) thread.updated_at = args[0];
      return;
    }
  }

  function statement(sql: string, args: unknown[]) {
    return {
      async run() {
        apply(sql, args);
        return { success: true };
      },
      async all() {
        return { results: select(sql, args) };
      },
      async first() {
        return select(sql, args)[0] ?? null;
      },
      async raw() {
        const rows = select(sql, args);
        const columns =
          sql.match(/select\s+(.+?)\s+from\s+"?chithis"?/i)?.[1]
            .split(",")
            .map((column) => column.trim().replace(/"/g, "")) ??
          (rows[0] ? Object.keys(rows[0]) : []);
        return rows.map((row) => columns.map((column) => row[column]));
      },
    };
  }

  return {
    db: {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return statement(sql, args);
          },
        };
      },
      async batch(statements: Array<{ run(): Promise<unknown> }>) {
        for (const item of statements) await item.run();
        return [];
      },
    },
    state: { threads, messages, chithis, now },
  };
}
