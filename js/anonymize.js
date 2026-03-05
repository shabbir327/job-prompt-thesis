export function getOrCreateParticipantId() {
  const key = "jobprompt_participant_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export function randomId(prefix = "id") {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function anonymizeText(input) {
  const s = (input || "").toString();

  // Mask emails
  let out = s.replace(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    "[email]"
  );

  // Mask phone-ish patterns (simple)
  out = out.replace(
    /(\+?\d[\d\s().-]{7,}\d)/g,
    "[phone]"
  );

  // Mask long digit sequences (IDs etc.)
  out = out.replace(/\b\d{6,}\b/g, "[number]");

  return out.trim();
}
