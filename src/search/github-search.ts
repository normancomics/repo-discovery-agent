export interface Repo {
  fullName: string;
  url: string;
  description: string;
  topics: string[];
  stars: number;
  forks: number;
  language: string | null;
  pushedAt: string;
  hasLicense: boolean;
  hasHomepage: boolean;
  owner: string;
  category: string;
}

export interface SearchQuery {
  category: string;
  q: string;
}

export const QUERIES: SearchQuery[] = [
  { category: "Base DeFi", q: "base defi in:name,description,topics" },
  { category: "Base DeFi", q: "topic:base topic:defi" },
  { category: "Farcaster", q: "farcaster miniapp in:name,description,topics" },
  { category: "Farcaster", q: "topic:farcaster" },
  { category: "MCP & Agents", q: "mcp server agent in:name,description,topics" },
  { category: "x402 Payments", q: "x402 payments in:name,description,topics" },
  { category: "ZK Privacy", q: "zero-knowledge privacy in:name,description,topics" },
  { category: "ZK Privacy", q: "topic:zk topic:privacy" },
  { category: "ERC-8004", q: "erc-8004 trustless agents in:name,description,readme" },
  { category: "Noir Circuits", q: "noir circuits zk in:name,description,topics" },
  { category: "Superfluid", q: "superfluid streaming in:name,description,topics" },
  { category: "Monero", q: "monero privacy in:name,description,topics" },
  { category: "Sovereign Tech", q: "sovereign self-hosted decentralized in:name,description,topics" },
];

interface ApiItem {
  full_name: string;
  html_url: string;
  description: string | null;
  topics?: string[];
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  pushed_at: string;
  license: unknown;
  homepage: string | null;
  owner: { login: string };
}

export async function searchRepos(opts: {
  token?: string;
  selfOwner?: string;
  perQuery?: number;
}): Promise<Repo[]> {
  const perQuery = opts.perQuery ?? 15;
  const self = (opts.selfOwner ?? "normancomics").toLowerCase();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "repo-discovery-agent",
  };
  if (opts.token) headers["Authorization"] = ["Bearer", opts.token].join(" ");

  const seen = new Map<string, Repo>();
  for (const { category, q } of QUERIES) {
    // fetch extra so self-excluded repos don't reduce the count below perQuery
    const params = new URLSearchParams({
      q: `${q} fork:false archived:false`,
      sort: "stars",
      order: "desc",
      per_page: String(Math.min(100, perQuery + 10)),
    });
    const res = await fetch(`https://api.github.com/search/repositories?${params}`, { headers });
    if (!res.ok) {
      console.warn(`Search failed (${res.status}) for "${q}"`);
      continue;
    }
    const data = (await res.json()) as { items: ApiItem[] };
    const items = data.items.filter((i) => i.owner.login.toLowerCase() !== self).slice(0, perQuery);
    for (const i of items) {
      if (seen.has(i.full_name)) continue;
      seen.set(i.full_name, {
        fullName: i.full_name,
        url: i.html_url,
        description: i.description ?? "",
        topics: i.topics ?? [],
        stars: i.stargazers_count,
        forks: i.forks_count,
        language: i.language,
        pushedAt: i.pushed_at,
        hasLicense: !!i.license,
        hasHomepage: !!i.homepage,
        owner: i.owner.login,
        category,
      });
    }
    // respect the search API secondary rate limit (30/min authenticated, 10/min anonymous)
    await new Promise((r) => setTimeout(r, opts.token ? 2100 : 6100));
  }
  return [...seen.values()];
}
