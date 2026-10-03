import { Octokit } from "@octokit/rest";
import { graphql } from "@octokit/graphql";
import type { Candidate, SponsorSignal } from "../types.js";

export function makeOctokit(token?: string): Octokit {
  return new Octokit({ auth: token, userAgent: "repo-discovery-agent" });
}

/** Run searches sequentially (search API is rate-limited) and dedupe by full name. */
export async function searchRepos(
  octokit: Octokit,
  queries: string[],
  perQuery: number,
  exclude: string[] = [],
): Promise<Candidate[]> {
  const seen = new Map<string, Candidate>();
  const excluded = new Set(exclude.map((e) => e.toLowerCase()));
  for (const q of queries) {
    try {
      const { data } = await octokit.search.repos({
        q,
        sort: "stars",
        order: "desc",
        per_page: perQuery,
      });
      for (const r of data.items) {
        const key = r.full_name.toLowerCase();
        if (seen.has(key) || excluded.has(key) || r.archived || r.fork) continue;
        seen.set(key, {
          fullName: r.full_name,
          url: r.html_url,
          description: r.description ?? "",
          topics: r.topics ?? [],
          language: r.language ?? null,
          stars: r.stargazers_count,
          pushedAt: r.pushed_at ?? "",
          owner: r.owner?.login ?? r.full_name.split("/")[0],
          archived: r.archived,
          fork: r.fork,
        });
      }
    } catch (err) {
      console.warn(`search failed for "${q}": ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return [...seen.values()];
}

/**
 * Public sponsor signals only: whether the owner has a Sponsors listing and the
 * public sponsor count. Aggregate use only; no individual sponsors are collected.
 */
export async function sponsorSignals(token: string | undefined, owners: string[]): Promise<Map<string, SponsorSignal>> {
  const out = new Map<string, SponsorSignal>();
  if (!token) return out;
  const gql = graphql.defaults({ headers: { authorization: `token ${token}` } });
  for (const owner of [...new Set(owners)]) {
    try {
      const res = await gql<{
        repositoryOwner: { hasSponsorsListing?: boolean; sponsors?: { totalCount: number } } | null;
      }>(
        `query($login:String!){ repositoryOwner(login:$login){ ... on User { hasSponsorsListing sponsors { totalCount } } ... on Organization { hasSponsorsListing sponsors { totalCount } } } }`,
        { login: owner },
      );
      const o = res.repositoryOwner;
      out.set(owner, {
        owner,
        hasSponsorsListing: o?.hasSponsorsListing ?? false,
        sponsorCount: o?.sponsors?.totalCount ?? null,
      });
    } catch {
      out.set(owner, { owner, hasSponsorsListing: false, sponsorCount: null });
    }
  }
  return out;
}
