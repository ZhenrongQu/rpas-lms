import type { SentryFrame, SentryIssue, SentrySource } from "./sentryIssue";

/**
 * The real Sentry feed, behind the same `SentrySource` seam as `FixtureSentrySource`.
 *
 * Three calls per poll: the project's releases (newest first, to resolve each issue's
 * PREVIOUS release), the unresolved issue list, then each issue's latest event for the
 * stack frames. `fetch` is injected so the mapping is unit-testable without a network.
 *
 * `release.current/previous` must be GIT COMMIT SHAs — `triage.ts` feeds them straight to
 * `SentryRepo.commitExists`/`isAncestor`. Sentry release *versions* are whatever the deploy
 * pipeline names them; this adapter passes them through verbatim. On Vercel the convention
 * is the commit SHA, and a version that is not a real commit is rejected by triage's
 * `commitExists` check, so a mismatched convention escalates rather than misfires.
 */
export type SentryApiConfig = {
  org: string;
  project: string;
  /** Auth token with `event:read` scope. */
  token: string;
  /** SaaS default; override for self-hosted. */
  baseUrl?: string;
  /** How far back to look for unresolved issues. */
  statsPeriod?: string;
};

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/** Sentry's event payload uses `lineNo`; the raw store format uses `lineno`. Accept both. */
type RawFrame = { function?: string; filename?: string; lineNo?: number; lineno?: number; inApp?: boolean };

function toFrames(raw: RawFrame[]): SentryFrame[] {
  return (
    raw
      .map((f) => ({
        function: f.function ?? "",
        filename: f.filename ?? "",
        lineno: f.lineNo ?? f.lineno ?? 0,
        inApp: f.inApp === true,
      }))
      // Sentry orders frames OLDEST-FIRST (the crash site is last). Consumers take the
      // FIRST in-app frame as the crash site, so reverse into crash-first order.
      .reverse()
  );
}

export class SentryApiSource implements SentrySource {
  private readonly baseUrl: string;
  private readonly statsPeriod: string;

  constructor(
    private readonly cfg: SentryApiConfig,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
  ) {
    this.baseUrl = (cfg.baseUrl ?? "https://sentry.io").replace(/\/$/, "");
    this.statsPeriod = cfg.statsPeriod ?? "14d";
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.cfg.token}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Sentry API ${path} failed: HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  /** Release versions newest-first, so `previous` is simply the next entry. */
  private async releaseOrder(): Promise<string[]> {
    const releases = await this.get<{ version: string }[]>(
      `/api/0/projects/${this.cfg.org}/${this.cfg.project}/releases/`,
    );
    return releases.map((r) => r.version);
  }

  async unresolvedIssues(): Promise<SentryIssue[]> {
    const [order, issues] = await Promise.all([
      this.releaseOrder(),
      this.get<
        {
          id: string;
          title: string;
          culprit: string;
          count: string | number;
          firstSeen: string;
          lastSeen: string;
          metadata?: { type?: string; value?: string };
        }[]
      >(
        `/api/0/projects/${this.cfg.org}/${this.cfg.project}/issues/` +
          `?query=${encodeURIComponent("is:unresolved")}&statsPeriod=${this.statsPeriod}`,
      ),
    ]);

    const out: SentryIssue[] = [];
    for (const issue of issues) {
      const event = await this.get<{
        release?: { version?: string } | null;
        entries?: { type: string; data?: { values?: { type?: string; value?: string; stacktrace?: { frames?: RawFrame[] } }[] } }[];
      }>(`/api/0/issues/${issue.id}/events/latest/`);

      const exception = event.entries?.find((e) => e.type === "exception")?.data?.values?.at(-1);
      const current = event.release?.version ?? "";
      const idx = order.indexOf(current);
      // The release deployed immediately before this one is the known-good candidate.
      // Unknown or oldest release ⇒ null, and triage escalates rather than guessing.
      const previous = idx >= 0 && idx + 1 < order.length ? order[idx + 1]! : null;

      out.push({
        id: issue.id,
        title: issue.title,
        culprit: issue.culprit,
        count: Number(issue.count) || 0,
        firstSeen: issue.firstSeen,
        lastSeen: issue.lastSeen,
        error: {
          type: exception?.type ?? issue.metadata?.type ?? "",
          value: exception?.value ?? issue.metadata?.value ?? "",
        },
        frames: toFrames(exception?.stacktrace?.frames ?? []),
        release: { current, previous },
      });
    }
    return out;
  }
}

/** Build a source from env, or null when Sentry is not configured (the caller then falls
 *  back to the fixture source — an unconfigured Sentry must not crash the pipeline). */
export function sentryApiSourceFromEnv(
  env: Record<string, string | undefined> = process.env,
): SentryApiSource | null {
  const { SENTRY_ORG: org, SENTRY_PROJECT: project, SENTRY_API_TOKEN: token } = env;
  if (!org || !project || !token) return null;
  return new SentryApiSource({ org, project, token, baseUrl: env.SENTRY_BASE_URL });
}
