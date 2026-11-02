import { describe, expect, it } from "vitest";

import { containsTerm, expandTerm, formatKeywords, matchPosting, normalize, parseKeywords, sourceQueries } from "./keywords";

describe("parseKeywords", () => {
  it("splits any, must and must-not terms", () => {
    expect(parseKeywords("chief of staff, Partnerships, +healthcare, -field sales, −Sales")).toEqual({
      any: ["chief of staff", "partnerships"],
      all: ["healthcare"],
      none: ["field sales", "sales"],
    });
  });

  it("reads OR, semicolons, quotes and duplicates", () => {
    expect(parseKeywords('"business development" OR growth; growth')).toEqual({ any: ["business development", "growth"], all: [], none: [] });
  });

  it("is empty for blank input", () => {
    expect(parseKeywords("  , ,")).toEqual({ any: [], all: [], none: [] });
  });

  it("formats back to one line", () => {
    expect(formatKeywords(parseKeywords("a, +b, -c"))).toBe("a, +b, -c");
  });
});

describe("normalize and containsTerm", () => {
  it("treats & as and, straightens quotes, collapses space", () => {
    expect(normalize("  Strategy &  Ops – Founder’s Office ")).toBe("strategy and ops - founder's office");
  });

  it("matches whole words only", () => {
    expect(containsTerm("head of bd and alliances", "bd")).toBe(true);
    expect(containsTerm("abdul's team", "bd")).toBe(false);
    expect(containsTerm("p and l owner", "p and l")).toBe(true);
  });
});

describe("expandTerm", () => {
  it("widens a title to its family", () => {
    const titles = expandTerm("Founder's Office");
    expect(titles[0]).toBe("founder's office");
    expect(titles).toContain("chief of staff");
    expect(titles).toContain("bizops");
  });

  it("joins a family through a multi-word title inside a longer term", () => {
    expect(expandTerm("head of channel partnerships")).toContain("alliances");
  });

  it("doesn't join a family through a single word inside a phrase", () => {
    expect(expandTerm("strategy and operations")).not.toContain("program manager");
  });

  it("keeps just the term with related titles off, or when it has no family", () => {
    expect(expandTerm("Founder's Office", false)).toEqual(["founder's office"]);
    expect(expandTerm("marine biologist")).toEqual(["marine biologist"]);
  });
});

describe("matchPosting", () => {
  const cos = { title: "Chief of Staff to the CEO", company: "Zenvo Health", place: "Bengaluru", description: "Work with our founders on healthcare partnerships." };

  it("finds a related title and says so", () => {
    const match = matchPosting(parseKeywords("founder's office"), cos);
    expect(match.matched).toBe(true);
    expect(match.hits).toContain("chief of staff");
    expect(match.viaRelated).toBe(true);
  });

  it("misses it with related titles off", () => {
    expect(matchPosting(parseKeywords("founder's office"), cos, { related: false }).matched).toBe(false);
  });

  it("requires every + term and drops any - term", () => {
    expect(matchPosting(parseKeywords("chief of staff, +healthcare"), cos).matched).toBe(true);
    expect(matchPosting(parseKeywords("chief of staff, +fintech"), cos).matched).toBe(false);
    expect(matchPosting(parseKeywords("chief of staff, -healthcare"), cos).matched).toBe(false);
  });

  it("weights title hits above body hits", () => {
    const inTitle = matchPosting(parseKeywords("partnerships"), { title: "Partnerships Lead", description: "" });
    const inBody = matchPosting(parseKeywords("partnerships"), { title: "Manager", description: "own partnerships" });
    expect(inTitle.relevance).toBeGreaterThan(inBody.relevance);
    expect(inTitle.viaRelated).toBe(false);
  });

  it("keeps a posting without any typed word when any-words only rank", () => {
    const match = matchPosting(parseKeywords("product designer, -sales"), { title: "UX Researcher" }, { requireAny: false });
    expect(match).toEqual({ matched: true, hits: [], viaRelated: false, relevance: 0 });
    expect(matchPosting(parseKeywords("product designer, +figma"), { title: "UX Researcher" }, { requireAny: false }).matched).toBe(false);
  });

  it("matches everything for an empty query, except excluded words", () => {
    expect(matchPosting(parseKeywords(""), cos).matched).toBe(true);
    expect(matchPosting(parseKeywords("-zenvo"), cos).matched).toBe(false);
  });
});

describe("sourceQueries", () => {
  it("asks once per typed term with the must terms, then related titles, up to the cap", () => {
    expect(sourceQueries(parseKeywords("founder's office, partnerships, +healthcare"), { max: 4 })).toEqual([
      "founder's office healthcare",
      "partnerships healthcare",
      "founders office healthcare",
      "chief of staff healthcare",
    ]);
  });

  it("asks only typed terms with related titles off", () => {
    expect(sourceQueries(parseKeywords("a, b"), { related: false })).toEqual(["a", "b"]);
  });

  it("falls back to the must terms when there are no any terms", () => {
    expect(sourceQueries(parseKeywords("+healthcare, +partnerships, -sales"))).toEqual(["healthcare partnerships"]);
  });
});
