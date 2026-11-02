import { beforeEach, describe, expect, it, vi } from "vitest";

import { JobSearchError } from "./errors";
import { EMPTY_QUERY, type FoundPosting, type JobSource, type SearchQuery } from "./search";

const searchPostings = vi.hoisted(() => vi.fn());
const config = vi.hoisted(() => ({ value: { source: "JSEARCH" as JobSource | null, keys: new Set<string>(["JSEARCH", "FREEHIRE"]) } }));

vi.mock("./index", () => ({ searchPostings, postingDetails: vi.fn() }));
vi.mock("./config", () => ({
  loadJobSearchConfig: async () => config.value,
  requestContext: () => ({}),
  credentialsFor: (_config: unknown, source: string) => {
    if (!config.value.keys.has(source)) throw new JobSearchError("no-key", `No ${source} key.`);
    return {};
  },
}));

const { askSource } = await import("./find");

const posting = (source: JobSource, id: string, title: string, company: string): FoundPosting => ({
  source,
  externalId: id,
  title,
  company,
  place: "Mumbai",
  remote: null,
  salary: "",
  postedAt: null,
  url: "",
  via: "",
  description: "",
  complete: false,
});

const query: SearchQuery = { ...EMPTY_QUERY, keywords: "founder's office, -field sales", country: "in" };

beforeEach(() => {
  searchPostings.mockReset();
  config.value = { source: "JSEARCH", keys: new Set(["JSEARCH", "FREEHIRE"]) };
});

describe("askSource, a new search", () => {
  it("asks every source that is set up, widens the keywords and merges the answers", async () => {
    searchPostings.mockImplementation(async (source: JobSource, _c: unknown, asked: SearchQuery) => ({
      postings:
        source === "JSEARCH"
          ? [posting("JSEARCH", "j1", "Chief of Staff", "Zenvo"), posting("JSEARCH", "j2", "Field Sales Executive", "Northgate")]
          : [posting("FREEHIRE", "f1", "Chief of Staff", "Zenvo Pvt Ltd"), posting("FREEHIRE", "f2", `Founder's Office (${asked.keywords})`, "Kinara")],
      next: source === "JSEARCH" ? "page:2" : null,
    }));

    const answer = await askSource(query);

    const asked = searchPostings.mock.calls.map(([source, , q]) => `${source}:${(q as SearchQuery).keywords}`);
    // JSearch has a quota, so it gets two lines; FreeHire is free and gets three. Adzuna has no key and is left out.
    expect(asked).toEqual([
      "JSEARCH:founder's office",
      "JSEARCH:founders office",
      "FREEHIRE:founder's office",
      "FREEHIRE:founders office",
      "FREEHIRE:chief of staff",
    ]);
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.source).toBe("JSEARCH");
    expect(answer.next).toBe("page:2");
    const titles = answer.postings.map((item) => `${item.title} · ${item.company}`);
    // Field sales is excluded; the Zenvo job found twice is kept once.
    expect(titles.filter((title) => title.includes("Zenvo"))).toHaveLength(1);
    expect(titles.some((title) => title.includes("Field Sales"))).toBe(false);
    expect(titles[0]).toMatch(/^Founder's Office/);
    expect(answer.postings[0]).not.toHaveProperty("match");
  });

  it("still answers when one source fails", async () => {
    searchPostings.mockImplementation(async (source: JobSource) => {
      if (source === "FREEHIRE") throw new JobSearchError("unavailable", "FreeHire isn't answering.");
      return { postings: [posting("JSEARCH", "j1", "Chief of Staff", "Zenvo")], next: null };
    });
    const answer = await askSource(query);
    expect(answer.ok && answer.postings.map((item) => item.company)).toEqual(["Zenvo"]);
  });

  it("reports the problem when every source fails", async () => {
    searchPostings.mockRejectedValue(new JobSearchError("quota", "You've used this month's searches."));
    expect(await askSource(query)).toEqual({ ok: false, problem: "quota", message: "You've used this month's searches." });
  });

  it("reports the chosen source's missing key", async () => {
    config.value = { source: "ADZUNA", keys: new Set(["FREEHIRE"]) };
    expect(await askSource(query)).toMatchObject({ ok: false, problem: "no-key" });
    expect(searchPostings).not.toHaveBeenCalled();
  });
});

describe("askSource, show more", () => {
  it("goes on with the given source alone and still applies the keywords", async () => {
    searchPostings.mockResolvedValue({ postings: [posting("FREEHIRE", "f9", "Field Sales Lead", "X"), posting("FREEHIRE", "f8", "Chief of Staff", "Y")], next: null });
    const answer = await askSource(query, { source: "FREEHIRE", next: "offset:20" });
    expect(searchPostings).toHaveBeenCalledTimes(1);
    expect(answer.ok && answer.postings.map((item) => item.company)).toEqual(["Y"]);
  });
});
