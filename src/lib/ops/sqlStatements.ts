/**
 * Splits a .sql file into individually executable statements.
 *
 * Prisma's `$executeRawUnsafe` goes through the extended query protocol, which
 * rejects more than one command per call (`42601: cannot insert multiple
 * commands into a prepared statement`) — so prisma/sql files must be fed one
 * statement at a time.
 *
 * A naive `split(";")` cannot do that: `prisma/sql/001-rls.sql` defines a
 * PL/pgSQL function whose body is full of semicolons. This scanner tracks the
 * places a `;` is not a terminator — dollar-quoted bodies, single-quoted
 * literals, and comments — and splits only outside them.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let i = 0;

  const push = (end: number) => {
    const statement = stripLeadingComments(sql.slice(start, end));
    if (statement) statements.push(statement);
  };

  while (i < sql.length) {
    const ch = sql[i];

    if (ch === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl + 1;
      continue;
    }

    if (ch === "/" && sql[i + 1] === "*") {
      const close = sql.indexOf("*/", i + 2);
      i = close === -1 ? sql.length : close + 2;
      continue;
    }

    if (ch === "'") {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'") {
          // '' is an escaped quote, not the end of the literal.
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === "$") {
      const tag = dollarTagAt(sql, i);
      if (tag) {
        const close = sql.indexOf(tag, i + tag.length);
        i = close === -1 ? sql.length : close + tag.length;
        continue;
      }
    }

    if (ch === ";") {
      push(i);
      start = i + 1;
    }

    i += 1;
  }

  push(sql.length);
  return statements;
}

/**
 * Drops the comment block a statement inherits from whatever preceded it.
 *
 * A statement's text starts at the previous `;`, so it carries the header
 * comments written above it. Postgres does not care, but a statement that
 * begins with its own verb is what makes a failure log readable.
 */
function stripLeadingComments(raw: string): string {
  let s = raw.trim();
  for (;;) {
    if (s.startsWith("--")) {
      const nl = s.indexOf("\n");
      if (nl === -1) return "";
      s = s.slice(nl + 1).trim();
      continue;
    }
    if (s.startsWith("/*")) {
      const close = s.indexOf("*/");
      if (close === -1) return "";
      s = s.slice(close + 2).trim();
      continue;
    }
    return s;
  }
}

/** Returns the dollar-quote tag opening at `i` (`$$`, `$function$`, ...) or null. */
function dollarTagAt(sql: string, i: number): string | null {
  const match = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
  return match ? match[0] : null;
}
