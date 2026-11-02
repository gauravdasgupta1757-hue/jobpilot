import { describe, expect, it } from "vitest";

import { parseKeywords } from "./keywords";
import { cityKey, companyKey, dedupeKey, mergeAndRank, mergePostings, titleKey } from "./merge";
import type { FoundPosting } from "./search";

const base: FoundPosting = {
  source: "JSEARCH",
  externalId: "1",
  title: "Founder’s Office – Partnerships",
  company: "Kinara Health Pvt. Ltd.",
  place: "Mumbai, Maharashtra, India",
  remote: false,
  salary: "",
  postedAt: "2026-10-30T00:00:00.000Z",
  url: "https://example.com/a",
  via: "LinkedIn",
  description: "Short start",
  complete: false,
};
const posting = (over: Partial<FoundPosting>): FoundPosting => ({ ...base, ...over });

describe("keys", () => {
  it("ignores legal suffixes, punctuation and the state", () => {
    expect(companyKey("Kinara Health Pvt. Ltd.")).toBe("kinara health");
    expect(titleKey("Founder’s Office – Partnerships")).toBe("founders office partnerships");
    expect(cityKey("Mumbai, Maharashtra, India")).toBe("mumbai");
    expect(dedupeKey(base)).toBe(dedupeKey(posting({ company: "Kinara Health", title: "Founders Office - Partnerships", place: "Mumbai" })));
  });
});

describe("mergePostings", () => {
  it("keeps the complete copy and lists every source, the kept one first", () => {
    const [one] = mergePostings([
      [base],
      [posting({ source: "FREEHIRE", externalId: "f1", description: "The whole posting", complete: true })],
      [posting({ source: "ADZUNA", externalId: "z1" })],
    ]);
    expect(one.posting.source).toBe("FREEHIRE");
    expect(one.foundIn).toEqual(["FREEHIRE", "JSEARCH", "ADZUNA"]);
  });

  it("keeps different jobs apart", () => {
    expect(mergePostings([[base, posting({ externalId: "2", place: "Bengaluru" })]])).toHaveLength(2);
  });
});

describe("mergeAndRank", () => {
  const lists = [
    [
      posting({ externalId: "a", title: "Chief of Staff", company: "Zenvo", place: "Bengaluru", postedAt: "2026-11-01T00:00:00.000Z" }),
      posting({ externalId: "b", title: "Partnerships Lead", company: "Ledgerline", place: "Mumbai", postedAt: "2026-10-20T00:00:00.000Z" }),
      posting({ externalId: "c", title: "Field Sales Executive", company: "Northgate", place: "Mumbai", description: "partnerships with clinics" }),
    ],
  ];

  it("drops postings that don't match and puts typed-word title hits first", () => {
    const ranked = mergeAndRank(lists, parseKeywords("partnerships, founder's office, -field sales"));
    expect(ranked.map((item) => item.company)).toEqual(["Ledgerline", "Zenvo"]);
    expect(ranked[1].match.viaRelated).toBe(true);
  });

  it("orders newest first on request", () => {
    const ranked = mergeAndRank(lists, parseKeywords("partnerships, founder's office, -field sales"), { order: "newest" });
    expect(ranked.map((item) => item.company)).toEqual(["Zenvo", "Ledgerline"]);
  });
});
