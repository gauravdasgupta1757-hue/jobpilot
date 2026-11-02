import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { saveSettings } from "@/lib/settings-data";
import { createTestClient, resetDatabase } from "@/test/db";

import { MockProvider } from "../ai/providers/mock";

import { alertPosting, importAlertPostings } from "./alerts";

// JobPilot: jobs from alert emails kept as the job agent's candidates.

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
vi.mock("@/lib/env", () => ({ env: { DOSSIER_SECRET: "a".repeat(32) } }));
vi.mock("@/lib/profile-data", async () => {
  const { demoProfile } = await import("@/lib/demo-profile");
  return { loadProfile: async () => demoProfile() };
});
const fake = vi.hoisted(() => ({ ai: false, scored: [] as string[] }));
vi.mock("@/lib/ai/config", () => ({ isAiConfigured: async () => fake.ai }));
vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  getAiProvider: async () =>
    new MockProvider({
      reply: (call) => {
        const { title } = JSON.parse(call.messages[0].content.split("The posting's facts:\n")[1].split("\n\nThe posting:")[0]) as { title: string };
        fake.scored.push(title);
        return { score: 88, reasons: [`Fits ${title}.`], redFlags: [] };
      },
    }),
}));

const prisma = () => db.client!;
const at = new Date("2026-11-02T04:30:00Z");
const job = (id: string, title: string, company = "Zenvo Health") => ({ portal: "LinkedIn", id, url: `https://www.linkedin.com/jobs/view/${id}/`, title, company, place: "Bengaluru" });

beforeEach(async () => {
  await resetDatabase(prisma());
  fake.ai = false;
  fake.scored = [];
  await saveSettings({ agentQuery: { keywords: "chief of staff, -sales", place: "", country: "in", radiusKm: 25, remoteOnly: false, postedWithin: "any" } });
});
afterAll(async () => prisma().$disconnect());

describe("alertPosting", () => {
  it("keeps what the email says, with the board as where it came from", () => {
    expect(alertPosting(job("4012345678", "Chief of Staff"), at)).toMatchObject({
      source: "EMAIL_ALERT",
      externalId: "linkedin:4012345678",
      via: "LinkedIn",
      postedAt: "2026-11-02T04:30:00.000Z",
      complete: false,
      description: expect.stringContaining("From your LinkedIn job alert of 2 Nov."),
    });
  });
});

describe("importAlertPostings", () => {
  it("keeps new jobs once, scored on the agent's keywords without an AI", async () => {
    const postings = [job("1000001", "Chief of Staff"), job("1000002", "Inside Sales Executive"), job("1000003", "Data Engineer")].map((entry) => alertPosting(entry, at));
    expect(await importAlertPostings(postings)).toBe(3);
    const kept = await prisma().agentCandidate.findMany({ orderBy: { externalId: "asc" } });
    expect(kept.map((candidate) => [candidate.title, candidate.score >= 70, candidate.source, candidate.via])).toEqual([
      ["Chief of Staff", true, "EMAIL_ALERT", "LinkedIn"],
      ["Inside Sales Executive", false, "EMAIL_ALERT", "LinkedIn"],
      ["Data Engineer", false, "EMAIL_ALERT", "LinkedIn"],
    ]);

    // The next alert with the same job, even as another board's copy, adds nothing.
    const again = alertPosting({ ...job("999", "Chief of Staff"), portal: "Naukri", url: "https://www.linkedin.com/jobs/view/1000001/" }, at);
    expect(await importAlertPostings([again, ...postings])).toBe(0);
  });

  it("has the AI score them when one is set up, as many as a run of the agent would", async () => {
    fake.ai = true;
    await saveSettings({ agentMaxScores: 1 });
    expect(await importAlertPostings([job("2000001", "Chief of Staff"), job("2000002", "Founder's Office Lead")].map((entry) => alertPosting(entry, at)))).toBe(2);
    expect(fake.scored).toEqual(["Chief of Staff"]);
    const scored = await prisma().agentCandidate.findFirstOrThrow({ where: { externalId: "linkedin:2000001" } });
    expect(scored).toMatchObject({ score: 88, reasons: ["From your LinkedIn job alert", "Fits Chief of Staff."] });
    // Find jobs shows the score too.
    expect(await prisma().postingScore.count()).toBe(1);
  });
});
