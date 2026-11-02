import "server-only";

import { credentialsFor, loadJobSearchConfig, requestContext, type JobSearchConfig } from "./config";
import { JobSearchError } from "./errors";
import { postingDetails, searchPostings } from "./index";
import { parseKeywords, sourceQueries } from "./keywords";
import { mergeAndRank } from "./merge";
import { foundPostingSchema, JOB_SOURCES, type FoundPosting, type JobSource, type SearchPage, type SearchProblem, type SearchQuery } from "./search";
import { SOURCE_INFO, sourceCovers } from "./sources";

// Asking job sources from Find jobs (E14-6): a page of postings, or what
// went wrong in words for the screen. Kept searches are in
// src/lib/posting-searches.ts.
//
// JobPilot: a new search asks every source that is set up, not only the one
// chosen in Settings, with the keywords widened to related titles
// (keywords.ts), and merges what they find into one ranked list (merge.ts).
// "Show more" goes on with the chosen source alone.

/** Keyword lines per search for a source with a quota, and for a free one. */
const LINES_WITH_QUOTA = 2;
const LINES_FREE = 3;

type Asked = ({ ok: true; source: JobSource } & SearchPage) | SearchProblem;

/**
 * One page for `query`: from every source that is set up when it's a new
 * search, or from `source` alone (a kept search going on with "Show more").
 */
export async function askSource(query: SearchQuery, { source, next = null }: { source?: JobSource; next?: string | null } = {}): Promise<Asked> {
  const config = await loadJobSearchConfig();
  const from = source ?? config.source;
  if (!from) return { ok: false, problem: "off", message: "Choose where to search in Settings → Job search first." };
  if (!query.country) return { ok: false, problem: "no-country", message: "Choose a country to search in." };
  if (!source && !next) return askEverywhere(config, from, query);
  try {
    const page = await searchPostings(from, credentialsFor(config, from), query, next, requestContext(from));
    const keywords = parseKeywords(query.keywords);
    const postings = mergeAndRank([page.postings], keywords).map(asFound);
    return { ok: true, source: from, postings, next: page.next };
  } catch (error) {
    if (error instanceof JobSearchError) return { ok: false, problem: error.problem, message: error.message };
    throw error;
  }
}

/** The sources this search can use: the chosen one first, then every other that has what it needs and covers the country. */
export function usableSources(config: JobSearchConfig, primary: JobSource, country: string): { source: JobSource; credentials: unknown }[] {
  const out: { source: JobSource; credentials: unknown }[] = [];
  for (const source of [primary, ...JOB_SOURCES.filter((other) => other !== primary)]) {
    if (!sourceCovers(source, country)) continue;
    try {
      out.push({ source, credentials: credentialsFor(config, source) });
    } catch (error) {
      // A source without a key, or switched off, is simply left out; the chosen one's problem is reported.
      if (!(error instanceof JobSearchError)) throw error;
      if (source === primary) throw error;
    }
  }
  return out;
}

/** Drops what merging added, so the posting can be kept and shown like any other. */
const asFound = (posting: FoundPosting): FoundPosting => foundPostingSchema.parse(posting);

async function askEverywhere(config: JobSearchConfig, primary: JobSource, query: SearchQuery): Promise<Asked> {
  let sources: { source: JobSource; credentials: unknown }[];
  try {
    sources = usableSources(config, primary, query.country);
  } catch (error) {
    if (error instanceof JobSearchError) return { ok: false, problem: error.problem, message: error.message };
    throw error;
  }
  if (!sources.length) return { ok: false, problem: "country", message: "None of your job sources covers that country. Choose another in Settings → Job search." };

  const keywords = parseKeywords(query.keywords);
  const lines = sourceQueries(keywords, { max: LINES_FREE });
  if (!lines.length) lines.push(query.keywords);

  const asks = sources.flatMap(({ source, credentials }) =>
    lines.slice(0, SOURCE_INFO[source].quotaPeriod ? LINES_WITH_QUOTA : LINES_FREE).map((line, index) => ({
      source,
      first: index === 0,
      page: searchPostings(source, credentials as never, { ...query, keywords: line }, null, requestContext(source)),
    })),
  );
  const settled = await Promise.allSettled(asks.map((ask) => ask.page));

  const lists: FoundPosting[][] = [];
  let next: string | null = null;
  let problem: JobSearchError | null = null;
  settled.forEach((result, index) => {
    const ask = asks[index];
    if (result.status === "fulfilled") {
      lists.push(result.value.postings);
      if (ask.source === primary && ask.first) next = result.value.next;
    } else if (result.reason instanceof JobSearchError) {
      problem ??= result.reason;
    } else {
      throw result.reason;
    }
  });
  if (!lists.length && problem) {
    const error = problem as JobSearchError;
    return { ok: false, problem: error.problem, message: error.message };
  }
  return { ok: true, source: primary, postings: mergeAndRank(lists, keywords).map(asFound), next };
}

/**
 * The whole text of a posting, from its own source (which may no longer be
 * the one chosen, for a saved posting); null when it can't be had.
 */
export async function fullText(posting: FoundPosting): Promise<string | null> {
  if (posting.complete) return posting.description;
  try {
    return await postingDetails(posting.source, credentialsFor(await loadJobSearchConfig(), posting.source), posting, requestContext(posting.source));
  } catch (error) {
    if (error instanceof JobSearchError) return null;
    throw error;
  }
}
