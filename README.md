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
