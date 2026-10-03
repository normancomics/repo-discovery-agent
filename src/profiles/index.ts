import { Octokit } from "@octokit/rest";
import { complete } from "../llm/index.js";
import { loadPrompts, loadProfiles, render } from "../config.js";
import type { Profile } from "../types.js";

/**
 * Build profiles from config, enriched with live repo topics/description when
 * available, and an optional LLM summary.
 */
export async function buildProfiles(octokit: Octokit): Promise<Profile[]> {
  const prompts = loadPrompts();
  const profiles = loadProfiles();
  for (const p of profiles) {
    const [owner, repo] = p.repo.split("/");
    try {
      const { data } = await octokit.repos.get({ owner, repo });
      if (data.description) p.description = data.description;
      const tags = new Set(p.tags.map((t) => t.toLowerCase()));
      for (const t of data.topics ?? []) if (!tags.has(t.toLowerCase())) p.tags.push(t);
    } catch {
      // repo may be private/unavailable; keep static profile
    }
    const summary = await complete(
      prompts.system,
      render(prompts.profileSummary, { name: p.name, description: p.description, tags: p.tags.join(", ") }),
    );
    if (summary) p.summary = summary;
  }
  return profiles;
}
