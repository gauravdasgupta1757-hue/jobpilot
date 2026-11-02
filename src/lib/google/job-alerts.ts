import { matchPosting, type KeywordQuery } from "@/lib/job-search/keywords";

import { baseDomain } from "./matching";
import { domainOf, htmlToText } from "./mime";

// JobPilot: the jobs in a job-alert email (LinkedIn, Naukri, Indeed and the
// other boards people in India get alerts from). Pure, so it's tested
// without Gmail. Nothing here visits the boards: what each job is comes
// from the email itself, and its link is kept for the user to open.
//
// Every alert lists its jobs as links to the job's page, so the links are
// what's read. In HTML mail the link's text is the job's title and the lines
// after it name the company and the place; in plain-text mail the lines just
// before a link do ("Product Manager / Razorpay / Bengaluru / View job: …").

export type AlertJob = {
  /** The board's name: "LinkedIn", "Naukri"… */
  portal: string;
  /** The board's own id for the job. */
  id: string;
  /** The job's page, without tracking. */
  url: string;
  title: string;
  company: string;
  place: string;
};

type Portal = {
  name: string;
  /** The sender's domain, as baseDomain gives it. */
  senders: readonly string[];
  /** Whether a link's host belongs to the board. */
  host: RegExp;
  /** The job's id from a link to it, or null when the link is to something else. */
  job: (url: URL) => string | null;
  /** The link to keep. */
  canonical: (url: URL, id: string) => string;
};

const pathId = (pattern: RegExp) => (url: URL) => pattern.exec(url.pathname)?.[1] ?? null;
const withoutQuery = (url: URL) => `${url.origin}${url.pathname}`;

const PORTALS: readonly Portal[] = [
  {
    name: "LinkedIn",
    senders: ["linkedin.com"],
    host: /(^|\.)linkedin\.com$/,
    job: pathId(/\/(?:comm\/)?jobs\/view\/(?:[^/]*-)?(\d{6,})/),
    canonical: (_url, id) => `https://www.linkedin.com/jobs/view/${id}/`,
  },
  {
    name: "Naukri",
    senders: ["naukri.com"],
    host: /(^|\.)naukri\.com$/,
    job: pathId(/\/job-listings-[^/]*?-(\d{9,})\/?$/),
    canonical: withoutQuery,
  },
  {
    name: "Indeed",
    senders: ["indeed.com", "indeed.co.in"],
    host: /(^|\.)indeed\.(com|co\.in)$/,
    job: (url) => (/^\/(viewjob|rc\/clk|pagead\/clk|m\/viewjob)/.test(url.pathname) ? (url.searchParams.get("jk")?.match(/^[0-9a-f]{8,}$/i)?.[0] ?? null) : null),
    canonical: (url, id) => `https://${url.hostname}/viewjob?jk=${id}`,
  },
  {
    name: "Instahyre",
    senders: ["instahyre.com"],
    host: /(^|\.)instahyre\.com$/,
    job: pathId(/\/job-(\d+)-/),
    canonical: withoutQuery,
  },
  {
    name: "IIMJobs",
    senders: ["iimjobs.com"],
    host: /(^|\.)iimjobs\.com$/,
    job: pathId(/\/j\/[^/]*-(\d+)\.html$/),
    canonical: withoutQuery,
  },
  {
    name: "Hirist",
    senders: ["hirist.tech", "hirist.com"],
    host: /(^|\.)hirist\.(tech|com)$/,
    job: pathId(/\/j\/[^/]*-(\d+)(?:\.html)?$/),
    canonical: withoutQuery,
  },
  {
    name: "Foundit",
    senders: ["foundit.in", "monsterindia.com"],
    host: /(^|\.)(foundit\.in|monsterindia\.com)$/,
    job: pathId(/\/job\/[^/]*-(\d{5,})$/),
    canonical: withoutQuery,
  },
  {
    name: "Glassdoor",
    senders: ["glassdoor.com", "glassdoor.co.in"],
    host: /(^|\.)glassdoor\.(com|co\.in)$/,
    job: (url) => url.searchParams.get("jobListingId") ?? url.searchParams.get("jl"),
    canonical: (url, id) => `https://${url.hostname}/job-listing/index.htm?jl=${id}`,
  },
  {
    name: "Wellfound",
    senders: ["wellfound.com", "angel.co"],
    host: /(^|\.)(wellfound\.com|angel\.co)$/,
    job: pathId(/\/jobs\/(\d+)/),
    canonical: (_url, id) => `https://wellfound.com/jobs/${id}`,
  },
  {
    name: "Cutshort",
    senders: ["cutshort.io"],
    host: /(^|\.)cutshort\.io$/,
    job: pathId(/\/job\/([^/?#]+)/),
    canonical: withoutQuery,
  },
];

/** The Gmail search for alerts, for the first look back. */
export const ALERT_SEARCH = `from:(${PORTALS.flatMap((portal) => portal.senders).join(" OR ")}) newer_than:7d`;

/** Mail from a board that is about an application, not new jobs. */
const NOT_AN_ALERT = /application (was |has been )?(sent|submitted|viewed|received)|you applied|thanks? (you )?for applying|interview|message from|invitation|viewed your profile/i;

const MAX_JOBS = 50;
const MAX_LINE = 140;

/** Link text that says what to do, not what the job is. */
const GENERIC = /^(view|view job|view details|see job|see more|apply|apply now|easy apply|details|more|learn more|view all.*|see all.*|search.*jobs.*|unsubscribe.*|manage.*|settings|help)$/i;

/** Lines in a job's card that are neither company nor place. */
const NOISE: readonly RegExp[] = [
  /^[-_=*·•|]{2,}$/,
  /\b\d+\s*(-|to|–)\s*\d+\s*(yrs?|years?)\b|\b\d+\+?\s*(yrs?|years?)\b/i,
  /lpa\b|₹|\binr\b|salary|not disclosed|\bctc\b/i,
  /\b\d+\+?\s*(applicants?|connections?|alumni|days?|hours?|weeks?|months?)\b/i,
  /^(new|promoted|easy apply|actively (recruiting|hiring)|be an early applicant|hot job|featured|apply|view job:?|just now|today)$/i,
  /^(posted|reviewed|reposted)\b/i,
  /\b(ago)$/i,
];

const isNoise = (line: string) => NOISE.some((pattern) => pattern.test(line));
const tidy = (text: string) => text.replace(/\s+/g, " ").trim();

function portalFor(fromAddress: string): Portal | null {
  const domain = baseDomain(domainOf(fromAddress));
  return PORTALS.find((portal) => portal.senders.includes(domain)) ?? null;
}

/** The job a link points to, also when the board wraps it in a redirect that carries it as a parameter. */
function jobOf(portal: Portal, href: string): { id: string; url: string } | null {
  const tries = [href];
  try {
    for (const value of new URL(href).searchParams.values()) if (/^https?:\/\//.test(value)) tries.push(value);
  } catch {
    return null;
  }
  for (const candidate of tries) {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol) || !portal.host.test(url.hostname)) continue;
    const id = portal.job(url);
    if (id) return { id, url: portal.canonical(url, id) };
  }
  return null;
}

const decodeEntities = (text: string) => text.replace(/&amp;/g, "&").replace(/&#x3D;|&#61;/g, "=").replace(/&quot;/g, '"');

/** A line in the mail: text, or a link to a job with what its text says. */
type Line = { job: { id: string; url: string }; text: string[] } | { job: null; text: string };

/** HTML mail as lines, with each link to a job marked. */
function htmlLines(portal: Portal, html: string): Line[] {
  const anchors = /<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  const marks: { job: { id: string; url: string }; text: string[] }[] = [];
  const marked = html.replace(anchors, (whole, _quote: string, href: string, inner: string) => {
    const job = jobOf(portal, decodeEntities(href));
    if (!job) return whole;
    const text = htmlToText(inner).split("\n").map(tidy).filter(Boolean);
    marks.push({ job, text });
    return `\n\u0000${marks.length - 1}\u0000\n`;
  });
  if (marks.length === 0) return [];
  return htmlToText(marked)
    .split("\n")
    .map(tidy)
    .filter(Boolean)
    .map((line): Line => {
      const mark = /^\u0000(\d+)\u0000$/.exec(line);
      return mark ? marks[Number(mark[1])] : { job: null, text: line };
    });
}

/** Plain-text mail as lines, with each link to a job marked. */
function textLines(portal: Portal, text: string): Line[] {
  const lines: Line[] = [];
  for (const raw of text.split("\n")) {
    const urls = raw.match(/https?:\/\/[^\s<>()"']+/g) ?? [];
    const jobs = urls.map((url) => jobOf(portal, url)).filter((job) => job !== null);
    if (jobs.length === 0) {
      const line = tidy(raw);
      if (line) lines.push({ job: null, text: line });
      continue;
    }
    // "View job: https://…" or "Product Manager https://…": what's beside the link is its text.
    const rest = tidy(urls.reduce((line, url) => line.replace(url, " "), raw)).replace(/[:\-–|]+$/, "").trim();
    lines.push({ job: jobs[0], text: rest ? [rest] : [] });
  }
  return lines;
}

const usable = (line: string) => line.length >= 2 && line.length <= MAX_LINE && !GENERIC.test(line) && !isNoise(line);

/** Company and place from the lines of a card, "Razorpay · Bengaluru" in one line as well. */
function companyAndPlace(lines: string[]): { company: string; place: string } {
  const kept = lines.filter(usable).slice(0, 3);
  const first = kept[0] ?? "";
  const split = first.split(/\s+[·•|]\s+|\s+-\s+/);
  if (split.length >= 2) return { company: split[0], place: split.slice(1).join(", ") };
  return { company: first, place: kept[1] ?? "" };
}

function jobsFrom(portal: Portal, lines: Line[]): AlertJob[] {
  const jobs = new Map<string, AlertJob>();
  const firstAt = new Map<string, number>();
  lines.forEach((line, index) => {
    if (line.job && !firstAt.has(line.job.id)) firstAt.set(line.job.id, index);
  });

  for (const [id, start] of firstAt) {
    if (jobs.size >= MAX_JOBS) break;
    const own = lines.filter((line) => line.job?.id === id) as Extract<Line, { job: object }>[];
    const title = own.flatMap((line) => line.text).find(usable);
    const url = own[0].job.url;
    if (title) {
      // The link is the title: the card's other lines come after it, until the next job.
      const after: string[] = own.flatMap((line) => line.text).filter((text) => text !== title);
      for (const line of lines.slice(start + 1)) {
        if (line.job && line.job.id !== id) break;
        if (!line.job) after.push(line.text);
      }
      jobs.set(id, { portal: portal.name, id, url, title, ...companyAndPlace(after) });
      continue;
    }
    // A bare link: the card is the lines just before it.
    const before: string[] = [];
    for (let at = start - 1; at >= 0 && !lines[at].job; at--) before.unshift((lines[at] as { text: string }).text);
    const card = before.filter(usable).slice(-3);
    if (card.length === 0) continue;
    jobs.set(id, { portal: portal.name, id, url, title: card[0], company: card[1] ?? "", place: card[2] ?? "" });
  }
  return [...jobs.values()];
}

/**
 * The jobs in a job-alert email, or null when the mail isn't one: not from a
 * board this knows, about an application rather than new jobs, or with no
 * links to jobs in it.
 */
export function readJobAlert(mail: { fromAddress: string; subject: string; text: string; html?: string }): { portal: string; jobs: AlertJob[] } | null {
  const portal = portalFor(mail.fromAddress);
  if (!portal || NOT_AN_ALERT.test(mail.subject)) return null;
  let jobs = mail.html ? jobsFrom(portal, htmlLines(portal, mail.html)) : [];
  if (jobs.length === 0) jobs = jobsFrom(portal, textLines(portal, mail.text));
  return jobs.length > 0 ? { portal: portal.name, jobs } : null;
}

/** Whether a job is remote, from its place or title; null when neither says. */
export const alertRemote = (job: Pick<AlertJob, "title" | "place">): boolean | null => (/\bremote\b|work from home|\bwfh\b/i.test(`${job.title} ${job.place}`) ? true : null);

/**
 * A score for an alert's job without the AI: how well it fits the job
 * agent's keywords. The board already picked it for the user, so a job that
 * fits clears the default minimum of 70; one with an excluded word, or
 * without a must-have, doesn't.
 */
export function keywordFit(job: { title: string; company: string; place: string; description: string }, query: KeywordQuery, portal: string) {
  const from = `From your ${portal} job alert`;
  const note = "Scored on your keywords only: add an AI provider in Settings for a closer look.";
  if (!matchPosting(query, job, { requireAny: false }).matched) {
    return { score: 20, reasons: [from], redFlags: ["Has a word you excluded, or misses a must-have one."] };
  }
  if (query.any.length === 0 && query.all.length === 0) return { score: 70, reasons: [from, note], redFlags: [] };
  const match = matchPosting(query, job);
  if (!match.matched) return { score: 45, reasons: [from, note], redFlags: ["None of your keywords is in it."] };
  const words = match.hits.slice(0, 3).map((hit) => `“${hit}”`).join(", ");
  return { score: Math.min(90, 65 + 5 * Math.min(match.relevance, 5)), reasons: [from, `Matches ${words}${match.viaRelated ? " (a related title)" : ""}.`, note], redFlags: [] };
}
