// Applications made outside JobPilot (JobPilot): the "your application was
// sent" mail that LinkedIn Easy Apply, Naukri, Indeed and applicant tracking
// systems send, read so the application lands on the board by itself.
// Pure, so it's tested without Gmail.

export type ConfirmationMail = { fromName: string; fromAddress: string; subject: string; text: string };

export type Confirmation = {
  /** Where the user applied: "LinkedIn", "Naukri", "Greenhouse"…, or "Company site". */
  portal: string;
  company: string;
  /** Empty when the mail doesn't name the role. */
  role: string;
};

/** Sender domains of job boards and applicant tracking systems, and how to call them. */
const PORTALS: [RegExp, string][] = [
  [/(^|\.)linkedin\.com$/, "LinkedIn"],
  [/(^|\.)naukri\.com$/, "Naukri"],
  [/(^|\.)indeed\.com$/, "Indeed"],
  [/(^|\.)instahyre\.com$/, "Instahyre"],
  [/(^|\.)iimjobs\.com$/, "IIMJobs"],
  [/(^|\.)hirist\.(com|tech)$/, "Hirist"],
  [/(^|\.)(foundit\.in|monsterindia\.com)$/, "Foundit"],
  [/(^|\.)(wellfound\.com|angel\.co)$/, "Wellfound"],
  [/(^|\.)cutshort\.io$/, "Cutshort"],
  [/(^|\.)(greenhouse\.io|greenhouse-mail\.io)$/, "Greenhouse"],
  [/(^|\.)lever\.co$/, "Lever"],
  [/(^|\.)ashbyhq\.com$/, "Ashby"],
  [/(^|\.)(myworkday\.com|workday\.com)$/, "Workday"],
  [/(^|\.)smartrecruiters\.com$/, "SmartRecruiters"],
  [/(^|\.)darwinbox\.(in|io|com)$/, "Darwinbox"],
  [/(^|\.)zohorecruit\.(com|in)$/, "Zoho Recruit"],
  [/(^|\.)keka\.com$/, "Keka"],
  [/(^|\.)(workable\.com|workablemail\.com)$/, "Workable"],
];

/** Job boards: their mail names the employer in the text, never in the sender. */
const BOARDS = new Set(["LinkedIn", "Naukri", "Indeed", "Instahyre", "IIMJobs", "Hirist", "Foundit", "Wellfound", "Cutshort"]);

const CONFIRMS = [
  /\byour application (?:was|has been|is) (?:successfully )?(?:sent|submitted|received)\b/i,
  /\bapplication (?:sent|submitted|received)(?: successfully)?\b/i,
  /\bthanks?(?: you)? for (?:applying|your application|submitting your application)\b/i,
  /\byou(?:'ve| have)? (?:successfully )?applied\b/i,
  /\bwe(?:'ve| have) (?:successfully )?received your application\b/i,
  /\bindeed application:/i,
];

/** Mail that isn't a confirmation even when it says "application": replies, alerts, invitations. */
const NOT_A_CONFIRMATION = [
  /\bunfortunately\b/i,
  /\bregret\b/i,
  /\bnot (?:be )?(?:moving|proceed)/i,
  /\binterview\b/i,
  /\bjobs? (?:you may|for you|alert|recommend)/i,
  /\brecommended jobs?\b/i,
  /\bnew jobs?\b/i,
  /\bcomplete your application\b/i,
  /\bfinish (?:applying|your application)\b/i,
];

const STOP = String.raw`(?=\s*(?:[.!,\n|–-]|\s-\s|$|\bhas\b|\bwas\b|\bvia\b|\bon\b|\bthrough\b|\band\b))`;
/** Ways the mail names the role and the employer, tried in order; the first that gives a company wins. */
const PATTERNS: RegExp[] = [
  new RegExp(String.raw`applied (?:to|for) (?:the )?(?<role>[^\n]{2,120}?) (?:position |role |job )?(?:at|with) (?<company>[^\n]{2,80}?)${STOP}`, "i"),
  new RegExp(String.raw`application (?:for|to) (?:the )?(?<role>[^\n]{2,120}?) (?:position |role |job )?(?:at|with) (?<company>[^\n]{2,80}?)${STOP}`, "i"),
  new RegExp(String.raw`thanks?(?: you)? for applying (?:to|for) (?:the )?(?<role>[^\n]{2,120}?) (?:position |role |job )?(?:at|with) (?<company>[^\n]{2,80}?)${STOP}`, "i"),
  new RegExp(String.raw`application (?:was |has been )?(?:sent|submitted)(?: successfully)? to (?<company>[^\n]{2,80}?)${STOP}`, "i"),
  new RegExp(String.raw`thanks?(?: you)? for (?:applying|your application|your interest) (?:to|at|in|with) (?<company>[^\n]{2,80}?)${STOP}`, "i"),
  new RegExp(String.raw`(?:application|applied)(?: sent| submitted)?(?: successfully)?(?: for|:)\s+(?<role>[^\n]{2,120}?) (?:at|[-–|]) (?<company>[^\n]{2,80}?)${STOP}`, "i"),
];
const ROLE_ONLY: RegExp[] = [
  new RegExp(String.raw`indeed application:\s*(?<role>[^\n]{2,120})`, "i"),
  new RegExp(String.raw`\b(?:position|role|job title):\s*(?<role>[^\n]{2,120})`, "i"),
  new RegExp(String.raw`\bapplication for (?:the )?(?<role>[^\n.!]{2,120}?)(?: position| role)?(?=[.!\n]|$)`, "i"),
];

function portalOf(address: string): string | null {
  const domain = address.split("@")[1]?.toLowerCase() ?? "";
  return PORTALS.find(([pattern]) => pattern.test(domain))?.[1] ?? null;
}

function clean(value: string | undefined, max: number): string {
  return (value ?? "")
    .replace(/^[\s"'“‘]+|[\s"'”’:.!,]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, max)
    .trim();
}

/** "Kinara Health Hiring Team via Greenhouse" → "Kinara Health". */
export function companyFromSender(name: string): string {
  return clean(
    name
      .replace(/\bvia\b.*$/i, "")
      .replace(/\b(hiring team|talent acquisition|recruiting|recruitment|careers|talent|jobs|hr|team|no-?reply)\b/gi, "")
      .replace(/[-–|@]+\s*$/, ""),
    80,
  );
}

/** A confirmation that the user applied, with where and for what; null for any other mail. */
export function detectConfirmation(mail: ConfirmationMail): Confirmation | null {
  const head = `${mail.subject}\n${mail.text.slice(0, 2000)}`;
  if (!CONFIRMS.some((pattern) => pattern.test(head))) return null;
  if (NOT_A_CONFIRMATION.some((pattern) => pattern.test(head))) return null;

  const portal = portalOf(mail.fromAddress);
  // The first place that names both the role and the company wins; else the first that names the company.
  let company = "";
  let role = "";
  search: for (const source of [mail.subject, mail.text.slice(0, 2000)]) {
    for (const pattern of PATTERNS) {
      const found = pattern.exec(source);
      if (!found?.groups?.company) continue;
      const foundRole = clean(found.groups.role, 120);
      if (!company) company = clean(found.groups.company, 80);
      if (foundRole) {
        company = clean(found.groups.company, 80);
        role = foundRole;
        break search;
      }
    }
  }
  if (!role) {
    for (const pattern of ROLE_ONLY) {
      const found = pattern.exec(head);
      if (found?.groups?.role) {
        role = clean(found.groups.role, 120);
        break;
      }
    }
  }
  // An applicant tracking system writes as the employer: its sender name is the company.
  if (!company && portal && !BOARDS.has(portal)) company = companyFromSender(mail.fromName);
  // Mail straight from the employer's own address.
  if (!company && !portal) company = companyFromSender(mail.fromName);
  if (!company || /^(linkedin|naukri|indeed)$/i.test(company)) return null;
  return { portal: portal ?? "Company site", company, role };
}

/** The Gmail search that finds these mails on the first check, whatever tab they landed in. */
export const CONFIRMATION_SEARCH =
  '("application was sent" OR "application has been submitted" OR "application submitted" OR "thank you for applying" OR "thanks for applying" OR "received your application" OR "you applied" OR "Indeed Application")';
