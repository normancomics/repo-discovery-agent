import type { ScoredRepo } from "../ranking/rank.js";

const CHANNELS = [
  ["🟣 Farcaster cast", "Share in relevant channels (e.g. /base, /miniapps) where project posts are welcome."],
  ["💬 GitHub Discussion", "Only on your own repos, or where maintainers explicitly invite project suggestions."],
  ["🐦 Twitter/X", "Post from your own account; don't mass-mention maintainers."],
  ["🎮 Discord", "Use the community's #showcase style channel, following its rules."],
  ["📧 Email", "Only for opt-in newsletters or maintainers who list a contact for submissions."],
];

export function generateReport(
  ranked: Record<string, ScoredRepo[]>,
  meta: { minScore: number; queryCount: number; scanned: number; date?: Date },
): string {
  const date = (meta.date ?? new Date()).toISOString().slice(0, 10);
  const cats = Object.keys(ranked).sort();
  const total = cats.reduce((n, c) => n + ranked[c].length, 0);
  const L: string[] = [];
  L.push(`# 🔭 Repo Discovery Report — ${date}`, "");
  L.push("> Focus: **BibleFI** & **Watcher Tech** — recommendations for human review. Nothing is posted automatically.", "");
  L.push("## 📊 Summary", "", "| Metric | Value |", "|---|---|");
  L.push(`| Search queries | ${meta.queryCount} |`, `| Repos scanned | ${meta.scanned} |`);
  L.push(`| Min score | ${meta.minScore}/100 |`, `| Categories with matches | ${cats.length} |`, `| Total matches | ${total} |`, "");
  for (const c of cats) {
    L.push(`## 🎯 ${c}`, "", "| Repo | Score | ⭐ | Matched keywords | Breakdown (K/P/A/Pr/Ad) |", "|---|---|---|---|---|");
    for (const r of ranked[c]) {
      const b = r.breakdown;
      L.push(`| [${r.fullName}](${r.url}) | **${r.score}** | ${r.stars} | ${r.matchedKeywords.join(", ") || "-"} | ${b.keywords}/${b.popularity}/${b.activity}/${b.professionalism}/${b.adoption} |`);
    }
    L.push("");
  }
  L.push("## 📣 Recommended Channels", "");
  for (const [n, d] of CHANNELS) L.push(`- **${n}** — ${d}`);
  L.push("", "## ✍️ Sample Outreach Templates", "", "_Drafts for you to edit and approve. Send only where invited._", "");
  L.push("### GitHub (list / discussion where submissions are invited)", "", "```text",
    "Hi! I maintain BibleFI, a Base/Farcaster onchain tithing & giving app. It seems to fit this list",
    "because <reason>. Happy to follow any contribution guidelines — thanks for curating!", "```", "");
  L.push("### Farcaster cast", "", "```text",
    "Building BibleFI on Base 🙏 onchain giving + financial wisdom. Looking for feedback from builders",
    "working on <topic>. Repo: https://github.com/normancomics/BibleFI", "```", "");
  L.push("## 🧪 Discovery Methodology", "",
    `1. Run ${meta.queryCount} GitHub search queries (top results each), excluding normancomics repos.`,
    "2. Score each repo out of 100: keywords (25), popularity (40), activity (20), professionalism (10), adoption (15).",
    `3. Keep repos scoring at least ${meta.minScore}; show the top 12 per category.`, "");
  L.push("## 🤝 Ethical Guidelines", "",
    "- No automated DMs, mass @-mentions, or unsolicited issues/discussions on others' repos.",
    "- Use only public data; don't profile individual sponsors.",
    "- A human reviews and approves everything before it is posted.",
    "- Follow GitHub's Acceptable Use Policies and each community's rules.", "");
  return L.join("\n");
}
