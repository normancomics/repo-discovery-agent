import type { Candidate, Profile, ScoredCandidate } from "../types.js";

const STOP = new Set(["the", "a", "an", "and", "or", "of", "for", "to", "in", "on", "with", "is", "are", "app", "based"]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function profileText(p: Profile): string {
  return [p.name, p.description, p.tags.join(" "), p.summary ?? ""].join(" ");
}

export function candidateText(c: Candidate): string {
  return [c.fullName, c.description, c.topics.join(" "), c.language ?? ""].join(" ");
}

const isBase = (c: Candidate) =>
  c.topics.some((t) => t.toLowerCase() === "base" || t.toLowerCase().startsWith("base-")) ||
  /\bbase\b/i.test(c.description);

/**
 * Score = lexical overlap (0..1) blended with optional semantic similarity,
 * plus small boosts for Base-first, language match, and recent activity.
 */
export function scoreCandidate(
  profile: Profile,
  c: Candidate,
  semantic: number | null = null,
  now: Date = new Date(),
): ScoredCandidate {
  const reasons: string[] = [];
  const pTokens = new Set(tokenize(profileText(profile)));
  const cTokens = new Set(tokenize(candidateText(c)));
  const lexical = jaccard(pTokens, cTokens);

  const tagSet = new Set(profile.tags.map((t) => t.toLowerCase().replace(/\s+/g, "-")));
  const sharedTags = c.topics.filter((t) => tagSet.has(t.toLowerCase()));
  if (sharedTags.length) reasons.push(`shared topics: ${sharedTags.join(", ")}`);

  let score = semantic === null ? lexical * 2 : lexical + semantic;
  score += Math.min(sharedTags.length, 4) * 0.1;

  if (isBase(c)) {
    score += 0.25;
    reasons.push("Base ecosystem");
  }
  if (c.language && profile.languages.some((l) => l.toLowerCase() === c.language!.toLowerCase())) {
    score += 0.05;
    reasons.push(`language: ${c.language}`);
  }
  const ageDays = c.pushedAt ? (now.getTime() - new Date(c.pushedAt).getTime()) / 864e5 : Infinity;
  if (ageDays < 90) {
    score += 0.1;
    reasons.push("recently active");
  } else if (ageDays > 730) {
    score -= 0.2;
  }
  score += Math.min(Math.log10(c.stars + 1) / 20, 0.15);

  return { ...c, score, lexical, semantic, reasons };
}

export function rank(
  profile: Profile,
  candidates: Candidate[],
  semantics: (number | null)[] = [],
  topN = 10,
): ScoredCandidate[] {
  return candidates
    .map((c, i) => scoreCandidate(profile, c, semantics[i] ?? null))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
