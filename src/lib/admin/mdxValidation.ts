import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileMDX } from "next-mdx-remote/rsc";
import { prisma } from "../db";

export type MdxValidationResult = { ok: true } | { ok: false; errors: string[] };

// Stub components for validation render. The four known lesson components map to
// passthroughs so valid MDX renders without client context/fetch; any other
// capitalized component is absent from this map, so render throws — that is the
// whitelist. (Run 7: the real Checkpoint is 'use client' + context, so a real
// component map would throw on valid MDX.)
const passthrough = (props: { children?: ReactNode }) =>
  createElement(Fragment, null, props.children);
const STUBS = { Tip: passthrough, Caution: passthrough, Note: passthrough, Checkpoint: passthrough };

/** Removes fenced code blocks so scans don't false-positive on documented code. */
const stripFences = (s: string): string =>
  s.replace(/```[\s\S]*?```/g, "").replace(/~~~[\s\S]*?~~~/g, "");

const DANGEROUS_TAG = /<\s*(script|iframe|object|embed|style|link|meta)\b/i;
const EVENT_ATTR = /\son[a-z]+\s*=/i;
const JS_URL = /javascript:/i;
const DATA_HTML_URL = /data:text\/html/i;

async function compileAndRender(body: string, locale: string, errors: string[]): Promise<void> {
  try {
    const { content } = await compileMDX({
      source: body,
      components: STUBS,
      options: { parseFrontmatter: false },
    });
    renderToStaticMarkup(content);
  } catch (err) {
    errors.push(`${locale}: invalid MDX — ${(err as Error).message}`);
  }
}

function scanImportsExports(body: string, locale: string, errors: string[]): void {
  if (/^[ \t]*(import|export)\b/m.test(stripFences(body))) {
    errors.push(`${locale}: import/export statements are not allowed in lesson bodies`);
  }
}

function scanDangerousHtml(body: string, locale: string, errors: string[]): void {
  const s = stripFences(body);
  if (DANGEROUS_TAG.test(s)) {
    errors.push(`${locale}: disallowed HTML tag (script/iframe/object/embed/style/link/meta)`);
  }
  if (EVENT_ATTR.test(s)) errors.push(`${locale}: inline event handler (on*=) attribute not allowed`);
  if (JS_URL.test(s)) errors.push(`${locale}: javascript: URL not allowed`);
  if (DATA_HTML_URL.test(s)) errors.push(`${locale}: data:text/html URL not allowed`);
}

/** Extracts checkpoint questionIds, enforcing the literal self-closing form. */
function parseCheckpoints(body: string, locale: string, errors: string[]): string[] {
  const s = stripFences(body);
  const ids: string[] = [];
  const seen = new Set<string>();
  const tagRe = /<Checkpoint\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(s))) {
    const tag = m[0];
    const idMatch = tag.match(/questionId="([^"]+)"/);
    if (!/\/>\s*$/.test(tag)) {
      errors.push(`${locale}: <Checkpoint> must be self-closing (<Checkpoint questionId="…" />)`);
    }
    if (!idMatch) {
      errors.push(`${locale}: <Checkpoint> needs a literal questionId="…" (no expression props)`);
      continue;
    }
    const id = idMatch[1];
    if (seen.has(id)) errors.push(`${locale}: duplicate Checkpoint questionId "${id}"`);
    seen.add(id);
    ids.push(id);
  }
  if (ids.length === 0) {
    errors.push(`${locale}: lesson must contain at least one <Checkpoint questionId="…" />`);
  }
  return ids;
}

async function checkQuestionIds(ids: string[], moduleId: string, errors: string[]): Promise<void> {
  if (ids.length === 0) return;
  const rows = await prisma.question.findMany({
    where: { id: { in: ids }, status: "ACTIVE" },
    select: { id: true, moduleId: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      errors.push(`Checkpoint questionId "${id}" is not an ACTIVE question`);
    } else if (row.moduleId !== moduleId) {
      errors.push(`Checkpoint questionId "${id}" is in module "${row.moduleId}", not "${moduleId}"`);
    }
  }
}

/**
 * Validates both MDX bodies before an admin lesson save. Rejects (without
 * writing) on: compile/render failure, unknown components, import/export,
 * dangerous raw HTML, and malformed/duplicate/expression/cross-module/inactive
 * Checkpoints or EN↔ZH questionId-set mismatch.
 */
export async function validateLessonMdxBodies({
  bodyEN,
  bodyZH,
  moduleId,
}: {
  bodyEN: string;
  bodyZH: string;
  moduleId: string;
}): Promise<MdxValidationResult> {
  const errors: string[] = [];

  await compileAndRender(bodyEN, "EN", errors);
  await compileAndRender(bodyZH, "ZH", errors);

  scanImportsExports(bodyEN, "EN", errors);
  scanImportsExports(bodyZH, "ZH", errors);
  scanDangerousHtml(bodyEN, "EN", errors);
  scanDangerousHtml(bodyZH, "ZH", errors);

  const enIds = parseCheckpoints(bodyEN, "EN", errors);
  const zhIds = parseCheckpoints(bodyZH, "ZH", errors);

  const enSet = new Set(enIds);
  const zhSet = new Set(zhIds);
  const diff = [...enSet].filter((x) => !zhSet.has(x)).concat([...zhSet].filter((x) => !enSet.has(x)));
  if (diff.length > 0) {
    errors.push(`EN and ZH must reference the same Checkpoint questionId set (differs: ${diff.join(", ")})`);
  }

  await checkQuestionIds([...new Set([...enIds, ...zhIds])], moduleId, errors);

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}
