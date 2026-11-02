import "server-only";

import type { JobSourceAdapter } from "./adapter";

// JobPilot: postings from job-alert emails (src/lib/google/job-alerts.ts).
// Nothing to search or test: the inbox check brings them in, with what the
// email says about each job, and the link opens the rest.

export const emailAlert: JobSourceAdapter<"EMAIL_ALERT"> = {
  source: "EMAIL_ALERT",
  search: async () => ({ postings: [], next: null }),
  details: async (posting) => posting.description || null,
  test: async () => {},
};
