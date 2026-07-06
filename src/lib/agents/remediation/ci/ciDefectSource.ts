import type { RegressionFixture } from "../fixtures";
import { resolveBaseline, type CiEvent, type CiHistory, type GitOps } from "./baseline";
import { buildCommitPairFixture, type CommitPairSpec, type RepoInspector } from "./commitPairFixture";
import { parseCiReport } from "./ciReport";
import type { DefectReport, DefectSource } from "./defectSource";

/** The fixture builder seam — the real one touches git/fs, so it is injectable for tests. */
export type FixtureBuilder = (spec: CommitPairSpec, repo: RepoInspector) => Promise<RegressionFixture | null>;

export type CiSourceDeps = {
  reportJson: string;
  event: CiEvent;
  originRepo: string;
  repository: string;
  defaultBranch: string;
  image: string;
  git: GitOps;
  history: CiHistory;
  repo: RepoInspector;
  /** Defaults to the real `buildCommitPairFixture`; injected as a stub in unit tests. */
  buildFixture?: FixtureBuilder;
};

/** Detection source for a CI test failure. Each null-return is a safe "nothing to remediate":
 *  no failing test, no resolvable baseline, or a diff outside the single-source-file v1 scope. */
export class CiDefectSource implements DefectSource {
  constructor(private readonly deps: CiSourceDeps) {}

  async detect(): Promise<DefectReport | null> {
    const failure = parseCiReport(this.deps.reportJson);
    if (!failure) return null;
    const baseline = await resolveBaseline(this.deps.event, this.deps.git, this.deps.history);
    if (!baseline) return null;
    const build = this.deps.buildFixture ?? buildCommitPairFixture;
    const fixture = await build(
      { originRepo: this.deps.originRepo, repository: this.deps.repository, baseline, failure, image: this.deps.image },
      this.deps.repo,
    );
    if (!fixture) return null;
    return { repository: this.deps.repository, defaultBranch: this.deps.defaultBranch, fixture };
  }
}
