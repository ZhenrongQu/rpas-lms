import type { DefectReport, DefectSource } from "../ci/defectSource";
import type { RegressionFixture } from "../fixtures";

/** A single-issue DefectSource: constructed from an already-triaged + already-synthesized
 *  issue, so detect() always returns exactly that ready report (never null-for-escalation). */
export class SentryDefectSource implements DefectSource {
  constructor(private readonly report: { repository: string; defaultBranch: string; fixture: RegressionFixture }) {}
  async detect(): Promise<DefectReport | null> {
    return this.report;
  }
}
