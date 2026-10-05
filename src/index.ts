import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { QUERIES, searchRepos } from "./search/github-search.js";
import { MIN_SCORE, TOP_N, rankByCategory } from "./ranking/rank.js";
import { generateReport } from "./report/generate.js";

const minScore = Number(process.env.MIN_SCORE ?? MIN_SCORE);
const repos = await searchRepos({
  token: process.env.GITHUB_TOKEN,
  selfOwner: process.env.GITHUB_OWNER ?? "normancomics",
  perQuery: Number(process.env.PER_QUERY ?? 15),
});
const ranked = rankByCategory(repos, minScore, Number(process.env.TOP_N ?? TOP_N));
const md = generateReport(ranked, { minScore, queryCount: QUERIES.length, scanned: repos.length });
const path = process.env.REPORT_PATH ?? "reports/discovery-report.md";
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, md);
console.log(`Wrote ${path} (${repos.length} repos scanned)`);
