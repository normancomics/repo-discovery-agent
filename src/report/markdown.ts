import type { Channel, Profile, ScoredCandidate } from "../types.js";

export interface ProfileResult {
  profile: Profile;
  matches: ScoredCandidate[];
  drafts: Map<string, string>;
  channels: Channel[];
}

export function defaultDraft(p: Profile, c: ScoredCandidate): string {
  return `Hi ${c.owner}, I maintain ${p.name} (${p.description}). I came across ${c.fullName} and noticed we share a focus (${c.reasons.join("; ") || "similar topics"}). If it's ever useful, I'd be glad to share notes or explore an integration. No pressure at all, and feel free to ignore this.`;
}

function matchTable(matches: ScoredCandidate[]): string {
  if (!matches.length) return "_No matches found._\n";
  const rows = matches.map(
    (m, i) =>
      `| ${i + 1} | [${m.fullName}](${m.url}) | ${m.score.toFixed(2)} | ${m.stars} | ${m.language ?? "-"} | ${m.reasons.join("; ") || "-"} |`,
  );
  return ["| # | Repo | Score | Stars | Lang | Why |", "|---|---|---|---|---|---|", ...rows].join("\n") + "\n";
}

export function sponsorOverlap(results: ProfileResult[]): string {
  const lines: string[] = [];
  for (const r of results) {
    const withListing = r.matches.filter((m) => m.sponsor?.hasSponsorsListing);
    const topics = new Map<string, number>();
    for (const m of withListing) for (const t of m.topics) topics.set(t, (topics.get(t) ?? 0) + 1);
    const top = [...topics.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t, n]) => `\`${t}\` (${n})`);
    lines.push(`### ${r.profile.name}`);
    lines.push(
      `- ${withListing.length}/${r.matches.length} matched maintainers have a public GitHub Sponsors listing: ${
        withListing.map((m) => `${m.owner}${m.sponsor?.sponsorCount != null ? ` (${m.sponsor.sponsorCount} sponsors)` : ""}`).join(", ") || "none"
      }`,
    );
    lines.push(`- Community topics among sponsored maintainers: ${top.join(", ") || "n/a"}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function renderReport(results: ProfileResult[], generatedAt: Date = new Date()): string {
  const out: string[] = [
    "# Discovery Report",
    "",
    `Generated: ${generatedAt.toISOString()}`,
    "",
    "> **For human review only.** Nothing here has been posted or sent. Use opt-in channels, follow each community's rules, and never mass-tag or DM.",
    "",
  ];
  for (const r of results) {
    out.push(`## ${r.profile.name} matches`, "", r.profile.summary ?? r.profile.description, "");
    out.push(`**Profile tags:** ${r.profile.tags.map((t) => `\`${t}\``).join(" ")}`, "");
    out.push(matchTable(r.matches));
    out.push(`### Recommended channels (${r.profile.name})`, "");
    for (const c of r.channels) out.push(`- **${c.channel}** — ${c.where}. ${c.how}`);
    out.push("", `### Draft outreach copy (${r.profile.name})`, "");
    for (const m of r.matches.slice(0, 5)) {
      out.push(`**${m.fullName}**`, "", `> ${(r.drafts.get(m.fullName) ?? defaultDraft(r.profile, m)).replace(/\n+/g, "\n> ")}`, "");
    }
  }
  out.push("## Sponsor overlap analysis", "", "_Public signals only (Sponsors listing, aggregate counts). No individual sponsor data is collected._", "");
  out.push(sponsorOverlap(results));
  return out.join("\n");
}

export function renderJson(results: ProfileResult[]): string {
  return JSON.stringify(
    results.map((r) => ({ profile: r.profile, matches: r.matches, channels: r.channels, drafts: Object.fromEntries(r.drafts) })),
    null,
    2,
  );
}
