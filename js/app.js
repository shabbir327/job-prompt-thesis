import { supabase } from "./supabaseClient.js";
import { anonymizeText, randomId, getOrCreateParticipantId } from "./anonymize.js";

const $ = (sel) => document.querySelector(sel);

// --- Form inputs
const form = $("#jobForm");
const role = $("#role");
const experience = $("#experience");
const consentEl = $("#consent");

// --- Preview fields
const previewRole = $("#previewRole");
const previewExperience = $("#previewExperience");

// --- Suggested jobs UI
const jobsHint = $("#jobsHint");
const jobsStatus = $("#jobsStatus");
const jobsSkeleton = $("#jobsSkeleton");
const jobsList = $("#jobsList");
const jobindexAllLink = $("#jobindexAllLink");

// --- UI bits
const statusPill = $("#statusPill");
const charCount = $("#charCount");
const lastSaved = $("#lastSaved");
const ariaLive = $("#ariaLive");

const resetBtn = $("#resetBtn");
const findJobsBtn = $("#generateBtn");
const copyBtn = $("#copyBtn");

const toast = $("#toast");
const toastText = $("#toastText");

const participantId = getOrCreateParticipantId();

// ---------------- helpers ----------------
function clean(v) { return (v || "").trim(); }

function nowStamp() {
  const d = new Date();
  return d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function showToast(msg) {
  if (!toast || !toastText) return;
  toastText.textContent = msg;
  toast.classList.add("show");
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function setStatus(text) {
  if (statusPill) statusPill.textContent = text || "";
}

function setAria(text) {
  if (ariaLive) ariaLive.textContent = text || "";
}

function roleToJobIndexQuery(roleText) {
  return encodeURIComponent(clean(roleText)).replace(/%20/g, "+");
}

function jobIndexUrlForRole(roleText) {
  const q = roleToJobIndexQuery(roleText);
  return `https://www.jobindex.dk/jobsoegning?q=${q}`;
}

function updateCounter() {
  if (!charCount || !experience) return;
  const max = Number(experience.maxLength || 1200);
  charCount.textContent = `${experience.value.length} / ${max}`;
}

function updatePreview() {
  const r = clean(role?.value);
  const aboutTxt = clean(experience?.value);

  if (previewRole) previewRole.textContent = r || "—";
  if (previewExperience) previewExperience.textContent = aboutTxt || "—";

  updateCounter();
  if (lastSaved) lastSaved.textContent = `Updated ${nowStamp()}`;
}

async function insertResponse(payload) {
  const { error } = await supabase.from("jobprompt").insert([payload]);
  if (error) throw error;
}

async function buildMultilingualQuery(roleText, aboutText) {
  const { data, error } = await supabase.functions.invoke("mistral-query-builder", {
    body: {
      role: roleText,
      about: aboutText
    }
  });

  if (error) throw error;
  return data;
}

async function fetchTopJobs(roleText) {
  const q = clean(roleText);
  if (!q) return [];

  const { data, error } = await supabase.functions.invoke("jobindex-top3", {
    body: { q }
  });

  if (error) throw error;
  return data?.jobs || [];
}

function setJobsUI({ state = "idle", message = "", jobs = [] } = {}) {
  // states: idle | loading | ready | empty | error

  if (jobsHint) jobsHint.style.display = (state === "idle") ? "block" : "none";

  if (jobsStatus) {
    const show = (state === "loading" || state === "empty" || state === "error");
    jobsStatus.style.display = show ? "block" : "none";
    jobsStatus.textContent = message || "";
  }

  if (jobsSkeleton) jobsSkeleton.style.display = (state === "loading") ? "grid" : "none";

  if (jobsList) {
    jobsList.style.display = (state === "ready" && jobs.length) ? "grid" : "none";
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
      btn.href = job.url;
      btn.target = "_blank";
      btn.rel = "noopener noreferrer";
      btn.textContent = "Open job →";

      btnRow.appendChild(btn);

      card.appendChild(title);
      card.appendChild(meta);
      if (job.snippet) card.appendChild(snippet);
      card.appendChild(btnRow);

      jobsList.appendChild(card);
    }
  }
}

// ---------------- events ----------------
function onEdit() {
  updatePreview();
  setStatus("Draft · editing");
  setJobsUI({ state: "idle" });
  if (jobindexAllLink) jobindexAllLink.href = "#";
}

[role, experience, consentEl].forEach((el) => {
  if (!el) return;
  el.addEventListener("input", onEdit);
  el.addEventListener("change", onEdit);
});

resetBtn?.addEventListener("click", () => {
  form.reset();
  updatePreview();
  setStatus("Draft · not submitted");
  setJobsUI({ state: "idle" });
  if (jobindexAllLink) jobindexAllLink.href = "#";
  role?.focus();
});

copyBtn?.addEventListener("click", async () => {
  const r = clean(role.value);
  const about = clean(experience.value);
  if (!r || !about) return showToast("Fill in role + experience first.");

  const text = `Role: ${r}\n\nExperience & interests:\n${about}`;
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard");
  } catch {
    showToast("Could not copy");
  }
});

// Find jobs => save => loading => fetch => render
form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!form.reportValidity()) {
    showToast("Please complete the form (including consent).");
    return;
  }

  const rawRole = clean(role.value);
  const rawAbout = clean(experience.value);

  if (rawAbout.length < 30) {
    showToast("Please write a bit more (a few sentences is perfect).");
    experience.focus();
    return;
  }

  setStatus("Saving · please wait");
  setAria("Saving your submission.");

  if (jobindexAllLink) jobindexAllLink.href = jobIndexUrlForRole(rawRole);

  const payload = {
    participant_id: participantId,
    submission_id: randomId("s"),
    role: anonymizeText(rawRole),
    about: anonymizeText(rawAbout),
    consent: true
  };

  try {
    if (findJobsBtn) findJobsBtn.disabled = true;

    await insertResponse(payload);

    setStatus("Finding jobs…");
    setAria("Finding the best jobs for you.");
    setJobsUI({ state: "loading", message: "Finding the jobs that best fit you…" });

    let finalQuery = rawRole;

    try {
      const llm = await buildMultilingualQuery(rawRole, rawAbout);
      finalQuery = llm?.jobindex_query || rawRole;
      console.log("Mistral query builder output:", llm);
    } catch (e) {
      console.error("Mistral fallback to raw role:", e);
    }
    
    const jobs = await fetchTopJobs(finalQuery);

    if (!jobs.length) {
      setJobsUI({ state: "empty", message: "No results found. Try a different role keyword." });
      setStatus("Saved · no results");
    } else {
      setJobsUI({ state: "ready", jobs });
      setStatus("Saved · suggestions ready");
    }

    showToast("Thank you for your prompt response.");
  } catch (err) {
    console.error(err);
    setStatus("Error");
    setAria("Something went wrong.");
    setJobsUI({ state: "error", message: "Could not load jobs right now. Please try again." });
    showToast(err?.message ? `Error: ${err.message}` : "Something went wrong.");
  } finally {
    if (findJobsBtn) findJobsBtn.disabled = false;
  }
});

// initial paint
updatePreview();
setJobsUI({ state: "idle" });
setStatus("Draft · not submitted");

