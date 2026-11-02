// Keyword search for Find jobs (JobPilot): what the user types, how it is
// widened to related job titles, and how a posting is checked against it.
// Pure functions, shared by the server and the screen.
//
//   chief of staff, partnerships        any of these
//   +healthcare                         must appear
//   -sales  or  −sales                  must not appear
//   "business development"              a phrase, as typed
//   a OR b                              same as a comma

export type KeywordQuery = {
  /** At least one of these must appear (when there are any). */
  any: string[];
  /** Every one of these must appear. */
  all: string[];
  /** None of these may appear. */
  none: string[];
};

/**
 * Job titles that mean the same kind of role, as recruiters in India and
 * abroad write them. A term matching one entry is widened to the whole
 * family when related titles are on.
 */
export const ROLE_FAMILIES: readonly (readonly string[])[] = [
  ["founder's office", "founders office", "chief of staff", "office of the ceo", "ceo's office", "strategy and operations", "bizops", "business operations"],
  ["partnerships", "partnership", "alliances", "strategic partnerships", "channel partnerships", "partner manager", "partner success"],
  ["business development", "bd manager", "bdm", "new business"],
  ["growth", "growth marketing", "user acquisition", "performance marketing"],
  ["product manager", "product owner", "associate product manager", "apm"],
  ["data analyst", "business analyst", "analytics", "mis analyst"],
  ["software engineer", "software developer", "sde", "backend developer", "full stack developer"],
  ["brand manager", "brand marketing", "marketing manager"],
  ["operations manager", "program manager", "operations"],
  ["talent acquisition", "recruiter", "hr business partner", "human resources"],
  ["financial analyst", "fp&a", "finance manager", "chartered accountant"],
  ["consultant", "strategy consultant", "management consultant", "associate consultant"],
  ["product designer", "ux designer", "ui designer", "ux/ui designer"],
  ["customer success", "account manager", "client success"],
  ["sales", "account executive", "key account manager", "field sales", "inside sales"],
];

/** Lower case, "&" read as "and", curly quotes straightened, one space between words. */
export function normalize(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits what the user typed into any, all and none. */
export function parseKeywords(input: string): KeywordQuery {
  const query: KeywordQuery = { any: [], all: [], none: [] };
  const parts = input
    .split(/,|;|\n|\s+OR\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const raw of parts) {
    let part = raw;
    let bucket: keyof KeywordQuery = "any";
    if (/^[-−]/.test(part)) {
      bucket = "none";
      part = part.slice(1);
    } else if (part.startsWith("+")) {
      bucket = "all";
      part = part.slice(1);
    }
    const term = normalize(part.replace(/^["']+|["']+$/g, ""));
    if (term && !query[bucket].includes(term)) query[bucket].push(term);
  }
  return query;
}

/** The query as one line again, for keeping and showing a search. */
export function formatKeywords(query: KeywordQuery): string {
  return [...query.any, ...query.all.map((term) => `+${term}`), ...query.none.map((term) => `-${term}`)].join(", ");
}

let families: string[][] | null = null;
const normalFamilies = () => (families ??= ROLE_FAMILIES.map((family) => family.map(normalize)));

/** The term and, when related titles are on, every title in its family. */
export function expandTerm(term: string, related = true): string[] {
  const normal = normalize(term);
  const out = new Set([normal]);
  if (related) {
    for (const family of normalFamilies()) {
      // A typed term joins a family when it is one of its titles, or holds a
      // multi-word one ("head of channel partnerships"); a single word inside
      // a longer phrase ("operations" in "strategy and operations") doesn't.
      if (family.some((title) => normal === title || (title.includes(" ") && containsTerm(normal, title)))) {
        for (const title of family) out.add(title);
      }
    }
  }
  return [...out];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const patternCache = new Map<string, RegExp>();
/** Whether `term` appears in `text` (both normalized) as whole words, so "bd" doesn't match "abdul". */
export function containsTerm(text: string, term: string): boolean {
  let pattern = patternCache.get(term);
  if (!pattern) {
    pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}(?=$|[^a-z0-9])`);
    patternCache.set(term, pattern);
  }
  return pattern.test(text);
}

export type PostingText = { title: string; company?: string; place?: string; description?: string };

export type KeywordMatch = {
  matched: boolean;
  /** The words that were found, as matched (a related title may stand in for a typed term). */
  hits: string[];
  /** True when it was found only through a related title, not a word the user typed. */
  viaRelated: boolean;
  /** Higher is better: a hit in the title counts three times one in the text. */
  relevance: number;
};

const NO_MATCH: KeywordMatch = { matched: false, hits: [], viaRelated: false, relevance: 0 };

/** Checks one posting against the query. An empty query matches everything. */
export function matchPosting(query: KeywordQuery, posting: PostingText, { related = true }: { related?: boolean } = {}): KeywordMatch {
  const title = normalize(posting.title);
  const body = normalize([posting.company, posting.place, posting.description].filter(Boolean).join(" \n "));
  const anywhere = `${title} \n ${body}`;

  if (query.none.some((term) => containsTerm(anywhere, term))) return NO_MATCH;

  const hits: string[] = [];
  let relevance = 0;
  let literal = false;

  for (const term of query.all) {
    const found = expandTerm(term, related).filter((variant) => containsTerm(anywhere, variant));
    if (!found.length) return NO_MATCH;
    if (found.includes(term)) literal = true;
    for (const variant of found) {
      if (!hits.includes(variant)) hits.push(variant);
      relevance += containsTerm(title, variant) ? 3 : 1;
    }
  }

  let anyFound = query.any.length === 0;
  for (const term of query.any) {
    for (const variant of expandTerm(term, related)) {
      if (!containsTerm(anywhere, variant)) continue;
      anyFound = true;
      if (variant === term) literal = true;
      if (!hits.includes(variant)) hits.push(variant);
      relevance += containsTerm(title, variant) ? 3 : 1;
    }
  }
  if (!anyFound) return NO_MATCH;

  const typed = query.any.length + query.all.length > 0;
  return { matched: true, hits, viaRelated: typed && !literal, relevance };
}

/**
 * What to ask the job sources, which each take one line of keywords: one
 * request per "any" term (with the "all" terms added), most important first,
 * at most `max` so a search doesn't use up a source's quota. With related
 * titles on and room to spare, the closest related titles are asked too.
 */
export function sourceQueries(query: KeywordQuery, { related = true, max = 4 }: { related?: boolean; max?: number } = {}): string[] {
  const must = query.all.join(" ");
  const withMust = (term: string) => (must ? `${term} ${must}` : term);
  const out: string[] = [];
  const push = (line: string) => {
    if (out.length < max && line && !out.includes(line)) out.push(line);
  };
  if (!query.any.length) {
    push(must);
    return out;
  }
  for (const term of query.any) push(withMust(term));
  if (related) {
    for (const term of query.any) {
      for (const variant of expandTerm(term, true).slice(1)) push(withMust(variant));
    }
  }
  return out;
}
