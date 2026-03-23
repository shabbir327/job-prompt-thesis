import { supabase } from "./supabaseClient.js";

const tabs = document.querySelectorAll(".tab-btn[data-tab]");
const panels = document.querySelectorAll(".panel");

tabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabs.forEach((b) => b.classList.remove("active"));
    panels.forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "./admin-login.html";
});

async function protectAdminPage() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "./admin-login.html";
    return;
  }
}
await protectAdminPage();

function toArray(value) {
  return value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function safeNumber(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseJsonOrNull(value) {
  if (!value.trim()) return null;
  return JSON.parse(value);
}

// -----------------------------
// SAVE CV ANNOTATION
// -----------------------------
document.getElementById("saveCvBtn").addEventListener("click", async () => {
  const statusEl = document.getElementById("cvStatus");
  statusEl.textContent = "Saving...";

  try {
    const payload = {
      annotation_id: makeId("cva"),
      cv_id: document.getElementById("cv_id").value.trim(),
      source_ref: document.getElementById("cv_source_ref").value.trim() || null,
      raw_text: document.getElementById("cv_raw_text").value.trim() || null,

      primary_role: document.getElementById("cv_primary_role").value.trim().toLowerCase() || null,
      normalized_roles: toArray(document.getElementById("cv_normalized_roles").value),
      skills: toArray(document.getElementById("cv_skills").value),
      languages: toArray(document.getElementById("cv_languages").value),
      education: toArray(document.getElementById("cv_education").value),
      industries: toArray(document.getElementById("cv_industries").value),
      locations: toArray(document.getElementById("cv_locations").value),

      years_experience_total: safeNumber(document.getElementById("cv_years_experience_total").value),
      seniority: document.getElementById("cv_seniority").value || null,
      role_experience: parseJsonOrNull(document.getElementById("cv_role_experience").value),

      annotation_notes: document.getElementById("cv_annotation_notes").value.trim() || null,
      ambiguity_flag: document.getElementById("cv_ambiguity_flag").value === "true"
    };

    if (!payload.cv_id) throw new Error("CV ID is required.");

    const { error } = await supabase
      .from("cv_annotations")
      .insert([payload])
      .select("annotation_id");

    if (error) throw error;

    statusEl.textContent = "CV annotation saved successfully.";
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  }
});

// -----------------------------
// SAVE JOB ANNOTATION
// -----------------------------
document.getElementById("saveJobBtn").addEventListener("click", async () => {
  const statusEl = document.getElementById("jobStatus");
  statusEl.textContent = "Saving...";

  try {
    const payload = {
      annotation_id: makeId("joba"),
      job_id: document.getElementById("job_id").value.trim() || null,
      job_url: document.getElementById("job_url").value.trim() || null,

      raw_job_title: document.getElementById("job_title").value.trim() || null,
      raw_job_text: document.getElementById("job_raw_text").value.trim() || null,
      company_name: document.getElementById("job_company_name").value.trim() || null,
      country: document.getElementById("job_country").value.trim().toLowerCase() || null,
      locations: toArray(document.getElementById("job_locations").value),

      primary_role: document.getElementById("job_primary_role").value.trim().toLowerCase() || null,
      normalized_roles: toArray(document.getElementById("job_normalized_roles").value),
      skills: toArray(document.getElementById("job_skills").value),
      languages: toArray(document.getElementById("job_languages").value),
      education: toArray(document.getElementById("job_education").value),
      industries: toArray(document.getElementById("job_industries").value),

      years_experience_required: safeNumber(document.getElementById("job_years_experience_required").value),
      seniority: document.getElementById("job_seniority").value || null,
      employment_type: document.getElementById("job_employment_type").value.trim() || null,

      annotation_notes: document.getElementById("job_annotation_notes").value.trim() || null,
      ambiguity_flag: document.getElementById("job_ambiguity_flag").value === "true"
    };

    const { error } = await supabase
      .from("job_annotations")
      .insert([payload])
      .select("annotation_id");

    if (error) throw error;

    statusEl.textContent = "Job annotation saved successfully.";
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  }
});

// -----------------------------
// PARSE JOB PDF
// -----------------------------
document.getElementById("parseJobPdfBtn").addEventListener("click", async () => {
  const statusEl = document.getElementById("parserStatus");
  const previewEl = document.getElementById("parserPreview");
  const fileInput = document.getElementById("jobPdfFile");

  statusEl.textContent = "Parsing...";
  previewEl.textContent = "";

  try {
    const file = fileInput.files?.[0];
    if (!file) throw new Error("Please select a PDF.");

    const modelName = document.getElementById("parser_model_name").value.trim() || "mistral";
    const promptVersion = document.getElementById("parser_prompt_version").value.trim() || "v1";

    const fileExt = file.name.split(".").pop();
    const filePath = `job-pdfs/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("admin-documents")
      .upload(filePath, file, { upsert: false });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from("admin-documents")
      .getPublicUrl(filePath);

    const source_pdf_url = publicUrlData.publicUrl;

    const { data: parseData, error: parseError } = await supabase.functions.invoke("parse-job-pdf", {
      body: {
        pdf_url: source_pdf_url,
        model_name: modelName,
        prompt_version: promptVersion
      }
    });

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

      primary_role: parsed.primary_role || null,
      normalized_roles: parsed.normalized_roles || [],
      skills: parsed.skills || [],
      languages: parsed.languages || [],
      education: parsed.education || [],
      industries: parsed.industries || [],
      locations: parsed.locations || [],
      years_experience_required: safeNumber(parsed.years_experience_required),
      seniority: parsed.seniority || null,
      employment_type: parsed.employment_type || null,

      parse_status: "completed",
      notes: null
    };

    const { error: saveError } = await supabase
      .from("llm_job_parses")
      .insert([payload])
      .select("parse_id");

    if (saveError) throw saveError;

    statusEl.textContent = "Job PDF parsed and saved successfully.";
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  }
});