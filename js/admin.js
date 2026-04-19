import { supabase } from "./supabaseClient.js";

const BASE_PATH = "/job-prompt-thesis";
const SUPABASE_FUNCTIONS_BASE = "https://vjwcpzprgqzbjmwjrfrc.supabase.co/functions/v1";

const MODEL_CONFIGS = {
  mistral: {
    provider: "mistral",
    model: "mistral-small-latest"
  },
  llama: {
    provider: "openrouter",
    model: "meta-llama/llama-3.1-8b-instruct"
  },
  gemma: {
    provider: "openrouter",
    model: "google/gemma-3-12b-it"
  }
};

async function protectAdminPage() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error("Session error:", error);
    window.location.href = `${BASE_PATH}/admin-login.html`;
    return false;
  }

  if (!data?.session) {
    window.location.href = `${BASE_PATH}/admin-login.html`;
    return false;
  }

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
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeParsedArray(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean))];
}

function normalizeCheckboxGroup(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return [];

  return [...new Set(
    Array.from(group.querySelectorAll('input[type="checkbox"]:checked'))
      .map((input) => String(input.value || "").trim().toLowerCase())
      .filter(Boolean)
  )];
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

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.tab;

      tabs.forEach((b) => b.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));

      btn.classList.add("active");
      const panel = document.getElementById(targetId);
      if (panel) panel.classList.add("active");
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
        education: normalizeCheckboxGroup("cv_education_group"),
        industries: normalizeList(document.getElementById("cv_industries").value),
        locations: normalizeList(document.getElementById("cv_locations").value),
        years_experience_total: safeNumber(document.getElementById("cv_years_experience_total").value),
        seniority: normalizeSingle(document.getElementById("cv_seniority").value),
        role_experience: parseRoleExperienceText(document.getElementById("cv_role_experience").value),
        annotation_notes: document.getElementById("cv_annotation_notes").value.trim() || null,
        ambiguity_flag: document.getElementById("cv_ambiguity_flag").value === "true",
      };

      const errors = validateCvPayload(payload);
      if (errors.length) throw new Error(errors.join("\n"));

      const { error } = await supabase
        .from("cv_annotations")
        .insert([payload])
        .select("annotation_id");

      if (error) throw error;

      statusEl.textContent = "CV annotation saved successfully.";
    } catch (err) {
      console.error("CV save error:", err);
      statusEl.textContent = `Error: ${err.message || err}`;
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
        education: normalizeCheckboxGroup("job_education_group"),
        industries: normalizeList(document.getElementById("job_industries").value),
        years_experience_required: safeNumber(document.getElementById("job_years_experience_required").value),
        seniority: normalizeSingle(document.getElementById("job_seniority").value),
        employment_type: normalizeSingle(document.getElementById("job_employment_type").value),
        annotation_notes: document.getElementById("job_annotation_notes").value.trim() || null,
        ambiguity_flag: document.getElementById("job_ambiguity_flag").value === "true",
      };

      const errors = validateJobPayload(payload);
      if (errors.length) throw new Error(errors.join("\n"));

      const { error } = await supabase
        .from("job_annotations")
        .insert([payload])
        .select("annotation_id");

      if (error) throw error;

      statusEl.textContent = "Job annotation saved successfully.";
    } catch (err) {
      console.error("Job save error:", err);
      statusEl.textContent = `Error: ${err.message || err}`;
    }
  });
}

async function getSessionToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("No active session token found.");
  }

  return session.access_token;
}

async function uploadTempPdfAndGetSignedUrl(file, folder) {
  const safeFileName = sanitizeFilename(file.name);
  const filePath = `${folder}/${Date.now()}-${safeFileName}`;

  const { error: uploadError } = await supabase.storage
    .from("admin-documents")
    .upload(filePath, file, { upsert: false });

  if (uploadError) throw uploadError;

  const { data: signedData, error: signedError } = await supabase.storage
    .from("admin-documents")
    .createSignedUrl(filePath, 60);

  if (signedError) {
    await supabase.storage.from("admin-documents").remove([filePath]);
    throw signedError;
  }

  return {
    filePath,
    signedUrl: signedData?.signedUrl,
  };
}

async function deleteTempFile(filePath) {
  if (!filePath) return;
  const { error } = await supabase.storage.from("admin-documents").remove([filePath]);
  if (error) {
    console.warn("Temporary file cleanup failed:", error);
  }
}

function buildJobParsePayload(file, provider, modelName, promptVersion, parseData) {
  const parsed = parseData?.parsed_output || {};

  return {
    parse_id: makeId("llmjob"),
    source_file_name: file.name,
    source_pdf_url: null,
    provider,
    model_name: modelName,
    prompt_version: promptVersion,
    raw_extracted_text: parseData?.raw_extracted_text || null,
    parsed_output: parsed,

    primary_role: normalizeSingle(parsed.primary_role),
    normalized_roles: normalizeParsedArray(parsed.normalized_roles),
    skills: normalizeParsedArray(parsed.skills),
    languages: normalizeParsedArray(parsed.languages),
    education: normalizeParsedArray(parsed.education),
    industries: normalizeParsedArray(parsed.industries),
    locations: normalizeParsedArray(parsed.locations),
    years_experience_required: safeNumber(parsed.years_experience_required),
    seniority: normalizeSingle(parsed.seniority),
    employment_type: normalizeSingle(parsed.employment_type),

    parse_status: "completed",
    notes: null
  };
}

function buildCvParsePayload(file, provider, modelName, promptVersion, candidateRef, testMode, parseData) {
  const parsed = parseData?.parse_payload || parseData || {};

  return {
    parse_id: makeId("llmcv"),
    candidate_ref: candidateRef || null,
    source_file_name: file.name,
    source_pdf_url: null,
    provider,
    model_name: modelName,
    prompt_version: promptVersion,
    parse_status: "completed",
    test_mode: testMode,

    parsed_output: parsed,

    language: normalizeSingle(parsed.language),
    normalized_role: normalizeSingle(parsed.normalized_role),
    normalized_roles: normalizeParsedArray(parsed.normalized_roles),
    role_experience: Array.isArray(parsed.role_experience) ? parsed.role_experience : [],
    danish_keywords: normalizeParsedArray(parsed.danish_keywords),
    english_keywords: normalizeParsedArray(parsed.english_keywords),
    adjacent_roles: normalizeParsedArray(parsed.adjacent_roles),
    skills: normalizeParsedArray(parsed.skills),
    industries: normalizeParsedArray(parsed.industries),
    education: normalizeParsedArray(parsed.education),
    languages: normalizeParsedArray(parsed.languages),
    locations: normalizeParsedArray(parsed.location || parsed.locations),
    years_experience: safeNumber(parsed.years_experience),
    seniority: normalizeSingle(parsed.seniority),
    summary: parsed.summary ? String(parsed.summary).trim() : null,
    jobindex_query: parsed.jobindex_query ? String(parsed.jobindex_query).trim() : null,

    redacted_text_preview: parseData?.ocr_text_preview || null,
    redacted_text_length: safeNumber(parseData?.ocr_text_length),
    pages_processed: safeNumber(parseData?.pages_processed),

    notes: null
  };
}

function getModelsToRun(mode) {
  if (mode === "all") return ["mistral", "llama", "gemma"];
  return [mode];
}

function appendStatusLine(el, text) {
  if (!el) return;
  el.textContent += `${el.textContent ? "\n" : ""}${text}`;
}

async function wireBatchJobParserRun(file, modelsToRun, promptVersion, token, statusEl, previewEl) {
  let tempFilePath = null;
  let successCount = 0;

  try {
    appendStatusLine(statusEl, `Uploading ${file.name}...`);
    const uploadData = await uploadTempPdfAndGetSignedUrl(file, "job-pdfs-temp");
    tempFilePath = uploadData.filePath;

    for (const modelKey of modelsToRun) {
      const config = MODEL_CONFIGS[modelKey];
      appendStatusLine(statusEl, `→ ${file.name} with ${modelKey}`);

      try {
        const response = await fetch(`${SUPABASE_FUNCTIONS_BASE}/parse-job-pdf`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            pdf_url: uploadData.signedUrl,
            provider: config.provider,
            model_name: config.model,
            prompt_version: promptVersion
          })
        });

        const parseData = await response.json();

        if (!response.ok) {
          console.error("parse-job-pdf failed:", parseData);
          appendStatusLine(statusEl, `❌ ${modelKey} failed for ${file.name}`);
          continue;
        }

        const parsed = parseData?.parsed_output || {};
        previewEl.textContent = JSON.stringify(parsed, null, 2);

        const payload = buildJobParsePayload(
          file,
          config.provider,
          config.model,
          promptVersion,
          parseData
        );

        const { error: saveError } = await supabase
          .from("llm_job_parses")
          .insert([payload]);

        if (saveError) {
          console.error("Job parse save error:", saveError);
          appendStatusLine(statusEl, `⚠️ save failed for ${modelKey} / ${file.name}`);
          continue;
        }

        appendStatusLine(statusEl, `✅ saved ${modelKey} / ${file.name}`);
        successCount += 1;

        await new Promise((r) => setTimeout(r, 1200));
      } catch (err) {
        console.error(`Job parse error for ${modelKey}`, err);
        appendStatusLine(statusEl, `❌ error for ${modelKey} / ${file.name}`);
      }
    }
  } finally {
    await deleteTempFile(tempFilePath);
  }

  return successCount;
}

async function wireBatchCvParserRun(file, modelsToRun, promptVersion, candidateRef, testMode, token, statusEl, previewEl) {
  let tempFilePath = null;
  let successCount = 0;

  try {
    appendStatusLine(statusEl, `Uploading ${file.name}...`);
    const uploadData = await uploadTempPdfAndGetSignedUrl(file, "cv-pdfs-temp");
    tempFilePath = uploadData.filePath;

    for (const modelKey of modelsToRun) {
      const config = MODEL_CONFIGS[modelKey];
      appendStatusLine(statusEl, `→ ${file.name} with ${modelKey}`);

      try {
        const response = await fetch(`${SUPABASE_FUNCTIONS_BASE}/parse-cv-pdf-admin`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            pdf_url: uploadData.signedUrl,
            provider: config.provider,
            model_name: config.model,
            prompt_version: promptVersion,
            test_mode: testMode
          })
        });

        const parseData = await response.json();

        if (!response.ok) {
          console.error("parse-cv-pdf-admin failed:", parseData);
          appendStatusLine(statusEl, `❌ ${modelKey} failed for ${file.name}`);
          continue;
        }

        previewEl.textContent = JSON.stringify(parseData?.parse_payload || parseData, null, 2);

        const payload = buildCvParsePayload(
          file,
          config.provider,
          config.model,
          promptVersion,
          candidateRef,
          testMode,
          parseData
        );

        const { error: saveError } = await supabase
          .from("llm_cv_parses")
          .insert([payload]);

        if (saveError) {
          console.error("CV parse save error:", saveError);
          appendStatusLine(statusEl, `⚠️ save failed for ${modelKey} / ${file.name}`);
          continue;
        }

        appendStatusLine(statusEl, `✅ saved ${modelKey} / ${file.name}`);
        successCount += 1;

        await new Promise((r) => setTimeout(r, 1200));
      } catch (err) {
        console.error(`CV parse error for ${modelKey}`, err);
        appendStatusLine(statusEl, `❌ error for ${modelKey} / ${file.name}`);
      }
    }
  } finally {
    await deleteTempFile(tempFilePath);
  }

  return successCount;
}

function wireParserForm() {
  const parseBtn = document.getElementById("parseJobPdfBtn");
  const statusEl = document.getElementById("parserStatus");
  const previewEl = document.getElementById("parserPreview");
  const fileInput = document.getElementById("jobPdfFile");
  const modeEl = document.getElementById("parser_mode");
  const promptEl = document.getElementById("parser_prompt_version");

  if (!parseBtn || !statusEl || !previewEl || !fileInput || !modeEl || !promptEl) return;

  parseBtn.addEventListener("click", async () => {
    statusEl.textContent = "";
    previewEl.textContent = "";

    try {
      const files = Array.from(fileInput.files || []);
      if (!files.length) throw new Error("Please select at least one Job PDF.");

      const mode = modeEl.value;
      const promptVersion = promptEl.value.trim() || "v1";
      const modelsToRun = getModelsToRun(mode);
      const token = await getSessionToken();

      let totalSuccess = 0;

      appendStatusLine(statusEl, `Starting batch job parsing for ${files.length} file(s)...`);

      for (const file of files) {
        totalSuccess += await wireBatchJobParserRun(
          file,
          modelsToRun,
          promptVersion,
          token,
          statusEl,
          previewEl
        );
      }

      appendStatusLine(statusEl, `🎉 Batch complete. Saved ${totalSuccess} row(s).`);
    } catch (err) {
      console.error("Batch job parser error:", err);
      statusEl.textContent = `Error: ${err.message || err}`;
    }
  });
}

function wireCvParserForm() {
  const parseBtn = document.getElementById("parseCvPdfBtn");
  const statusEl = document.getElementById("cvParserStatus");
  const previewEl = document.getElementById("cvParserPreview");
  const fileInput = document.getElementById("cvPdfFile");
  const modeEl = document.getElementById("cv_parser_mode");
  const promptEl = document.getElementById("cv_parser_prompt_version");
  const candidateRefEl = document.getElementById("cv_parser_candidate_ref");
  const testModeEl = document.getElementById("cv_parser_test_mode");

  if (!parseBtn || !statusEl || !previewEl || !fileInput || !modeEl || !promptEl || !candidateRefEl || !testModeEl) return;

  parseBtn.addEventListener("click", async () => {
    statusEl.textContent = "";
    previewEl.textContent = "";

    try {
      const files = Array.from(fileInput.files || []);
      if (!files.length) throw new Error("Please select at least one CV PDF.");

      const mode = modeEl.value;
      const promptVersion = promptEl.value.trim() || "cv_admin_v1";
      const candidateRef = candidateRefEl.value.trim() || null;
      const testMode = testModeEl.value === "true";
      const modelsToRun = getModelsToRun(mode);
      const token = await getSessionToken();

      let totalSuccess = 0;

      appendStatusLine(statusEl, `Starting batch CV parsing for ${files.length} file(s)...`);

      for (const file of files) {
        totalSuccess += await wireBatchCvParserRun(
          file,
          modelsToRun,
          promptVersion,
          candidateRef,
          testMode,
          token,
          statusEl,
          previewEl
        );
      }

      appendStatusLine(statusEl, `🎉 Batch complete. Saved ${totalSuccess} row(s).`);
    } catch (err) {
      console.error("Batch CV parser error:", err);
      statusEl.textContent = `Error: ${err.message || err}`;
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
  wireCvParserForm();
  wireJobForm();
  wireParserForm();
}

initAdmin();
