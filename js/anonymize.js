export function anonymizeText(text) {
  let t = String(text ?? "");

  t = t.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]");
  t = t.replace(/\bhttps?:\/\/\S+\b/gi, "[REDACTED_URL]");
  t = t.replace(/\bwww\.\S+\b/gi, "[REDACTED_URL]");
  t = t.replace(/(\+?\d[\d\s().-]{7,}\d)/g, "[REDACTED_PHONE]");
  t = t.replace(/\b(my name is|i am|i'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g, "$1 [REDACTED_NAME]");

  return t;
}

export function randomId(prefix = "id") {
  return `${prefix}_` + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

const PID_KEY = "job_prompt_participant_id_v1";

/**
 * Persistent participant id stored in localStorage (pseudonymous).
 */
export function getOrCreateParticipantId() {
  const existing = localStorage.getItem(PID_KEY);
  if (existing) return existing;

  const pid = randomId("p");
  localStorage.setItem(PID_KEY, pid);
  return pid;
}