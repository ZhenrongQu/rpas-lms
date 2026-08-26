// THROWAWAY — CI gate acceptance probe. Delete with this branch.
//
// A Server Component (no "use client") using a React hook. Deliberately the one
// mistake that passes `tsc` and passes vitest: TypeScript has no notion of the
// server/client boundary, and no test imports this file. Only `pnpm build`
// can catch it, which is the claim this branch exists to verify.
import { useState } from "react";

export default function Page() {
  const [n] = useState(0);
  return <div>{n}</div>;
}
