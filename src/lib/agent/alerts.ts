import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { alertRemote, keywordFit, type AlertJob } from "@/lib/google/job-alerts";
import { parseKeywords } from "@/lib/job-search/keywords";
import type { FoundPosting } from "@/lib/job-search/search";
import { logServerError } from "@/lib/log";
import { saveScore } from "@/lib/posting-scores";
import { prisma } from "@/lib/prisma";
import { loadProfile } from "@/lib/profile-data";
import { loadPostingScorer, scoringProblem } from "@/lib/scoring";
import { loadSettings } from "@/lib/settings-data";

import { candidateData } from "./candidates";
import { newPostings } from "./run";

// JobPilot: the jobs from LinkedIn, Naukri and other alert emails, kept as
// the job agent's candidates, so they wait on the Job agent screen with the
// ones its own searches find. Scored by the AI when one is set up (as many
// as a run of the agent scores), else on the agent's keywords.

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** An alert's job in the shape search results have. */
export function alertPosting(job: AlertJob, receivedAt: Date): FoundPosting {
  const at = [job.company, job.place].filter(Boolean).join(", ");
  return {
    source: "EMAIL_ALERT",
    externalId: `${job.portal.toLowerCase()}:${job.id}`.slice(0, 500),
    title: job.title.slice(0, 500),
    company: job.company.slice(0, 300),
    place: job.place.slice(0, 300),
    remote: alertRemote(job),
    salary: "",
    postedAt: receivedAt.toISOString(),
    url: job.url,
    via: job.portal,
    description: `${job.title}${at ? ` — ${at}` : ""}.\n\nFrom your ${job.portal} job alert of ${dateFormat.format(receivedAt)}. Open the posting for the full description, or paste it into the application.`,
    complete: false,
  };
}

/** Keeps the new ones as candidates. Returns how many were new. */
export async function importAlertPostings(postings: readonly FoundPosting[], signal?: AbortSignal): Promise<number> {
  const fresh = await newPostings(postings);
  if (fresh.length === 0) return 0;
  const settings = await loadSettings();
  const keywords = parseKeywords(settings.agentQuery.keywords);
  const ai = (await scoringProblem()) ? null : await Promise.all([loadPostingScorer(), loadProfile()]);
  const aiSignal = signal ?? new AbortController().signal;
  let aiLeft = settings.agentMaxScores;
  let added = 0;

  for (const posting of fresh) {
    if (signal?.aborted) break;
    let fit = keywordFit(posting, keywords, posting.via);
    if (ai && aiLeft > 0) {
      aiLeft--;
      try {
        const [score, profile] = ai;
        const { data, scoredWith } = await score(posting, profile, aiSignal);
        await saveScore(posting, data, scoredWith);
        fit = { score: data.score, reasons: [`From your ${posting.via} job alert`, ...data.reasons], redFlags: data.redFlags };
      } catch (error) {
        // The keyword score stands in.
        if (!aiSignal.aborted) logServerError("scoring a job alert", error);
      }
    }
    try {
      await prisma.agentCandidate.create({ data: candidateData(posting, fit), select: { id: true } });
      added++;
    } catch (error) {
      // The same job from another alert, kept first: it's seen either way.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  return added;
}
