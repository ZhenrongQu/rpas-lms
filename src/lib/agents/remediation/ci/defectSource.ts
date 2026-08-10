import type { RegressionFixture } from "../fixtures";

/** What a detection source hands the runner: the incident coordinates + a ready fixture. */
export type DefectReport = {
  repository: string;
  defaultBranch: string;
  fixture: RegressionFixture;
};

/** The A/B-shared detection seam. `detect` returns null when there is nothing to remediate. */
export interface DefectSource {
  detect(): Promise<DefectReport | null>;
}
