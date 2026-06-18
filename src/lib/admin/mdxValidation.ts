import { compileMDX } from "next-mdx-remote/rsc";

export type MdxValidationResult = { ok: true } | { ok: false; errors: string[] };

// Whitelisted lesson components. Any other capitalized JSX tag is rejected by
// scanComponents (that scan IS the whitelist). Checkpoints are no longer placed
// inline (SEC-04): they are authored in the CMS, assigned to a lesson, and
// rendered at the lesson bottom — so <Checkpoint> is not an allowed MDX tag.
const ALLOWED_COMPONENTS = ["Tip", "Caution", "Note"] as const;

/** Removes fenced code blocks so scans don't false-positive on documented code. */
const stripFences = (s: string): string =>
  s.replace(/```[\s\S]*?```/g, "").replace(/~~~[\s\S]*?~~~/g, "");

const DANGEROUS_TAG = /<\s*(script|iframe|object|embed|style|link|meta)\b/i;
const EVENT_ATTR = /\son[a-z]+\s*=/i;
const JS_URL = /javascript:/i;
const DATA_HTML_URL = /data:text\/html/i;

async function compileForSyntax(body: string, locale: string, errors: string[]): Promise<void> {
  try {
    // Compile to surface MDX syntax/parse errors. We deliberately do NOT render
    // the result — rendering would require react-dom/server, which the App Router
    // build forbids; the component whitelist is enforced by scanComponents.
    await compileMDX({ source: body, options: { parseFrontmatter: false } });
  } catch (err) {
    errors.push(`${locale}: invalid MDX — ${(err as Error).message}`);
  }
}

/** Whitelist: reject any capitalized JSX component not in ALLOWED_COMPONENTS. */
function scanComponents(body: string, locale: string, errors: string[]): void {
  const s = stripFences(body);
  const tagRe = /<\s*([A-Z][A-Za-z0-9]*)/g;
  const flagged = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(s))) {
    const name = m[1];
    if (!(ALLOWED_COMPONENTS as readonly string[]).includes(name) && !flagged.has(name)) {
      flagged.add(name);
      errors.push(`${locale}: unknown component <${name}> (allowed: ${ALLOWED_COMPONENTS.join(", ")})`);
    }
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

/**
 * Validates both MDX bodies before an admin lesson save. Rejects (without
 * writing) on compile/parse failure, unknown components, import/export, or
 * dangerous raw HTML. Checkpoints are no longer part of lesson bodies.
 */
export async function validateLessonMdxBodies({
  bodyEN,
  bodyZH,
}: {
  bodyEN: string;
  bodyZH: string;
}): Promise<MdxValidationResult> {
  const errors: string[] = [];

  await compileForSyntax(bodyEN, "EN", errors);
  await compileForSyntax(bodyZH, "ZH", errors);

  scanComponents(bodyEN, "EN", errors);
  scanComponents(bodyZH, "ZH", errors);

  scanImportsExports(bodyEN, "EN", errors);
  scanImportsExports(bodyZH, "ZH", errors);

  scanDangerousHtml(bodyEN, "EN", errors);
  scanDangerousHtml(bodyZH, "ZH", errors);

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}
