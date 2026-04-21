import { supabase } from "./supabaseClient.js";
import { anonymizeText, randomId, getOrCreateParticipantId } from "./anonymize.js";

const $ = (sel) => document.querySelector(sel);

const statusPill = $("#statusPill");
const toast = $("#toast");
const toastText = $("#toastText");

const candidateModeBtn = $("#candidateModeBtn");
const employerModeBtn = $("#employerModeBtn");

const candidateView = $("#candidateView");
const employerView = $("#employerView");
const candidateResults = $("#candidateResults");
const employerResults = $("#employerResults");

let currentMode = "candidate";

/* -------------------------
   Shared helpers
------------------------- */

const SUPPORTED_LOCATIONS = {
  DK: [
    "København", "Storkøbenhavn", "Aarhus", "Odense", "Aalborg", "Esbjerg", "Randers",
    "Kolding", "Horsens", "Vejle", "Roskilde", "Herning", "Silkeborg", "Helsingør",
    "Næstved", "Fredericia", "Viborg", "Køge", "Holstebro", "Taastrup", "Slagelse",
    "Hillerød", "Sønderborg", "Svendborg", "Holbæk", "Hjørring", "Frederikshavn",
    "Skive", "Ringsted", "Aabenraa", "Kalundborg", "Middelfart", "Ikast",
    "Brønderslev", "Grenaa", "Thisted", "Bornholm", "Nordsjælland", "Sjælland",
    "Fyn", "Midtjylland", "Sydjylland", "Vestjylland"
  ],
  DE: [
    "Berlin", "Hamburg", "München", "Köln", "Frankfurt am Main", "Stuttgart",
    "Düsseldorf", "Dortmund", "Essen", "Leipzig", "Bremen", "Dresden", "Hannover",
    "Nürnberg", "Duisburg", "Bochum", "Wuppertal", "Bielefeld", "Bonn", "Münster",
    "Karlsruhe", "Mannheim", "Augsburg", "Wiesbaden", "Gelsenkirchen",
    "Mönchengladbach", "Braunschweig", "Chemnitz", "Kiel", "Aachen", "Halle",
    "Magdeburg", "Freiburg", "Krefeld", "Lübeck", "Oberhausen", "Erfurt", "Mainz",
    "Rostock", "Kassel", "Hagen", "Hamm", "Saarbrücken", "Potsdam", "Ludwigshafen",
    "Oldenburg", "Leverkusen", "Osnabrück", "Heidelberg", "Darmstadt", "Regensburg",
    "Ingolstadt", "Ulm", "Würzburg", "Wolfsburg", "Offenbach", "Heilbronn",
    "Pforzheim", "Göttingen", "Trier", "Jena", "Flensburg"
  ]
};

function clean(v) {
  return String(v ?? "").trim();
}

function parseCommaList(text) {
  return clean(text)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function asArray(value) {
  if (Array.isArray(value)) return value.map((v) => clean(v)).filter(Boolean);
  return [];
}

function asNullableNumber(value) {
  const v = clean(value);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function nowStamp() {
  const d = new Date();
  return d.toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function showToast(msg) {
  if (!toast || !toastText) return;
  toastText.textContent = msg;
  toast.classList.add("show");
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 1800);
}

function setStatus(text) {
  if (statusPill) statusPill.textContent = text || "";
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeDisplayValue(value) {
  if (Array.isArray(value)) return value.map((v) => normalizeDisplayValue(v)).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return clean(value);
}

function normalizeWebsite(url) {
  const v = clean(url);
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}

function populateLocationOptions(selectEl, countryCode = "", placeholder = "Select location") {
  if (!selectEl) return;

  const locations = SUPPORTED_LOCATIONS[countryCode] || [];
  const current = clean(selectEl.value);

  selectEl.innerHTML = `<option value="">${placeholder}</option>`;

  for (const loc of locations) {
    const option = document.createElement("option");
    option.value = loc;
    option.textContent = loc;
    if (loc === current) option.selected = true;
    selectEl.appendChild(option);
  }
}

function switchMode(mode) {
  currentMode = mode;
  const isCandidate = mode === "candidate";

  candidateView?.classList.toggle("hiddenView", !isCandidate);
  candidateResults?.classList.toggle("hiddenView", !isCandidate);

  employerView?.classList.toggle("hiddenView", isCandidate);
  employerResults?.classList.toggle("hiddenView", isCandidate);

  candidateModeBtn?.classList.toggle("active", isCandidate);
  employerModeBtn?.classList.toggle("active", !isCandidate);

  setStatus(isCandidate ? "Thesis Prototype v1" : "Employer Job Bank");
}

/* -------------------------
   Candidate mode
------------------------- */

const participantId = getOrCreateParticipantId();

const form = $("#jobForm");
const ariaLive = $("#ariaLive");
const charCount = $("#charCount");
const lastSaved = $("#lastSaved");

const resetBtn = $("#resetBtn");
const submitBtn = $("#submitBtn");

const role = $("#role");
const experience = $("#experience");
const education = $("#education");
const yearsExperience = $("#yearsExperience");
const skills = $("#skills");
const languages = $("#languages");
const jobCountry = $("#jobCountry");
const location = $("#location");
const cvFile = $("#cvFile");
const consentEl = $("#consent");

const recommendationRating = $("#recommendationRating");
const ratingStatus = $("#ratingStatus");

const jobsHint = $("#jobsHint");
const jobsStatus = $("#jobsStatus");
const jobsSkeleton = $("#jobsSkeleton");
const jobsList = $("#jobsList");
const jobindexAllLink = $("#jobindexAllLink");

let latestSubmissionId = "";
let latestRecommendationReady = false;

function setCandidateAria(text) {
  if (ariaLive) ariaLive.textContent = text || "";
}

function updateCandidateCounter() {
  const max = Number(experience?.maxLength || 1200);
  const used = experience?.value?.length || 0;
  if (charCount) charCount.textContent = `${used} / ${max}`;
}

function setRatingEnabled(enabled, message = "") {
  if (recommendationRating) {
    recommendationRating.disabled = !enabled;
    if (!enabled) recommendationRating.value = "";
  }
  if (ratingStatus) {
    ratingStatus.textContent =
      message || (enabled ? "Please rate the recommendations." : "Rate after recommendations appear.");
  }
}

function getStructuredPromptFields() {
  return {
    education: clean(education?.value),
    yearsExperience: clean(yearsExperience?.value),
    skills: parseCommaList(skills?.value),
    languages: parseCommaList(languages?.value),
    country: clean(jobCountry?.value),
    location: clean(location?.value) ? [clean(location.value)] : [],
  };
}

function buildAugmentedAbout(rawAbout, structured) {
  const parts = [];

  if (clean(rawAbout)) parts.push(`Experience and interests:\n${clean(rawAbout)}`);
  if (clean(structured.education)) parts.push(`Education:\n${structured.education}`);
  if (clean(structured.yearsExperience)) parts.push(`Years of experience:\n${structured.yearsExperience}`);
  if (structured.skills?.length) parts.push(`Skills:\n${structured.skills.join(", ")}`);
  if (structured.languages?.length) parts.push(`Languages:\n${structured.languages.join(", ")}`);
  if (structured.country) parts.push(`Preferred country:\n${structured.country === "DK" ? "Denmark" : "Germany"}`);
  if (structured.location?.length) parts.push(`Location:\n${structured.location.join(", ")}`);

  return parts.join("\n\n").trim();
}

function clearParsedProfile() {
  return;
}

function renderParsedProfile() {
  return;
}

function setJobsUI({ state = "idle", message = "", jobs = [] } = {}) {
  if (jobsHint) jobsHint.style.display = state === "idle" ? "block" : "none";

  if (jobsStatus) {
    const show = state === "loading" || state === "empty" || state === "error";
    jobsStatus.style.display = show ? "block" : "none";
    jobsStatus.textContent = message || "";
  }

  if (jobsSkeleton) jobsSkeleton.style.display = state === "loading" ? "grid" : "none";

  if (jobsList) {
    jobsList.style.display = state === "ready" && jobs.length ? "grid" : "none";
    jobsList.innerHTML = "";

    for (const job of jobs) {
      const card = document.createElement("div");
      card.className = "jobCard";

      const title = document.createElement("p");
      title.className = "jobTitle";
      title.textContent = job.title || "Job listing";

      const meta = document.createElement("p");
      meta.className = "jobMeta";
      meta.textContent = [clean(job.source), clean(job.company_name)].filter(Boolean).join(" • ");

      const btnRow = document.createElement("div");
      btnRow.className = "jobBtnRow";

      const btn = document.createElement("a");
      btn.className = "jobBtn";
      btn.href = job.url || "#";
      btn.target = "_blank";
      btn.rel = "noopener noreferrer";
      btn.textContent = job.source === "Job Bank" ? "Open company listing →" : "Open job →";

      btnRow.appendChild(btn);
      card.appendChild(title);

      if (meta.textContent) {
        card.appendChild(meta);
      }

      card.appendChild(btnRow);
      jobsList.appendChild(card);
    }
  }
}

function buildRecommendationColumns(jobs) {
  const top3 = Array.isArray(jobs) ? jobs.slice(0, 3) : [];
  const job1 = top3[0] || {};
  const job2 = top3[1] || {};
  const job3 = top3[2] || {};

  return {
    rec_job_1_title: clean(job1.title) || null,
    rec_job_1_url: clean(job1.url) || null,
    rec_job_1_source: clean(job1.source) || null,

    rec_job_2_title: clean(job2.title) || null,
    rec_job_2_url: clean(job2.url) || null,
    rec_job_2_source: clean(job2.source) || null,

    rec_job_3_title: clean(job3.title) || null,
    rec_job_3_url: clean(job3.url) || null,
    rec_job_3_source: clean(job3.source) || null,
  };
}

function onCandidateEdit() {
  updateCandidateCounter();
  clearParsedProfile();
  setJobsUI({ state: "idle" });
  if (jobindexAllLink) jobindexAllLink.href = "#";
  if (lastSaved) lastSaved.textContent = `Updated ${nowStamp()}`;
  if (currentMode === "candidate") setStatus("Draft · editing");
}

function normalizeTextKey(text) {
  return clean(text)
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugifyPart(text) {
  return normalizeTextKey(text)
    .replace(/_/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function jobBoardUrlForResult(queryText, locationText = "", portal = "jobindex") {
  const qSlug = slugifyPart(queryText);
  const locationSlug = slugifyPart(locationText);

  if (portal === "stepstone") {
    if (qSlug && locationSlug) return `https://www.stepstone.de/jobs/${qSlug}/in-${locationSlug}/`;
    if (qSlug) return `https://www.stepstone.de/jobs/${qSlug}/`;
    return "https://www.stepstone.de/";
  }

  if (locationSlug && clean(queryText)) {
    const q = encodeURIComponent(clean(queryText)).replace(/%20/g, "+");
    return `https://www.jobindex.dk/jobsoegning/${locationSlug}?q=${q}`;
  }

  if (clean(queryText)) {
    const q = encodeURIComponent(clean(queryText)).replace(/%20/g, "+");
    return `https://www.jobindex.dk/jobsoegning?q=${q}`;
  }

  return "https://www.jobindex.dk/jobsoegning";
}

async function insertCandidateProfile(payload) {
  const { error } = await supabase
    .from("candidate_profiles")
    .insert([payload]);

  if (error) throw error;

  return { submission_id: payload.submission_id };
}

async function updateRecommendationRating(submissionId, ratingValue) {
  const { error } = await supabase
    .from("candidate_profiles")
    .update({ recommendation_rating: ratingValue })
    .eq("submission_id", submissionId);

  if (error) throw error;

  return true;
}

async function buildMultilingualQuery(roleText, aboutText) {
  const { data, error } = await supabase.functions.invoke("mistral-query-builder", {
    body: { role: roleText, about: aboutText },
  });

  if (error) throw new Error(error.message || "mistral-query-builder failed");
  if (data?.error) throw new Error(data.error);

  return data;
}

async function fetchTopJobs(queryText, locationText = "", country = "") {
  const q = clean(queryText);
  const locationValue = clean(locationText);
  const countryValue = clean(country);

  if (!q) {
    return {
      jobs: [],
      portal: "jobindex",
      searchUrl: "",
      normalizedCountry: "",
      normalizedLocation: "",
      shortQuery: "",
      portal_error: "",
    };
  }

  const { data, error } = await supabase.functions.invoke("jobindex-top3", {
    body: { q, location: locationValue, country: countryValue },
  });

  if (error) throw new Error(error.message || "jobindex-top3 failed");
  if (data?.error) throw new Error(data.error);

  return {
    jobs: Array.isArray(data?.jobs) ? data.jobs : [],
    portal: clean(data?.portal) || "jobindex",
    searchUrl: clean(data?.searchUrl),
    normalizedCountry: clean(data?.normalizedCountry),
    normalizedLocation: clean(data?.normalizedLocation),
    shortQuery: clean(data?.shortQuery) || q,
    portal_error: clean(data?.portal_error),
  };
}

async function fetchJobBankMatches({
  normalizedRole = "",
  normalizedRoles = [],
  skills = [],
  location = [],
  country = "",
  seniority = "",
}) {
  let query = supabase
    .from("job_posts")
    .select(`
      id,
      company_name,
      company_website,
      application_url,
      raw_job_title,
      normalized_role,
      normalized_roles,
      skills,
      location,
      search_country,
      seniority,
      employment_type,
      workplace_type,
      summary,
      is_active
    `)
    .eq("is_active", true);

  if (clean(country)) {
    query = query.eq("search_country", clean(country));
  }

  const { data, error } = await query.limit(100);

  if (error) throw error;

  const roleMain = clean(normalizedRole).toLowerCase();
  const altRoles = asArray(normalizedRoles).map((v) => v.toLowerCase());
  const userSkills = asArray(skills).map((v) => v.toLowerCase());
  const userLocations = asArray(location).map((v) => v.toLowerCase());
  const userSeniority = clean(seniority).toLowerCase();

  const scored = (data || [])
    .map((job) => {
      const jobRole = clean(job.normalized_role).toLowerCase();
      const jobAltRoles = asArray(job.normalized_roles).map((v) => v.toLowerCase());
      const jobSkills = asArray(job.skills).map((v) => v.toLowerCase());
      const jobLocations = asArray(job.location).map((v) => v.toLowerCase());
      const jobSeniority = clean(job.seniority).toLowerCase();

      let score = 0;

      if (roleMain && jobRole && roleMain === jobRole) score += 50;

      const roleOverlap = altRoles.filter((r) => jobAltRoles.includes(r));
      score += Math.min(roleOverlap.length * 10, 20);

      const skillOverlap = userSkills.filter((s) => jobSkills.includes(s));
      score += Math.min(skillOverlap.length * 4, 20);

      const locationOverlap = userLocations.filter((l) => jobLocations.includes(l));
      if (locationOverlap.length) score += 10;

      if (userSeniority && jobSeniority && userSeniority === jobSeniority) score += 5;

      return {
        id: job.id,
        title: clean(job.raw_job_title) || clean(job.normalized_role) || "Job bank role",
        url: clean(job.application_url) || clean(job.company_website) || "#",
        source: "Job Bank",
        company_name: clean(job.company_name),
        summary: clean(job.summary),
        match_score: score,
      };
    })
    .filter((job) => job.match_score > 0)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 5);

  return scored;
}

function dedupeJobs(jobs = []) {
  const seen = new Set();

  return jobs.filter((job) => {
    const key = [
      clean(job.title).toLowerCase(),
      clean(job.company_name).toLowerCase(),
      clean(job.url).toLowerCase(),
    ].join("|");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeRecommendedJobs(externalJobs = [], bankJobs = []) {
  const normalizedExternal = externalJobs.map((job) => ({
    ...job,
    source: job.source || "Jobindex",
    company_name: clean(job.company_name),
    match_score: typeof job.match_score === "number" ? job.match_score : 0,
  }));

  return dedupeJobs([...bankJobs, ...normalizedExternal]).slice(0, 8);
}

async function uploadCvPdf(file) {
  const path = `uploads/${crypto.randomUUID()}.pdf`;

  const { error: uploadError } = await supabase.storage.from("cvs").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: "application/pdf",
  });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("cvs").getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

async function deleteCvPdf(path) {
  const { error } = await supabase.storage.from("cvs").remove([path]);
  if (error) console.error("Failed to delete uploaded CV:", error);
}

async function parseCvPdf(pdfUrl) {
  const { data, error } = await supabase.functions.invoke("parse-cv-pdf", {
    body: { pdf_url: pdfUrl },
  });

  if (error) throw new Error(error.message || "parse-cv-pdf failed");
  if (data?.error) throw new Error(data.error);

  return data;
}

function mergeProfiles(promptData, cvData, promptInput) {
  const promptLocations = promptInput.structured.location || [];
  const cvLocations = asArray(cvData?.location);
  const mergedLocations = [...new Set([...promptLocations, ...cvLocations])];

  const searchCountry =
    clean(promptInput?.structured?.country) ||
    clean(promptData?.search_country) ||
    clean(cvData?.search_country);

  const portalQueryRole =
    clean(promptData?.portal_query_role) ||
    clean(cvData?.portal_query_role) ||
    clean(promptData?.normalized_role) ||
    clean(cvData?.normalized_role) ||
    clean(promptInput?.rawRole);

  const jobindexQuery =
    clean(promptData?.jobindex_query) ||
    clean(cvData?.jobindex_query) ||
    portalQueryRole;

  const stepstoneQuery =
    clean(promptData?.stepstone_query) ||
    clean(cvData?.stepstone_query) ||
    portalQueryRole;

  return {
    source_type: cvData ? "prompt_cv_combined" : "job_prompt",
    language: clean(cvData?.language || promptData?.language) || null,
    search_country: searchCountry || null,
    normalized_role: clean(promptData?.normalized_role || cvData?.normalized_role) || null,
    normalized_roles: [
      ...new Set([
        ...asArray(promptData?.normalized_roles),
        ...asArray(cvData?.normalized_roles),
      ]),
    ],
    portal_query_role: portalQueryRole || null,
    jobindex_query: jobindexQuery || null,
    stepstone_query: stepstoneQuery || null,
    role_experience: Array.isArray(cvData?.role_experience)
      ? cvData.role_experience
      : Array.isArray(promptData?.role_experience)
      ? promptData.role_experience
      : null,
    danish_keywords: [...new Set([...asArray(promptData?.danish_keywords), ...asArray(cvData?.danish_keywords)])],
    english_keywords: [...new Set([...asArray(promptData?.english_keywords), ...asArray(cvData?.english_keywords)])],
    adjacent_roles: [...new Set([...asArray(promptData?.adjacent_roles), ...asArray(cvData?.adjacent_roles)])],
    skills: [...new Set([...asArray(promptData?.skills), ...asArray(cvData?.skills)])],
    industries: [...new Set([...asArray(promptData?.industries), ...asArray(cvData?.industries)])],
    education: [...new Set([...asArray(promptData?.education), ...asArray(cvData?.education)])],
    languages: [...new Set([...asArray(promptData?.languages), ...asArray(cvData?.languages)])],
    location: mergedLocations,
    years_experience:
      asNullableNumber(cvData?.years_experience) ??
      asNullableNumber(promptData?.years_experience) ??
      asNullableNumber(promptInput?.structured?.yearsExperience),
    seniority: clean(cvData?.seniority || promptData?.seniority) || null,
    summary: clean(cvData?.summary || promptData?.summary) || null,
  };
}

function getPortalQuery(merged, country) {
  if (country === "DE") {
    return clean(merged?.stepstone_query) || clean(merged?.portal_query_role) || clean(merged?.normalized_role);
  }
  return clean(merged?.jobindex_query) || clean(merged?.portal_query_role) || clean(merged?.normalized_role);
}

/* -------------------------
   Employer mode
------------------------- */

const jobPostForm = $("#jobPostForm");
const jobPostAriaLive = $("#jobPostAriaLive");
const jobPostCharCount = $("#jobPostCharCount");
const jobPostLastSaved = $("#jobPostLastSaved");
const jobPostResetBtn = $("#jobPostResetBtn");
const jobPostSubmitBtn = $("#jobPostSubmitBtn");

const companyName = $("#companyName");
const companyWebsite = $("#companyWebsite");
const applicationUrl = $("#applicationUrl");
const contactEmail = $("#contactEmail");
const jobTitle = $("#jobTitle");
const jobDescription = $("#jobDescription");
const jobRequirements = $("#jobRequirements");
const jobBenefits = $("#jobBenefits");
const jobPostCountry = $("#jobPostCountry");
const jobPostLocation = $("#jobPostLocation");
const employmentType = $("#employmentType");
const workplaceType = $("#workplaceType");
const jobEducation = $("#jobEducation");
const jobYearsExperience = $("#jobYearsExperience");
const jobSkills = $("#jobSkills");
const jobLanguages = $("#jobLanguages");
const jobSeniority = $("#jobSeniority");
const jobIndustry = $("#jobIndustry");
const jobPostConsent = $("#jobPostConsent");

const jobPostParsedHint = $("#jobPostParsedHint");
const jobPostParsedProfile = $("#jobPostParsedProfile");
const jobPostStatusText = $("#jobPostStatusText");

function setEmployerAria(text) {
  if (jobPostAriaLive) jobPostAriaLive.textContent = text || "";
}

function updateEmployerCounter() {
  const max = Number(jobDescription?.maxLength || 4000);
  const used = jobDescription?.value?.length || 0;
  if (jobPostCharCount) jobPostCharCount.textContent = `${used} / ${max}`;
}

function clearEmployerParsedProfile() {
  if (jobPostParsedHint) jobPostParsedHint.style.display = "block";
  if (jobPostParsedProfile) {
    jobPostParsedProfile.innerHTML = "";
    jobPostParsedProfile.style.display = "none";
  }
}

function renderEmployerParsedProfile(data) {
  if (!jobPostParsedProfile) return;

  const sections = [
    ["Normalized role", normalizeDisplayValue(data?.normalized_role)],
    ["Alternative roles", normalizeDisplayValue(data?.normalized_roles)],
    ["Skills", normalizeDisplayValue(data?.skills)],
    ["Industries", normalizeDisplayValue(data?.industries)],
    ["Education", normalizeDisplayValue(data?.education)],
    ["Languages", normalizeDisplayValue(data?.languages)],
    ["Years of experience", normalizeDisplayValue(data?.years_experience)],
    ["Seniority", normalizeDisplayValue(data?.seniority)],
    ["Employment type", normalizeDisplayValue(data?.employment_type)],
    ["Workplace type", normalizeDisplayValue(data?.workplace_type)],
    ["Department", normalizeDisplayValue(data?.department)],
    ["Responsibilities", normalizeDisplayValue(data?.responsibilities)],
    ["Requirements", normalizeDisplayValue(data?.requirements)],
    ["Nice to have", normalizeDisplayValue(data?.nice_to_have)],
    ["Benefits", normalizeDisplayValue(data?.benefits)],
    ["Locations", normalizeDisplayValue(data?.location)],
    ["Summary", normalizeDisplayValue(data?.summary)],
  ].filter(([, value]) => clean(value));

  if (!sections.length) {
    clearEmployerParsedProfile();
    return;
  }

  jobPostParsedProfile.innerHTML = sections
    .map(
      ([label, value]) => `
        <div class="parsedGroup">
          <p class="parsedLabel">${escapeHtml(label)}</p>
          <p class="parsedValue">${escapeHtml(value)}</p>
        </div>
      `
    )
    .join("");

  if (jobPostParsedHint) jobPostParsedHint.style.display = "none";
  jobPostParsedProfile.style.display = "grid";
}

function getEmployerStructuredFields() {
  return {
    education: parseCommaList(jobEducation?.value),
    yearsExperience: asNullableNumber(jobYearsExperience?.value),
    skills: parseCommaList(jobSkills?.value),
    languages: parseCommaList(jobLanguages?.value),
    industry: clean(jobIndustry?.value),
    country: clean(jobPostCountry?.value),
    location: clean(jobPostLocation?.value) ? [clean(jobPostLocation.value)] : [],
    seniority: clean(jobSeniority?.value),
    employmentType: clean(employmentType?.value),
    workplaceType: clean(workplaceType?.value),
  };
}

function buildEmployerNormalizerPayload() {
  const structured = getEmployerStructuredFields();

  const extraNotes = [
    structured.education.length ? `Education: ${structured.education.join(", ")}` : "",
    structured.yearsExperience !== null ? `Years of experience: ${structured.yearsExperience}` : "",
    structured.skills.length ? `Skills: ${structured.skills.join(", ")}` : "",
    structured.languages.length ? `Languages: ${structured.languages.join(", ")}` : "",
    structured.industry ? `Industry/Department: ${structured.industry}` : "",
    structured.seniority ? `Seniority: ${structured.seniority}` : "",
    structured.employmentType ? `Employment type: ${structured.employmentType}` : "",
    structured.workplaceType ? `Workplace type: ${structured.workplaceType}` : "",
    structured.location.length ? `Location: ${structured.location.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  return {
    companyName: clean(companyName?.value),
    jobTitle: clean(jobTitle?.value),
    jobDescription: clean(jobDescription?.value),
    jobRequirements: [clean(jobRequirements?.value), extraNotes].filter(Boolean).join("\n\n"),
    jobBenefits: clean(jobBenefits?.value),
    searchCountry: clean(jobPostCountry?.value),
  };
}

async function normalizeJobPost(payload) {
  const { data, error } = await supabase.functions.invoke("mistral-job-post-normalizer", {
    body: payload,
  });

  console.log("mistral-job-post-normalizer response:", { data, error, payload });

  if (error) {
    const message =
      data?.error ||
      data?.details?.error ||
      data?.details?.message ||
      error.message ||
      "mistral-job-post-normalizer failed";
    throw new Error(message);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

async function insertJobPost(payload) {
  const { error } = await supabase
    .from("job_posts")
    .insert([payload]);

  if (error) throw error;
  return true;
}

function onEmployerEdit() {
  updateEmployerCounter();
  clearEmployerParsedProfile();
  if (jobPostStatusText) jobPostStatusText.textContent = "Draft updated.";
  if (jobPostLastSaved) jobPostLastSaved.textContent = `Updated ${nowStamp()}`;
  if (currentMode === "employer") setStatus("Employer Job Bank · editing");
}

/* -------------------------
   Events
------------------------- */

candidateModeBtn?.addEventListener("click", () => switchMode("candidate"));
employerModeBtn?.addEventListener("click", () => switchMode("employer"));

jobCountry?.addEventListener("change", () => {
  populateLocationOptions(location, clean(jobCountry?.value));
  onCandidateEdit();
});

jobPostCountry?.addEventListener("change", () => {
  populateLocationOptions(jobPostLocation, clean(jobPostCountry?.value));
  onEmployerEdit();
});

recommendationRating?.addEventListener("change", async () => {
  const ratingValue = asNullableNumber(recommendationRating?.value);
  if (!latestRecommendationReady || !latestSubmissionId || !ratingValue) return;

  try {
    await updateRecommendationRating(latestSubmissionId, ratingValue);
    if (ratingStatus) ratingStatus.textContent = "Thanks — your rating has been saved.";
    showToast("Rating saved");
  } catch (err) {
    console.error("Failed to save rating:", err);
    if (ratingStatus) ratingStatus.textContent = "Could not save rating. Please try again.";
    showToast("Could not save rating");
  }
});

[role, experience, education, yearsExperience, skills, languages, location, consentEl, cvFile].forEach((el) => {
  if (!el) return;
  el.addEventListener("input", onCandidateEdit);
  el.addEventListener("change", onCandidateEdit);
});

[
  companyName,
  companyWebsite,
  applicationUrl,
  contactEmail,
  jobTitle,
  jobDescription,
  jobRequirements,
  jobBenefits,
  jobPostLocation,
  employmentType,
  workplaceType,
  jobEducation,
  jobYearsExperience,
  jobSkills,
  jobLanguages,
  jobSeniority,
  jobIndustry,
  jobPostConsent,
].forEach((el) => {
  if (!el) return;
  el.addEventListener("input", onEmployerEdit);
  el.addEventListener("change", onEmployerEdit);
});

resetBtn?.addEventListener("click", () => {
  form?.reset();
  if (cvFile) cvFile.value = "";
  populateLocationOptions(location, clean(jobCountry?.value));
  clearParsedProfile();
  setJobsUI({ state: "idle" });
  if (jobindexAllLink) jobindexAllLink.href = "#";
  if (lastSaved) lastSaved.textContent = "Ready";
  setStatus("Thesis Prototype v1");
  latestSubmissionId = "";
  latestRecommendationReady = false;
  setRatingEnabled(false, "Rate after recommendations appear.");
  updateCandidateCounter();
  role?.focus();
});

jobPostResetBtn?.addEventListener("click", () => {
  jobPostForm?.reset();
  populateLocationOptions(jobPostLocation, clean(jobPostCountry?.value));
  clearEmployerParsedProfile();
  if (jobPostStatusText) jobPostStatusText.textContent = "Ready to save a job post.";
  if (jobPostLastSaved) jobPostLastSaved.textContent = "Ready";
  setStatus("Employer Job Bank");
  updateEmployerCounter();
  companyName?.focus();
});

/* -------------------------
   Candidate submit
------------------------- */

form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!form.reportValidity()) {
    showToast("Please complete the form and keep consent checked.");
    return;
  }

  const rawRole = clean(role?.value);
  const rawAbout = clean(experience?.value);
  const structured = getStructuredPromptFields();
  const augmentedAbout = buildAugmentedAbout(rawAbout, structured);
  const file = cvFile?.files?.[0] || null;

  const hasPrompt =
    rawRole ||
    rawAbout ||
    clean(structured.education) ||
    clean(structured.yearsExperience) ||
    structured.skills.length ||
    structured.languages.length ||
    structured.location.length ||
    structured.country;

  if (!hasPrompt && !file) {
    showToast("Please provide a prompt, a CV, or both.");
    return;
  }

  if (!structured.country || !structured.location.length) {
    showToast("Please select a supported country and location.");
    return;
  }

  try {
    if (submitBtn) submitBtn.disabled = true;

    setStatus("Parsing with AI…");
    setCandidateAria("Parsing your input.");
    clearParsedProfile();
    setJobsUI({
      state: "loading",
      message: "Parsing your input and finding matching jobs…",
    });
    setRatingEnabled(false, "Rate after recommendations appear.");
    latestSubmissionId = "";
    latestRecommendationReady = false;

    let promptParsed = null;
    let cvParsed = null;
    let upload = null;

    if (hasPrompt) {
      try {
        promptParsed = await buildMultilingualQuery(rawRole, augmentedAbout);
      } catch (err) {
        console.error("Prompt parsing failed:", err);
      }
    }

    if (file) {
      upload = await uploadCvPdf(file);
      try {
        cvParsed = await parseCvPdf(upload.publicUrl);
      } finally {
        await deleteCvPdf(upload.path);
      }
    }

    const merged = mergeProfiles(promptParsed, cvParsed, {
      rawRole,
      rawAbout,
      structured,
    });

    renderParsedProfile(merged);

    setStatus("Finding jobs…");
    setCandidateAria("Finding relevant jobs.");

    const finalCountry = clean(structured.country);
    const primaryLocation = structured.location[0];
    const portalQuery = getPortalQuery(merged, finalCountry);

    const searchResult = await fetchTopJobs(portalQuery, primaryLocation, finalCountry);

    const externalJobs = Array.isArray(searchResult.jobs)
      ? searchResult.jobs.map((job) => ({
          ...job,
          source: "Jobindex",
        }))
      : [];

    const bankJobs = await fetchJobBankMatches({
      normalizedRole: merged.normalized_role,
      normalizedRoles: merged.normalized_roles,
      skills: merged.skills,
      location: merged.location,
      country: finalCountry,
      seniority: merged.seniority,
    });

    const jobs = mergeRecommendedJobs(externalJobs, bankJobs);
    const recCols = buildRecommendationColumns(jobs);

    const usedLocationFallback =
      Boolean(clean(searchResult.normalizedLocation)) &&
      Array.isArray(searchResult.jobs) &&
      searchResult.jobs.length > 0 &&
      Boolean(clean(searchResult.searchUrl)) &&
      !clean(searchResult.searchUrl).includes(clean(searchResult.normalizedLocation));

    let jobsMessage = "";

    if (clean(searchResult.portal_error)) {
      jobsMessage =
        finalCountry === "DE"
          ? "Germany search is temporarily unavailable from the current server environment. Job bank matches may still be shown."
          : "External search is temporarily unavailable. Job bank matches may still be shown.";
    } else if (!jobs.length) {
      jobsMessage =
        "No results found. Try refining the role or choosing another supported location.";
    } else if (primaryLocation && usedLocationFallback) {
      jobsMessage = `No external jobs were found in ${primaryLocation}. Showing broader external matches and any job-bank matches instead.`;
    }

    const submissionId = randomId("s");

    const inserted = await insertCandidateProfile({
      participant_id: participantId,
      submission_id: submissionId,
      source_type: merged.source_type,
      raw_role: rawRole ? anonymizeText(rawRole) : null,
      raw_about: rawAbout ? anonymizeText(augmentedAbout) : null,

      language: merged.language,
      normalized_role: merged.normalized_role,
      normalized_roles: merged.normalized_roles,
      role_experience: merged.role_experience,
      danish_keywords: merged.danish_keywords,
      english_keywords: merged.english_keywords,
      adjacent_roles: merged.adjacent_roles,
      skills: merged.skills,
      industries: merged.industries,
      education: merged.education,
      languages: merged.languages,
      location: merged.location,
      years_experience: merged.years_experience,
      seniority: merged.seniority,
      summary: merged.summary,
      jobindex_query: searchResult.shortQuery || portalQuery,

      user_country: finalCountry || null,
      user_location: primaryLocation || null,
      user_education: structured.education ? anonymizeText(structured.education) : null,
      user_skills: structured.skills.map(anonymizeText),
      user_languages: structured.languages.map(anonymizeText),
      user_years_experience: asNullableNumber(structured.yearsExperience),

      consent: true,
      recommendation_rating: null,
      ocr_text_preview: clean(cvParsed?.ocr_text_preview) || null,
      ocr_text_length: asNullableNumber(cvParsed?.ocr_text_length),
      pages_processed: asNullableNumber(cvParsed?.pages_processed),

      ...recCols,
    });

    latestSubmissionId = inserted.submission_id;
    latestRecommendationReady = true;
    setRatingEnabled(true, "Please rate the recommendations.");

    if (jobindexAllLink) {
      jobindexAllLink.href =
        clean(searchResult.searchUrl) ||
        jobBoardUrlForResult(
          searchResult.shortQuery || portalQuery,
          primaryLocation,
          searchResult.portal
        );
    }

    if (!jobs.length) {
      setJobsUI({
        state: "empty",
        message: jobsMessage,
      });
      setStatus("Saved · no results");
    } else {
      setJobsUI({
        state: "ready",
        jobs,
      });

      if (jobsMessage && jobsStatus) {
        jobsStatus.style.display = "block";
        jobsStatus.textContent = jobsMessage;
      }

      setStatus("Saved · recommendation ready");
    }

    setCandidateAria("Recommendation complete.");
    if (lastSaved) lastSaved.textContent = `Saved ${nowStamp()}`;
    showToast("Recommendation ready.");
  } catch (err) {
    console.error(err);
    setStatus("Error");
    setCandidateAria("Something went wrong.");
    clearParsedProfile();
    setJobsUI({
      state: "error",
      message: "Could not complete the recommendation right now. Please try again.",
    });
    setRatingEnabled(false, "Rate after recommendations appear.");
    showToast(err?.message ? `Error: ${err.message}` : "Something went wrong.");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

/* -------------------------
   Employer submit
------------------------- */

jobPostForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!jobPostForm.reportValidity()) {
    showToast("Please complete the form and keep consent checked.");
    return;
  }

  const rawTitle = clean(jobTitle?.value);
  const rawDescription = clean(jobDescription?.value);
  const rawRequirements = clean(jobRequirements?.value);
  const rawBenefits = clean(jobBenefits?.value);
  const structured = getEmployerStructuredFields();

  if (!rawTitle || !rawDescription) {
    showToast("Please provide at least a job title and job description.");
    return;
  }

  if (!structured.country || !structured.location.length) {
    showToast("Please select a country and location.");
    return;
  }

  try {
    if (jobPostSubmitBtn) jobPostSubmitBtn.disabled = true;

    setStatus("Normalizing with AI…");
    setEmployerAria("Normalizing the job post.");
    if (jobPostStatusText) {
      jobPostStatusText.textContent = "Normalizing job post and preparing job-bank entry...";
    }

    const normalized = await normalizeJobPost(buildEmployerNormalizerPayload());
    renderEmployerParsedProfile(normalized);

    const submissionId = randomId("jp");

    const payload = {
      submission_id: submissionId,
      source_type: "job_post",
      poster_type: "company",

      company_name: clean(companyName?.value),
      company_website: normalizeWebsite(companyWebsite?.value),
      application_url: normalizeWebsite(applicationUrl?.value),
      contact_email: clean(contactEmail?.value) || null,

      raw_job_title: anonymizeText(rawTitle),
      raw_job_description: anonymizeText(rawDescription),
      raw_requirements: rawRequirements ? anonymizeText(rawRequirements) : null,
      raw_benefits: rawBenefits ? anonymizeText(rawBenefits) : null,

      language: clean(normalized?.language) || null,
      search_country: clean(normalized?.search_country || structured.country) || null,
      user_country: structured.country || null,
      user_location: structured.location[0] || null,

      normalized_role: clean(normalized?.normalized_role) || null,
      normalized_roles: asArray(normalized?.normalized_roles),
      portal_query_role: clean(normalized?.portal_query_role) || null,
      jobindex_query: clean(normalized?.jobindex_query) || null,
      stepstone_query: clean(normalized?.stepstone_query) || null,

      location: asArray(normalized?.location).length ? asArray(normalized?.location) : structured.location,
      skills: [...new Set([...structured.skills, ...asArray(normalized?.skills)])],
      industries: [...new Set([structured.industry, ...asArray(normalized?.industries)].filter(Boolean))],
      education: [...new Set([...structured.education, ...asArray(normalized?.education)])],
      languages: [...new Set([...structured.languages, ...asArray(normalized?.languages)])],
      years_experience: normalized?.years_experience ?? structured.yearsExperience,
      seniority: clean(normalized?.seniority || structured.seniority) || null,
      summary: clean(normalized?.summary) || null,

      employment_type: clean(normalized?.employment_type || structured.employmentType) || null,
      workplace_type: clean(normalized?.workplace_type || structured.workplaceType) || null,
      department: clean(normalized?.department || structured.industry) || null,
      responsibilities: asArray(normalized?.responsibilities),
      requirements: asArray(normalized?.requirements),
      nice_to_have: asArray(normalized?.nice_to_have),
      benefits: asArray(normalized?.benefits),

      is_active: true,
      visibility: "public",
    };

    await insertJobPost(payload);

    if (jobPostStatusText) jobPostStatusText.textContent = "Job post saved to the job bank.";
    if (jobPostLastSaved) jobPostLastSaved.textContent = `Saved ${nowStamp()}`;
    setStatus("Saved · job bank updated");
    setEmployerAria("Job post saved successfully.");
    showToast("Job post saved");
  } catch (err) {
    console.error(err);
    setStatus("Error");
    setEmployerAria("Something went wrong.");
    if (jobPostStatusText) {
      jobPostStatusText.textContent = "Could not save the job post right now. Please try again.";
    }
    showToast(err?.message ? `Error: ${err.message}` : "Something went wrong.");
  } finally {
    if (jobPostSubmitBtn) jobPostSubmitBtn.disabled = false;
  }
});

/* -------------------------
   Init
------------------------- */

populateLocationOptions(location, clean(jobCountry?.value));
populateLocationOptions(jobPostLocation, clean(jobPostCountry?.value));

setRatingEnabled(false, "Rate after recommendations appear.");
updateCandidateCounter();
updateEmployerCounter();

clearParsedProfile();
clearEmployerParsedProfile();
setJobsUI({ state: "idle" });

if (jobPostStatusText) jobPostStatusText.textContent = "Ready to save a job post.";

switchMode("candidate");
