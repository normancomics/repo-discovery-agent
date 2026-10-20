import express, { type Request } from "express";
import { cached, getRepo, listRepos, owner, sponsorLinks } from "./github.js";
import { analyzeRepo, matchInterests, searchOwn } from "./analyze.js";
import { paid, PAY_TO, FACILITATOR, NETWORK, USDC_BASE, atomic, requirements, type PaidRoute } from "./x402.js";
import { QUERIES, searchRepos, type Repo } from "../search/github-search.js";
import { MIN_SCORE, TOP_N, rankByCategory, scoreRepo } from "../ranking/rank.js";
import { generateReport } from "../report/generate.js";

const PORT = Number(process.env.PORT ?? 4021);
const base = () => (process.env.RENDER_EXTERNAL_URL ?? process.env.PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/$/, "");
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "64kb" }));
app.use((_req, res, next) => { res.set("Access-Control-Allow-Origin", "*").set("Access-Control-Allow-Headers", "*").set("Access-Control-Expose-Headers", "PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT-RESPONSE"); next(); });

// Simple fixed-window rate limit per IP.
const LIMIT = Number(process.env.RATE_LIMIT_PER_MIN ?? 60);
const hits = new Map<string, { n: number; reset: number }>();
app.use((req, res, next) => {
  if (req.method === "OPTIONS") return res.sendStatus(204);
  const k = req.ip ?? "?"; const now = Date.now(); const h = hits.get(k);
  if (!h || h.reset < now) hits.set(k, { n: 1, reset: now + 60_000 });
  else if (++h.n > LIMIT) return res.status(429).set("Retry-After", String(Math.ceil((h.reset - now) / 1000))).json({ error: "Rate limit exceeded" });
  next();
});

const wrap = (fn: (req: Request) => Promise<unknown>) => async (req: Request, res: express.Response) => {
  try { const out = await fn(req); if (out === undefined) return res.status(404).json({ error: "Not found" }); res.json(out); }
  catch (e) { res.status((e as { status?: number }).status === 403 ? 503 : 500).json({ error: (e as Error).message }); }
};
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// ---------- paid route definitions ----------
const ROUTES: Record<string, PaidRoute> = {
  analyze: { path: "/analyze", method: "GET", priceUsd: 0.05,
    description: "Deep rule-based analysis of one normancomics repo: README summary, tech stack, entry points, how to run, activity, good first contributions, health checks, sponsor links.",
    queryParams: { repo: { type: "string", description: "Repo name, e.g. BibleFI", required: true } }, inputExample: { repo: "BibleFI" },
    example: { repo: { name: "BibleFI" }, summary: "...", techStack: ["TypeScript", "Vite"], howToRun: ["npm install && npm run dev"], activity: { status: "active" } } },
  similar: { path: "/similar", method: "GET", priceUsd: 0.03,
    description: "Live GitHub search for repos similar to a normancomics repo (by its topics) or to a topic, scored 0-100 (keywords, popularity, activity, professionalism, adoption).",
    queryParams: { repo: { type: "string", description: "normancomics repo name (uses its topics)" }, topic: { type: "string", description: "Free-text topic, e.g. 'farcaster miniapp'" } },
    inputExample: { topic: "x402 payments" }, example: { query: "x402 payments", results: [{ fullName: "owner/repo", score: 72.4, url: "https://github.com/owner/repo" }] } },
  match: { path: "/match", method: "GET", priceUsd: 0.02,
    description: "Rank normancomics' repos against an agent's or user's interests, with reasons and sponsor links.",
    queryParams: { interests: { type: "string", description: "Comma or space separated interests, e.g. 'defi, zk, farcaster'", required: true } },
    inputExample: { interests: "defi zk farcaster" }, example: { matches: [{ name: "BibleFI", score: 80, reasons: ["matches: defi, farcaster"] }] } },
  report: { path: "/report", method: "GET", priceUsd: 0.10,
    description: "Full discovery report (Markdown in JSON): 13 ecosystem queries (Base DeFi, Farcaster, MCP, x402, ZK, ERC-8004, Noir, Superfluid...), ranked repos per category, channels and ethics. Cached up to 12h.",
    queryParams: {}, inputExample: {}, example: { generatedAt: "2026-10-20T00:00:00Z", markdown: "# Repo Discovery Report ..." } },
};

// ---------- free endpoints ----------
app.get("/", (_req, res) => res.json({
  service: "repo-discovery-agent", owner: owner(),
  description: "Discover normancomics' GitHub repos and sponsor them. Free discovery; deeper analysis is paid per call via x402 (USDC on Base).",
  free: { "GET /repos": "List public repos", "GET /repos/:name": "One repo card + sponsor links", "GET /sponsor": "Sponsor links", "GET /search?q=": "Keyword search over normancomics repos", "GET /llms.txt": "Agent-readable index", "GET /openapi.json": "OpenAPI 3.1", "GET /.well-known/x402": "x402 resource list", "POST /mcp": "MCP (Streamable HTTP, JSON-RPC)" },
  paid: Object.fromEntries(Object.values(ROUTES).map((r) => [`GET ${r.path}`, `$${r.priceUsd.toFixed(2)} USDC on Base: ${r.description}`])),
  sponsor: sponsorLinks(),
}));
app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.get("/sponsor", (_req, res) => res.json(sponsorLinks()));
app.get("/repos", wrap(async () => ({ owner: owner(), count: (await listRepos()).length, repos: await listRepos(), sponsor: sponsorLinks() })));
app.get("/repos/:name", wrap(async (req) => { const r = await getRepo(String(req.params.name)); return r && { ...r, sponsor: sponsorLinks(), deeperAnalysis: `${base()}/analyze?repo=${r.name}` }; }));
app.get("/search", wrap(async (req) => { const q = str(req.query.q); if (!q) return { error: "q required", results: [] }; return { q, results: await searchOwn(q), sponsor: sponsorLinks() }; }));

// ---------- paid endpoints ----------
app.get("/analyze", paid(ROUTES.analyze, base, async (req) => {
  const name = str(req.query.repo); if (!name) return { status: 400, body: { error: "repo query param required" } };
  const a = await analyzeRepo(name); return a ? { status: 200, body: a } : { status: 404, body: { error: "Unknown repo" } };
}));

async function similar(repoName: string, topic: string) {
  let terms: string[] = [];
  if (repoName) { const r = await getRepo(repoName); if (!r) return undefined; terms = r.topics.length ? r.topics.slice(0, 3) : (r.description.split(/\s+/).slice(0, 3)); }
  else terms = topic.split(/[\s,]+/).filter(Boolean).slice(0, 4);
  const q = terms.join(" ");
  return cached(`similar:${q.toLowerCase()}`, 6 * 60 * 60_000, async () => {
    const found = await searchOne(`${q} in:name,description,topics`);
    const results = found.map((r) => scoreRepo(r)).sort((a, b) => b.score - a.score).slice(0, 15)
      .map(({ fullName, url, description, stars, language, score, matchedKeywords, breakdown }) => ({ fullName, url, description, stars, language, score, matchedKeywords, breakdown }));
    return { query: q, results };
  });
}
async function searchOne(q: string): Promise<Repo[]> {
  const params = new URLSearchParams({ q: `${q} fork:false archived:false`, sort: "stars", order: "desc", per_page: "40" });
  const h: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "repo-discovery-agent" };
  if (process.env.GITHUB_TOKEN) h.Authorization = ["Bearer", process.env.GITHUB_TOKEN].join(" ");
  const res = await fetch(`https://api.github.com/search/repositories?${params}`, { headers: h });
  if (!res.ok) throw new Error(`GitHub search ${res.status}`);
  const data = (await res.json()) as { items: any[] };
  return data.items.filter((i) => i.owner.login.toLowerCase() !== owner().toLowerCase()).map((i) => ({
    fullName: i.full_name, url: i.html_url, description: i.description ?? "", topics: i.topics ?? [], stars: i.stargazers_count,
    forks: i.forks_count, language: i.language, pushedAt: i.pushed_at, hasLicense: !!i.license, hasHomepage: !!i.homepage, owner: i.owner.login, category: q }));
}
app.get("/similar", paid(ROUTES.similar, base, async (req) => {
  const repo = str(req.query.repo), topic = str(req.query.topic);
  if (!repo && !topic) return { status: 400, body: { error: "repo or topic query param required" } };
  const out = await similar(repo, topic); return out ? { status: 200, body: out } : { status: 404, body: { error: "Unknown repo" } };
}));
app.get("/match", paid(ROUTES.match, base, async (req) => {
  const i = str(req.query.interests); if (!i) return { status: 400, body: { error: "interests query param required" } };
  return { status: 200, body: await matchInterests(i) };
}));
app.get("/report", paid(ROUTES.report, base, async () => ({ status: 200, body: await cached("report", 12 * 60 * 60_000, async () => {
  const repos = await searchRepos({ token: process.env.GITHUB_TOKEN, selfOwner: owner(), perQuery: 15 });
  const ranked = rankByCategory(repos, MIN_SCORE, TOP_N);
  return { generatedAt: new Date().toISOString(), scanned: repos.length, markdown: generateReport(ranked, { minScore: MIN_SCORE, queryCount: QUERIES.length, scanned: repos.length }) };
}) })));

// ---------- agent discovery ----------
app.get("/.well-known/x402", (_req, res) => res.json({
  x402Version: 2, facilitator: FACILITATOR, network: NETWORK, asset: USDC_BASE, payTo: PAY_TO,
  resources: Object.values(ROUTES).map((r) => ({ resource: base() + r.path, method: r.method, description: r.description, priceUsd: r.priceUsd, accepts: [requirements(r)] })),
}));
app.get("/llms.txt", (_req, res) => res.type("text/plain").send([
  "# repo-discovery-agent", "", "> Discover normancomics' GitHub repos (BibleFI, Watcher Tech, uNRMN, GoodLums...) and sponsor them. Free discovery endpoints; deeper analysis paid per call via x402 (USDC on Base mainnet, payTo normancomics.eth).", "",
  "## Free", `- [Service index](${base()}/): JSON overview`, `- [Repos](${base()}/repos): all public repos`, `- [Repo card](${base()}/repos/BibleFI): one repo + sponsor links`,
  `- [Sponsor](${base()}/sponsor): GitHub Sponsors, Patreon, Open Collective, ENS`, `- [Search](${base()}/search?q=defi): keyword search`, "",
  "## Paid (x402 v2, exact scheme, eip155:8453 USDC)", ...Object.values(ROUTES).map((r) => `- [GET ${r.path}](${base()}${r.path}) $${r.priceUsd.toFixed(2)}: ${r.description}`), "",
  "## Machine-readable", `- [OpenAPI](${base()}/openapi.json)`, `- [x402 resources](${base()}/.well-known/x402)`, `- [MCP endpoint](${base()}/mcp): Streamable HTTP JSON-RPC (POST)`, "",
  "## Sponsor", "- https://github.com/sponsors/normancomics", "",
].join("\n")));

function openapi() {
  const q = (params: PaidRoute["queryParams"]) => Object.entries(params).map(([name, v]) => ({ name, in: "query", required: !!v.required, description: v.description, schema: { type: v.type } }));
  const ok = { "200": { description: "OK", content: { "application/json": {} } } };
  const paths: Record<string, unknown> = {
    "/repos": { get: { summary: "List normancomics' public repos (free)", responses: ok } },
    "/repos/{name}": { get: { summary: "Repo card + sponsor links (free)", parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }], responses: ok } },
    "/sponsor": { get: { summary: "Sponsor links (free)", responses: ok } },
    "/search": { get: { summary: "Keyword search (free)", parameters: [{ name: "q", in: "query", required: true, schema: { type: "string" } }], responses: ok } },
  };
  for (const r of Object.values(ROUTES)) paths[r.path] = { get: { summary: `${r.description} ($${r.priceUsd.toFixed(2)} via x402)`, parameters: q(r.queryParams),
    "x-x402": { priceUsd: r.priceUsd, amount: atomic(r.priceUsd), asset: USDC_BASE, network: NETWORK, payTo: PAY_TO },
    responses: { ...ok, "402": { description: "Payment required (x402 v2). See PAYMENT-REQUIRED header." } } } };
  return { openapi: "3.1.0", info: { title: "repo-discovery-agent", version: "1.0.0", description: "Discover and sponsor normancomics' repos. Paid endpoints use x402." }, servers: [{ url: base() }], paths };
}
app.get("/openapi.json", (_req, res) => res.json(openapi()));

// ---------- MCP (Streamable HTTP, stateless JSON responses) ----------
const MCP_TOOLS = [
  { name: "list_repos", description: "List normancomics' public GitHub repos (free).", inputSchema: { type: "object", properties: {} } },
  { name: "get_repo", description: "Get one normancomics repo card with sponsor links (free).", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "search_repos", description: "Keyword search over normancomics' repos (free).", inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] } },
  { name: "sponsor_links", description: "How to sponsor normancomics (free).", inputSchema: { type: "object", properties: {} } },
  ...Object.entries(ROUTES).map(([k, r]) => ({ name: k, description: `PAID $${r.priceUsd.toFixed(2)} via x402: ${r.description} Returns the HTTP endpoint and x402 payment requirements; call it with an x402 client.`,
    inputSchema: { type: "object", properties: Object.fromEntries(Object.entries(r.queryParams).map(([n, v]) => [n, { type: v.type, description: v.description }])) } })),
];
async function callTool(name: string, args: Record<string, string>) {
  switch (name) {
    case "list_repos": return listRepos();
    case "get_repo": return { ...(await getRepo(args.name ?? "")), sponsor: sponsorLinks() };
    case "search_repos": return searchOwn(args.q ?? "");
    case "sponsor_links": return sponsorLinks();
  }
  const r = ROUTES[name]; if (!r) throw new Error(`Unknown tool ${name}`);
  const url = `${base()}${r.path}?${new URLSearchParams(args)}`;
  return { paymentRequired: true, url, method: "GET", priceUsd: r.priceUsd, accepts: [requirements(r)], howTo: "GET the url with an x402 client (PAYMENT-SIGNATURE header)." };
}
app.get("/mcp", (_req, res) => res.status(405).set("Allow", "POST").json({ error: "Use POST (MCP Streamable HTTP, JSON-RPC 2.0)" }));
app.post("/mcp", async (req, res) => {
  const handle = async (m: { jsonrpc: string; id?: number | string; method: string; params?: any }) => {
    if (m.id === undefined) return undefined; // notification
    const ok = (result: unknown) => ({ jsonrpc: "2.0", id: m.id, result });
    try {
      switch (m.method) {
        case "initialize": return ok({ protocolVersion: m.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} },
          serverInfo: { name: "repo-discovery-agent", version: "1.0.0" }, instructions: "Discover and sponsor normancomics' repos. Paid tools return x402 payment details." });
        case "ping": return ok({});
        case "tools/list": return ok({ tools: MCP_TOOLS });
        case "tools/call": { const out = await callTool(m.params?.name, m.params?.arguments ?? {}); return ok({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] }); }
        default: return { jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "Method not found" } };
      }
    } catch (e) { return ok({ content: [{ type: "text", text: (e as Error).message }], isError: true }); }
  };
  const body = req.body;
  if (Array.isArray(body)) { const out = (await Promise.all(body.map(handle))).filter(Boolean); return out.length ? res.json(out) : res.sendStatus(202); }
  const out = await handle(body); return out ? res.json(out) : res.sendStatus(202);
});

app.listen(PORT, () => console.log(`repo-discovery-agent x402 service on :${PORT} (${base()})`));
