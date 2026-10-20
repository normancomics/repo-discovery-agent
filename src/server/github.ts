// Read-only GitHub helpers with an in-memory TTL cache. Works unauthenticated; GITHUB_TOKEN raises rate limits.
const OWNER = process.env.GITHUB_OWNER ?? "normancomics";
const cache = new Map<string, { exp: number; val: unknown }>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val as T;
  const val = await fn();
  cache.set(key, { exp: Date.now() + ttlMs, val });
  return val;
}

function headers(raw = false): Record<string, string> {
  const h: Record<string, string> = {
    Accept: raw ? "application/vnd.github.raw" : "application/vnd.github+json",
    "User-Agent": "repo-discovery-agent",
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = ["Bearer", process.env.GITHUB_TOKEN].join(" ");
  return h;
}

export async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, { headers: headers() });
  if (!res.ok) throw Object.assign(new Error(`GitHub ${res.status} for ${path}`), { status: res.status });
  return (await res.json()) as T;
}

export interface OwnRepo {
  name: string; fullName: string; url: string; description: string; topics: string[];
  stars: number; forks: number; language: string | null; pushedAt: string; homepage: string | null;
  openIssues: number; license: string | null; defaultBranch: string;
}

interface ApiRepo {
  name: string; full_name: string; html_url: string; description: string | null; topics?: string[];
  stargazers_count: number; forks_count: number; language: string | null; pushed_at: string;
  homepage: string | null; open_issues_count: number; license: { spdx_id?: string } | null;
  default_branch: string; fork: boolean; archived: boolean; private: boolean;
}

const map = (r: ApiRepo): OwnRepo => ({
  name: r.name, fullName: r.full_name, url: r.html_url, description: r.description ?? "",
  topics: r.topics ?? [], stars: r.stargazers_count, forks: r.forks_count, language: r.language,
  pushedAt: r.pushed_at, homepage: r.homepage || null, openIssues: r.open_issues_count,
  license: r.license?.spdx_id ?? null, defaultBranch: r.default_branch,
});

export const owner = () => OWNER;

export function listRepos(): Promise<OwnRepo[]> {
  return cached("repos", 60 * 60_000, async () => {
    const all = await gh<ApiRepo[]>(`/users/${OWNER}/repos?per_page=100&type=owner&sort=pushed`);
    return all.filter((r) => !r.private && !r.fork && !r.archived).map(map);
  });
}

export async function getRepo(name: string): Promise<OwnRepo | undefined> {
  return (await listRepos()).find((r) => r.name.toLowerCase() === name.toLowerCase());
}

export function readme(name: string): Promise<string> {
  return cached(`readme:${name}`, 6 * 60 * 60_000, async () => {
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${name}/readme`, { headers: headers(true) });
    return res.ok ? await res.text() : "";
  });
}

export function tree(name: string, branch: string): Promise<string[]> {
  return cached(`tree:${name}`, 6 * 60 * 60_000, async () => {
    try {
      const t = await gh<{ tree: { path: string; type: string }[] }>(`/repos/${OWNER}/${name}/git/trees/${branch}?recursive=1`);
      return t.tree.filter((x) => x.type === "blob").map((x) => x.path);
    } catch { return []; }
  });
}

export function issues(name: string): Promise<{ title: string; url: string; labels: string[] }[]> {
  return cached(`issues:${name}`, 60 * 60_000, async () => {
    try {
      const list = await gh<{ title: string; html_url: string; labels: { name: string }[]; pull_request?: unknown }[]>(
        `/repos/${OWNER}/${name}/issues?state=open&per_page=50`);
      return list.filter((i) => !i.pull_request).map((i) => ({ title: i.title, url: i.html_url, labels: i.labels.map((l) => l.name) }));
    } catch { return []; }
  });
}

export function sponsorLinks() {
  return {
    githubSponsors: `https://github.com/sponsors/${OWNER}`,
    patreon: "https://www.patreon.com/normancomics",
    openCollective: "https://opencollective.com/normancomics-eth",
    ens: "normancomics.eth",
    address: process.env.PAY_TO ?? "0x3d95D4A6DbaE0Cd0643a82b13A13b08921D6ADf7",
    note: "Sponsor on GitHub, or send USDC/ETH on Base or Ethereum to normancomics.eth.",
  };
}
