import {
  anonymizeText,
  randomId,
  getOrCreateParticipantId
} from "./anonymize.js";

const el = (id) => document.getElementById(id);

const form = el("jobPromptForm");
const role = el("role");
const locationInput = el("location");
const about = el("about");
const consent = el("consent");

const counter = el("counter");
const statusEl = el("status");
const resetBtn = el("resetBtn");

const participantIdText = el("participantIdText");
const copyPidBtn = el("copyPidBtn");


// ============================
// CONFIGURATION
// ============================

// Google Apps Script Web App URL
const SHEETS_ENDPOINT =
  "https://script.google.com/macros/s/AKfycby8t8_z_7VCR1DAasNl6CemCZF8Ve2XQnrEMlKA1GWFj-C9MhlEr-4KybSrzL90X2HK/exec";


// Jobindex search URL template
// Replace with real template later
const JOBINDEX_URL_TEMPLATE =
  "https://www.jobindex.dk/jobsoegning/{location}?q={job}";


// ============================
// UTILITIES
// ============================

function setStatus(message, type) {
  statusEl.textContent = message || "";
  statusEl.className = "status";

  if (type) statusEl.classList.add(type);
}

function updateCounter() {
  const length = about.value.length;
  counter.textContent = `${length}/1200`;
}

function buildJobindexUrl(job, location) {

  const jobEncoded = encodeURIComponent(job);
  const locationEncoded = encodeURIComponent(location);

  return JOBINDEX_URL_TEMPLATE
    .replace("{job}", jobEncoded)
    .replace("{location}", locationEncoded);

}


// ============================
// GOOGLE SHEETS SUBMISSION
// ============================

async function postToSheets(payload) {

  const body = new URLSearchParams();

  Object.entries(payload).forEach(([key, value]) => {
    body.append(key, String(value ?? ""));
  });

  await fetch(SHEETS_ENDPOINT, {
    method: "POST",
    mode: "no-cors",
    body
  });
}


// ============================
// PARTICIPANT ID
// ============================

const participantId = getOrCreateParticipantId();

if (participantIdText) {
  participantIdText.textContent = participantId;
}

if (copyPidBtn) {
  copyPidBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(participantId);
      setStatus("Participant ID copied.", "ok");
    } catch {
      setStatus("Could not copy participant ID.", "error");
    }
  });
}


// ============================
// EVENTS
// ============================

about.addEventListener("input", updateCounter);
updateCounter();

resetBtn?.addEventListener("click", () => {
  form.reset();
  updateCounter();
  setStatus("");
  role.focus();
});


// ============================
// FORM SUBMISSION
// ============================

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  setStatus("");

  const raw = {
    role: role.value.trim(),
    location: locationInput.value.trim(),
    about: about.value.trim()
  };

  // Validation
  if (!raw.role) {
    setStatus("Please enter the job you are looking for.", "error");
    role.focus();
    return;
  }

  if (!raw.location) {
    setStatus("Please enter where you want to work.", "error");
    locationInput.focus();
    return;
  }

  if (raw.about.length < 30) {
    setStatus("Please write a bit more about your experience.", "error");
    about.focus();
    return;
  }

  if (!consent.checked) {
    setStatus("Consent is required to submit.", "error");
    return;
  }

  // Generate submission id
  const submissionId = randomId("s");

  // Prepare anonymized payload
  const payload = {
    participantId: participantId,
    submissionId: submissionId,
    createdAt: new Date().toISOString(),
    role: anonymizeText(raw.role),
    location: anonymizeText(raw.location),
    about: anonymizeText(raw.about),
    consent: true
  };

  try {

    await postToSheets(payload);

    setStatus("Response saved. Opening Jobindex results...", "ok");

    // Open Jobindex search results
    const url = buildJobindexUrl(raw.role, raw.location);
    window.open(url, "_blank");

    form.reset();
    updateCounter();

  } catch (err) {

    console.error(err);
    setStatus("Could not send data. Please try again.", "error");

  }
});