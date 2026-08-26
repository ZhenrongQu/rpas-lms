import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { splitSqlStatements } from "./sqlStatements";

describe("splitSqlStatements", () => {
  it("splits plain statements and drops empty fragments", () => {
    expect(splitSqlStatements("SELECT 1; SELECT 2;;\n")).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("keeps semicolons inside a dollar-quoted body", () => {
    const sql = `
      CREATE FUNCTION f() RETURNS int LANGUAGE plpgsql AS $function$
      DECLARE x int;
      BEGIN
        x := 1;
        RETURN x;
      END;
      $function$;
      SELECT 1;
    `;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("RETURN x;");
    expect(statements[1]).toBe("SELECT 1");
  });

  it("handles anonymous $$ blocks and two differently tagged bodies", () => {
    const sql = `DO $$ BEGIN PERFORM 1; END $$; DO $b$ BEGIN PERFORM 2; END $b$; SELECT 3;`;
    expect(splitSqlStatements(sql)).toHaveLength(3);
  });

  it("strips the header comments a statement inherits from the line above it", () => {
    const statements = splitSqlStatements("-- header\n-- more\nSELECT 1;\n/* block */ SELECT 2;");

    expect(statements).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("ignores semicolons in string literals, escaped quotes, and comments", () => {
    const sql = `
      -- a comment with ; in it
      SELECT 'a;b', 'it''s; fine';
      /* block ; comment */
      SELECT 2;
    `;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("'it''s; fine'");
  });

  it("returns a trailing statement that has no terminating semicolon", () => {
    expect(splitSqlStatements("SELECT 1")).toEqual(["SELECT 1"]);
  });

  // The regression this exists for: `prisma/sql/001-rls.sql` is the file whose
  // PL/pgSQL bodies broke the old split(";"). If it ever splits into fragments
  // again, `pnpm db:indexes` silently applies half a hardening script.
  it("splits the real RLS hardening file into whole statements", () => {
    const sql = readFileSync(join(process.cwd(), "prisma", "sql", "001-rls.sql"), "utf8");
    const statements = splitSqlStatements(sql);

    // CREATE FUNCTION, DROP EVENT TRIGGER, CREATE EVENT TRIGGER, DO backfill.
    expect(statements).toHaveLength(4);
    expect(statements.filter((s) => s.includes("$function$"))).toHaveLength(1);
    expect(statements.filter((s) => s.startsWith("DO "))).toHaveLength(1);
    // No fragment may start mid-body — that is what the old splitter produced.
    for (const statement of statements) {
      expect(statement).toMatch(/^(CREATE|DROP|DO)\b/);
    }
  });
});
