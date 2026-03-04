/**
 * Best-effort anonymization for common personal identifiers.
 * This is NOT perfect — UI copy should still instruct users to avoid personal data.
 */
export function anonymizeText(text) {
  let t = String(text ?? "");

  // Emails
  t = t.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]");

  // URLs
  t = t.replace(/\bhttps?:\/\/\S+\b/gi, "[REDACTED_URL]");
  t = t.replace(/\bwww\.\S+\b/gi, "[REDACTED_URL]");

  // Phone numbers (broad best-effort; may over-redact)
  t = t.replace(/(\+?\d[\d\s().-]{7,}\d)/g, "[REDACTED_PHONE]");

  // Common “my name is …” patterns (best-effort)
  t = t.replace(/\b(my name is|i am|i'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g, "$1 [REDACTED_NAME]");

  return t;
}

export function randomParticipantId() {
  return "p_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
}