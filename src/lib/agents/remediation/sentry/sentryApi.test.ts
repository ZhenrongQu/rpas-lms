import { describe, expect, it } from "vitest";
import { SentryApiSource, sentryApiSourceFromEnv, type FetchLike } from "./sentryApi";

const cfg = { org: "o", project: "p", token: "t" };

/** A fetch that answers from a URL-substring → payload table and records what was asked. */
function fakeFetch(table: Record<string, unknown>, calls: string[] = []): FetchLike {
  return async (url) => {
    calls.push(url);
    const hit = Object.entries(table).find(([frag]) => url.includes(frag));
    if (!hit) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => hit[1] };
  };
}

const issueRow = {
  id: "42",
  title: "TypeError: bad",
  culprit: "isAnswerCorrect(src/lib/exam/grade.ts)",
  count: "7", // Sentry sends this as a string
  firstSeen: "2026-08-01T00:00:00Z",
  lastSeen: "2026-08-02T00:00:00Z",
  metadata: { type: "TypeError", value: "bad" },
};

// Sentry orders frames oldest-first: handler → service → crash site.
const latestEvent = {
  release: { version: "sha-current" },
  entries: [
    {
      type: "exception",
      data: {
        values: [
          {
            type: "TypeError",
            value: "Cannot read properties of undefined",
            stacktrace: {
              frames: [
                { function: "handler", filename: "app/api/exam/route.ts", lineNo: 3, inApp: true },
                { function: "isAnswerCorrect", filename: "src/lib/exam/grade.ts", lineNo: 17, inApp: true },
              ],
            },
          },
        ],
      },
    },
  ],
};

const table = {
  "/releases/": [{ version: "sha-current" }, { version: "sha-prev" }, { version: "sha-older" }],
  "/issues/?query": [issueRow],
  "/events/latest/": latestEvent,
};

describe("SentryApiSource", () => {
  it("puts the crash site first, so triage's first-inApp-frame lands on the defect", async () => {
    const [got] = await new SentryApiSource(cfg, fakeFetch(table)).unresolvedIssues();
    // Reversed from Sentry's oldest-first order.
    expect(got!.frames[0]).toEqual({
      function: "isAnswerCorrect",
      filename: "src/lib/exam/grade.ts",
      lineno: 17,
      inApp: true,
    });
  });

  it("resolves previous as the release deployed just before the current one", async () => {
    const [got] = await new SentryApiSource(cfg, fakeFetch(table)).unresolvedIssues();
    expect(got!.release).toEqual({ current: "sha-current", previous: "sha-prev" });
  });

  it("leaves previous null for the oldest release, so triage escalates instead of guessing", async () => {
    const oldest = { ...table, "/releases/": [{ version: "sha-current" }] };
    const [got] = await new SentryApiSource(cfg, fakeFetch(oldest)).unresolvedIssues();
    expect(got!.release.previous).toBeNull();
  });

  it("leaves previous null when the event's release is not in the release list", async () => {
    const unknown = { ...table, "/releases/": [{ version: "something-else" }] };
    const [got] = await new SentryApiSource(cfg, fakeFetch(unknown)).unresolvedIssues();
    expect(got!.release.previous).toBeNull();
  });

  it("coerces Sentry's string count to a number", async () => {
    const [got] = await new SentryApiSource(cfg, fakeFetch(table)).unresolvedIssues();
    expect(got!.count).toBe(7);
  });

  it("falls back to issue metadata when the event carries no exception entry", async () => {
    const noEntries = { ...table, "/events/latest/": { release: { version: "sha-current" }, entries: [] } };
    const [got] = await new SentryApiSource(cfg, fakeFetch(noEntries)).unresolvedIssues();
    expect(got!.error).toEqual({ type: "TypeError", value: "bad" });
    expect(got!.frames).toEqual([]);
  });

  it("sends the bearer token and throws on a non-OK response", async () => {
    const calls: string[] = [];
    const failing: FetchLike = async (url) => {
      calls.push(url);
      return { ok: false, status: 403, json: async () => ({}) };
    };
    await expect(new SentryApiSource(cfg, failing).unresolvedIssues()).rejects.toThrow(/HTTP 403/);
  });

  it("targets the configured self-hosted base url", async () => {
    const calls: string[] = [];
    await new SentryApiSource({ ...cfg, baseUrl: "https://sentry.internal/" }, fakeFetch(table, calls)).unresolvedIssues();
    expect(calls.every((u) => u.startsWith("https://sentry.internal/api/0/"))).toBe(true);
  });
});

describe("sentryApiSourceFromEnv", () => {
  it("returns null when Sentry is not configured, so the pipeline can fall back", () => {
    expect(sentryApiSourceFromEnv({})).toBeNull();
    expect(sentryApiSourceFromEnv({ SENTRY_ORG: "o", SENTRY_PROJECT: "p" })).toBeNull();
  });

  it("builds a source when org, project and token are all present", () => {
    expect(sentryApiSourceFromEnv({ SENTRY_ORG: "o", SENTRY_PROJECT: "p", SENTRY_API_TOKEN: "t" })).toBeInstanceOf(
      SentryApiSource,
    );
  });
});
