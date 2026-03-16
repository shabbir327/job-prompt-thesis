import { supabase } from "./supabaseClient.js";
import { anonymizeText, randomId, getOrCreateParticipantId } from "./anonymize.js";

const $ = (sel) => document.querySelector(sel);

// ---------------- core UI ----------------
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

// ---------------- mode switch ----------------
const promptModeBtn = $("#promptModeBtn");
const cvModeBtn = $("#cvModeBtn");
const promptModePanel = $("#promptModePanel");
const cvModePanel = $("#cvModePanel");

// ---------------- prompt inputs ----------------
const role = $("#role");
const experience = $("#experience");
const education = $("#education");
const yearsExperience = $("#yearsExperience");
const skills = $("#skills");
const languages = $("#languages");
const location = $("#location");

// ---------------- CV inputs ----------------
const cvFile = $("#cvFile");

// ---------------- shared inputs ----------------
const consentEl = $("#consent");

// ---------------- preview ----------------
const previewMode = $("#previewMode");
const previewRole = $("#previewRole");
const previewExperience = $("#previewExperience");
const previewStructured = $("#previewStructured");

// ---------------- parsed profile ----------------
const parsedHint = $("#parsedHint");
const parsedProfile = $("#parsedProfile");

// ---------------- jobs UI ----------------
const jobsHint = $("#jobsHint");
const jobsStatus = $("#jobsStatus");
const jobsSkeleton = $("#jobsSkeleton");
const jobsList = $("#jobsList");
const jobindexAllLink = $("#jobindexAllLink");

const participantId = getOrCreateParticipantId();

let currentMode = "prompt";

// ---------------- helpers ----------------
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
  if (!charCount) return;

  if (currentMode === "prompt") {
    const max = Number(experience?.maxLength || 1200);
    const used = experience?.value?.length || 0;
    charCount.textContent = `${used} / ${max}`;
    return;
  }

  charCount.textContent = cvFile?.files?.[0] ? "PDF selected" : "No PDF selected";
}

function jobIndexUrlForQuery(queryText) {
  const q = encodeURIComponent(clean(queryText)).replace(/%20/g, "+");
  return `https://www.jobindex.dk/jobsoegning?q=${q}`;
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
  if (!file) return "—";
  return `${file.name} (${Math.round(file.size / 1024)} KB)`;
}

function getStructuredPromptFields() {
  return {
    education: clean(education?.value),
    yearsExperience: clean(yearsExperience?.value),
    skills: parseCommaList(skills?.value),
    languages: parseCommaList(languages?.value),
    location: parseCommaList(location?.value),
  };
}

function buildStructuredPreviewText() {
  if (currentMode !== "prompt") {
    return "PDF CV will be privacy-redacted and parsed automatically.";
  }

  const fields = getStructuredPromptFields();

  const lines = [
    fields.education ? `Education: ${fields.education}` : "",
    fields.yearsExperience ? `Years of experience: ${fields.yearsExperience}` : "",
    fields.skills.length ? `Skills: ${fields.skills.join(", ")}` : "",
    fields.languages.length ? `Languages: ${fields.languages.join(", ")}` : "",
    fields.location.length ? `location: ${fields.location.join(", ")}` : "",
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
  if (structured.location?.length) parts.push(`location:\n${structured.location.join(", ")}`);

  return parts.join("\n\n").trim();
}

function currentInputSummary() {
  if (currentMode === "prompt") {
    return {
      modeLabel: "Job Prompt",
      roleText: clean(role?.value) || "—",
      contentText: clean(experience?.value) || "—",
      structuredText: buildStructuredPreviewText(),
    };
  }

  const file = cvFile?.files?.[0] || null;

  return {
    modeLabel: "PDF CV Upload",
    roleText: file ? summarizeFilename(file) : "CV-based recommendation",
    contentText: file ? `Uploaded PDF CV: ${summarizeFilename(file)}` : "—",
    structuredText: "PDF CV will be privacy-redacted and parsed automatically.",
  };
}

function formatRoleExperience(roleExperience) {
  if (!Array.isArray(roleExperience) || !roleExperience.length) return "";

  return roleExperience
    .map((item) => {
      const role = clean(item?.role);
      const years = item?.years;
      const evidence = clean(item?.evidence);

      const yearsText =
        years === null || years === undefined || years === ""
          ? ""
          : `${years} year${Number(years) === 1 ? "" : "s"}`;

      const left = [role, yearsText].filter(Boolean).join(" — ");
      return evidence ? `${left}\nEvidence: ${evidence}` : left;
    })
    .filter(Boolean)
    .join("\n\n");
}

function setJobsUI({ state = "idle", message = "", jobs = [] } = {}) {
  if (jobsHint) jobsHint.style.display = state === "idle" ? "block" : "none";

  if (jobsStatus) {
    const show = state === "loading" || state === "empty" || state === "error";
    jobsStatus.style.display = show ? "block" : "none";
    jobsStatus.textContent = message || "";
  }

  if (jobsSkeleton) {
    jobsSkeleton.style.display = state === "loading" ? "grid" : "none";
  }

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
      meta.textContent = [job.company, job.location].filter(Boolean).join(" · ");

      const snippet = document.createElement("p");
      snippet.className = "jobSnippet";
      snippet.textContent = job.snippet || "";

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
      if (meta.textContent) card.appendChild(meta);
      if (job.snippet) card.appendChild(snippet);
      card.appendChild(btnRow);

      jobsList.appendChild(card);
    }
  }
}

function clearParsedProfile() {
  if (parsedHint) parsedHint.style.display = "block";
  if (parsedProfile) {
    parsedProfile.style.display = "none";
    parsedProfile.innerHTML = "";
  }
}

function normalizeDisplayValue(value) {
  if (Array.isArray(value)) {
    return value.map((v) => normalizeDisplayValue(v)).filter(Boolean).join(", ");
  }

  if (value && typeof value === "object") {
    try {
      if ("degree" in value || "title" in value || "name" in value) {
        return [value.degree, value.title, value.name].filter(Boolean).join(" - ");
      }
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return clean(value);
}

function renderParsedProfile(data) {
  if (!parsedProfile) return;

  const sections = [
    ["Detected language", data?.language],
    ["Normalized role", data?.normalized_role],
    ["Normalized roles", data?.normalized_roles],
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
    ["Jobindex query", data?.jobindex_query],
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

function updatePreview() {
  const summary = currentInputSummary();

  if (previewMode) previewMode.textContent = summary.modeLabel;
  if (previewRole) previewRole.textContent = summary.roleText;
  if (previewExperience) previewExperience.textContent = summary.contentText;
  if (previewStructured) previewStructured.textContent = summary.structuredText;

  updateCounter();
  if (lastSaved) lastSaved.textContent = `Updated ${nowStamp()}`;
}

function setMode(mode) {
  currentMode = mode === "cv" ? "cv" : "prompt";

  const promptActive = currentMode === "prompt";
  const cvActive = currentMode === "cv";

  promptModeBtn?.classList.toggle("active", promptActive);
  cvModeBtn?.classList.toggle("active", cvActive);

  promptModeBtn?.setAttribute("aria-selected", String(promptActive));
  cvModeBtn?.setAttribute("aria-selected", String(cvActive));

  promptModePanel?.classList.toggle("hidden", !promptActive);
  cvModePanel?.classList.toggle("hidden", !cvActive);

  updatePreview();
  clearParsedProfile();
  setJobsUI({ state: "idle" });

  if (jobindexAllLink) jobindexAllLink.href = "#";
  setStatus("Draft · editing");
}

// ---------------- supabase helpers ----------------
async function insertCandidateProfile(payload) {
  const { error } = await supabase.from("candidate_profiles").insert([payload]);
  if (error) throw error;
}

async function buildMultilingualQuery(roleText, aboutText) {
  const { data, error } = await supabase.functions.invoke("mistral-query-builder", {
    body: { role: roleText, about: aboutText },
  });

  if (error) throw new Error(error.message || "mistral-query-builder failed");
  if (data?.error) throw new Error(data.error);

  return data;
}

async function fetchTopJobs(queryText) {
  const q = clean(queryText);
  if (!q) return [];

  const { data, error } = await supabase.functions.invoke("jobindex-top3", {
    body: { q },
  });

  if (error) throw new Error(error.message || "jobindex-top3 failed");
  if (data?.error) throw new Error(data.error);

  return data?.jobs || [];
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

  return {
    path,
    publicUrl: data.publicUrl,
  };
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

// ---------------- submission helpers ----------------
function getPromptSubmission() {
  const rawRole = clean(role?.value);
  const rawAbout = clean(experience?.value);
  const structured = getStructuredPromptFields();
  const augmentedAbout = buildAugmentedAbout(rawAbout, structured);

  if (!rawRole) {
    role?.focus();
    throw new Error("Please enter the role you are looking for.");
  }

  const hasStructuredInfo =
    clean(structured.education) ||
    clean(structured.yearsExperience) ||
    structured.skills.length ||
    structured.languages.length;
    structured.location.length;

  if (!clean(rawAbout) && !hasStructuredInfo) {
    experience?.focus();
    throw new Error("Please add some experience details or structured profile information.");
  }

  if (clean(rawAbout) && rawAbout.length < 20 && !hasStructuredInfo) {
    experience?.focus();
    throw new Error("Please write a bit more about your experience and interests.");
  }

  return {
    source_type: "job_prompt",
    rawRole,
    rawAbout,
    structured,
    augmentedAbout,
  };
}

function getCvSubmission() {
  const file = cvFile?.files?.[0] || null;

  if (!file) throw new Error("Please upload a PDF CV.");
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Only PDF CV files are supported right now.");
  }

  return {
    source_type: "cv_pdf",
    file,
  };
}

// ---------------- mode events ----------------
promptModeBtn?.addEventListener("click", () => setMode("prompt"));
cvModeBtn?.addEventListener("click", () => setMode("cv"));

// ---------------- live updates ----------------
function onEdit() {
  updatePreview();
  clearParsedProfile();
  setJobsUI({ state: "idle" });

  if (jobindexAllLink) jobindexAllLink.href = "#";
  setStatus("Draft · editing");
}

[role, experience, education, yearsExperience, skills, languages, location, consentEl].forEach((el) => {
  if (!el) return;
  el.addEventListener("input", onEdit);
  el.addEventListener("change", onEdit);
});

cvFile?.addEventListener("change", () => {
  updatePreview();
  clearParsedProfile();
  setJobsUI({ state: "idle" });

  if (jobindexAllLink) jobindexAllLink.href = "#";
  setStatus("Draft · editing");
});

// ---------------- buttons ----------------
resetBtn?.addEventListener("click", () => {
  form?.reset();
  if (cvFile) cvFile.value = "";

  clearParsedProfile();
  setJobsUI({ state: "idle" });

  if (jobindexAllLink) jobindexAllLink.href = "#";
  if (lastSaved) lastSaved.textContent = "Live preview";

  setStatus("Thesis Prototype v1");
  updatePreview();

  if (currentMode === "prompt") role?.focus();
  else cvFile?.focus();
});

copyBtn?.addEventListener("click", async () => {
  const summary = currentInputSummary();

  const text = [
    `Input mode: ${summary.modeLabel}`,
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

// ---------------- submit flow ----------------
form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!form.reportValidity()) {
    showToast("Please complete the form and keep consent checked.");
    return;
  }

  try {
    if (submitBtn) submitBtn.disabled = true;

    // ---------- PROMPT MODE ----------
    if (currentMode === "prompt") {
      const submission = getPromptSubmission();

      setStatus("Parsing with AI…");
      setAria("Parsing your input with AI.");
      clearParsedProfile();
      setJobsUI({
        state: "loading",
        message: "Parsing your input and finding matching jobs…",
      });

      let llm = null;
      try {
        llm = await buildMultilingualQuery(submission.rawRole, submission.augmentedAbout);
        renderParsedProfile(llm);
      } catch (llmErr) {
        console.error("Mistral parsing failed:", llmErr);
        clearParsedProfile();
      }

      const finalQuery = clean(llm?.jobindex_query) || submission.rawRole;

      await insertCandidateProfile({
        participant_id: participantId,
        submission_id: randomId("s"),
        source_type: submission.source_type,
        raw_role: anonymizeText(submission.rawRole),
        raw_about: anonymizeText(submission.augmentedAbout),

        language: clean(llm?.language) || null,
        normalized_role: clean(llm?.normalized_role) || null,
        normalized_roles: asArray(llm?.normalized_roles),
        role_experience: Array.isArray(llm?.role_experience) ? llm.role_experience : null,
        danish_keywords: asArray(llm?.danish_keywords),
        english_keywords: asArray(llm?.english_keywords),
        adjacent_roles: asArray(llm?.adjacent_roles),

        skills: asArray(llm?.skills),
        industries: asArray(llm?.industries),
        education: asArray(llm?.education),
        languages: asArray(llm?.languages),
        location: asArray(llm?.location),
        years_experience: asNullableNumber(llm?.years_experience),
        seniority: clean(llm?.seniority) || null,
        summary: clean(llm?.summary) || null,
        jobindex_query: finalQuery,

        user_education: anonymizeText(submission.structured.education || ""),
        user_skills: submission.structured.skills.map(anonymizeText),
        user_languages: submission.structured.languages.map(anonymizeText),
        user_location: submission.structured.location.map(anonymizeText),
        user_years_experience: asNullableNumber(submission.structured.yearsExperience),

        consent: true,
      });

      if (jobindexAllLink) jobindexAllLink.href = jobIndexUrlForQuery(finalQuery);

      setStatus("Finding jobs…");
      setAria("Finding relevant jobs.");

      const jobs = await fetchTopJobs(finalQuery);

      if (!jobs.length) {
        setJobsUI({
          state: "empty",
          message: "No results found. Try a different role description.",
        });
        setStatus("Saved · no results");
      } else {
        setJobsUI({ state: "ready", jobs });
        setStatus("Saved · recommendation ready");
      }

      setAria("Recommendation complete.");
      if (lastSaved) lastSaved.textContent = `Saved ${nowStamp()}`;
      showToast("Recommendation ready.");
      return;
    }

    // ---------- CV MODE ----------
    const submission = getCvSubmission();

    setStatus("Uploading CV…");
    setAria("Uploading your CV.");

    const upload = await uploadCvPdf(submission.file);

    try {
      setStatus("Parsing CV with AI…");
      setAria("Parsing your CV with AI.");
      clearParsedProfile();
      setJobsUI({
        state: "loading",
        message: "Reading your PDF CV and finding matching jobs…",
      });

      const parsedCv = await parseCvPdf(upload.publicUrl);
      renderParsedProfile(parsedCv);

      const finalQuery =
        clean(parsedCv?.jobindex_query) ||
        clean(parsedCv?.normalized_role) ||
        "job";

      await insertCandidateProfile({
        participant_id: participantId,
        submission_id: randomId("s"),
        source_type: submission.source_type,
        raw_role: null,
        raw_about: null,

        language: clean(parsedCv?.language) || null,
        normalized_role: clean(parsedCv?.normalized_role) || null,
        normalized_roles: asArray(parsedCv?.normalized_roles),
        role_experience: Array.isArray(parsedCv?.role_experience) ? parsedCv.role_experience : null,
        danish_keywords: asArray(parsedCv?.danish_keywords),
        english_keywords: asArray(parsedCv?.english_keywords),
        adjacent_roles: asArray(parsedCv?.adjacent_roles),

        skills: asArray(parsedCv?.skills),
        industries: asArray(parsedCv?.industries),
        education: asArray(parsedCv?.education),
        languages: asArray(parsedCv?.languages),
        location: asArray(parsedCv?.location),
        years_experience: asNullableNumber(parsedCv?.years_experience),
        seniority: clean(parsedCv?.seniority) || null,
        summary: clean(parsedCv?.summary) || null,
        jobindex_query: finalQuery,

        user_education: null,
        user_skills: [],
        user_languages: [],
        user_location: [],
        user_years_experience: null,

        consent: true,
        ocr_text_preview: clean(parsedCv?.ocr_text_preview) || null,
        ocr_text_length: asNullableNumber(parsedCv?.ocr_text_length),
        pages_processed: asNullableNumber(parsedCv?.pages_processed),
      });

      if (jobindexAllLink) jobindexAllLink.href = jobIndexUrlForQuery(finalQuery);

      setStatus("Finding jobs…");
      setAria("Finding relevant jobs.");

      const jobs = await fetchTopJobs(finalQuery);

      if (!jobs.length) {
        setJobsUI({
          state: "empty",
          message: "No results found. Try another CV or refine the parsing pipeline.",
        });
        setStatus("Saved · no results");
      } else {
        setJobsUI({ state: "ready", jobs });
        setStatus("Saved · recommendation ready");
      }

      setAria("Recommendation complete.");
      if (lastSaved) lastSaved.textContent = `Saved ${nowStamp()}`;
      showToast("CV recommendation ready.");
    } finally {
      await deleteCvPdf(upload.path);
    }
  } catch (err) {
    console.error(err);
    setStatus("Error");
    setAria("Something went wrong.");
    clearParsedProfile();
    setJobsUI({
      state: "error",
      message: "Could not complete the recommendation right now. Please try again.",
    });
    showToast(err?.message ? `Error: ${err.message}` : "Something went wrong.");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

// ---------------- initial paint ----------------
updatePreview();
clearParsedProfile();
setJobsUI({ state: "idle" });
setStatus("Thesis Prototype v1");
setMode("prompt");
