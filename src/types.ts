export interface Profile {
  id: string;
  name: string;
  repo: string;
  description: string;
  tags: string[];
  languages: string[];
  outreachGoal: string;
  summary?: string;
}

export interface Candidate {
  fullName: string;
  url: string;
  description: string;
  topics: string[];
  language: string | null;
  stars: number;
  pushedAt: string;
  owner: string;
  archived: boolean;
  fork: boolean;
}

export interface SponsorSignal {
  owner: string;
  hasSponsorsListing: boolean;
  sponsorCount: number | null;
}

export interface ScoredCandidate extends Candidate {
  score: number;
  lexical: number;
  semantic: number | null;
  reasons: string[];
  sponsor?: SponsorSignal;
}

export interface QueryConfig {
  perQueryLimit: number;
  topN: number;
  queries: Record<string, string[]>;
  curatedLists: string[];
}

export interface Channel {
  channel: string;
  where: string;
  how: string;
}
