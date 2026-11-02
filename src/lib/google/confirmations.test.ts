import { describe, expect, it } from "vitest";

import { companyFromSender, detectConfirmation } from "./confirmations";

const mail = (fromName: string, fromAddress: string, subject: string, text = "") => ({ fromName, fromAddress, subject, text });

describe("detectConfirmation", () => {
  it("reads a LinkedIn Easy Apply confirmation", () => {
    expect(
      detectConfirmation(
        mail("LinkedIn", "jobs-noreply@linkedin.com", "Rohan, your application was sent to Kinara Health", "Your application was sent to Kinara Health\nFounder's Office - Partnerships\nKinara Health · Mumbai"),
      ),
    ).toEqual({ portal: "LinkedIn", company: "Kinara Health", role: "" });
  });

  it("reads a Naukri confirmation with role and company", () => {
    expect(
      detectConfirmation(mail("Naukri", "info@naukri.com", "Application sent successfully", "You have successfully applied to Growth Lead, Channel Partners at Tidewater Homes.")),
    ).toEqual({ portal: "Naukri", company: "Tidewater Homes", role: "Growth Lead, Channel Partners" });
  });

  it("reads an Indeed confirmation", () => {
    expect(
      detectConfirmation(mail("Indeed Apply", "indeedapply@indeed.com", "Indeed Application: Business Development Manager", "Your application has been submitted to Medlane Clinics.")),
    ).toEqual({ portal: "Indeed", company: "Medlane Clinics", role: "Business Development Manager" });
  });

  it("takes the employer from the sender for an applicant tracking system", () => {
    expect(
      detectConfirmation(mail("Zenvo Health Hiring Team", "no-reply@us.greenhouse-mail.io", "Thank you for applying!", "We've received your application for Chief of Staff.")),
    ).toEqual({ portal: "Greenhouse", company: "Zenvo Health", role: "Chief of Staff" });
  });

  it("reads a company's own thank-you mail", () => {
    expect(
      detectConfirmation(mail("Ledgerline Careers", "careers@ledgerline.example", "Thanks for applying to Ledgerline", "Thanks for applying to the Head of Partnerships role at Ledgerline.")),
    ).toEqual({ portal: "Company site", company: "Ledgerline", role: "Head of Partnerships" });
  });

  it("ignores job alerts, rejections, interview invites and unfinished applications", () => {
    expect(detectConfirmation(mail("LinkedIn Job Alerts", "jobalerts-noreply@linkedin.com", "New jobs for you", "30 new jobs you applied filters for"))).toBeNull();
    expect(detectConfirmation(mail("Kinara Careers", "careers@kinara.example", "Your application", "Thank you for applying. Unfortunately we won't move ahead."))).toBeNull();
    expect(detectConfirmation(mail("Priya", "priya@kinara.example", "Interview", "Thanks for your application, can we set up an interview?"))).toBeNull();
    expect(detectConfirmation(mail("Naukri", "info@naukri.com", "Complete your application", "You applied halfway. Complete your application now."))).toBeNull();
  });

  it("ignores a job board mail that doesn't name the employer", () => {
    expect(detectConfirmation(mail("Naukri", "info@naukri.com", "Application sent successfully", "Your application was sent."))).toBeNull();
  });

  it("ignores ordinary mail", () => {
    expect(detectConfirmation(mail("Mom", "mom@gmail.com", "Dinner", "See you at 8"))).toBeNull();
  });
});

describe("companyFromSender", () => {
  it("drops hiring-team words and the ATS", () => {
    expect(companyFromSender("Kinara Health Recruiting via Lever")).toBe("Kinara Health");
    expect(companyFromSender("Ledgerline Talent Acquisition")).toBe("Ledgerline");
  });
});
