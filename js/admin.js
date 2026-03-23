function parseRoleExperienceText(value) {
  if (!value.trim()) return null;

  const entries = value
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);

  const parsed = [];

  for (const entry of entries) {
    // matches: "Data Analyst 2 years", "Manager 1 year", "Engineer 3.5 years"
    const match = entry.match(/^(.*?)(\d+(?:\.\d+)?)\s*(year|years|yr|yrs)$/i);

    if (!match) {
      continue;
    }

    const rawRole = match[1].trim().toLowerCase();
    const years = Number(match[2]);

    const normalizedRole = ROLE_MAP[rawRole] || rawRole;

    parsed.push({
      role: normalizedRole,
      years
    });
  }

  return parsed.length ? parsed : null;
}
