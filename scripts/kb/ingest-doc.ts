/**
 * Ingest an external reference document into the RAG knowledge base — the entry
 * point for feeding in regulations, Transport Canada material, study guides, etc.
 *
 *   pnpm tsx scripts/kb/ingest-doc.ts --file <path> --source-id <slug> --title "<title>" \
 *       [--locale EN|ZH] [--cert BASIC|ADVANCED] [--module <moduleId>]
 *
 * The file is treated as markdown/plain text for one language. Ingest EN and ZH
 * versions of the same document as two runs sharing a --source-id; each replaces
 * only its own locale's chunks (source = "DOCUMENT"). Requires VOYAGE_API_KEY.
 */
import { readFileSync } from "node:fs";
import { prisma } from "../../src/lib/db";
import { indexSource, ensureVectorIndex } from "./_shared";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const file = arg("file");
  const sourceId = arg("source-id");
  const title = arg("title");
  const locale = (arg("locale") ?? "EN").toUpperCase();
  const certRaw = arg("cert");
  const moduleId = arg("module") ?? null;

  if (!file || !sourceId || !title) {
    console.error(
      "Usage: tsx scripts/kb/ingest-doc.ts --file <path> --source-id <slug> --title <title> " +
        "[--locale EN|ZH] [--cert BASIC|ADVANCED] [--module <moduleId>]",
    );
    process.exit(2);
  }
  if (locale !== "EN" && locale !== "ZH") {
    console.error(`--locale must be EN or ZH (got ${locale})`);
    process.exit(2);
  }
  // A present-but-invalid --cert must fail, not silently index as cert-agnostic
  // (e.g. a typo like ADVNACED). Only an absent flag means "no cert level".
  let certLevel: "BASIC" | "ADVANCED" | null = null;
  if (certRaw !== undefined) {
    const up = certRaw.toUpperCase();
    if (up !== "BASIC" && up !== "ADVANCED") {
      console.error(`--cert must be BASIC or ADVANCED (got "${certRaw}")`);
      process.exit(2);
    }
    certLevel = up;
  }

  const body = readFileSync(file, "utf8");
  const n = await indexSource({
    source: "DOCUMENT",
    sourceId,
    moduleId,
    certLevel,
    locales: [{ locale, title, body }],
  });

  await ensureVectorIndex();
  console.log(`✓ ingested "${title}" [${sourceId}/${locale}] → ${n} chunks`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
