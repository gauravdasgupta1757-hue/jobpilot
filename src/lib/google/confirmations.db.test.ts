import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestClient, resetDatabase } from "@/test/db";

// JobPilot: applications made outside the app, logged from their
// confirmation mail, against a test database.

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
vi.mock("@/lib/env", () => ({ env: { DOSSIER_SECRET: "s".repeat(40), DOSSIER_DATA_DIR: "/tmp" } }));

import type { MatchableApplication } from "./matching";
import { logConfirmedApplication } from "./sync";

const prisma = () => db.client!;
const sentAt = new Date("2026-10-30T09:15:00Z");

beforeEach(() => resetDatabase(prisma()));
afterAll(() => prisma().$disconnect());

describe("logConfirmedApplication", () => {
  it("adds a new application as sent, with a note on where it came from", async () => {
    const known: MatchableApplication[] = [];
    const id = await logConfirmedApplication({ portal: "Naukri", company: "Tidewater Homes", role: "Growth Lead" }, sentAt, known);

    const application = await prisma().application.findUniqueOrThrow({ where: { id }, include: { notes: true, events: true } });
    expect(application).toMatchObject({ company: "Tidewater Homes", role: "Growth Lead", title: "Growth Lead · Tidewater Homes", status: "SENT", sentAt });
    expect(application.notes[0].body).toMatch(/^Logged from your Naukri confirmation email\./);
    expect(application.events).toHaveLength(1);
    // Later mail in the same check can match it.
    expect(known.map((entry) => entry.id)).toEqual([id]);
  });

  it("marks a draft for the same company and role as sent instead of adding another", async () => {
    const draft = await prisma().application.create({ data: { company: "Kinara Health Pvt Ltd", role: "Founder's Office – Partnerships" } });
    const id = await logConfirmedApplication({ portal: "LinkedIn", company: "Kinara Health", role: "" }, sentAt, []);
    expect(id).toBe(draft.id);
    expect(await prisma().application.count()).toBe(1);
    expect(await prisma().application.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "SENT", sentAt });
  });

  it("leaves an application that's further along as it is", async () => {
    const interviewing = await prisma().application.create({ data: { company: "Ledgerline", role: "Head of Partnerships", status: "INTERVIEW" } });
    const id = await logConfirmedApplication({ portal: "Company site", company: "Ledgerline", role: "Head of Partnerships" }, sentAt, []);
    expect(id).toBe(interviewing.id);
    expect(await prisma().application.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "INTERVIEW" });
  });

  it("keeps a different role at the same company apart", async () => {
    await prisma().application.create({ data: { company: "Ledgerline", role: "Head of Partnerships" } });
    await logConfirmedApplication({ portal: "Greenhouse", company: "Ledgerline", role: "Data Analyst" }, sentAt, []);
    expect(await prisma().application.count()).toBe(2);
  });
});
