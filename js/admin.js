import { supabase } from "./supabaseClient.js";


const BASE_PATH = "/job-prompt-thesis";

async function protectAdminPage() {
  const { data, error } = await supabase.auth.getSession();
  console.log("admin page session check:", { data, error });

  if (error) {
    console.error("Session error:", error);
    window.location.href = `${BASE_PATH}/admin-login.html`;
    return false;
  }

  if (!data?.session) {
    console.warn("No active session found on admin page");
    window.location.href = `${BASE_PATH}/admin-login.html`;
    return false;
  }

  console.log("Admin session OK:", data.session.user);
  return true;
}

function normalizeList(value) {
  return [
    ...new Set(
      String(value || "")
        .split(/[;,]/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

function normalizeSingle(value) {
  const v = String(value || "").trim().toLowerCase();
  return v || null;
}

function safeNumber(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseRoleExperienceText(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const entries = raw
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);

  const parsed = [];

  for (const entry of entries) {
    const match = entry.match(/^(.*?)(\d+(?:\.\d+)?)\s*(year|years|yr|yrs)$/i);
    if (!match) continue;

    const role = match[1].trim().toLowerCase();
    const years = Number(match[2]);

    parsed.push({ role, years });
  }

  return parsed.length ? parsed : null;
}

function sanitizeFilename(name) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")   // remove accents/diacritics
    .replace(/[^a-zA-Z0-9._-]/g, "_")  // replace unsafe chars
    .replace(/_+/g, "_")               // collapse repeated underscores
    .replace(/^_+|_+$/g, "");          // trim underscores
}

function validateCvPayload(payload) {
  const errors = [];
  if (!payload.cv_id) errors.push("CV ID is required.");
  if (!payload.primary_role) errors.push("Primary role is required.");

  const rawRoleExp = document.getElementById("cv_role_experience")?.value?.trim() || "";
  if (rawRoleExp && !payload.role_experience) {
    errors.push("Role experience format is invalid. Use format like: Data Analyst 2 years; Manager 1 year");
  }

  return errors;
}

function validateJobPayload(payload) {
  const errors = [];
  if (!payload.raw_job_title && !payload.primary_role) {
    errors.push("Add at least a raw job title or a primary role.");
  }
  return errors;
}

function wireTabs() {
  const tabs = document.querySelectorAll(".tab-btn[data-tab]");
  const panels = document.querySelectorAll(".panel");

  console.log("tabs found:", tabs.length, "panels found:", panels.length);

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.tab;
      console.log("switching to tab:", targetId);

      tabs.forEach((b) => b.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));

      btn.classList.add("active");
      const panel = document.getElementById(targetId);
      if (panel) {
        panel.classList.add("active");
      } else {
        console.error("Panel not found for tab:", targetId);
      }
    });
  });
}

function wireLogout() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = `${BASE_PATH}/admin-login.html`;
  });
}

function wireRoleExperiencePreview() {
  const input = document.getElementById("cv_role_experience");
  const preview = document.getElementById("cv_role_experience_preview");

  if (!input || !preview) return;

  const update = () => {
    const parsed = parseRoleExperienceText(input.value);
    preview.textContent = parsed
      ? JSON.stringify(parsed, null, 2)
      : "Example: Data Analyst 2 years; Manager 1 year";
  };

  input.addEventListener("input", update);
  update();
}

function wireCvForm() {
  const saveCvBtn = document.getElementById("saveCvBtn");
  const statusEl = document.getElementById("cvStatus");
  if (!saveCvBtn || !statusEl) return;

  saveCvBtn.addEventListener("click", async () => {
    statusEl.textContent = "Saving CV annotation...";

    try {
      const payload = {
        annotation_id: makeId("cva"),
        cv_id: document.getElementById("cv_id").value.trim(),
        source_ref: document.getElementById("cv_source_ref").value.trim() || null,
        raw_text: document.getElementById("cv_raw_text").value.trim() || null,
        primary_role: normalizeSingle(document.getElementById("cv_primary_role").value),
        normalized_roles: normalizeList(document.getElementById("cv_normalized_roles").value),
        skills: normalizeList(document.getElementById("cv_skills").value),
        languages: normalizeList(document.getElementById("cv_languages").value),
        education: normalizeList(document.getElementById("cv_education").value),
        industries: normalizeList(document.getElementById("cv_industries").value),
        locations: normalizeList(document.getElementById("cv_locations").value),
        years_experience_total: safeNumber(document.getElementById("cv_years_experience_total").value),
        seniority: normalizeSingle(document.getElementById("cv_seniority").value),
        role_experience: parseRoleExperienceText(document.getElementById("cv_role_experience").value),
        annotation_notes: document.getElementById("cv_annotation_notes").value.trim() || null,
        ambiguity_flag: document.getElementById("cv_ambiguity_flag").value === "true",
      };

      console.log("CV payload:", payload);

      const errors = validateCvPayload(payload);
      if (errors.length) throw new Error(errors.join("\n"));

      const { data, error } = await supabase
        .from("cv_annotations")
        .insert([payload])
        .select("annotation_id");

      console.log("CV insert result:", { data, error });

      if (error) throw error;

      statusEl.textContent = "CV annotation saved successfully.";
    } catch (err) {
      console.error("CV save error:", err);
      statusEl.textContent = `Error: ${err.message}`;
    }
  });
}

function wireJobForm() {
  const saveJobBtn = document.getElementById("saveJobBtn");
  const statusEl = document.getElementById("jobStatus");
  if (!saveJobBtn || !statusEl) return;

  saveJobBtn.addEventListener("click", async () => {
    statusEl.textContent = "Saving job annotation...";

    try {
      const payload = {
        annotation_id: makeId("joba"),
        job_id: document.getElementById("job_id").value.trim() || null,
        job_url: document.getElementById("job_url").value.trim() || null,
        raw_job_title: document.getElementById("job_title").value.trim() || null,
        raw_job_text: document.getElementById("job_raw_text").value.trim() || null,
        company_name: document.getElementById("job_company_name").value.trim() || null,
        country: normalizeSingle(document.getElementById("job_country").value),
        locations: normalizeList(document.getElementById("job_locations").value),
        primary_role: normalizeSingle(document.getElementById("job_primary_role").value),
        normalized_roles: normalizeList(document.getElementById("job_normalized_roles").value),
        skills: normalizeList(document.getElementById("job_skills").value),
        languages: normalizeList(document.getElementById("job_languages").value),
        education: normalizeList(document.getElementById("job_education").value),
        industries: normalizeList(document.getElementById("job_industries").value),
        years_experience_required: safeNumber(document.getElementById("job_years_experience_required").value),
        seniority: normalizeSingle(document.getElementById("job_seniority").value),
        employment_type: normalizeSingle(document.getElementById("job_employment_type").value),
        annotation_notes: document.getElementById("job_annotation_notes").value.trim() || null,
        ambiguity_flag: document.getElementById("job_ambiguity_flag").value === "true",
      };

      console.log("Job payload:", payload);

      const errors = validateJobPayload(payload);
      if (errors.length) throw new Error(errors.join("\n"));

      const { data, error } = await supabase
        .from("job_annotations")
        .insert([payload])
        .select("annotation_id");

      console.log("Job insert result:", { data, error });

      if (error) throw error;

      statusEl.textContent = "Job annotation saved successfully.";
    } catch (err) {
      console.error("Job save error:", err);
      statusEl.textContent = `Error: ${err.message}`;
    }
  });
}

function wireParserForm() {
  const parseBtn = document.getElementById("parseJobPdfBtn");
  const statusEl = document.getElementById("parserStatus");
  const previewEl = document.getElementById("parserPreview");
  const fileInput = document.getElementById("jobPdfFile");

  if (!parseBtn || !statusEl || !previewEl || !fileInput) return;

  parseBtn.addEventListener("click", async () => {
    statusEl.textContent = "Parsing...";
    previewEl.textContent = "";

    try {
      const file = fileInput.files?.[0];
      if (!file) throw new Error("Please select a PDF.");

      const modelName = document.getElementById("parser_model_name").value.trim() || "mistral";
      const promptVersion = document.getElementById("parser_prompt_version").value.trim() || "v1";
      const safeFileName = sanitizeFilename(file.name);
      const filePath = `job-pdfs/${Date.now()}-${safeFileName}`;

      const { error: uploadError } = await supabase.storage
        .from("admin-documents")
        .upload(filePath, file, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("admin-documents")
        .getPublicUrl(filePath);

      const source_pdf_url = publicUrlData.publicUrl;

      const {
      data: { session }
        } = await supabase.auth.getSession();
        
        if (!session?.access_token) {
          throw new Error("No active session token found for function call.");
        }

        const { data: parseData, error: parseError } = await supabase.functions.invoke(
          "parse-job-pdf",
          {
            body: {
              pdf_url: source_pdf_url,
              model_name: modelName,
              prompt_version: promptVersion,
            },
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

      if (parseError) throw parseError;

      const parsed = parseData?.parsed_output || parseData || {};
      previewEl.textContent = JSON.stringify(parsed, null, 2);

      const payload = {
        parse_id: makeId("llmjob"),
        source_file_name: file.name,
        source_pdf_url,
        model_name: modelName,
        prompt_version: promptVersion,
        raw_extracted_text: parseData?.raw_extracted_text || null,
        parsed_output: parsed,
        primary_role: normalizeSingle(parsed.primary_role),
        normalized_roles: Array.isArray(parsed.normalized_roles) ? parsed.normalized_roles.map((x) => String(x).trim().toLowerCase()).filter(Boolean) : [],
        skills: Array.isArray(parsed.skills) ? parsed.skills.map((x) => String(x).trim().toLowerCase()).filter(Boolean) : [],
        languages: Array.isArray(parsed.languages) ? parsed.languages.map((x) => String(x).trim().toLowerCase()).filter(Boolean) : [],
        education: Array.isArray(parsed.education) ? parsed.education.map((x) => String(x).trim().toLowerCase()).filter(Boolean) : [],
        industries: Array.isArray(parsed.industries) ? parsed.industries.map((x) => String(x).trim().toLowerCase()).filter(Boolean) : [],
        locations: Array.isArray(parsed.locations) ? parsed.locations.map((x) => String(x).trim().toLowerCase()).filter(Boolean) : [],
        years_experience_required: safeNumber(parsed.years_experience_required),
        seniority: normalizeSingle(parsed.seniority),
        employment_type: normalizeSingle(parsed.employment_type),
        parse_status: "completed",
        notes: null,
      };

      const { data, error: saveError } = await supabase
        .from("llm_job_parses")
        .insert([payload])
        .select("parse_id");

      console.log("Parser save result:", { data, saveError });

      if (saveError) throw saveError;

      statusEl.textContent = "Job PDF parsed and saved successfully.";
    } catch (err) {
      console.error("Parser error:", err);
      statusEl.textContent = `Error: ${err.message}`;
    }
  });
}

async function initAdmin() {
  const ok = await protectAdminPage();
  if (!ok) return;

  wireTabs();
  wireLogout();
  wireRoleExperiencePreview();
  wireCvForm();
  wireJobForm();
  wireParserForm();

  console.log("Admin UI initialized");
}

initAdmin();
