import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { complete, embed } from "./llm/index.js";
import { loadChannels, loadPrompts, loadQueries, render } from "./config.js";
import { buildProfiles } from "./profiles/index.js";
import { makeOctokit, searchRepos, sponsorSignals } from "./search/github.js";
import { candidateText, cosine, profileText, rank } from "./ranking/similarity.js";
import { defaultDraft, renderJson, renderReport, type ProfileResult } from "./report/markdown.js";

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) console.warn("GITHUB_TOKEN not set: unauthenticated requests are heavily rate-limited.");
  const octokit = makeOctokit(token);
  const prompts = loadPrompts();
  const cfg = loadQueries();
  const channels = loadChannels();

  const profiles = await buildProfiles(octokit);
  const own = profiles.map((p) => p.repo);
  const results: ProfileResult[] = [];

  for (const profile of profiles) {
    console.log(`Searching for ${profile.name}...`);
    const queries = [...(cfg.queries[profile.id] ?? []), ...cfg.curatedLists];
    const candidates = await searchRepos(octokit, queries, cfg.perQueryLimit, own);

    let semantics: (number | null)[] = [];
    const vecs = await embed([profileText(profile), ...candidates.map(candidateText)]);
    if (vecs) semantics = vecs.slice(1).map((v) => cosine(vecs[0], v));

    const matches = rank(profile, candidates, semantics, cfg.topN);
    const signals = await sponsorSignals(token, matches.map((m) => m.owner));
    for (const m of matches) m.sponsor = signals.get(m.owner);

    const drafts = new Map<string, string>();
    for (const m of matches.slice(0, 5)) {
      const text = await complete(
        prompts.system,
        render(prompts.outreach, {
          name: profile.name,
          description: profile.description,
          target: m.fullName,
          targetDescription: m.description,
          angle: m.reasons.join("; ") || "shared focus",
        }),
      );
      drafts.set(m.fullName, text ?? defaultDraft(profile, m));
    }
    results.push({ profile, matches, drafts, channels: channels[profile.id] ?? [] });
  }

  const outDir = process.env.OUTPUT_DIR ?? "output";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "report.md"), renderReport(results));
  writeFileSync(path.join(outDir, "report.json"), renderJson(results));
  console.log(`Wrote ${outDir}/report.md and report.json (review before any outreach).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
