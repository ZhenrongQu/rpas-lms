import { compileMDX } from "next-mdx-remote/rsc";

export type MdxValidationResult = { ok: true } | { ok: false; errors: string[] };

// SEC-17: lesson bodies are validated against an ALLOWLIST, not a blacklist of
// "known bad" tags. Every JSX/HTML tag in the body must be either a whitelisted
// lesson component or a whitelisted safe formatting tag; anything else (script,
// iframe, custom elements, unknown components…) is rejected. In MDX every `<tag>`
// — upper- or lower-case — parses as a JSX element, so one allowlist covers both.
// Checkpoints are no longer placed inline (SEC-04): they are authored in the CMS.
const ALLOWED_COMPONENTS = ["Tip", "Caution", "Note"] as const;

// Safe presentational HTML an author might hand-write. Markdown already emits
// most of these from its own syntax; listing them keeps raw use from being
// rejected. Notably absent: script/iframe/object/embed/style/link/meta/form/svg.
const SAFE_HTML_TAGS = [
  "br", "b", "strong", "i", "em", "u", "s", "del", "ins", "sub", "sup", "kbd",
  "mark", "small", "abbr", "code", "pre", "blockquote", "p", "span", "div", "hr",
  "a", "img", "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "th",
  "td", "caption", "h1", "h2", "h3", "h4", "h5", "h6", "figure", "figcaption",
  "dl", "dt", "dd",
] as const;

const EVENT_ATTR = /\son[a-z]+\s*=/i;
const JS_URL = /javascript:/i;
const DATA_HTML_URL = /data:text\/html/i;

/**
 * Removes spans where a `<` is NOT a tag — fenced and inline code, and Markdown
 * autolinks (`<https://…>`, `<a@b.com>`) — so the tag allowlist below doesn't
 * false-positive on documented code or links.
 */
const stripNonTags = (s: string): string =>
  s
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/<[a-z][a-z0-9+.-]*:\/\/[^>]*>/gi, "")
    .replace(/<[a-z][a-z0-9+.-]*:[^>]*>/gi, "")
    .replace(/<[^<>\s@]+@[^<>\s]+>/g, "");

async function compileForSyntax(body: string, locale: string, errors: string[]): Promise<void> {
  try {
    // Compile to surface MDX syntax/parse errors. We deliberately do NOT render
    // the result — rendering would require react-dom/server, which the App Router
    // build forbids; the tag allowlist is enforced by scanTags.
    await compileMDX({ source: body, options: { parseFrontmatter: false } });
  } catch (err) {
    errors.push(`${locale}: invalid MDX — ${(err as Error).message}`);
  }
}

/** Allowlist: reject any JSX/HTML tag that isn't a known component or safe tag. */
function scanTags(body: string, locale: string, errors: string[]): void {
  const s = stripNonTags(body);
  const tagRe = /<\s*([A-Za-z][A-Za-z0-9]*)/g;
  const flagged = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(s))) {
    const name = m[1]!;
    const allowed = /^[A-Z]/.test(name)
      ? (ALLOWED_COMPONENTS as readonly string[]).includes(name)
      : (SAFE_HTML_TAGS as readonly string[]).includes(name.toLowerCase());
    if (!allowed && !flagged.has(name)) {
      flagged.add(name);
      errors.push(`${locale}: disallowed tag <${name}> (not in the allowlist)`);
    }
  }
}

function scanImportsExports(body: string, locale: string, errors: string[]): void {
  if (/^[ \t]*(import|export)\b/m.test(stripNonTags(body))) {
    errors.push(`${locale}: import/export statements are not allowed in lesson bodies`);
  }
}

/** Even on allowed tags, reject dangerous attributes / URLs. */
function scanDangerousAttrs(body: string, locale: string, errors: string[]): void {
  const s = stripNonTags(body);
  if (EVENT_ATTR.test(s)) errors.push(`${locale}: inline event handler (on*=) attribute not allowed`);
  if (JS_URL.test(s)) errors.push(`${locale}: javascript: URL not allowed`);
  if (DATA_HTML_URL.test(s)) errors.push(`${locale}: data:text/html URL not allowed`);
}

/**
 * Validates both MDX bodies before an admin lesson save. Rejects (without
 * writing) on compile/parse failure, any non-allowlisted tag, import/export, or
 * a dangerous attribute/URL. Checkpoints are no longer part of lesson bodies.
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

  scanTags(bodyEN, "EN", errors);
  scanTags(bodyZH, "ZH", errors);

  scanImportsExports(bodyEN, "EN", errors);
  scanImportsExports(bodyZH, "ZH", errors);

  scanDangerousAttrs(bodyEN, "EN", errors);
  scanDangerousAttrs(bodyZH, "ZH", errors);

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}
