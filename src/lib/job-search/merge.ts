// Merging what several job sources found for one search (JobPilot): the same
// posting from JSearch, Adzuna and FreeHire becomes one, then postings are
// checked against the keywords and ranked. Pure, so it is easy to test.

import { matchPosting, normalize, type KeywordMatch, type KeywordQuery } from "./keywords";
import type { FoundPosting, JobSource } from "./search";

/** A posting after merging: where else it was found, and how it matched the keywords. */
export type MergedPosting = FoundPosting & {
  /** Every source that returned it, the kept one first. */
  foundIn: JobSource[];
  match: KeywordMatch;
};

const COMPANY_NOISE = /\b(private|pvt|limited|ltd|llp|inc|corp|corporation|technologies|technology|labs|india|the)\b\.?/g;

/** "Kinara Health Pvt. Ltd." and "Kinara Health" are the same employer. */
export function companyKey(company: string): string {
  return normalize(company).replace(COMPANY_NOISE, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

/** The first part of a place: "Mumbai, Maharashtra, India" → "mumbai". */
export function cityKey(place: string): string {
  return normalize(place).split(/[,(/|·-]/)[0].replace(/[^a-z ]+/g, "").trim();
}

/** Same title words in the same order, ignoring punctuation: "Founder’s Office – Partnerships" = "founders office partnerships". */
export function titleKey(title: string): string {
  return normalize(title).replace(/'/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** What makes two postings the same job, whichever source found them. */
export function dedupeKey(posting: Pick<FoundPosting, "title" | "company" | "place">): string {
  return `${companyKey(posting.company)}|${titleKey(posting.title)}|${cityKey(posting.place)}`;
}

/** Which of two copies to keep: the one with the whole text, then a direct link, then the newest. */
function better(a: FoundPosting, b: FoundPosting): FoundPosting {
  if (a.complete !== b.complete) return a.complete ? a : b;
  if (Boolean(a.url) !== Boolean(b.url)) return a.url ? a : b;
  if (a.description.length !== b.description.length) return a.description.length > b.description.length ? a : b;
  return (a.postedAt ?? "") >= (b.postedAt ?? "") ? a : b;
}

/** One entry per job, keeping the best copy and every source that had it. */
export function mergePostings(lists: FoundPosting[][]): { posting: FoundPosting; foundIn: JobSource[] }[] {
  const byKey = new Map<string, { posting: FoundPosting; foundIn: JobSource[] }>();
  for (const list of lists) {
    for (const posting of list) {
      const key = dedupeKey(posting);
      const seen = byKey.get(key);
      if (!seen) {
        byKey.set(key, { posting, foundIn: [posting.source] });
        continue;
      }
      const kept = better(seen.posting, posting);
      const foundIn = seen.foundIn.includes(posting.source) ? seen.foundIn : [...seen.foundIn, posting.source];
      byKey.set(key, { posting: kept, foundIn: [kept.source, ...foundIn.filter((source) => source !== kept.source)] });
    }
  }
  return [...byKey.values()];
}

export type RankOrder = "best" | "newest";

/**
 * Merges, keeps only postings that match the keywords, and orders them: by
 * how well the keywords match (title hits first, then postings more sources
 * agree on, then the newest), or newest first.
 */
export function mergeAndRank(
  lists: FoundPosting[][],
  query: KeywordQuery,
  { related = true, order = "best" }: { related?: boolean; order?: RankOrder } = {},
): MergedPosting[] {
  const merged: MergedPosting[] = [];
  for (const { posting, foundIn } of mergePostings(lists)) {
    const match = matchPosting(query, posting, { related });
    if (match.matched) merged.push({ ...posting, foundIn, match });
  }
  const newest = (a: MergedPosting, b: MergedPosting) => (b.postedAt ?? "").localeCompare(a.postedAt ?? "");
  merged.sort(
    order === "newest"
      ? (a, b) => newest(a, b) || b.match.relevance - a.match.relevance
      : (a, b) => b.match.relevance - a.match.relevance || Number(a.match.viaRelated) - Number(b.match.viaRelated) || b.foundIn.length - a.foundIn.length || newest(a, b),
  );
  return merged;
}
