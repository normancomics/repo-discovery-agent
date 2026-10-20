# repo-discovery-agent
Discovery agent: profiles normancomics' top repos (BibleFI, Watcher Tech, uNRMN, GoodLums, etc.) and finds similar repos/communities for human-approved, opt-in promotion.

## Quick start
```bash
npm install
cp .env.example .env   # set GITHUB_TOKEN
export $(grep -v '^#' .env | xargs) && npm run discover
```
The report is written to `reports/discovery-report.md`.

## Scoring
Keywords 25, popularity 40, activity 20, professionalism 10, adoption 15 (max 100). Minimum 40; top 12 per category. 13 search queries (top 15 each), excluding `normancomics` repos.

## Workflow setup
`.github/workflows/discovery.yml` runs every Sunday 00:00 UTC and via manual `workflow_dispatch`. It uploads the report as an artifact and opens a GitHub issue with the report. Ensure Actions has issue write permission.

## Ethical guidelines
Recommend, don't blast: no automated DMs, mass @-mentions, or unsolicited issues/discussions. Public data only; a human approves all outreach.

---

## 🌐 x402 HTTP service (agents & humans)

`src/server/` exposes the agent as a public API so agents and people can discover normancomics' repos and sponsor them. Discovery is free. Deeper analysis is paid per call via [x402](https://x402.org): USDC on Base mainnet, paid to `normancomics.eth` (`0x3d95D4A6DbaE0Cd0643a82b13A13b08921D6ADf7`), settled through the keyless [PayAI facilitator](https://facilitator.payai.network). Everything is rule-based, with no LLM calls.

| Endpoint | Price | What it returns |
|---|---|---|
| `GET /` | free | Service index |
| `GET /repos` | free | normancomics' public repos |
| `GET /repos/:name` | free | One repo card plus sponsor links |
| `GET /sponsor` | free | GitHub Sponsors, Patreon, Open Collective, ENS |
| `GET /search?q=` | free | Keyword search over normancomics' repos |
| `GET /analyze?repo=` | $0.05 | README summary, tech stack, entry points, how to run, activity, good first contributions, health checks |
| `GET /similar?repo=` or `?topic=` | $0.03 | Live GitHub search for similar repos, scored 0–100 |
| `GET /match?interests=` | $0.02 | normancomics' repos ranked against your interests, with reasons |
| `GET /report` | $0.10 | Full discovery report (Markdown), cached for up to 12 hours |

A paid endpoint called without payment returns **HTTP 402**. The payment requirements (x402 v2, plus Bazaar discovery metadata) are in the `PAYMENT-REQUIRED` header and in the JSON body. Pay with any x402 client using the `PAYMENT-SIGNATURE` header (`X-PAYMENT` also works). Settlement happens only after the work succeeds. You are not charged for 4xx or 5xx responses.

**Agent discovery:** `/llms.txt`, `/.well-known/x402`, `/openapi.json`, and `POST /mcp`. `/mcp` is a stateless MCP Streamable HTTP endpoint. Its free tools return data, and its paid tools return the x402 URL and payment requirements.

**Built in:** in-memory caching (repos 1h, analysis 6h, report 12h) and a per-IP rate limit (`RATE_LIMIT_PER_MIN`, default 60).

### Run locally

```bash
npm install && npm run build && npm start   # http://localhost:4021
```

### Deploy on Render (free)

Use **New → Blueprint** with this repo (`render.yaml`), or set up a Node web service by hand:

- Build: `npm install --include=dev && npm run build`
- Start: `npm start`
- Health check: `/healthz`
- Env (all optional): `GITHUB_TOKEN` (a fine-grained, public-repos read-only token; raises the GitHub rate limit from 60 to 5,000 requests/hour and is strongly recommended for `/report`), `PAY_TO`, `GITHUB_OWNER`, `FACILITATOR_URL`, `RATE_LIMIT_PER_MIN`. Render sets `PORT` and `RENDER_EXTERNAL_URL` automatically.

### 💖 Sponsor

[github.com/sponsors/normancomics](https://github.com/sponsors/normancomics) · [Patreon](https://www.patreon.com/normancomics) · [Open Collective](https://opencollective.com/normancomics-eth) · `normancomics.eth`
