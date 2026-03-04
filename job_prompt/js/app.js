import { anonymizeText, randomParticipantId } from "./anonymize.js";

const el = (id) => document.getElementById(id);

const form = el("jobPromptForm");
const role = el("role");
const locationInput = el("location");
const about = el("about");
const consent = el("consent");
const statusEl = el("status");
const counter = el("counter");
const resetBtn = el("resetBtn");

const exportJsonlBtn = el("exportJsonlBtn");
const exportCsvBtn = el("exportCsvBtn");
const clearLocalBtn = el("clearLocalBtn");
const savedCountEl = el("savedCount");

const STORAGE_KEY = "job_prompt_responses_v1";

function setStatus(msg, kind) {
  statusEl.textContent = msg || "";
  statusEl.className = "status" + (kind ? ` ${kind}` : "");
}

function updateCounter() {
  counter.textContent = `${about.value.length}/1200`;
}

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveAll(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  savedCountEl.textContent = String(list.length);
}

function refreshCount() {
  savedCountEl.textContent = String(loadAll().length);
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function toJsonl(list) {
  return list.map((x) => JSON.stringify(x)).join("\n") + (list.length ? "\n" : "");
}

function toCsv(list) {
  // Minimal CSV export (escaped)
  const headers = ["participantId", "createdAt", "role", "location", "about"];
  const esc = (v) => {
    const s = String(v ?? "");
    const safe = s.replace(/"/g, '""');
    return `"${safe}"`;
  };

  const rows = list.map((x) =>
    headers.map((h) => esc(x[h])).join(",")
  );

  return [headers.join(","), ...rows].join("\n") + "\n";
}

// OPTIONAL: show a warning if user types obvious PII
function containsLikelyPII(text) {
  const t = String(text ?? "");
  const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(t);
  const url = /\bhttps?:\/\/\S+\b/i.test(t) || /\bwww\.\S+\b/i.test(t);
  const phone = /(\+?\d[\d\s().-]{7,}\d)/.test(t);
  return email || url || phone;
}

about.addEventListener("input", () => {
  updateCounter();
  if (containsLikelyPII(about.value)) {
    setStatus("Reminder: Please avoid personal info. It will be redacted on save.", "");
  } else {
    // keep status if it's an error/ok, otherwise clear gentle reminders
    if (!statusEl.classList.contains("error") && !statusEl.classList.contains("ok")) {
      setStatus("", "");
    }
  }
});

updateCounter();
refreshCount();

resetBtn.addEventListener("click", () => {
  form.reset();
  updateCounter();
  setStatus("");
  role.focus();
});

exportJsonlBtn.addEventListener("click", () => {
  const list = loadAll();
  if (!list.length) return setStatus("No local responses to export yet.", "error");
  download("job_prompt_responses.jsonl", toJsonl(list), "application/jsonl");
  setStatus("Exported JSONL.", "ok");
});

exportCsvBtn.addEventListener("click", () => {
  const list = loadAll();
  if (!list.length) return setStatus("No local responses to export yet.", "error");
  download("job_prompt_responses.csv", toCsv(list), "text/csv");
  setStatus("Exported CSV.", "ok");
});

clearLocalBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  refreshCount();
  setStatus("Cleared local responses.", "ok");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("");

  const raw = {
    role: role.value.trim(),
    location: locationInput.value.trim(),
    about: about.value.trim(),
  };

  if (!raw.role) return setStatus("Please enter the job you are looking for.", "error"), role.focus();
  if (!raw.location) return setStatus("Please enter where you want to work.", "error"), locationInput.focus();
  if (raw.about.length < 30) return setStatus("Please write a little more detail (at least ~30 characters).", "error"), about.focus();
  if (!consent.checked) return setStatus("Consent is required to save your anonymized response.", "error");

  const payload = {
    participantId: randomParticipantId(),
    createdAt: new Date().toISOString(),
    role: anonymizeText(raw.role),
    location: anonymizeText(raw.location),
    about: anonymizeText(raw.about),
    consent: true,
  };

  // Save locally (good for dev + backup)
  const list = loadAll();
  list.push(payload);
  saveAll(list);

const ENDPOINT = "https://script.google.com/macros/s/AKfycby8t8_z_7VCR1DAasNl6CemCZF8Ve2XQnrEMlKA1GWFj-C9MhlEr-4KybSrzL90X2HK/exec";

try {

  await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

} catch (err) {
  console.error("Upload failed", err);
}

  setStatus("Saved (anonymized). Thank you!", "ok");
  form.reset();
  updateCounter();
});