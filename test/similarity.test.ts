import { test } from "node:test";
import assert from "node:assert/strict";
import { rank, tokenize, jaccard } from "../src/ranking/similarity.js";
import { defaultDraft, renderReport } from "../src/report/markdown.js";
import type { Candidate, Profile } from "../src/types.js";

const profile: Profile = {
  id: "p", name: "P", repo: "o/p", description: "DeFi on Base with Farcaster",
  tags: ["Base", "Farcaster", "DeFi"], languages: ["TypeScript"], outreachGoal: "",
};
const mk = (fullName: string, over: Partial<Candidate> = {}): Candidate => ({
  fullName, url: `https://github.com/${fullName}`, description: "", topics: [], language: null,
  stars: 10, pushedAt: new Date().toISOString(), owner: fullName.split("/")[0], archived: false, fork: false, ...over,
});

test("tokenize/jaccard", () => {
  assert.deepEqual(tokenize("The Base-chain app"), ["base", "chain"]);
  assert.equal(jaccard(new Set(["a"]), new Set(["a"])), 1);
  assert.equal(jaccard(new Set(), new Set(["a"])), 0);
});

test("rank prefers Base/Farcaster relevant repos", () => {
  const good = mk("x/good", { description: "Farcaster DeFi on Base", topics: ["base", "farcaster"], language: "TypeScript" });
  const bad = mk("x/bad", { description: "image editor" });
  const ranked = rank(profile, [bad, good]);
  assert.equal(ranked[0].fullName, "x/good");
  assert.ok(ranked[0].reasons.includes("Base ecosystem"));
});

test("report is marked human-review and includes drafts", () => {
  const m = rank(profile, [mk("x/good", { topics: ["base"] })]);
  const md = renderReport([{ profile, matches: m, drafts: new Map(), channels: [] }]);
  assert.match(md, /human review only/i);
  assert.ok(md.includes(defaultDraft(profile, m[0])));
});
