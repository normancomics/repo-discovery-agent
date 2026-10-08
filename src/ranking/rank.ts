import type { Repo } from "../search/github-search.js";

export const KEYWORDS = [
  "base", "defi", "farcaster", "miniapp", "mcp", "x402", "zk", "zero-knowledge",
  "privacy", "erc-8004", "noir", "superfluid", "monero", "sovereign", "agent",
  "bible", "tithing", "christian", "onchain", "watcher", "security",
];

export const MIN_SCORE = 40;
export const TOP_N = 12;

export interface ScoredRepo extends Repo {
  score: number;
  breakdown: { keywords: number; popularity: number; activity: number; professionalism: number; adoption: number };
  matchedKeywords: string[];
}

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));

export function scoreRepo(repo: Repo, now = Date.now()): ScoredRepo {
  const text = `${repo.fullName} ${repo.description} ${repo.topics.join(" ")}`.toLowerCase();
  const matched = KEYWORDS.filter((k) => text.includes(k));
  const keywords = clamp(matched.length * 5, 25);
  // log scale: ~10k stars saturates 40 pts
  const popularity = clamp((Math.log10(repo.stars + 1) / 4) * 40, 40);
  const days = (now - new Date(repo.pushedAt).getTime()) / 86_400_000;
  const activity = days <= 30 ? 20 : days <= 90 ? 15 : days <= 180 ? 10 : days <= 365 ? 5 : 0;
  const professionalism =
    (repo.hasLicense ? 4 : 0) + (repo.description ? 3 : 0) + (repo.hasHomepage ? 3 : 0);
  const adoption = clamp((Math.log10(repo.forks + 1) / 3) * 15, 15);
  const r = (n: number) => Math.round(n * 10) / 10;
  const breakdown = {
    keywords: r(keywords), popularity: r(popularity), activity: r(activity),
    professionalism: r(professionalism), adoption: r(adoption),
  };
  // component caps sum to 110, so normalize to a 0-100 scale
  const score = r(((keywords + popularity + activity + professionalism + adoption) / 110) * 100);
  return { ...repo, score, breakdown, matchedKeywords: matched };
}

export function rankByCategory(
  repos: Repo[],
  minScore = MIN_SCORE,
  topN = TOP_N,
): Record<string, ScoredRepo[]> {
  const out: Record<string, ScoredRepo[]> = {};
  for (const repo of repos) {
    const s = scoreRepo(repo);
    if (s.score < minScore) continue;
    (out[s.category] ??= []).push(s);
  }
  for (const k of Object.keys(out)) {
    out[k] = out[k].sort((a, b) => b.score - a.score).slice(0, topN);
  }
  return out;
}
