/**
 * Test-mode fixtures — dummy Apify outputs in the EXACT shape each actor returns,
 * so the scrape + enrichment code paths (and their normalizers) run unchanged and
 * the UI gets realistic, streaming data WITHOUT calling Apify or spending credit.
 *
 * Enabled by LEADS_TEST_MODE=true (see leadsTestMode()). People are generated
 * deterministically from small pools, so any requested count yields varied,
 * believable rows — and the same person enriches consistently across actors
 * (the lead's LinkedIn handle carries the person index).
 */

export function leadsTestMode(): boolean {
  const v = (process.env.LEADS_TEST_MODE || "").toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/* ----------------------------- pools ----------------------------- */

const FIRST = ["Sarah", "Marcus", "Priya", "Daniel", "Aisha", "Tom", "Lena", "Diego", "Mei", "Jordan", "Noah", "Yuki", "Olivia", "Sam", "Hana", "Liam"];
const LAST = ["Chen", "Patel", "Okafor", "Rossi", "Nguyen", "Kowalski", "Haddad", "Silva", "Tanaka", "Berg", "Mercer", "Volkov", "Reyes", "Dubois", "Ahmed", "Frost"];
const TITLES = [
  "Founder & CEO", "Co-Founder", "Head of Growth", "Founder", "Managing Director",
  "VP of Marketing", "Solo Consultant", "Agency Owner", "Fractional CMO", "Head of Content",
];
const COMPANIES = ["Northwind Labs", "Brightpath", "Casper & Co", "Lumen Studio", "Forge Collective", "Tidepool", "Anvil Group", "Meridian", "Saffron", "Outliers Club", "Beacon Works", "Untethered"];
const CITIES = ["San Francisco, CA", "London, UK", "Austin, TX", "Toronto, Canada", "Singapore", "Dubai, UAE", "Berlin, Germany", "New York, NY", "Sydney, Australia", "Bangalore, India"];
const SKILLS = ["Personal Branding", "Content Strategy", "Go-To-Market", "LinkedIn Marketing", "Lead Generation", "Copywriting", "Positioning", "Demand Gen", "Storytelling", "Sales Enablement", "Community", "SEO"];

const pick = <T,>(arr: T[], i: number, mult = 1) => arr[((i * mult) % arr.length + arr.length) % arr.length];
const pad = (n: number) => String(n).padStart(3, "0");

export type FixturePerson = {
  index: number;
  firstName: string;
  lastName: string;
  fullName: string;
  handle: string; // linkedin slug
  linkedinUrl: string;
  title: string;
  company: string;
  companyUrl: string;
  location: string;
  pictureUrl: string;
  headline: string;
  about: string;
  skills: string[];
  followers: number;
  openToWork: boolean;
  /** email known at search time? (else the finder resolves it) */
  emailAtSearch: boolean;
  email: string;
  /** how the verifier rules on this email */
  verify: "valid" | "invalid" | "disposable" | "free";
  posts: { text: string; daysAgo: number; reactions: number; comments: number }[];
};

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function makePerson(i: number): FixturePerson {
  const firstName = pick(FIRST, i, 1);
  const lastName = pick(LAST, i, 7);
  const fullName = `${firstName} ${lastName}`;
  const title = pick(TITLES, i, 3);
  const company = pick(COMPANIES, i, 5);
  const location = pick(CITIES, i, 2);
  const handle = `${slugify(fullName)}-${pad(i)}`;
  const domain = `${slugify(company).replace(/-/g, "")}.com`;
  const emailAtSearch = i % 3 !== 2; // ~1/3 have no email at search → finder resolves
  const verify = (["valid", "valid", "valid", "free", "invalid", "disposable"] as const)[i % 6];
  const followers = 1800 + ((i * 733) % 26000);
  return {
    index: i,
    firstName,
    lastName,
    fullName,
    handle,
    linkedinUrl: `https://www.linkedin.com/in/${handle}`,
    title,
    company,
    companyUrl: `https://www.linkedin.com/company/${slugify(company)}`,
    location,
    pictureUrl: `https://i.pravatar.cc/200?u=${handle}`,
    headline: `${title} at ${company} · helping founders grow with content`,
    about: `${firstName} is a ${title.toLowerCase()} at ${company}. ${i % 2 ? "Ex-operator turned advisor" : "Built and sold a small agency"}, now focused on turning founder expertise into inbound pipeline. Writes weekly about positioning, content systems, and the unsexy operations behind a personal brand.`,
    skills: [pick(SKILLS, i, 1), pick(SKILLS, i, 4), pick(SKILLS, i, 7), pick(SKILLS, i, 9)].filter((s, k, a) => a.indexOf(s) === k),
    followers,
    openToWork: i % 7 === 0,
    emailAtSearch,
    email: `${firstName.toLowerCase()}@${domain}`,
    verify,
    posts: [
      { text: `Most founders don't have a content problem. They have a ${i % 2 ? "positioning" : "consistency"} problem. Here's the system we use.`, daysAgo: 2 + (i % 5), reactions: 40 + ((i * 17) % 480), comments: 4 + (i % 30) },
      { text: `Spent 6 years thinking more reach was the answer. It wasn't. ${i % 2 ? "Trust" : "Clarity"} was.`, daysAgo: 6 + (i % 9), reactions: 25 + ((i * 11) % 300), comments: 2 + (i % 18) },
    ].slice(0, (i % 3) + 1),
  };
}

/** Person index encoded in the LinkedIn handle (…-NNN); falls back to a hash. */
export function personFromUrlOrHandle(s: string): FixturePerson {
  const m = s.match(/-(\d{1,4})(?:$|\/|\?)/);
  if (m) return makePerson(parseInt(m[1], 10));
  let h = 0;
  for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) | 0;
  return makePerson(Math.abs(h) % 997);
}

/* ----------------- actor-format output builders ----------------- */

/** harvestapi/linkedin-profile-search output item. */
export function fixtureSearchItems(count: number, findEmails: boolean): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => i).map((i) => {
    const p = makePerson(i);
    const item: Record<string, unknown> = {
      id: p.handle,
      firstName: p.firstName,
      lastName: p.lastName,
      linkedinUrl: p.linkedinUrl,
      pictureUrl: p.pictureUrl,
      summary: p.headline,
      openProfile: i % 4 !== 0,
      premium: i % 4 === 0,
      location: { linkedinText: p.location },
      currentPositions: [
        {
          current: true,
          title: p.title,
          companyName: p.company,
          companyLinkedinUrl: p.companyUrl,
          startedOn: { month: 1 + (i % 12), year: 2019 + (i % 5) },
          description: "",
        },
      ],
    };
    if (findEmails && p.emailAtSearch) item.email = p.email;
    return item;
  });
}

/** apimaestro/linkedin-profile-detail output. */
export function fixtureProfileItem(usernameOrUrl: string): Record<string, unknown> {
  const p = personFromUrlOrHandle(usernameOrUrl);
  const [city, country] = p.location.split(",").map((s) => s.trim());
  return {
    basic_info: {
      first_name: p.firstName,
      last_name: p.lastName,
      fullname: p.fullName,
      headline: p.headline,
      about: p.about,
      top_skills: p.skills,
      follower_count: p.followers,
      connection_count: Math.min(500, 200 + (p.index % 300)),
      open_to_work: p.openToWork,
      is_premium: p.index % 4 === 0,
      email: p.emailAtSearch ? p.email : null,
      location: { city: city || p.location, country: country || "", full: p.location },
      profile_url: p.linkedinUrl,
      public_identifier: p.handle,
    },
    experience: [
      { is_current: true, title: p.title, company: p.company, company_linkedin_url: p.companyUrl, duration: `${1 + (p.index % 6)} yrs`, employment_type: "Full-time", location: p.location },
      { is_current: false, title: "Marketing Lead", company: pick(COMPANIES, p.index, 9), duration: "2 yrs 3 mos", employment_type: "Full-time", location: p.location },
    ],
    education: [{ school: pick(["Stanford", "LSE", "UT Austin", "IIM", "NUS"], p.index, 1), degree_name: "BBA, Marketing", field_of_study: "Marketing" }],
  };
}

/** harvestapi/linkedin-profile-posts output items for a set of profile URLs. */
export function fixturePostItems(urls: string[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const url of urls) {
    const p = personFromUrlOrHandle(url);
    for (const post of p.posts) {
      out.push({
        author: { publicIdentifier: p.handle, linkedinUrl: p.linkedinUrl, name: p.fullName },
        text: post.text,
        postedAt: `${post.daysAgo}d`,
        reactionsCount: post.reactions,
        commentsCount: post.comments,
        url: `${p.linkedinUrl}/recent-activity/`,
      });
    }
  }
  return out;
}

/** snipercoder/bulk-linkedin-email-finder output rows. */
export function fixtureFinderRows(urls: string[]): Record<string, unknown>[] {
  return urls.map((url) => {
    const p = personFromUrlOrHandle(url);
    return {
      "01_Name": p.fullName,
      "02_First_name": p.firstName,
      "03_Last_name": p.lastName,
      "04_Email": p.email, // the finder resolves it even when search didn't
      "05_Phone_number": null,
      "06_Linkedin_url": url,
      "07_Title": p.title,
      "16_Company_name": p.company,
      "17_Query_linkedin": url,
    };
  });
}

/** nexgendata/email-verification-tool output items. */
export function fixtureVerifyItems(emails: string[]): Record<string, unknown>[] {
  return emails.map((email) => {
    const domain = email.split("@")[1] ?? "";
    const p = personFromUrlOrHandle(email.split("@")[0]);
    const v = p.verify;
    return {
      email,
      localPart: email.split("@")[0],
      domain,
      syntaxValid: v !== "invalid",
      mxValid: v !== "invalid",
      isValid: v === "valid" || v === "free",
      isDisposable: v === "disposable",
      isFreeProvider: v === "free",
      mxRecords: v === "invalid" ? [] : [{ priority: 10, server: `mx.${domain}` }],
    };
  });
}
