import { describe, it, expect } from "vitest";
import { InMemorySessionStore, type ExamSession } from "./store";

function makeSession(id: string): ExamSession {
  return {
    id,
    certLevel: "BASIC",
    locale: "EN",
    questionIds: ["air-law-0001"],
    questionSnapshot: [],
    startedAt: 0,
    expiresAt: 1000,
    answers: {},
    submitted: false,
  };
}

describe("InMemorySessionStore", () => {
  it("creates and gets a session", async () => {
    const store = new InMemorySessionStore();
    await store.create(makeSession("s1"));
    const got = await store.get("s1");
    expect(got?.id).toBe("s1");
  });

  it("returns null for an unknown id", async () => {
    const store = new InMemorySessionStore();
    expect(await store.get("nope")).toBeNull();
  });

  it("returns copies so callers cannot mutate stored state directly", async () => {
    const store = new InMemorySessionStore();
    await store.create(makeSession("s2"));
    const a = (await store.get("s2"))!;
    a.answers["air-law-0001"] = ["a"];
    const b = (await store.get("s2"))!;
    expect(b.answers["air-law-0001"]).toBeUndefined();
  });

  it("persists updates", async () => {
    const store = new InMemorySessionStore();
    await store.create(makeSession("s3"));
    const s = (await store.get("s3"))!;
    s.answers["air-law-0001"] = ["b"];
    s.submitted = true;
    await store.update(s);
    const got = (await store.get("s3"))!;
    expect(got.submitted).toBe(true);
    expect(got.answers["air-law-0001"]).toEqual(["b"]);
  });
});
