import { supabase } from "./supabaseClient.js";
import { anonymizeText, randomId, getOrCreateParticipantId } from "./anonymize.js";

const $ = (sel) => document.querySelector(sel);

const form = $("#jobForm");
const statusPill = $("#statusPill");
const ariaLive = $("#ariaLive");
const charCount = $("#charCount");
const lastSaved = $("#lastSaved");

const resetBtn = $("#resetBtn");
const submitBtn = $("#submitBtn");
const copyBtn = $("#copyBtn");

const toast = $("#toast");
const toastText = $("#toastText");

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

const previewMode = $("#previewMode");
const previewRole = $("#previewRole");
const previewExperience = $("#previewExperience");
const previewStructured = $("#previewStructured");

const parsedHint = $("#parsedHint");
const parsedProfile = $("#parsedProfile");

const jobsHint = $("#jobsHint");
const jobsStatus = $("#jobsStatus");
const jobsSkeleton = $("#jobsSkeleton");
const jobsList = $("#jobsList");
const jobindexAllLink = $("#jobindexAllLink");

const participantId = getOrCreateParticipantId();

let latestSubmissionId = "";
let latestRecommendationReady = false;

const SUPPORTED_LOCATIONS = {
  DK: [
    "København",
    "Storkøbenhavn",
    "Aarhus",
    "Odense",
    "Aalborg",
    "Esbjerg",
    "Randers",
    "Kolding",
    "Horsens",
    "Vejle",
    "Roskilde",
    "Herning",
    "Silkeborg",
    "Helsingør",
    "Næstved",
    "Fredericia",
    "Viborg",
    "Køge",
    "Holstebro",
    "Taastrup",
    "Slagelse",
    "Hillerød",
    "Sønderborg",
    "Svendborg",
    "Holbæk",
    "Hjørring",
    "Frederikshavn",
    "Skive",
    "Ringsted",
    "Aabenraa",
    "Kalundborg",
    "Middelfart",
    "Ikast",
    "Brønderslev",
    "Grenaa",
    "Thisted",
    "Bornholm",
    "Nordsjælland",
    "Sjælland",
    "Fyn",
    "Midtjylland",
    "Sydjylland",
    "Vestjylland"
  ],
  DE: [
    "Berlin",
    "Hamburg",
    "München",
    "Köln",
    "Frankfurt am Main",
    "Stuttgart",
    "Düsseldorf",
    "Dortmund",
    "Essen",
    "Leipzig",
    "Bremen",
    "Dresden",
    "Hannover",
    "Nürnberg",
    "Duisburg",
    "Bochum",
    "Wuppertal",
    "Bielefeld",
    "Bonn",
    "Münster",
    "Karlsruhe",
    "Mannheim",
    "Augsburg",
    "Wiesbaden",
    "Gelsenkirchen",
    "Mönchengladbach",
    "Braunschweig",
    "Chemnitz",
    "Kiel",
    "Aachen",
    "Halle",
    "Magdeburg",
    "Freiburg",
    "Krefeld",
    "Lübeck",
    "Oberhausen",
    "Erfurt",
    "Mainz",
    "Rostock",
    "Kassel",
    "Hagen",
    "Hamm",
    "Saarbrücken",
    "Potsdam",
    "Ludwigshafen",
    "Oldenburg",
    "Leverkusen",
    "Osnabrück",
    "Heidelberg",
    "Darmstadt",
    "Regensburg",
    "Ingolstadt",
    "Ulm",
    "Würzburg",
    "Wolfsburg",
    "Offenbach",
    "Heilbronn",
    "Pforzheim",
    "Göttingen",
    "Trier",
    "Jena",
    "Flensburg"
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

function setAria(text) {
  if (ariaLive) ariaLive.textContent = text || "";
}

function updateCounter() {
  const max = Number(experience?.maxLength || 1200);
  const used = experience?.value?.length || 0;
  charCount.textContent = `${used} / ${max}`;
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
    if (qSlug && locationSlug) {
      return `https://www.stepstone.de/jobs/${qSlug}/in-${locationSlug}/`;
    }
    if (qSlug) {
      return `https://www.stepstone.de/jobs/${qSlug}/`;
    }
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

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function summarizeFilename(file) {
  if (!file) return "No CV uploaded";
  return `${file.name} (${Math.round(file.size / 1024)} KB)`;
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

function populateLocationOptions(countryCode = clean(jobCountry?.value)) {
  if (!location) return;

  const locations = SUPPORTED_LOCATIONS[countryCode] || [];
  const current = clean(location.value);

  location.innerHTML = `<option value="">Select location</option>`;

  for (const loc of locations) {
    const option = document.createElement("option");
    option.value = loc;
    option.textContent = loc;
    if (loc === current) option.selected = true;
    location.appendChild(option);
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

function buildStructuredPreviewText() {
  const fields = getStructuredPromptFields();

  const lines = [
    fields.education ? `Education: ${fields.education}` : "",
    fields.yearsExperience ? `Years of experience: ${fields.yearsExperience}` : "",
    fields.skills.length ? `Skills: ${fields.skills.join(", ")}` : "",
    fields.languages.length ? `Languages: ${fields.languages.join(", ")}` : "",
    fields.country ? `Country: ${fields.country === "DK" ? "Denmark" : "Germany"}` : "",
    fields.location.length ? `Location: ${fields.location.join(", ")}` : "",
  ].filter(Boolean);

  return lines.length ? lines.join("\n") : "—";
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

function currentInputSummary() {
  const file = cvFile?.files?.[0] || null;
  const hasCv = !!file;
  const hasPrompt = !!clean(role?.value) || !!clean(experience?.value);

  let modeLabel = "Prompt only";
  if (hasPrompt && hasCv) modeLabel = "Prompt + CV";
  else if (!hasPrompt && hasCv) modeLabel = "CV only";

  return {
    modeLabel,
    roleText: clean(role?.value) || (file ? "CV-based recommendation" : "—"),
    contentText: hasCv ? summarizeFilename(file) : (clean(experience?.value) || "—"),
    structuredText: buildStructuredPreviewText(),
  };
}

function formatRoleExperience(roleExperience) {
  if (!Array.isArray(roleExperience) || !roleExperience.length) return "";

  return roleExperience
    .map((item) => {
      const roleText = clean(item?.role);
      const years = item?.years;
      const evidence = clean(item?.evidence);

      const yearsText =
        years === null || years === undefined || years === ""
          ? ""
          : `${years} year${Number(years) === 1 ? "" : "s"}`;

      const left = [roleText, yearsText].filter(Boolean).join(" — ");
      return evidence ? `${left}\nEvidence: ${evidence}` : left;
    })
    .filter(Boolean)
    .join("\n\n");
}

function normalizeDisplayValue(value) {
  if (Array.isArray(value)) {
    return value.map((v) => normalizeDisplayValue(v)).filter(Boolean).join(", ");
  }

  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return clean(value);
}

function clearParsedProfile() {
  if (parsedHint) parsedHint.style.display = "block";
  if (parsedProfile) {
    parsedProfile.style.display = "none";
    parsedProfile.innerHTML = "";
  }
}

function renderParsedProfile(data) {
  if (!parsedProfile) return;

  const sections = [
    ["Detected language", data?.language],
    ["Search country", data?.search_country],
    ["Normalized role", data?.normalized_role],
    ["Normalized roles", data?.normalized_roles],
    ["Portal query role", data?.portal_query_role],
    ["Jobindex query", data?.jobindex_query],
    ["Stepstone query", data?.stepstone_query],
    ["Role-specific experience", formatRoleExperience(data?.role_experience)],
    ["Danish keywords", data?.danish_keywords],
    ["English keywords", data?.english_keywords],
    ["Adjacent roles", data?.adjacent_roles],
    ["Skills", data?.skills],
    ["Industries", data?.industries],
    ["Education", data?.education],
    ["Languages", data?.languages],
    ["Location", data?.location],
    ["Years of relevant experience", data?.years_experience],
    ["Seniority", data?.seniority],
    ["Summary", data?.summary],
  ]
    .map(([label, value]) => [label, normalizeDisplayValue(value)])
    .filter(([, value]) => clean(value));

  if (!sections.length) {
    clearParsedProfile();
    return;
  }

  parsedProfile.innerHTML = sections
    .map(
      ([label, value]) => `
      <div class="parsedGroup">
        <p class="parsedLabel">${escapeHtml(label)}</p>
        <p class="parsedValue">${escapeHtml(value)}</p>
      </div>
    `
    )
    .join("");

  if (parsedHint) parsedHint.style.display = "none";
  parsedProfile.style.display = "grid";
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

      const btnRow = document.createElement("div");
      btnRow.className = "jobBtnRow";

      const btn = document.createElement("a");
      btn.className = "jobBtn";
      btn.href = job.url || "#";
      btn.target = "_blank";
      btn.rel = "noopener noreferrer";
      btn.textContent = "Open job →";

      btnRow.appendChild(btn);
      card.appendChild(title);
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
    rec_job_2_title: clean(job2.title) || null,
    rec_job_2_url: clean(job2.url) || null,
    rec_job_3_title: clean(job3.title) || null,
    rec_job_3_url: clean(job3.url) || null,
  };
}

function onEdit() {
  updatePreview();
  clearParsedProfile();
  setJobsUI({ state: "idle" });
  if (jobindexAllLink) jobindexAllLink.href = "#";
  setStatus("Draft · editing");
}

async function insertCandidateProfile(payload) {
  const { error } = await supabase.from("candidate_profiles").insert([payload]);
  if (error) throw error;
}

async function updateRecommendationRating(submissionId, ratingValue) {
  const { data, error } = await supabase
    .from("candidate_profiles")
    .update({ recommendation_rating: ratingValue })
    .eq("submission_id", submissionId)
    .select("submission_id, recommendation_rating");

  if (error) throw error;
  if (!data || !data.length) {
    throw new Error("Rating update did not match any saved recommendation row.");
  }

  return data[0];
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
    danish_keywords: [
      ...new Set([
        ...asArray(promptData?.danish_keywords),
        ...asArray(cvData?.danish_keywords),
      ]),
    ],
    english_keywords: [
      ...new Set([
        ...asArray(promptData?.english_keywords),
        ...asArray(cvData?.english_keywords),
      ]),
    ],
    adjacent_roles: [
      ...new Set([
        ...asArray(promptData?.adjacent_roles),
        ...asArray(cvData?.adjacent_roles),
      ]),
    ],
    skills: [
      ...new Set([
        ...asArray(promptData?.skills),
        ...asArray(cvData?.skills),
      ]),
    ],
    industries: [
      ...new Set([
        ...asArray(promptData?.industries),
        ...asArray(cvData?.industries),
      ]),
    ],
    education: [
      ...new Set([
        ...asArray(promptData?.education),
        ...asArray(cvData?.education),
      ]),
    ],
    languages: [
      ...new Set([
        ...asArray(promptData?.languages),
        ...asArray(cvData?.languages),
      ]),
    ],
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

function updatePreview() {
  const summary = currentInputSummary();

  if (previewMode) previewMode.textContent = summary.modeLabel;
  if (previewRole) previewRole.textContent = summary.roleText;
  if (previewExperience) previewExperience.textContent = summary.contentText;
  if (previewStructured) previewStructured.textContent = summary.structuredText;

  updateCounter();
  if (lastSaved) lastSaved.textContent = `Updated ${nowStamp()}`;
}

jobCountry?.addEventListener("change", () => {
  populateLocationOptions(clean(jobCountry.value));
  onEdit();
});

recommendationRating?.addEventListener("change", async () => {
  const ratingValue = asNullableNumber(recommendationRating?.value);

  if (!latestRecommendationReady || !latestSubmissionId || !ratingValue) {
    return;
  }

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
  el.addEventListener("input", onEdit);
  el.addEventListener("change", onEdit);
});

resetBtn?.addEventListener("click", () => {
  form?.reset();
  if (cvFile) cvFile.value = "";
  populateLocationOptions("");
  clearParsedProfile();
  setJobsUI({ state: "idle" });
  if (jobindexAllLink) jobindexAllLink.href = "#";
  if (lastSaved) lastSaved.textContent = "Live preview";
  setStatus("Thesis Prototype v1");
  latestSubmissionId = "";
  latestRecommendationReady = false;
  setRatingEnabled(false, "Rate after recommendations appear.");
  updatePreview();
  role?.focus();
});

copyBtn?.addEventListener("click", async () => {
  const summary = currentInputSummary();

  const text = [
    `Input type: ${summary.modeLabel}`,
    "",
    `Role / target: ${summary.roleText}`,
    "",
    "Experience / CV content:",
    summary.contentText,
    "",
    "Structured input:",
    summary.structuredText,
  ].join("\n");

  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard");
  } catch {
    showToast("Could not copy");
  }
});

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
    setAria("Parsing your input.");
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
    setAria("Finding relevant jobs.");

    const finalCountry = clean(structured.country);
    const primaryLocation = structured.location[0];
    const portalQuery = getPortalQuery(merged, finalCountry);

    const searchResult = await fetchTopJobs(portalQuery, primaryLocation, finalCountry);
    const jobs = searchResult.jobs;
    const recCols = buildRecommendationColumns(jobs);

    const usedLocationFallback =
      Boolean(clean(searchResult.normalizedLocation)) &&
      Array.isArray(jobs) &&
      jobs.length > 0 &&
      Boolean(clean(searchResult.searchUrl)) &&
      !clean(searchResult.searchUrl).includes(clean(searchResult.normalizedLocation));

    let jobsMessage = "";

    if (clean(searchResult.portal_error)) {
      jobsMessage =
        finalCountry === "DE"
          ? "Germany search is temporarily unavailable from the current server environment. You can still open the source portal below."
          : "Search is temporarily unavailable. Please try again.";
    } else if (!jobs.length) {
      jobsMessage =
        "No results found. Try refining the role or choosing another supported location in Denmark or Germany.";
    } else if (primaryLocation && usedLocationFallback) {
      jobsMessage = `No jobs were found in ${primaryLocation}. Showing related jobs from a broader search instead.`;
    }

    const submissionId = randomId("s");

    await insertCandidateProfile({
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

    latestSubmissionId = submissionId;
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

    setAria("Recommendation complete.");
    if (lastSaved) lastSaved.textContent = `Saved ${nowStamp()}`;
    showToast("Recommendation ready.");
  } catch (err) {
    console.error(err);
    setStatus("Error");
    setAria("Something went wrong.");
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

populateLocationOptions(clean(jobCountry?.value));
setRatingEnabled(false, "Rate after recommendations appear.");
updatePreview();
clearParsedProfile();
setJobsUI({ state: "idle" });
setStatus("Thesis Prototype v1");
