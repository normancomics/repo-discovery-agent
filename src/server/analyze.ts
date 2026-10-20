// Rule-based (no LLM) analysis of normancomics' repos.
import { getRepo, issues, readme, tree, listRepos, sponsorLinks, type OwnRepo } from "./github.js";

const STACK: [RegExp, string][] = [
  [/(^|\/)package\.json$/, "Node.js"], [/tsconfig\.json$/, "TypeScript"], [/next\.config\./, "Next.js"],
  [/vite\.config\./, "Vite"], [/remix\.config\.|@remix-run/, "Remix"], [/hardhat\.config\./, "Hardhat"],
  [/foundry\.toml$/, "Foundry"], [/\.sol$/, "Solidity"], [/\.nr$|Nargo\.toml$/, "Noir"], [/\.circom$/, "Circom"],
  [/requirements\.txt$|pyproject\.toml$/, "Python"], [/Cargo\.toml$/, "Rust"], [/go\.mod$/, "Go"],
  [/Dockerfile$/, "Docker"], [/\.github\/workflows\//, "GitHub Actions"], [/supabase\//, "Supabase"],
  [/tailwind\.config\./, "Tailwind"], [/vercel\.json$/, "Vercel"], [/render\.yaml$/, "Render"],
  [/farcaster|\.well-known\/farcaster/, "Farcaster"], [/mcp/i, "MCP"],
];

function summarize(md: string): string {
  const text = md.replace(/```[\s\S]*?```/g, "").replace(/<[^>]+>/g, "").split(/\n\s*\n/)
    .map((p) => p.replace(/^#+\s.*$/gm, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim())
    .filter((p) => p.length > 40 && !/^[-*|>]/.test(p));
  return text.slice(0, 2).join("\n\n").slice(0, 800);
}

function runHints(md: string, files: string[]): string[] {
  const out = new Set<string>();
  for (const m of md.matchAll(/```(?:bash|sh|shell|console)?\n([\s\S]*?)```/g)) {
    for (const line of m[1].split("\n")) {
      const l = line.replace(/^\$\s*/, "").trim();
      if (/^(npm|pnpm|yarn|bun|npx|node|python|pip|forge|cargo|go|docker|make)\b/.test(l)) out.add(l);
    }
  }
  if (!out.size && files.includes("package.json")) out.add("npm install && npm run dev");
  return [...out].slice(0, 8);
}

export async function analyzeRepo(name: string) {
  const repo = await getRepo(name);
  if (!repo) return undefined;
  const [md, files, open] = await Promise.all([readme(repo.name), tree(repo.name, repo.defaultBranch), issues(repo.name)]);
  const stack = [...new Set(STACK.filter(([re]) => files.some((f) => re.test(f))).map(([, s]) => s))];
  const days = Math.round((Date.now() - new Date(repo.pushedAt).getTime()) / 86_400_000);
  const good = open.filter((i) => i.labels.some((l) => /good first|help wanted|easy|beginner/i.test(l)));
  return {
    repo, summary: summarize(md) || repo.description,
    techStack: stack, language: repo.language, fileCount: files.length,
    entryPoints: files.filter((f) => /^(src\/)?(index|main|app|server)\.(t|j)sx?$|^app\/page\.tsx$|^pages\/index\./.test(f)),
    howToRun: runHints(md, files),
    activity: { daysSinceLastPush: days, status: days <= 30 ? "active" : days <= 180 ? "maintained" : "dormant", openIssues: open.length },
    goodFirstContributions: (good.length ? good : open).slice(0, 5),
    health: {
      hasReadme: !!md, hasLicense: !!repo.license, hasCI: files.some((f) => f.startsWith(".github/workflows/")),
      hasTests: files.some((f) => /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\./.test(f)),
      hasFunding: files.includes(".github/FUNDING.yml"),
    },
    sponsor: sponsorLinks(),
  };
}

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9-]+/).filter((t) => t.length > 1);

export function textScore(repo: OwnRepo, terms: string[]) {
  const hay = `${repo.name} ${repo.description} ${repo.topics.join(" ")} ${repo.language ?? ""}`.toLowerCase();
  const matched = terms.filter((t) => hay.includes(t));
  return { matched, score: matched.length };
}

export async function searchOwn(q: string) {
  const terms = tokens(q);
  return (await listRepos()).map((r) => ({ r, ...textScore(r, terms) }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score || b.r.stars - a.r.stars)
    .map((x) => ({ ...x.r, matched: x.matched }));
}

export async function matchInterests(interests: string) {
  const terms = tokens(interests);
  const all = await listRepos();
  const scored = all.map((r) => {
    const { matched } = textScore(r, terms);
    const days = (Date.now() - new Date(r.pushedAt).getTime()) / 86_400_000;
    const score = Math.round(Math.min(100, matched.length * 25 + (days <= 90 ? 10 : 0) + Math.min(10, r.stars * 2) + (r.description ? 5 : 0)));
    return { name: r.name, url: r.url, description: r.description, score,
      reasons: [matched.length ? `matches: ${matched.join(", ")}` : "", days <= 90 ? "recently active" : ""].filter(Boolean),
      sponsor: `https://github.com/sponsors/normancomics` };
  }).filter((x) => x.reasons.some((r) => r.startsWith("matches"))).sort((a, b) => b.score - a.score);
  return { interests: terms, matches: scored.slice(0, 10), sponsor: sponsorLinks() };
}
