import { test } from "node:test";
import assert from "node:assert/strict";
import { rankByCategory, scoreRepo } from "../src/ranking/rank.js";
import { generateReport } from "../src/report/generate.js";
import type { Repo } from "../src/search/github-search.js";

const base: Repo = {
  fullName: "a/b", url: "https://github.com/a/b", description: "base defi farcaster miniapp",
  topics: ["base", "defi"], stars: 3000, forks: 200, language: "TypeScript",
  pushedAt: new Date().toISOString(), hasLicense: true, hasHomepage: true, owner: "a", category: "Base DeFi",
};

test("score stays within 0-100 and weights are capped", () => {
  const s = scoreRepo({ ...base, stars: 1e9, forks: 1e9 });
  assert.ok(s.score <= 100);
  assert.ok(s.breakdown.keywords <= 25 && s.breakdown.popularity <= 40 && s.breakdown.adoption <= 15);
});

test("low-scoring repos are filtered and top N is enforced", () => {
  const weak: Repo = { ...base, fullName: "x/y", description: "", topics: [], stars: 0, forks: 0, hasLicense: false, hasHomepage: false, pushedAt: "2010-01-01T00:00:00Z" };
  const many = Array.from({ length: 20 }, (_, i) => ({ ...base, fullName: `a/r${i}` }));
  const out = rankByCategory([weak, ...many]);
  assert.equal(out["Base DeFi"].length, 12);
  assert.ok(!out["Base DeFi"].some((r) => r.fullName === "x/y"));
});

test("report contains required sections", () => {
  const md = generateReport(rankByCategory([base]), { minScore: 40, queryCount: 13, scanned: 1 });
  for (const h of ["Summary", "Recommended Channels", "Outreach Templates", "Methodology", "Ethical Guidelines"]) {
    assert.ok(md.includes(h), h);
  }
});
