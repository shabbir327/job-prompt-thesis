import { supabase } from "supabaseClient.js";
import { anonymizeText, randomId, getOrCreateParticipantId } from "./anonymize.js";

const el = (id) => document.getElementById(id);

const form = el("jobPromptForm");
const role = el("role");
const locationInput = el("location");
const about = el("about");
const consent = el("consent");

const counter = el("counter");
const statusEl = el("status");
const resetBtn = el("resetBtn");
const submitBtn = el("submitBtn");

const successCard = el("successCard");
const newResponseBtn = el("newResponseBtn");
const copyLinkBtn = el("copyLinkBtn");

const participantId = getOrCreateParticipantId();

function setStatus(msg, kind) {
  statusEl.textContent = msg || "";
  statusEl.className = "status" + (kind ? ` ${kind}` : "");
}

function updateCounter() {
  counter.textContent = `${about.value.length}/1200`;
}

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
  const parts = cleaned.split(",").map(p => p.trim()).filter(Boolean);
  const mapped = parts.map(p => map[p] || p);

  return mapped.join(", ");
}

function showSuccess() {
  successCard.hidden = false;
  successCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function hideSuccess() {
  successCard.hidden = true;
}

async function insertResponse(payload) {
  const { error } = await supabase.from("jobprompt").insert([payload]);
  if (error) throw error;
}

about.addEventListener("input", updateCounter);
updateCounter();

resetBtn?.addEventListener("click", () => {
  form.reset();
  updateCounter();
  setStatus("");
  role.focus();
});

newResponseBtn?.addEventListener("click", () => {
  hideSuccess();
  setStatus("");
  form.reset();
  updateCounter();
  role.focus();
});

copyLinkBtn?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    // This is a separate status area (success card). Keep it simple.
    alert("Link copied. Thank you for sharing!");
  } catch {
    alert("Could not copy the link. You can copy it from the address bar.");
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("");

  const raw = {
    role: role.value.trim(),
    location: locationInput.value.trim(),
    about: about.value.trim(),
  };

  if (!raw.role) return setStatus("Please enter what job you are looking for.", "error"), role.focus();
  if (!raw.location) return setStatus("Please enter where you are looking.", "error"), locationInput.focus();
  if (raw.about.length < 30) return setStatus("Please write a bit more (a few sentences is perfect).", "error"), about.focus();
  if (!consent.checked) return setStatus("Consent is required to submit.", "error");

  const payload = {
    participant_id: participantId,
    submission_id: randomId("s"),
    role: anonymizeText(raw.role),
    location: normalizeLocation(anonymizeText(raw.location)),
    about: anonymizeText(raw.about),
    consent: true,
  };

  try {
    submitBtn.disabled = true;
    setStatus("Submitting…", "");

    await insertResponse(payload);

    setStatus("Saved. Thank you!", "ok");
    form.reset();
    updateCounter();
    showSuccess();
  } catch (err) {
    console.error(err);
    setStatus(`Could not submit: ${err.message || err}`, "error");
  } finally {
    submitBtn.disabled = false;
  }
});