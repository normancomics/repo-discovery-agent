import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Channel, Profile, QueryConfig } from "./types.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function load<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(root, "config", file), "utf8")) as T;
}

export const loadProfiles = () => load<Profile[]>("profiles.json");
export const loadQueries = () => load<QueryConfig>("queries.json");
export const loadChannels = () => load<Record<string, Channel[]>>("channels.json");
export const loadPrompts = () =>
  load<{ system: string; profileSummary: string; outreach: string }>("prompts.json");

export function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
}
