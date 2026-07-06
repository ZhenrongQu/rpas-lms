export type PrTarget = { baseRef: string; headBranch: string };
export type OpenPr = { number: number; url: string };

/** The GitHub operations the publisher needs. Real impl (entrypoint) uses git + the `gh` CLI;
 *  unit tests use MockGitHubClient. */
export interface GitHubClient {
  findOpenPr(headBranch: string): Promise<OpenPr | null>;
  pushFixBranch(a: { headBranch: string; baseCommit: string; patch: string; message: string }): Promise<void>;
  openDraftPr(a: { target: PrTarget; title: string; body: string; labels: string[] }): Promise<OpenPr>;
  commentOnPr(prNumber: number, body: string): Promise<void>;
}

export class MockGitHubClient implements GitHubClient {
  existing: OpenPr | null = null;
  pushed: Array<{ headBranch: string; baseCommit: string; patch: string; message: string }> = [];
  opened: Array<{ target: PrTarget; title: string; body: string; labels: string[] }> = [];
  comments: Array<{ prNumber: number; body: string }> = [];

  async findOpenPr(): Promise<OpenPr | null> {
    return this.existing;
  }
  async pushFixBranch(a: { headBranch: string; baseCommit: string; patch: string; message: string }): Promise<void> {
    this.pushed.push(a);
  }
  async openDraftPr(a: { target: PrTarget; title: string; body: string; labels: string[] }): Promise<OpenPr> {
    this.opened.push(a);
    return { number: 1, url: "https://x/1" };
  }
  async commentOnPr(prNumber: number, body: string): Promise<void> {
    this.comments.push({ prNumber, body });
  }
}
