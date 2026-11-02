import { describe, expect, it } from "vitest";

import { parseKeywords } from "@/lib/job-search/keywords";

import { ALERT_SEARCH, alertRemote, keywordFit, readJobAlert } from "./job-alerts";

// Made-up alerts in the shapes the boards send; check against real ones once
// an inbox with them is connected.

const linkedInText = `Your job alert for chief of staff in Bengaluru
3 new jobs match your preferences.

Chief of Staff to the CEO
Zenvo Health
Bengaluru, Karnataka, India
View job: https://www.linkedin.com/comm/jobs/view/4012345678/?trackingId=abc%3D&refId=xyz

---------------------------------------------------------

Founder's Office Associate
Kite Labs
Mumbai, Maharashtra, India (Hybrid)
View job: https://www.linkedin.com/comm/jobs/view/4012345999/?trackingId=def

---------------------------------------------------------

See all jobs: https://www.linkedin.com/comm/jobs/search?keywords=chief%20of%20staff
Unsubscribe: https://www.linkedin.com/comm/psettings/email-unsubscribe`;

const linkedInHtml = `<html><body>
<p>Your job alert for <b>partnerships</b></p>
<table>
<tr><td><a href="https://www.linkedin.com/comm/jobs/view/4099990001/?trackingId=a&amp;refId=b"><img src="logo.png" alt=""></a></td>
<td><a href="https://www.linkedin.com/comm/jobs/view/4099990001/?trackingId=a&amp;refId=b">Partnerships Lead</a>
<p>Razorpay · Bengaluru, Karnataka, India</p><p>Actively recruiting</p><p>3 connections</p></td></tr>
<tr><td><a href="https://www.linkedin.com/comm/jobs/view/4099990002/?trackingId=c">Strategic Alliances Manager</a>
<p>CRED</p><p>Remote</p><p>Easy Apply</p></td></tr>
</table>
<a href="https://www.linkedin.com/comm/jobs/search">See all jobs</a>
</body></html>`;

const naukriHtml = `<div>
<a href="https://www.naukri.com/job-listings-business-development-manager-acme-fintech-pvt-ltd-mumbai-3-to-6-years-281024500123?src=jobalert&amp;sid=1">Business Development Manager</a>
<div>Acme Fintech Pvt Ltd</div><div>3-6 Yrs</div><div>₹ 8-12 Lacs PA</div><div>Mumbai, Navi Mumbai</div>
<a href="https://www.naukri.com/job-listings-growth-analyst-nimbus-bengaluru-1-to-3-years-281024500456?src=jobalert">Growth Analyst</a>
<div>Nimbus</div><div>1-3 Yrs</div><div>Not disclosed</div><div>Bengaluru</div>
<a href="https://www.naukri.com/mnjuser/profile">Update your profile</a>
</div>`;

describe("readJobAlert", () => {
  it("reads a plain-text LinkedIn alert: the lines before each link", () => {
    const alert = readJobAlert({ fromAddress: "jobalerts-noreply@linkedin.com", subject: "“chief of staff”: 3 new jobs", text: linkedInText });
    expect(alert).toEqual({
      portal: "LinkedIn",
      jobs: [
        { portal: "LinkedIn", id: "4012345678", url: "https://www.linkedin.com/jobs/view/4012345678/", title: "Chief of Staff to the CEO", company: "Zenvo Health", place: "Bengaluru, Karnataka, India" },
        { portal: "LinkedIn", id: "4012345999", url: "https://www.linkedin.com/jobs/view/4012345999/", title: "Founder's Office Associate", company: "Kite Labs", place: "Mumbai, Maharashtra, India (Hybrid)" },
      ],
    });
  });

  it("reads an HTML LinkedIn alert: the link's text, then company · place", () => {
    const alert = readJobAlert({ fromAddress: "jobs-noreply@linkedin.com", subject: "Partnerships Lead at Razorpay and more", text: "", html: linkedInHtml });
    expect(alert?.jobs).toEqual([
      { portal: "LinkedIn", id: "4099990001", url: "https://www.linkedin.com/jobs/view/4099990001/", title: "Partnerships Lead", company: "Razorpay", place: "Bengaluru, Karnataka, India" },
      { portal: "LinkedIn", id: "4099990002", url: "https://www.linkedin.com/jobs/view/4099990002/", title: "Strategic Alliances Manager", company: "CRED", place: "Remote" },
    ]);
  });

  it("reads a Naukri alert, skipping experience and salary lines", () => {
    const alert = readJobAlert({ fromAddress: "naukrialerts@naukri.com", subject: "15 new jobs matching your profile", text: "", html: naukriHtml });
    expect(alert?.portal).toBe("Naukri");
    expect(alert?.jobs.map(({ title, company, place, url }) => ({ title, company, place, url }))).toEqual([
      {
        title: "Business Development Manager",
        company: "Acme Fintech Pvt Ltd",
        place: "Mumbai, Navi Mumbai",
        url: "https://www.naukri.com/job-listings-business-development-manager-acme-fintech-pvt-ltd-mumbai-3-to-6-years-281024500123",
      },
      { title: "Growth Analyst", company: "Nimbus", place: "Bengaluru", url: "https://www.naukri.com/job-listings-growth-analyst-nimbus-bengaluru-1-to-3-years-281024500456" },
    ]);
  });

  it("finds the job inside a tracking redirect", () => {
    const html = `<a href="https://click.indeed.com/redirect?url=${encodeURIComponent("https://in.indeed.com/rc/clk?jk=4f1c2a9b8e7d6c5b&from=ja")}">Product Analyst</a><br>Swiggy<br>Bengaluru, Karnataka`;
    const alert = readJobAlert({ fromAddress: "alert@indeed.com", subject: "Product Analyst jobs in Bengaluru", text: "", html });
    expect(alert?.jobs).toEqual([
      { portal: "Indeed", id: "4f1c2a9b8e7d6c5b", url: "https://in.indeed.com/viewjob?jk=4f1c2a9b8e7d6c5b", title: "Product Analyst", company: "Swiggy", place: "Bengaluru, Karnataka" },
    ]);
  });

  it("is null for a board's mail about an application, another sender, or no job links", () => {
    expect(readJobAlert({ fromAddress: "jobs-noreply@linkedin.com", subject: "Your application was sent to Zenvo Health", text: linkedInText })).toBeNull();
    expect(readJobAlert({ fromAddress: "talent@zenvo.example", subject: "Jobs", text: linkedInText })).toBeNull();
    expect(readJobAlert({ fromAddress: "messages-noreply@linkedin.com", subject: "You appeared in 9 searches", text: "See who: https://www.linkedin.com/me/search-appearances" })).toBeNull();
  });

  it("counts a job linked twice once", () => {
    const text = `Growth Manager\nMeesho\nBengaluru\nhttps://www.linkedin.com/jobs/view/4000000001/\nApply: https://www.linkedin.com/jobs/view/4000000001/?apply=1`;
    expect(readJobAlert({ fromAddress: "jobalerts-noreply@linkedin.com", subject: "New jobs", text })?.jobs).toHaveLength(1);
  });

  it("searches every board's senders in the first look", () => {
    expect(ALERT_SEARCH).toContain("linkedin.com OR naukri.com");
    expect(ALERT_SEARCH).toContain("newer_than:7d");
  });
});

describe("alertRemote", () => {
  it("says remote only when the place or title does", () => {
    expect(alertRemote({ title: "Analyst", place: "Remote" })).toBe(true);
    expect(alertRemote({ title: "Analyst", place: "Pune" })).toBeNull();
  });
});

describe("keywordFit", () => {
  const job = { title: "Chief of Staff to the CEO", company: "Zenvo Health", place: "Bengaluru", description: "" };

  it("clears the default minimum when a keyword or related title fits", () => {
    const fit = keywordFit(job, parseKeywords("founder's office"), "LinkedIn");
    expect(fit.score).toBeGreaterThanOrEqual(70);
    expect(fit.reasons[0]).toBe("From your LinkedIn job alert");
    expect(fit.reasons[1]).toContain("related title");
  });

  it("stays below it without a keyword, and well below with an excluded one", () => {
    expect(keywordFit(job, parseKeywords("data engineer"), "Naukri").score).toBeLessThan(70);
    expect(keywordFit(job, parseKeywords("chief of staff, -zenvo"), "Naukri")).toMatchObject({ score: 20, redFlags: [expect.any(String)] });
  });

  it("lets everything through when the agent has no keywords", () => {
    expect(keywordFit(job, parseKeywords(""), "Indeed").score).toBe(70);
  });
});
