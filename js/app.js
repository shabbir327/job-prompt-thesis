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

// Final prompt (locked until Generate + save succeeds)
const previewPrompt = $("#previewPrompt");
const lockedPromptHint = $("#lockedPromptHint");

// --- UI bits
const statusPill = $("#statusPill");
const charCount = $("#charCount");
const lastSaved = $("#lastSaved");
const ariaLive = $("#ariaLive");

const resetBtn = $("#resetBtn");
const generateBtn = $("#generateBtn");
const copyBtn = $("#copyBtn");

const toast = $("#toast");
const toastText = $("#toastText");

const participantId = getOrCreateParticipantId();

// ---------------- helpers ----------------
function clean(v) {
  return (v || "").trim();
}

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

// Location normalization (kept from your existing JS)
function normalizeLocation(location) {
  const map = {
    "copenhagen": "koebenhavn",
    "københavn": "koebenhavn",
    "kobenhavn": "koebenhavn",
    "kbh": "koebenhavn",
    "aarhus": "aarhus",
    "århus": "aarhus",
    "odense": "odense",
    "aalborg": "aalborg",
    "ålborg": "aalborg",
  };

  const cleaned = (location || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Allow multiple locations separated by comma
  const parts = cleaned.split(",").map((p) => p.trim()).filter(Boolean);
  const mapped = parts.map((p) => map[p] || p);

  return mapped.join(", ");
}

function buildPrompt({ role, about }) {
  return [
    "Help me find roles that match this profile:",
    "",
    `• Target role: ${role || "—"}`,
    "",
    "About me (experience & interests):",
    about || "—",
    "",
    "Please suggest:",
    "1) 8–12 relevant job titles (including adjacent roles),",
    "2) what keywords/skills to highlight,",
    "3) which industries/companies might fit,",
    "4) a short outreach message I can send to a recruiter."
  ].join("\n");
}

function lockPrompt() {
  if (previewPrompt) previewPrompt.style.display = "none";
  if (lockedPromptHint) lockedPromptHint.style.display = "block";
}

function revealPrompt(text) {
  if (!previewPrompt) return;
  previewPrompt.textContent = text;
  previewPrompt.style.display = "block";
  if (lockedPromptHint) lockedPromptHint.style.display = "none";
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

// ---------------- events ----------------
function onEdit() {
  updatePreview();
  setStatus("Draft · editing");
  lockPrompt(); // ensure prompt stays hidden when editing after generation
}

[role, locationEl, workMode, experience, consentEl].forEach((el) => {
  if (!el) return;
  el.addEventListener("input", onEdit);
  el.addEventListener("change", onEdit);
});

resetBtn?.addEventListener("click", () => {
  form.reset();
  updatePreview();
  setStatus("Draft · not submitted");
  lockPrompt();
  role?.focus();
});

copyBtn?.addEventListener("click", async () => {
  // Copy only if prompt is revealed
  if (!previewPrompt || previewPrompt.style.display === "none") {
    showToast("Click Generate to reveal the prompt first.");
    return;
  }

  try {
    await navigator.clipboard.writeText(previewPrompt.textContent || "");
    showToast("Copied to clipboard");
  } catch {
    showToast("Could not copy");
  }
});

// Generate => validate => save => reveal
form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Built-in validation for required inputs + consent checkbox
  if (!form.reportValidity()) {
    showToast("Please complete the form (including consent).");
    return;
  }

  const rawRole = clean(role.value);
  const rawAbout = clean(experience.value);

  // Extra guard (keeps your previous "write a bit more" UX)
  if (rawAbout.length < 30) {
    showToast("Please write a bit more (a few sentences is perfect).");
    experience.focus();
    return;
  }

  setStatus("Saving · please wait");
  setAria("Saving your submission.");

  // Build prompt text to reveal AFTER successful save
  const locationLine = [rawLocation, rawMode ? `(${rawMode})` : ""].filter(Boolean).join(" ");
  const promptText = buildPrompt({
  role: rawRole,
  about: rawAbout
});

  // Payload saved to Supabase (anonymized)
  const payload = {
    participant_id: participantId,
    submission_id: randomId("s"),
    role: anonymizeText(rawRole),
    about: anonymizeText(rawAbout),
    consent: true,
  };

  try {
    if (generateBtn) generateBtn.disabled = true;

    await insertResponse(payload);

    // Reveal only after successful insert
    revealPrompt(promptText);

    setStatus("Saved · prompt generated");
    setAria("Saved and generated.");
    showToast("Thanks for your prompt response ✨");
  } catch (err) {
    console.error(err);
    setStatus("Error · not saved");
    setAria("Save failed.");
    showToast(err?.message ? `Could not save: ${err.message}` : "Could not save. Check Supabase / RLS.");
    lockPrompt();
  } finally {
    if (generateBtn) generateBtn.disabled = false;
  }
});

// initial paint
updatePreview();
lockPrompt();
setStatus("Draft · not submitted");
