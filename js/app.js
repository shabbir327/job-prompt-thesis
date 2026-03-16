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

// ---------------- CV inputs ----------------
const cvFile = $("#cvFile");

// ---------------- shared inputs ----------------
const consentEl = $("#consent");

// ---------------- preview ----------------
const previewMode = $("#previewMode");
const previewRole = $("#previewRole");
const previewExperience = $("#previewExperience");

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

function currentInputSummary() {
  if (currentMode === "prompt") {
    return {
      modeLabel: "Job Prompt",
      roleText: clean(role?.value) || "—",
      contentText: clean(experience?.value) || "—",
    };
  }

  const file = cvFile?.files?.[0] || null;
  return {
    modeLabel: "PDF CV Upload",
    roleText: file ? summarizeFilename(file) : "CV-based recommendation",
    contentText: file ? `Uploaded PDF CV: ${summarizeFilename(file)}` : "—",
  };
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

function renderParsedProfile(data) {
  if (!parsedProfile) return;

  const sections = [
    ["Detected language", data?.language],
    ["Normalized role", data?.normalized_role],
    ["Normalized roles", Array.isArray(data?.normalized_roles) ? data.normalized_roles.join(", ") : ""],
    ["Danish keywords", Array.isArray(data?.danish_keywords) ? data.danish_keywords.join(", ") : ""],
    ["English keywords", Array.isArray(data?.english_keywords) ? data.english_keywords.join(", ") : ""],
    ["Adjacent roles", Array.isArray(data?.adjacent_roles) ? data.adjacent_roles.join(", ") : ""],
    ["Skills", Array.isArray(data?.skills) ? data.skills.join(", ") : ""],
    ["Industries", Array.isArray(data?.industries) ? data.industries.join(", ") : ""],
    ["Education", Array.isArray(data?.education) ? data.education.join(", ") : ""],
    ["Languages", Array.isArray(data?.languages) ? data.languages.join(", ") : ""],
    ["Years of experience", data?.years_experience],
    ["Seniority", data?.seniority],
    ["Summary", data?.summary],
    ["Jobindex query", data?.jobindex_query],
  ].filter(([, value]) => clean(value));

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
async function insertResponse(payload) {
  const { error } = await supabase.from("jobprompt").insert([payload]);
  if (error) throw error;
}

async function buildMultilingualQuery(roleText, aboutText) {
  const { data, error } = await supabase.functions.invoke("mistral-query-builder", {
    body: { role: roleText, about: aboutText },
  });

  console.log("mistral-query-builder data:", data);
  console.log("mistral-query-builder error:", error);

  if (error) {
    throw new Error(error.message || "mistral-query-builder failed");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

async function fetchTopJobs(queryText) {
  const q = clean(queryText);
  if (!q) return [];

  const { data, error } = await supabase.functions.invoke("jobindex-top3", {
    body: { q },
  });

  console.log("jobindex-top3 data:", data);
  console.log("jobindex-top3 error:", error);

  if (error) {
    throw new Error(error.message || "jobindex-top3 failed");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

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
  if (error) {
    console.error("Failed to delete uploaded CV:", error);
  }
}

async function parseCvPdf(pdfUrl) {
  const { data, error } = await supabase.functions.invoke("parse-cv-pdf", {
    body: { pdf_url: pdfUrl },
  });

  console.log("parse-cv-pdf data:", data);
  console.log("parse-cv-pdf error:", error);

  if (error) {
    throw new Error(error.message || "parse-cv-pdf failed");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

// ---------------- submission helpers ----------------
function getPromptSubmission() {
  const rawRole = clean(role?.value);
  const rawAbout = clean(experience?.value);

  if (!rawRole) {
    role?.focus();
    throw new Error("Please enter the role you are looking for.");
  }

  if (rawAbout.length < 30) {
    experience?.focus();
    throw new Error("Please write a bit more about your experience and interests.");
  }

  return {
    input_type: "prompt",
    rawRole,
    rawAbout,
  };
}

function getCvSubmission() {
  const file = cvFile?.files?.[0] || null;

  if (!file) {
    throw new Error("Please upload a PDF CV.");
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Only PDF CV files are supported right now.");
  }

  return {
    input_type: "cv_pdf",
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

[role, experience, consentEl].forEach((el) => {
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

  if (currentMode === "prompt") {
    role?.focus();
  } else {
    cvFile?.focus();
  }
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

      setStatus("Saving · please wait");
      setAria("Saving your submission.");

      const payload = {
        participant_id: participantId,
        submission_id: randomId("s"),
        input_type: submission.input_type,
        role: anonymizeText(submission.rawRole),
        about: anonymizeText(submission.rawAbout),
        consent: true,
      };

      await insertResponse(payload);

      setStatus("Parsing with AI…");
      setAria("Parsing your input with AI.");
      clearParsedProfile();
      setJobsUI({
        state: "loading",
        message: "Parsing your input and finding matching jobs…",
      });

      let llm;
      try {
        llm = await buildMultilingualQuery(submission.rawRole, submission.rawAbout);
        renderParsedProfile(llm);
      } catch (llmErr) {
        console.error("Mistral parsing failed:", llmErr);
        clearParsedProfile();
      }

      const finalQuery = clean(llm?.jobindex_query) || submission.rawRole;

      if (jobindexAllLink) {
        jobindexAllLink.href = jobIndexUrlForQuery(finalQuery);
      }

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
      setStatus("Saving metadata…");
      setAria("Saving your submission.");

      const payload = {
        participant_id: participantId,
        submission_id: randomId("s"),
        input_type: "cv_pdf",
        role: anonymizeText(`CV upload: ${submission.file.name}`),
        about: anonymizeText(`Uploaded PDF CV: ${submission.file.name}`),
        consent: true,
      };

      await insertResponse(payload);

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

      if (jobindexAllLink) {
        jobindexAllLink.href = jobIndexUrlForQuery(finalQuery);
      }

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
