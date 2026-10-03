# repo-discovery-agent

Discovery & matching agent for two flagship projects:

1. **BibleFI**: biblically-based DeFi on Base, a Farcaster mini-app with Noir ZK circuits.
2. **Watcher Tech - Blockchain Grimoire**: sovereign blockchain ecosystem with an MCP oracle server, x402 payments on Base and RAG-AGI agents.

The agent **recommends, it never posts.** It produces a markdown (and JSON) report for a human to review. There is no automated outreach, mass tagging, or DMs. Only public data is used.

## Pipeline

| Phase | Code | What it does |
|---|---|---|
| 1. Profiling | `src/profiles/` | Loads `config/profiles.json`, enriches with live repo description/topics, optional LLM summary |
| 2. Discovery | `src/search/github.ts` | Octokit REST repo search using `config/queries.json` (Base-first) |
| 3. Sponsor intel | `src/search/github.ts` | GraphQL: public Sponsors listing + aggregate count per maintainer |
| Ranking | `src/ranking/` | Lexical (Jaccard) + optional OpenAI embedding similarity, Base/language/activity boosts |
| 4. Report | `src/report/` | Matches, channels (`config/channels.json`), draft copy, sponsor overlap |

## Setup

```bash
npm install
cp .env.example .env   # fill in values
export $(grep -v '^#' .env | xargs)   # or use your own env loader
npm start
```

Output: `output/report.md` and `output/report.json`.

`GITHUB_TOKEN` is required in practice (rate limits and GraphQL). `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` is optional; without one, templated drafts are used. Set `EMBEDDING_MODEL` (with `OPENAI_API_KEY`) to enable semantic similarity.

## Configuration

- `config/profiles.json`: project profiles and tags
- `config/queries.json`: GitHub search queries per profile, curated-list queries, limits
- `config/channels.json`: recommended sharing channels
- `config/prompts.json`: LLM prompts

## Scripts

- `npm start`: run the agent
- `npm test`: unit tests
- `npm run typecheck`: TypeScript check

## CI

`.github/workflows/discovery.yml` runs weekly (Mondays 14:00 UTC) and on manual dispatch, uploading the report as an artifact for review. Set optional `DISCOVERY_GITHUB_TOKEN`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` repository secrets.

## Ethics

Base-first, public data only, respect GitHub's ToS, no unsolicited promotion. Drafts are templates for manual editing.
