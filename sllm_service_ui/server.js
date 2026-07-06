const http = require("node:http");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { buildKgContext, injectKgContext, summarizeKgForClient } = require("./kg_context_builder");
const { buildGraph } = require("./kg_graph_builder");

const ENV_FILE = path.join(__dirname, ".env");
const FILE_ENV = parseEnvFile(ENV_FILE);
const PROJECT_ROOT = path.resolve(__dirname, "..");

function resolveAppPath(value) {
  if (!value) {
    return "";
  }
  return path.isAbsolute(value) ? value : path.resolve(__dirname, value);
}

function resolveProjectPath(value) {
  if (!value) {
    return "";
  }
  return path.isAbsolute(value) ? value : path.resolve(PROJECT_ROOT, value);
}

const HOST = process.env.HOST || FILE_ENV.HOST || "127.0.0.1";
const START_PORT = Number(process.env.PORT || FILE_ENV.PORT || 8787);
const MODEL = process.env.OLLAMA_MODEL || FILE_ENV.OLLAMA_MODEL || "gemma4:e4b";
const QWEN_14_MODEL = process.env.QWEN_14_MODEL || FILE_ENV.QWEN_14_MODEL || "qwen3:14b";
const ALLOWED_MODELS = Array.from(new Set([MODEL, QWEN_14_MODEL]));
const OLLAMA_URL = (process.env.OLLAMA_URL || FILE_ENV.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const HF_MODEL_ID = process.env.HF_MODEL_ID || FILE_ENV.HF_MODEL_ID || "google/gemma-4-E4B-it";
const HF_MODEL_VALUE = process.env.HF_MODEL_VALUE || FILE_ENV.HF_MODEL_VALUE || `hf:${HF_MODEL_ID}`;
const HF_FT_MODEL_VALUE = process.env.HF_FT_MODEL_VALUE || FILE_ENV.HF_FT_MODEL_VALUE || "hf:gemma-4-E4B-it_ft_v1";
const HF_FT_DISPLAY_NAME = process.env.HF_FT_DISPLAY_NAME || FILE_ENV.HF_FT_DISPLAY_NAME || "gemma-4-E4B-it";
const HF_FT_ADAPTER_DIR =
  resolveAppPath(process.env.HF_FT_ADAPTER_DIR || FILE_ENV.HF_FT_ADAPTER_DIR || "");
const HF_FT2_MODEL_VALUE =
  process.env.HF_FT2_MODEL_VALUE || FILE_ENV.HF_FT2_MODEL_VALUE || "hf:gemma-4-E4B-it_ft_v2";
const HF_FT2_DISPLAY_NAME =
  process.env.HF_FT2_DISPLAY_NAME || FILE_ENV.HF_FT2_DISPLAY_NAME || "gemma-4-E4B-it";
const HF_FT2_ADAPTER_DIR =
  resolveAppPath(process.env.HF_FT2_ADAPTER_DIR || FILE_ENV.HF_FT2_ADAPTER_DIR || "");
const HF_FT3_MODEL_VALUE =
  process.env.HF_FT3_MODEL_VALUE || FILE_ENV.HF_FT3_MODEL_VALUE || "hf:gemma-4-E4B-it_ft_v3";
const HF_FT3_DISPLAY_NAME =
  process.env.HF_FT3_DISPLAY_NAME || FILE_ENV.HF_FT3_DISPLAY_NAME || "gemma4:E4B";
const HF_FT3_ADAPTER_DIR =
  resolveAppPath(process.env.HF_FT3_ADAPTER_DIR || FILE_ENV.HF_FT3_ADAPTER_DIR || "../model/adapter");
const HF_BACKEND_URL = (process.env.HF_BACKEND_URL || FILE_ENV.HF_BACKEND_URL || "http://127.0.0.1:8896").replace(/\/$/, "");
const HF_BACKEND_SCRIPT =
  resolveAppPath(
    process.env.HF_BACKEND_SCRIPT ||
      FILE_ENV.HF_BACKEND_SCRIPT ||
      path.join("server_handoff_20260501", "app", "hf_transformers_server.py"),
  );
const HF_ENABLED_VALUE = String(process.env.HF_ENABLED || FILE_ENV.HF_ENABLED || "1").toLowerCase();
const HF_ENABLED = !["0", "false", "no", "off"].includes(HF_ENABLED_VALUE);
const HF_AUTOSTART_VALUE = String(process.env.HF_AUTOSTART || FILE_ENV.HF_AUTOSTART || "1").toLowerCase();
const HF_AUTOSTART = !["0", "false", "no", "off"].includes(HF_AUTOSTART_VALUE);
const HF_PYTHON_EXE = process.env.HF_PYTHON_EXE || FILE_ENV.HF_PYTHON_EXE || "python";
const OPENAI_DEFAULT_MODEL = process.env.OPENAI_MODEL || FILE_ENV.OPENAI_MODEL || "gpt-4.1-mini";
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT_FILE = path.join(__dirname, "local-llm-chat.port");
const STRICT_PORT = process.env.STRICT_PORT === "1";
const KG_ARCHITECTURE_EDITS_FILE = path.join(__dirname, "kg", "kg_architecture_edits_v1.json");
const TASK_PI_EDGES_FILE = path.join(__dirname, "kg", "task_pi_edges_v2.json");
const REPORT_PDF_SCRIPT =
  resolveAppPath(process.env.REPORT_PDF_SCRIPT || FILE_ENV.REPORT_PDF_SCRIPT || path.join("tools", "report_pdf.py"));
const REPORT_PDF_PYTHON =
  process.env.REPORT_PDF_PYTHON ||
  FILE_ENV.REPORT_PDF_PYTHON ||
  "python";
const REPORT_PDF_FONT =
  resolveAppPath(
    process.env.REPORT_PDF_FONT ||
      process.env.PDF_FONT_PATH ||
      FILE_ENV.REPORT_PDF_FONT ||
      FILE_ENV.PDF_FONT_PATH ||
      path.join("assets", "fonts", "NanumGothic-Regular.ttf"),
  );
const VST_PI_SUMMARY_FILE =
  resolveAppPath(process.env.VST_PI_SUMMARY_FILE || FILE_ENV.VST_PI_SUMMARY_FILE || "");
const VST_PI_SUMMARY_CSV_FILE =
  resolveAppPath(process.env.VST_PI_SUMMARY_CSV_FILE || FILE_ENV.VST_PI_SUMMARY_CSV_FILE || "");
const CLIENT_DEMOGRAPHICS_FILE =
  process.env.CLIENT_DEMOGRAPHICS_FILE || FILE_ENV.CLIENT_DEMOGRAPHICS_FILE
    ? resolveAppPath(process.env.CLIENT_DEMOGRAPHICS_FILE || FILE_ENV.CLIENT_DEMOGRAPHICS_FILE)
    : resolveProjectPath("data_preprocessing/clients_metadata.csv");
const HOSPITAL_DATA_REAL_DIR =
  process.env.HOSPITAL_DATA_REAL_DIR || FILE_ENV.HOSPITAL_DATA_REAL_DIR
    ? resolveAppPath(process.env.HOSPITAL_DATA_REAL_DIR || FILE_ENV.HOSPITAL_DATA_REAL_DIR)
    : resolveProjectPath("pdss_data");
const PROTOTYPE_SUMMARY_ROOT =
  process.env.PROTOTYPE_SUMMARY_ROOT || FILE_ENV.PROTOTYPE_SUMMARY_ROOT
    ? resolveAppPath(process.env.PROTOTYPE_SUMMARY_ROOT || FILE_ENV.PROTOTYPE_SUMMARY_ROOT)
    : resolveProjectPath("data_preprocessing/summary");
const VST_FEATURE_ORDER = [
  "et_first_fixation_duration_mean",
  "et_fixation_duration_mean",
  "et_fixation_duration_std",
  "et_fixation_dispersion_mean",
];
const PROTOTYPE_TASK_CONFIGS = {
  vst: {
    key: "vst",
    kgTask: "VST",
    displayName: "VST",
    domain: "선택주의력",
    taskTypeLabel: "시각 탐색 과제",
    summaryFile: path.join(PROTOTYPE_SUMMARY_ROOT, "vst", "vst_summary.json"),
  },
  flanker: {
    key: "flanker",
    kgTask: "Flanker",
    displayName: "Flanker",
    domain: "간섭통제",
    taskTypeLabel: "간섭 통제 과제",
    summaryFile: path.join(PROTOTYPE_SUMMARY_ROOT, "flanker", "flanker_summary.json"),
  },
  gng: {
    key: "gng",
    kgTask: "GNG",
    displayName: "GNG",
    domain: "반응억제",
    taskTypeLabel: "반응억제 과제",
    summaryFile: path.join(PROTOTYPE_SUMMARY_ROOT, "gng", "gng_summary.json"),
  },
};
const REPORT_RESULT_TASK_PRIORITY = ["vst", "flanker", "gng", "ast", "dnb"];
const REPORT_STUDENT_INFO_KEYS = [
  "registrationNo",
  "name",
  "gender",
  "age",
  "education",
  "birthDate",
  "physician",
  "evaluationDate",
];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

function parseEnvFile(filePath) {
  try {
    const env = {};
    const text = fsSync.readFileSync(filePath, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const equalsIndex = line.indexOf("=");
      if (equalsIndex === -1) {
        continue;
      }

      const key = line.slice(0, equalsIndex).trim();
      let value = line.slice(equalsIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
    return env;
  } catch {
    return {};
  }
}

function getRuntimeConfig() {
  const fileEnv = parseEnvFile(ENV_FILE);
  const openaiApiKey = fileEnv.OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
  const openaiModel = fileEnv.OPENAI_MODEL || process.env.OPENAI_MODEL || OPENAI_DEFAULT_MODEL;
  const openaiBaseUrl =
    fileEnv.OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

  return {
    openaiApiKey,
    openaiModel,
    openaiBaseUrl: openaiBaseUrl.replace(/\/$/, ""),
    openaiModelValue: `openai:${openaiModel}`,
    openaiConfigured: Boolean(openaiApiKey),
    hfEnabled: HF_ENABLED,
    hfModelId: HF_MODEL_ID,
    hfModelValue: HF_MODEL_VALUE,
    hfFtModelValue: HF_FT_MODEL_VALUE,
    hfFtDisplayName: HF_FT_DISPLAY_NAME,
    hfFtAdapterDir: HF_FT_ADAPTER_DIR,
    hfFtConfigured: Boolean(HF_FT_ADAPTER_DIR && fsSync.existsSync(HF_FT_ADAPTER_DIR)),
    hfFt2ModelValue: HF_FT2_MODEL_VALUE,
    hfFt2DisplayName: HF_FT2_DISPLAY_NAME,
    hfFt2AdapterDir: HF_FT2_ADAPTER_DIR,
    hfFt2Configured: Boolean(HF_FT2_ADAPTER_DIR && fsSync.existsSync(HF_FT2_ADAPTER_DIR)),
    hfFt3ModelValue: HF_FT3_MODEL_VALUE,
    hfFt3DisplayName: HF_FT3_DISPLAY_NAME,
    hfFt3AdapterDir: HF_FT3_ADAPTER_DIR,
    hfFt3Configured: Boolean(HF_FT3_ADAPTER_DIR && fsSync.existsSync(HF_FT3_ADAPTER_DIR)),
    hfBackendUrl: HF_BACKEND_URL,
  };
}

function isOpenAiModelValue(model) {
  return typeof model === "string" && model.startsWith("openai:");
}

function isHfModelValue(model) {
  return typeof model === "string" && model.startsWith("hf:");
}

function getDisplayName(model, runtimeConfig = getRuntimeConfig()) {
  if (model === MODEL) {
    return `Ollama:${MODEL}`;
  }
  if (model === QWEN_14_MODEL) {
    return `Ollama:${QWEN_14_MODEL}`;
  }
  if (model === runtimeConfig.hfModelValue) {
    return "Vanilla:gemma-4-E4B-it";
  }
  if (model === runtimeConfig.hfFtModelValue) {
    return `FT_v1:${runtimeConfig.hfFtDisplayName}`;
  }
  if (model === runtimeConfig.hfFt2ModelValue) {
    return `FT_v2:${runtimeConfig.hfFt2DisplayName}`;
  }
  if (model === runtimeConfig.hfFt3ModelValue) {
    return runtimeConfig.hfFt3DisplayName;
  }
  return model;
}

function getAllowedModels(runtimeConfig = getRuntimeConfig()) {
  const models = [...ALLOWED_MODELS];
  if (runtimeConfig.hfEnabled) {
    models.push(runtimeConfig.hfModelValue);
    if (runtimeConfig.hfFtConfigured) {
      models.push(runtimeConfig.hfFtModelValue);
    }
    if (runtimeConfig.hfFt2Configured) {
      models.push(runtimeConfig.hfFt2ModelValue);
    }
    if (runtimeConfig.hfFt3Configured) {
      models.push(runtimeConfig.hfFt3ModelValue);
    }
  }
  if (runtimeConfig.openaiConfigured) {
    models.push(runtimeConfig.openaiModelValue);
  }
  return Array.from(new Set(models));
}

function getKgEnabledModels(runtimeConfig = getRuntimeConfig()) {
  return Array.from(
    new Set([
      MODEL,
      runtimeConfig.hfModelValue,
      runtimeConfig.hfFtModelValue,
      runtimeConfig.hfFt2ModelValue,
      runtimeConfig.hfFt3ModelValue,
      runtimeConfig.openaiModelValue,
    ].filter(Boolean)),
  );
}

function shouldApplyKgForModel(model, runtimeConfig = getRuntimeConfig(), payloadKgEnabled = true) {
  return payloadKgEnabled !== false && getKgEnabledModels(runtimeConfig).includes(model);
}

function getHfAdapterConfig(modelValue, runtimeConfig = getRuntimeConfig()) {
  if (modelValue === runtimeConfig.hfFtModelValue && runtimeConfig.hfFtConfigured) {
    return {
      adapterDir: runtimeConfig.hfFtAdapterDir,
      adapterName: "ft_v1",
    };
  }
  if (modelValue === runtimeConfig.hfFt2ModelValue && runtimeConfig.hfFt2Configured) {
    return {
      adapterDir: runtimeConfig.hfFt2AdapterDir,
      adapterName: "ft_v2",
    };
  }
  if (modelValue === runtimeConfig.hfFt3ModelValue && runtimeConfig.hfFt3Configured) {
    return {
      adapterDir: runtimeConfig.hfFt3AdapterDir,
      adapterName: "sllm_prototype",
    };
  }
  return null;
}

let hfBackendProcess = null;

function maybeStartHfBackend() {
  if (!HF_ENABLED || !HF_AUTOSTART || hfBackendProcess || !fsSync.existsSync(HF_BACKEND_SCRIPT)) {
    return;
  }

  const stdoutPath = path.join(__dirname, "hf.backend.stdout.log");
  const stderrPath = path.join(__dirname, "hf.backend.stderr.log");
  const stdout = fsSync.openSync(stdoutPath, "a");
  const stderr = fsSync.openSync(stderrPath, "a");

  hfBackendProcess = spawn(HF_PYTHON_EXE, [HF_BACKEND_SCRIPT], {
    cwd: __dirname,
    env: {
      ...process.env,
      HF_MODEL_ID,
      HF_PORT: new URL(HF_BACKEND_URL).port || "8896",
      HF_DEVICE_MAP: process.env.HF_DEVICE_MAP || FILE_ENV.HF_DEVICE_MAP || "none",
      HF_DEVICE: process.env.HF_DEVICE || FILE_ENV.HF_DEVICE || "cuda:0",
      HF_DTYPE: process.env.HF_DTYPE || FILE_ENV.HF_DTYPE || "bfloat16",
      HF_LOAD_IN_4BIT: process.env.HF_LOAD_IN_4BIT || FILE_ENV.HF_LOAD_IN_4BIT || "0",
      HF_MAX_NEW_TOKENS: process.env.HF_MAX_NEW_TOKENS || FILE_ENV.HF_MAX_NEW_TOKENS || "131072",
      HF_HUB_DISABLE_XET: process.env.HF_HUB_DISABLE_XET || FILE_ENV.HF_HUB_DISABLE_XET || "1",
      CUDA_VISIBLE_DEVICES:
        process.env.HF_CUDA_VISIBLE_DEVICES ||
        FILE_ENV.HF_CUDA_VISIBLE_DEVICES ||
        process.env.CUDA_VISIBLE_DEVICES ||
        "0",
    },
    windowsHide: true,
    stdio: ["ignore", stdout, stderr],
  });

  hfBackendProcess.on("exit", (code, signal) => {
    fsSync.appendFileSync(
      stderrPath,
      `[${new Date().toISOString()}] HF backend exited code=${code} signal=${signal}\n`,
    );
    hfBackendProcess = null;
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function sendPdf(res, filename, data) {
  const safeFilename = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  res.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${safeFilename}"`,
    "Content-Length": data.length,
    "Cache-Control": "no-store",
  });
  res.end(data);
}

function notFound(res) {
  sendJson(res, 404, { error: "not_found" });
}

async function readJson(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      throw new Error("request_body_too_large");
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function cleanReportField(value, limit) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).replace(/\0/g, "").slice(0, limit).trim();
}

function cleanReportMap(value, allowedKeys, limit = 120) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const clean = {};
  for (const key of allowedKeys) {
    clean[key] = cleanReportField(value[key], limit);
  }
  return clean;
}

function cleanReportMetrics(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, 4).map((item) =>
    cleanReportMap(item, ["task", "label", "value", "unit", "band", "performanceLabel"], 120),
  );
}

function hasReportMetricValues(value) {
  return (
    Array.isArray(value) &&
    value.some((item) => item && typeof item === "object" && String(item.value ?? "").trim())
  );
}

let cachedVstPiSummary = null;
let cachedVstResultMetricCohort = null;
let cachedTaskPiEdges = null;
let cachedClientDemographics = null;
const cachedPrototypeSummaries = new Map();
const STUDENT_USER_NAME_RE = /\bCNU\s*[-_ ]?\s*S\s*[-_ ]?(\d{1,3})\b/i;
const DISPLAY_STUDENT_ID_MAP = new Map([["CNU-S027", "대상자 ID_001"]]);

function normalizeStudentUserName(value) {
  const text = String(value || "");
  const match = STUDENT_USER_NAME_RE.exec(text);
  if (match) {
    return `CNU-S${match[1].padStart(3, "0")}`;
  }
  return "";
}

function displayStudentUserName(userName) {
  const normalized = String(userName || "").trim().toUpperCase();
  return DISPLAY_STUDENT_ID_MAP.get(normalized) || String(userName || "").trim();
}

function detectStudentUserNameFromMessages(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "user") {
      continue;
    }
    const userName = normalizeStudentUserName(message.content);
    if (userName) {
      return userName;
    }
  }
  return "";
}

function loadVstPiSummary() {
  const stat = fsSync.statSync(VST_PI_SUMMARY_FILE);
  if (cachedVstPiSummary && cachedVstPiSummary.mtimeMs === stat.mtimeMs) {
    return cachedVstPiSummary;
  }

  const parsed = JSON.parse(fsSync.readFileSync(VST_PI_SUMMARY_FILE, "utf8"));
  const students = Array.isArray(parsed.students) ? parsed.students : [];
  const byUserName = new Map();

  for (const student of students) {
    const userName = String(student?.user_name || "").trim().toUpperCase();
    if (userName) {
      byUserName.set(userName, student);
    }
  }

  cachedVstPiSummary = {
    mtimeMs: stat.mtimeMs,
    cohortSize: Number.isFinite(parsed.cohort_size) ? parsed.cohort_size : students.length,
    byUserName,
  };
  return cachedVstPiSummary;
}

function loadTaskPiEdges() {
  try {
    const stat = fsSync.statSync(TASK_PI_EDGES_FILE);
    if (cachedTaskPiEdges && cachedTaskPiEdges.mtimeMs === stat.mtimeMs) {
      return cachedTaskPiEdges.data;
    }

    const data = JSON.parse(fsSync.readFileSync(TASK_PI_EDGES_FILE, "utf8"));
    cachedTaskPiEdges = { mtimeMs: stat.mtimeMs, data };
    return data;
  } catch (error) {
    console.warn(`[kg] failed to load ${TASK_PI_EDGES_FILE}: ${error.message}`);
    return null;
  }
}

function getTaskDefinitionFromKg(taskName) {
  const kg = loadTaskPiEdges();
  const task = kg?.tasks?.[taskName];
  if (!task || typeof task !== "object") {
    return "";
  }
  return String(task.task_description_ko || task.task_description || "").trim();
}

function normalizePrototypeSubjectId(value) {
  const match = /(?:대상자\s*)?ID\s*[_-]?\s*(\d{1,3})\b/i.exec(String(value || ""));
  if (!match) {
    return "";
  }
  return `ID_${match[1].padStart(3, "0")}`;
}

function prototypeSubjectUserName(subjectId) {
  const match = /^ID_(\d{3})$/i.exec(String(subjectId || "").trim());
  if (!match) {
    return "";
  }
  return `CNU-S${match[1]}`;
}

function detectPrototypeTaskKey(text) {
  const source = String(text || "");
  if (/(선택\s*주의력|선택주의|VST|시각\s*탐색)/i.test(source)) {
    return "vst";
  }
  if (/(간섭\s*통제|간섭통제|Flanker|플랭커)/i.test(source)) {
    return "flanker";
  }
  if (/(반응\s*억제|반응억제|GNG|Go\s*[-/]?\s*No\s*[-/]?\s*Go)/i.test(source)) {
    return "gng";
  }
  return "";
}

function looksLikePrototypeAnalysisRequest(text) {
  const source = String(text || "");
  return /(분석|해석|평가|보고서|양상|알려줘|작성|확인)/i.test(source);
}

function hasUnsupportedPrototypeDomain(text) {
  const source = String(text || "");
  if (detectPrototypeTaskKey(source)) {
    return false;
  }
  return /(작업\s*기억|지속\s*주의|처리\s*속도|인지\s*유연성|실행\s*기능|AST|DNB|CPT|우울|불안)/i.test(source);
}

function latestPrototypeRequest(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "user") {
      continue;
    }
    const subjectId = normalizePrototypeSubjectId(message.content);
    if (subjectId) {
      return {
        subjectId,
        taskKey: detectPrototypeTaskKey(message.content),
        text: message.content || "",
      };
    }
  }
  return { subjectId: "", taskKey: "", text: "" };
}

function loadPrototypeSummary(taskKey) {
  const config = PROTOTYPE_TASK_CONFIGS[taskKey];
  if (!config) {
    return null;
  }
  try {
    const stat = fsSync.statSync(config.summaryFile);
    const cached = cachedPrototypeSummaries.get(taskKey);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.data;
    }
    const data = JSON.parse(fsSync.readFileSync(config.summaryFile, "utf8"));
    cachedPrototypeSummaries.set(taskKey, { mtimeMs: stat.mtimeMs, data });
    return data;
  } catch (error) {
    console.warn(`[prototype] failed to load ${config.summaryFile}: ${error.message}`);
    return null;
  }
}

function lookupPrototypeSubject(taskKey, subjectId) {
  const config = PROTOTYPE_TASK_CONFIGS[taskKey];
  const summary = loadPrototypeSummary(taskKey);
  const userName = prototypeSubjectUserName(subjectId);
  if (!config) {
    return { status: "no_task", subjectId, taskKey };
  }
  if (!subjectId || !userName) {
    return { status: "no_id", taskKey };
  }
  if (!summary || !Array.isArray(summary.students)) {
    return { status: "error", subjectId, userName, taskKey };
  }
  const student = summary.students.find(
    (item) => normalizeStudentUserName(item?.user_name).toUpperCase() === userName,
  );
  if (!student) {
    return { status: "not_found", subjectId, userName, taskKey, cohortSize: summary.students.length };
  }
  return {
    status: "found",
    subjectId,
    userName,
    taskKey,
    config,
    summary,
    student,
    taskData: student[taskKey] || {},
    cohortSize: Number.isFinite(summary.cohort_size) ? summary.cohort_size : summary.students.length,
  };
}

function lookupVstStudent(userName) {
  if (!userName) {
    return { status: "no_id" };
  }

  try {
    const summary = loadVstPiSummary();
    const student = summary.byUserName.get(userName.toUpperCase());
    if (!student) {
      return { status: "not_found", userName, cohortSize: summary.cohortSize };
    }
    return { status: "found", userName, student, cohortSize: summary.cohortSize };
  } catch (error) {
    console.warn(`[vst] failed to load ${VST_PI_SUMMARY_FILE}: ${error.message}`);
    return { status: "error", userName, detail: error.message };
  }
}



function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current);
  return cells;
}

function parseNumericMetric(value) {
  const number = Number(String(value ?? "").trim());
  return Number.isFinite(number) ? number : null;
}

function loadVstResultMetricCohort() {
  try {
    const stat = fsSync.statSync(VST_PI_SUMMARY_CSV_FILE);
    if (cachedVstResultMetricCohort && cachedVstResultMetricCohort.mtimeMs === stat.mtimeMs) {
      return cachedVstResultMetricCohort;
    }

    const text = fsSync.readFileSync(VST_PI_SUMMARY_CSV_FILE, "utf8");
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    const headers = lines.length
      ? parseCsvLine(lines[0]).map((header) => header.replace(/^\uFEFF/, "").trim())
      : [];
    const byUserName = new Map();
    const metricValues = {
      "누락오류": [],
      "오경보오류": [],
      "반응시간 평균": [],
      "반응시간 표준편차": [],
    };

    for (const line of lines.slice(1)) {
      const values = parseCsvLine(line);
      const record = {};
      headers.forEach((header, index) => {
        record[header] = String(values[index] ?? "").trim();
      });

      const userName = normalizeStudentUserName(record.user_name);
      if (userName) {
        byUserName.set(userName.toUpperCase(), record);
      }

      for (const label of Object.keys(metricValues)) {
        const numericValue = parseNumericMetric(record[label]);
        if (numericValue !== null) {
          metricValues[label].push(numericValue);
        }
      }
    }

    cachedVstResultMetricCohort = { mtimeMs: stat.mtimeMs, byUserName, metricValues };
    return cachedVstResultMetricCohort;
  } catch (error) {
    console.warn(`[vst] failed to load ${VST_PI_SUMMARY_CSV_FILE}: ${error.message}`);
    return { mtimeMs: 0, byUserName: new Map(), metricValues: {} };
  }
}

function performanceRankLabelLowerIsBetter(value, cohortValues) {
  const numericValue = parseNumericMetric(value);
  const values = Array.isArray(cohortValues)
    ? cohortValues.filter((item) => Number.isFinite(item)).sort((a, b) => a - b)
    : [];
  if (numericValue === null || values.length === 0) {
    return "";
  }

  let betterCount = 0;
  for (const cohortValue of values) {
    if (cohortValue < numericValue) {
      betterCount += 1;
    }
  }

  const bestRankFromBest = betterCount + 1;
  const topPercent = Math.min(100, Math.max(1, Math.round((bestRankFromBest / values.length) * 100)));
  if (topPercent <= 50) {
    return `상위 ${topPercent}%`;
  }

  const bottomPercent = Math.min(
    100,
    Math.max(1, Math.round(((values.length - bestRankFromBest + 1) / values.length) * 100)),
  );
  return `하위 ${bottomPercent}%`;
}

function loadClientDemographics() {
  try {
    const stat = fsSync.statSync(CLIENT_DEMOGRAPHICS_FILE);
    if (cachedClientDemographics && cachedClientDemographics.mtimeMs === stat.mtimeMs) {
      return cachedClientDemographics;
    }

    const text = fsSync.readFileSync(CLIENT_DEMOGRAPHICS_FILE, "utf8");
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    const headers = lines.length
      ? parseCsvLine(lines[0]).map((header) => header.replace(/^\uFEFF/, "").trim())
      : [];
    const byUserName = new Map();

    for (const line of lines.slice(1)) {
      const values = parseCsvLine(line);
      const record = {};
      headers.forEach((header, index) => {
        record[header] = String(values[index] ?? "").trim();
      });
      const userName = normalizeStudentUserName(record.user_name);
      if (userName) {
        byUserName.set(userName.toUpperCase(), record);
      }
    }

    cachedClientDemographics = { mtimeMs: stat.mtimeMs, byUserName };
    return cachedClientDemographics;
  } catch (error) {
    console.warn(`[hospital] failed to load ${CLIENT_DEMOGRAPHICS_FILE}: ${error.message}`);
    return { mtimeMs: 0, byUserName: new Map() };
  }
}

function lookupClientDemographics(userName) {
  if (!userName) {
    return { status: "no_id" };
  }

  const demographics = loadClientDemographics();
  const student = demographics.byUserName.get(userName.toUpperCase());
  if (!student) {
    return { status: "not_found", userName };
  }
  return { status: "found", userName, student };
}

function toHospitalDateFolder(value) {
  const text = String(value || "").trim();
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (match) {
    return `${match[1]}${match[2].padStart(2, "0")}${match[3].padStart(2, "0")}`;
  }

  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  if (match) {
    return `${match[3]}${match[1].padStart(2, "0")}${match[2].padStart(2, "0")}`;
  }

  return "";
}

function safeReadDirNames(dirPath) {
  try {
    return fsSync
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (_error) {
    return [];
  }
}

function candidateHospitalClientDirs(student) {
  const clientId = String(student?.client_id || "").trim();
  if (!clientId) {
    return [];
  }

  const dirs = [];
  const seen = new Set();
  const addDate = (dateName) => {
    if (!dateName || seen.has(dateName)) {
      return;
    }
    seen.add(dateName);
    const clientDir = path.join(HOSPITAL_DATA_REAL_DIR, dateName, clientId);
    if (fsSync.existsSync(clientDir)) {
      dirs.push({ dateName, clientDir });
    }
  };

  addDate(toHospitalDateFolder(student.session_date));
  for (const dateName of safeReadDirNames(HOSPITAL_DATA_REAL_DIR).sort().reverse()) {
    addDate(dateName);
  }
  return dirs;
}

function newestResultJsonInDir(resultDir) {
  const candidates = [];
  for (const resultId of safeReadDirNames(resultDir)) {
    const filePath = path.join(resultDir, resultId, "result.json");
    try {
      const stat = fsSync.statSync(filePath);
      if (stat.isFile()) {
        candidates.push({ filePath, mtimeMs: stat.mtimeMs });
      }
    } catch (_error) {
      // Ignore incomplete result folders.
    }
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs || a.filePath.localeCompare(b.filePath));
  return candidates[0]?.filePath || "";
}

function findHospitalResultJson(student) {
  for (const { dateName, clientDir } of candidateHospitalClientDirs(student)) {
    for (const taskName of REPORT_RESULT_TASK_PRIORITY) {
      const resultFile = newestResultJsonInDir(path.join(clientDir, taskName, "result"));
      if (resultFile) {
        return {
          dateName,
          taskName,
          resultFile,
          clientId: String(student?.client_id || "").trim(),
        };
      }
    }
  }
  return null;
}

function formatHospitalMetricValue(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return String(value).trim();
  }
  if (Number.isInteger(number)) {
    return String(number);
  }
  return number.toFixed(2).replace(/\.?0+$/, "");
}

function formatReportTaskName(taskName) {
  return String(taskName || "").trim().toUpperCase();
}

function buildHospitalReportMetrics(meta, taskName = "", userName = "") {
  const source = meta && typeof meta === "object" ? meta : {};
  const task = formatReportTaskName(taskName);
  const cohort = loadVstResultMetricCohort();
  const csvRecord = userName ? cohort.byUserName.get(userName.toUpperCase()) || {} : {};
  const definitions = [
    { label: "누락오류", metaKey: "numOmissionErrors", unit: "" },
    { label: "오경보오류", metaKey: "numCommissionErrors", unit: "" },
    { label: "반응시간 평균", metaKey: "meanResponseTime", unit: "ms" },
    { label: "반응시간 표준편차", metaKey: "stdResponseTime", unit: "ms" },
  ];

  return definitions.map((definition) => {
    const rawValue =
      source[definition.metaKey] !== null && source[definition.metaKey] !== undefined && source[definition.metaKey] !== ""
        ? source[definition.metaKey]
        : csvRecord[definition.label];
    return {
      task,
      label: definition.label,
      value: formatHospitalMetricValue(rawValue),
      unit: definition.unit,
      band: "",
      performanceLabel: performanceRankLabelLowerIsBetter(rawValue, cohort.metricValues[definition.label]),
    };
  });
}

function buildHospitalStudentInfo(student) {
  return {
    registrationNo: displayStudentUserName(student?.user_name),
    name: String(student?.Initial || "").trim(),
    gender: String(student?.sex || "").trim(),
    age: student?.age_years ? `${student.age_years}` : "",
    education: "",
    birthDate: "",
    physician: "",
    evaluationDate: String(student?.session_date || "").trim(),
  };
}

function formatPrototypeNumber(value, fractionDigits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return String(value ?? "").trim();
  }
  if (Number.isInteger(number)) {
    return String(number);
  }
  return number.toFixed(fractionDigits).replace(/\.?0+$/, "");
}

function prototypeMetricUnit(label) {
  if (/오류/.test(String(label || ""))) {
    return "개";
  }
  if (/반응시간/.test(String(label || ""))) {
    return "ms";
  }
  return "";
}

function formatPrototypeMetricValue(label, value) {
  const valueText = formatPrototypeNumber(value, 2);
  const unit = prototypeMetricUnit(label);
  return valueText ? `${valueText}${unit}` : "제공되지 않음";
}

function prototypePerformanceEntries(taskData) {
  const performance = taskData?.performance && typeof taskData.performance === "object" ? taskData.performance : {};
  return ["누락오류", "오경보오류", "반응시간 평균", "반응시간 표준편차"].map((label) => ({
    label,
    value: performance[label]?.value ?? "",
    percentile: String(performance[label]?.performance_percentile || "").trim(),
  }));
}

function prototypeFeatureOrder(summary, taskData) {
  const fromSummary = summary?.features && typeof summary.features === "object" ? Object.keys(summary.features) : [];
  const fromStudent = taskData?.features && typeof taskData.features === "object" ? Object.keys(taskData.features) : [];
  return fromSummary.length ? fromSummary : fromStudent;
}

function prototypeFeatureEntries(summary, taskData) {
  const features = taskData?.features && typeof taskData.features === "object" ? taskData.features : {};
  return prototypeFeatureOrder(summary, taskData).map((featureName) => {
    const feature = features[featureName] || {};
    const valueText = formatPrototypeNumber(feature.value, 3);
    const unit = String(feature.unit || "").trim();
    return {
      name: featureName,
      sourcePi: String(feature.source_pi_name || featureName).trim(),
      value: valueText ? `${valueText}${unit ? unit === "count/sec" ? "회/s" : ` ${unit}` : ""}` : "제공되지 않음",
      position: String(feature.position_label_ko || "").trim(),
      percentileRank: feature.percentile_rank ?? "",
      percentileBand: String(feature.percentile_band || "").trim(),
      validWindow: feature.valid_window_count ?? "",
      missingWindow: feature.missing_window_count ?? "",
    };
  });
}

const PROTOTYPE_SECTION5_TEMPLATES = {
  vst: {
    taskName: "VST",
    domain: "선택주의력",
    criterion: "DSM-5 Criterion A1",
    criterionDomain: "부주의 증상군",
    checkItems:
      "세부사항을 놓치거나 부주의한 실수를 하는 양상, 다른 사람이 말할 때 경청하지 않는 것처럼 보이는 양상, 외부 자극에 쉽게 산만해지는 양상",
  },
  flanker: {
    taskName: "Flanker",
    domain: "간섭통제",
    criterion: "DSM-5 Criterion A1",
    criterionDomain: "부주의 증상군",
    checkItems: "외부 자극에 쉽게 산만해지는 양상",
  },
  gng: {
    taskName: "GNG",
    domain: "반응억제",
    criterion: "DSM-5 Criterion A2",
    criterionDomain: "과잉행동-충동성 증상군",
    checkItems: "질문이 끝나기 전에 대답하는 양상, 차례를 기다리기 어려워하는 양상, 타인을 방해하거나 끼어드는 양상",
  },
};

function prototypeMetricNumericValue(taskData, label) {
  const performance = taskData?.performance && typeof taskData.performance === "object" ? taskData.performance : {};
  return parseNumericMetric(performance[label]?.value);
}

function formatPrototypeCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "0";
  }
  return String(Math.max(0, Math.round(number)));
}

function normalizedPercentileBand(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/범위/g, "");
}

function featureBandDirection(feature) {
  const label = String(feature?.position_label_ko || "");
  const band = normalizedPercentileBand(feature?.percentile_band || "");
  if (label.includes("상위") || band === "p75-p90" || band.includes("p90")) {
    return "high";
  }
  if (label.includes("하위") || band === "p10-p25" || band.includes("p10미만") || band.includes("p10")) {
    return "low";
  }
  return "";
}

function taskPiPolarityMap(taskName) {
  const kg = loadTaskPiEdges();
  const task = kg?.tasks?.[taskName];
  const map = new Map();
  if (!task || typeof task !== "object") {
    return map;
  }

  const edges = [...(task.edges || []), ...(task.conditional_edges || []), ...(task.guardrail_edges || [])];
  for (const edge of edges) {
    if (!edge?.pi) {
      continue;
    }
    map.set(
      String(edge.pi),
      edge.polarity || (edge.direction === "low" ? "difficulty_when_low" : "difficulty_when_high"),
    );
  }
  return map;
}

function prototypeFeaturesIndicateDifficulty(lookupResult) {
  if (lookupResult?.status !== "found") {
    return false;
  }

  const polarityByPi = taskPiPolarityMap(lookupResult.config?.kgTask);
  const features =
    lookupResult.taskData?.features && typeof lookupResult.taskData.features === "object"
      ? lookupResult.taskData.features
      : {};

  for (const [featureName, feature] of Object.entries(features)) {
    const sourcePi = String(feature?.source_pi_name || featureName);
    const polarity = polarityByPi.get(featureName) || polarityByPi.get(sourcePi) || "difficulty_when_high";
    const bandDirection = featureBandDirection(feature);
    if (polarity === "difficulty_when_low" && bandDirection === "low") {
      return true;
    }
    if (polarity !== "difficulty_when_low" && bandDirection === "high") {
      return true;
    }
  }

  return false;
}

function buildFixedPrototypeSection5Text(lookupResult) {
  if (lookupResult?.status !== "found") {
    return "";
  }

  const template = PROTOTYPE_SECTION5_TEMPLATES[lookupResult.config?.key];
  if (!template) {
    return "";
  }

  const omission = prototypeMetricNumericValue(lookupResult.taskData, "누락오류") ?? 0;
  const commission = prototypeMetricNumericValue(lookupResult.taskData, "오경보오류") ?? 0;
  const omissionText = formatPrototypeCount(omission);
  const commissionText = formatPrototypeCount(commission);
  const hasPerformanceDifficulty = omission > 0 || commission > 0;
  const hasFeatureDifficulty = prototypeFeaturesIndicateDifficulty(lookupResult);

  let firstSentence;
  let bridgeLead;
  if (hasPerformanceDifficulty) {
    firstSentence = `${template.taskName} 검사 결과 지표에서 누락오류 ${omissionText}개, 오경보오류 ${commissionText}개로 나타나 ${template.domain}의 저하 가능성이 시사된다.`;
    bridgeLead = "이에 따라";
  } else if (hasFeatureDifficulty) {
    firstSentence = `${template.taskName} 검사 결과 지표에서 누락오류 0개, 오경보오류 0개로 ${template.domain} 저하를 직접 시사하는 바는 관찰되지 않았으나, 연관 Primitive Indicator와 관련하여 ${template.domain}의 저하 가능성이 시사된다.`;
    bridgeLead = "이에 따라";
  } else {
    firstSentence = `${template.taskName} 검사 결과 지표에서 누락오류 0개, 오경보오류 0개로 ${template.domain} 저하를 직접 시사하는 바는 관찰되지 않았다.`;
    bridgeLead = "그러나";
  }

  return [
    `${firstSentence} ${bridgeLead} ${template.criterion}의 ${template.criterionDomain}과 관련하여 ${template.checkItems}을 확인할 필요가 있다.`,
    "아울러 이러한 양상이 6개월 이상 지속되었는지, 12세 이전에 발현되었는지, 2개 이상의 환경에서 일관되게 나타나는지, 사회적·학업적·직업적 기능 또는 일상생활 수행에 어려움을 초래하는지를 함께 평가해야 한다. 또한 해당 양상이 다른 정신질환, 발달적 요인, 의학적 상태 또는 물질의 영향으로 더 잘 설명되지 않는지도 종합적으로 검토해야 한다.",
  ].join("\n");
}

function buildPrototypeStudentInfo(lookupResult) {
  const demographics = lookupResult.student?.demographics || {};
  return {
    registrationNo: lookupResult.subjectId,
    name: String(demographics.Initial || "").trim(),
    gender: String(demographics.sex || "").trim(),
    age: demographics.age_years ? `${demographics.age_years}` : "",
    education: "",
    birthDate: "",
    physician: "",
    evaluationDate: String(demographics.session_date || "").trim(),
  };
}

function buildPrototypeReportMetrics(lookupResult) {
  if (lookupResult.status !== "found") {
    return [];
  }
  const taskName = lookupResult.config.displayName;
  return prototypePerformanceEntries(lookupResult.taskData).map((entry) => ({
    task: taskName,
    label: entry.label,
    value: formatPrototypeNumber(entry.value, 2),
    unit: prototypeMetricUnit(entry.label) === "ms" ? "ms" : "",
    band: "",
    performanceLabel: entry.percentile,
  }));
}

function buildPrototypeStructuredReportDataBlock(lookupResult) {
  const { subjectId, config, summary, taskData } = lookupResult;
  const taskDefinition = getTaskDefinitionFromKg(config.kgTask);
  const displaySubjectId = subjectId ? `대상자 ${subjectId}` : "대상자";
  const fixedSection5Text = buildFixedPrototypeSection5Text(lookupResult);
  const taskTypeLabel = config.taskTypeLabel || "시각 탐색 과제";
  const overviewSentence =
    `본 보고서는 ${displaySubjectId} 학생이 ${config.displayName}에서 보인 ${taskTypeLabel} 수행 관련 지표를 기반으로 하며, ` +
    `${config.domain}과(와) 관련된 시각 처리 양상을 해석합니다.`;
  const lines = [
    "[SERVER_STRUCTURED_REPORT_DATA]",
    "아래 값은 서버가 prototype summary 데이터에서 조회한 구조화 원자료입니다. 답변은 이 블록의 값을 우선 사용하고, 없는 값은 추정하지 마세요.",
    `report_subject_id=${displaySubjectId}`,
    `overview_sentence=${overviewSentence}`,
    `task=${config.displayName}`,
    `task_key=${config.key}`,
    `clinical_domain=${config.domain}`,
    `task_definition=${taskDefinition || "제공되지 않음"}`,
    "performance_metrics:",
  ];

  for (const entry of prototypePerformanceEntries(taskData)) {
    lines.push(
      `- metric=${entry.label}; value=${formatPrototypeMetricValue(entry.label, entry.value)}; performance_percentile=${entry.percentile || "제공되지 않음"}`,
    );
  }

  lines.push("primitive_indicators:");
  for (const feature of prototypeFeatureEntries(summary, taskData)) {
    const extra = [
      feature.percentileRank !== "" ? `percentile_rank=${feature.percentileRank}` : "",
      feature.percentileBand ? `percentile_band=${feature.percentileBand}` : "",
      feature.validWindow !== "" ? `valid_window=${feature.validWindow}` : "",
      feature.missingWindow !== "" ? `missing_window=${feature.missingWindow}` : "",
    ].filter(Boolean);
    lines.push(
      `- pi=${feature.name}; source_pi=${feature.sourcePi}; value=${feature.value}; interpretation_label=${feature.position || "제공되지 않음"}${extra.length ? `; ${extra.join("; ")}` : ""}`,
    );
  }

  lines.push("answer_format:");
  lines.push("- [1. 개요]에는 overview_sentence를 그대로 1문장으로 사용하세요.");
  lines.push(`- 답변 본문에서 대상자를 지칭할 때는 "${displaySubjectId}" 표기를 사용하세요.`);
  lines.push("- [2. 보고서의 근거가 되는 Task]는 '■ Task명 : {task}'와 '- 정의 : {task_definition}' 구조로 작성하세요.");
  lines.push("- [3. 검사 결과 지표 및 연관 Primitive Indicator]는 '- 검사 결과 지표 :'와 '- 연관 Primitive Indicator :'를 분리하고, 위 performance_metrics와 primitive_indicators를 bullet로 그대로 반영하세요.");
  lines.push("- [4. 센서 데이터 해석 및 임상적 시사점]은 해당 task의 KG 용어와 위 PI 값을 연결해 해석하세요. [4]에서는 누락오류, 오경보오류, 반응시간 평균, 반응시간 표준편차를 언급하지 마세요.");
  if (fixedSection5Text) {
    lines.push(
      "- [5. DSM-5 진단 기준 확인 사항]은 아래 fixed_section5_text를 문구 그대로 사용하세요. Criterion 번호, 증상군, 확인 항목을 바꾸거나 다른 DSM-5 항목으로 대체하지 마세요.",
    );
    lines.push("fixed_section5_text:");
    lines.push("[5. DSM-5 진단 기준 확인 사항]");
    for (const line of fixedSection5Text.split("\n")) {
      lines.push(line);
    }
  } else {
    lines.push("- [5. DSM-5 진단 기준 확인 사항]은 진단 단정 없이 추가 확인 사항으로만 작성하세요.");
  }
  lines.push("[/SERVER_STRUCTURED_REPORT_DATA]");
  return lines.join("\n");
}

function buildPrototypePromptBlock(lookupResult) {
  if (lookupResult.status === "no_task") {
    return [
      "[서버 prototype 데이터 조회 안내]",
      `${lookupResult.subjectId || "대상자"} ID는 감지되었지만 분석 키워드를 찾지 못했습니다.`,
      "선택주의력(VST), 간섭통제(Flanker), 반응억제(GNG) 중 어떤 양상을 분석할지 확인하세요.",
    ].join("\n");
  }
  if (lookupResult.status === "no_id") {
    return [
      "[서버 prototype 데이터 조회 안내]",
      "대상자 ID(ID_###)가 감지되지 않아 prototype summary 데이터를 자동 조회하지 못했습니다.",
      "사용자에게 실제 사용 가능한 대상자 ID를 ID_### 형식으로 다시 입력하도록 안내하세요.",
    ].join("\n");
  }
  if (lookupResult.status === "not_found") {
    return [
      "[서버 prototype 데이터 조회 안내]",
      `${lookupResult.subjectId}${lookupResult.userName ? ` (= ${lookupResult.userName})` : ""}에 해당하는 대상자 데이터는 현재 ${lookupResult.cohortSize || 48}명 prototype summary에 없습니다.`,
      "해당 대상자에 대한 분석을 진행하지 말고, 실제 사용 가능한 ID를 다시 입력하도록 안내하세요.",
    ].join("\n");
  }
  if (lookupResult.status !== "found") {
    return [
      "[서버 prototype 데이터 조회 안내]",
      `${lookupResult.subjectId || "대상자"}의 prototype summary 데이터를 읽는 중 오류가 발생했습니다.`,
      "자동 조회값을 사용할 수 없으므로 데이터 확인을 요청하세요.",
    ].join("\n");
  }

  const lines = [
    `[서버 조회 ${lookupResult.config.displayName} prototype summary]`,
    `표시 대상자 ID: 대상자 ${lookupResult.subjectId}`,
    `내부 조회 ID: ${lookupResult.userName}`,
    `대상 코호트: ${lookupResult.config.displayName} summary ${lookupResult.cohortSize || 48}명`,
    `분석 영역: ${lookupResult.config.domain}`,
    buildPrototypeStructuredReportDataBlock(lookupResult),
  ];
  return lines.join("\n");
}

function prototypeLookupBlockingMessage(messages) {
  const text = latestUserMessageText(messages);
  if (!looksLikePrototypeAnalysisRequest(text)) {
    return "";
  }

  const subjectId = normalizePrototypeSubjectId(text);
  const taskKey = detectPrototypeTaskKey(text);
  if (!subjectId) {
    return "대상자 ID가 감지되지 않았습니다. '대상자 ID_005의 선택주의력 양상을 분석해줘.'와 같이 ID_### 형식으로 다시 입력해주세요.";
  }
  if (!taskKey) {
    if (hasUnsupportedPrototypeDomain(text)) {
      return "현재 지원되는 분석 영역은 선택주의력, 간섭통제, 반응억제입니다. 세 영역 중 하나를 포함해 다시 입력해주세요.";
    }
    return "분석할 주의 기능 영역이 감지되지 않았습니다. 선택주의력, 간섭통제, 반응억제 중 하나를 포함해 다시 입력해주세요. 예: 대상자 ID_005의 반응억제 양상을 분석해줘.";
  }

  const lookupResult = lookupPrototypeSubject(taskKey, subjectId);
  if (lookupResult.status === "not_found") {
    return `대상자 ${subjectId}에 해당하는 데이터가 현재 분석 대상 48명 목록에 없습니다. 사용 가능한 대상자 ID로 다시 입력해주세요.`;
  }
  if (lookupResult.status === "error") {
    return `대상자 ${subjectId}의 데이터를 조회하는 중 오류가 발생했습니다. 데이터 파일 또는 서버 상태를 확인한 뒤 다시 시도해주세요.`;
  }
  return "";
}

function streamDirectAssistantMessage(res, { model, content, reportable = false }) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`event: meta\ndata: ${JSON.stringify({ model })}\n\n`);
  res.write(`data: ${JSON.stringify({ content })}\n\n`);
  res.write(`event: done\ndata: ${JSON.stringify({ done: true, tokenStats: null, reportable })}\n\n`);
  res.end();
}

function buildPrototypeReportDataFromText(text) {
  const subjectId = normalizePrototypeSubjectId(text);
  const taskKey = detectPrototypeTaskKey(text);
  if (!subjectId || !taskKey) {
    return { studentInfo: null, resultMetrics: [] };
  }
  const lookupResult = lookupPrototypeSubject(taskKey, subjectId);
  if (lookupResult.status !== "found") {
    return { studentInfo: null, resultMetrics: [] };
  }
  return {
    studentInfo: buildPrototypeStudentInfo(lookupResult),
    resultMetrics: buildPrototypeReportMetrics(lookupResult),
  };
}

function buildHospitalReportDataFromText(text) {
  const userName = normalizeStudentUserName(text);
  if (!userName) {
    return { studentInfo: null, resultMetrics: [] };
  }

  const lookupResult = lookupClientDemographics(userName);
  if (lookupResult.status !== "found") {
    return { studentInfo: null, resultMetrics: [] };
  }

  const resultLocation = findHospitalResultJson(lookupResult.student);
  if (!resultLocation) {
    console.warn(`[hospital] result.json not found for ${userName}`);
    return {
      studentInfo: buildHospitalStudentInfo(lookupResult.student),
      resultMetrics: buildHospitalReportMetrics({}, "vst", userName),
    };
  }

  try {
    const result = JSON.parse(fsSync.readFileSync(resultLocation.resultFile, "utf8"));
    return {
      studentInfo: buildHospitalStudentInfo(lookupResult.student),
      resultMetrics: buildHospitalReportMetrics(result.meta, resultLocation.taskName, userName),
    };
  } catch (error) {
    console.warn(`[hospital] failed to read ${resultLocation.resultFile}: ${error.message}`);
    return {
      studentInfo: buildHospitalStudentInfo(lookupResult.student),
      resultMetrics: buildHospitalReportMetrics({}, resultLocation.taskName, userName),
    };
  }
}

function latestUserMessageText(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return messages[index].content || "";
    }
  }
  return "";
}

function looksLikeVstAnalysisRequest(text) {
  const source = String(text || "");
  const hasAnalysisIntent = /(분석|해석|평가|보고서|양상|알려줘)/i.test(source);
  const hasAttentionCue = /(주의\s*집중|VST|시선|고정|fixation|eye[-\s]?tracking)/i.test(source);
  return hasAnalysisIntent && hasAttentionCue;
}

function formatVstNumber(value, fractionDigits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "";
  }
  return number.toFixed(fractionDigits);
}

function formatVstBand(band) {
  const text = String(band || "").trim();
  if (!text) {
    return "";
  }
  if (/범위|이상|미만|이하/.test(text)) {
    return text;
  }
  return `${text} 범위`;
}

function getVstFeature(student, featureName) {
  const features = student?.vst?.features;
  if (!features || typeof features !== "object") {
    return null;
  }
  return features[featureName] || null;
}

function formatVstFeaturePromptLine(student, featureName) {
  const feature = getVstFeature(student, featureName);
  if (!feature) {
    return `- ${featureName}: 값 없음.`;
  }

  const valueText = formatVstNumber(feature.value);
  const unit = String(feature.unit || "").trim();
  const band = formatVstBand(feature.percentile_band);
  const position = String(feature.position_label_ko || "").trim();
  const bandText = [band, position].filter(Boolean).join(", ") || "위치 정보 없음";
  const windowCount = Number.isFinite(student?.vst?.window_count) ? student.vst.window_count : 60;
  const validCount = Number.isFinite(feature.valid_window_count) ? feature.valid_window_count : "";
  const missingCount = Number.isFinite(feature.missing_window_count) ? feature.missing_window_count : "";
  const windowText =
    validCount !== "" || missingCount !== ""
      ? ` (valid window ${validCount || 0}/${windowCount}, missing ${missingCount || 0})`
      : "";

  if (!valueText) {
    return `- ${featureName}: 값 없음, ${bandText}${windowText}.`;
  }
  return `- ${featureName}: ${valueText}${unit ? ` ${unit}` : ""}로 ${bandText}이었다${windowText}.`;
}


function formatStructuredVstFeatureLine(student, featureName) {
  const feature = getVstFeature(student, featureName);
  const valueText = formatVstNumber(feature?.value);
  const unit = String(feature?.unit || "").trim();
  const position = String(feature?.position_label_ko || "").trim();
  const sourcePiName = String(feature?.source_pi_name || featureName).trim();
  const validCount = Number.isFinite(feature?.valid_window_count) ? feature.valid_window_count : "";
  const missingCount = Number.isFinite(feature?.missing_window_count) ? feature.missing_window_count : "";
  const valueWithUnit = valueText ? `${valueText}${unit ? ` ${unit}` : ""}` : "제공되지 않음";
  const interpretationLabel = position || "제공되지 않음";
  const windowText =
    validCount !== "" || missingCount !== ""
      ? `; valid_window=${validCount || 0}; missing_window=${missingCount || 0}`
      : "";

  return `- pi=${featureName}; source_pi=${sourcePiName}; value=${valueWithUnit}; interpretation_label=${interpretationLabel}${windowText}`;
}

function buildStructuredVstReportDataBlock(student, displayUserName = "") {
  const taskDefinition = getTaskDefinitionFromKg("VST");
  const reportSubjectId = displayUserName || displayStudentUserName(student?.user_name) || "대상자";
  const lines = [
    "[SERVER_STRUCTURED_REPORT_DATA]",
    "아래 값은 서버가 학생 데이터에서 조회한 구조화 원자료입니다. [2]와 [3] 섹션 작성 시 이 블록의 task, pi, value, interpretation_label을 우선 사용하세요.",
    `report_subject_id=${reportSubjectId}`,
    `overview_sentence=본 보고서는 ${reportSubjectId} 학생이 VST에서 보인 시각 탐색 과제 수행 관련 지표를 기반으로 하며, 선택주의력과 관련된 시각 처리 양상을 해석합니다.`,
    "task=VST",
    `task_definition=${taskDefinition || "제공되지 않음"}`,
    "collected_data:",
  ];

  for (const featureName of VST_FEATURE_ORDER) {
    lines.push(formatStructuredVstFeatureLine(student, featureName));
  }

  lines.push("[/SERVER_STRUCTURED_REPORT_DATA]");
  return lines.join("\n");
}

function buildVstPromptBlock(lookupResult) {
  if (lookupResult.status === "no_id") {
    return [
      "[서버 VST 데이터 조회 안내]",
      "학생 ID(CNU-S###)가 감지되지 않아 서버에서 VST PI 값을 자동 조회하지 못했습니다.",
      "사용자가 4개 PI 값을 직접 제공했다면 그 값을 사용하고, 값이 없다면 CNU-S### 형식의 학생 ID를 요청하세요.",
    ].join("\n");
  }

  if (lookupResult.status === "not_found") {
    return [
      "[서버 VST 데이터 조회 안내]",
      `${lookupResult.userName}는 현재 vst_pi_50_summary.json에 포함된 ${lookupResult.cohortSize || 50}명 대상자에서 찾을 수 없습니다.`,
      "사용자에게 지원 가능한 CNU-S### 학생 ID인지 확인해 달라고 안내하세요.",
    ].join("\n");
  }

  if (lookupResult.status === "error") {
    return [
      "[서버 VST 데이터 조회 안내]",
      `${lookupResult.userName || "학생"}의 VST PI 요약 파일을 읽는 중 오류가 발생했습니다.`,
      "자동 조회값을 사용할 수 없으므로, 사용자가 직접 제공한 PI 값이 없다면 데이터 확인을 요청하세요.",
    ].join("\n");
  }

  const student = lookupResult.student;
  const displayUserName = displayStudentUserName(lookupResult.userName);
  const demographics = student.demographics || {};
  const lines = [
    "[서버 조회 VST PI 요약]",
    `표시 대상자 ID: ${displayUserName}`,
    `대상 코호트: VST eye-tracking 유효 파일이 있는 ${lookupResult.cohortSize || 50}명`,
    "계산 기준: 각 PI는 vst의 60개 window 중 숫자값이 있는 window만 평균낸 값입니다.",
  ];

  if (demographics.sex || demographics.age_years || demographics.session_date) {
    lines.push(
      `학생 정보: 성별 ${demographics.sex || "미상"}, 나이 ${demographics.age_years || "미상"}, 평가일 ${demographics.session_date || "미상"}`,
    );
  }

  lines.push("VST에서는");
  for (const featureName of VST_FEATURE_ORDER) {
    lines.push(formatVstFeaturePromptLine(student, featureName));
  }
  lines.push(
    "답변 지시: 위 서버 조회값을 사용자가 직접 입력한 VST PI 값처럼 우선 반영하고, feature명은 et_fixation_dispersion_mean처럼 보고서 표기명을 사용하세요.",
  );
  lines.push(
    `대상자 표기는 반드시 "${displayUserName}"만 사용하고, 내부 조회용 ID는 답변 본문과 PDF용 응답에 쓰지 마세요.`,
  );
  lines.push("");
  lines.push(buildStructuredVstReportDataBlock(student, displayUserName));
  return lines.join("\n");
}

function appendBlockToLatestUserMessage(messages, block) {
  const nextMessages = messages.map((message) => ({ ...message }));
  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    if (nextMessages[index].role === "user") {
      nextMessages[index].content = `${nextMessages[index].content}\n\n${block}`;
      break;
    }
  }
  return nextMessages;
}

function injectVstStudentContext(messages) {
  const userName = detectStudentUserNameFromMessages(messages);
  if (userName) {
    return appendBlockToLatestUserMessage(messages, buildVstPromptBlock(lookupVstStudent(userName)));
  }

  const latestText = latestUserMessageText(messages);
  if (looksLikeVstAnalysisRequest(latestText)) {
    return appendBlockToLatestUserMessage(messages, buildVstPromptBlock({ status: "no_id" }));
  }

  return messages;
}

function injectStudentDataContext(messages) {
  const prototypeRequest = latestPrototypeRequest(messages);
  if (prototypeRequest.subjectId) {
    if (!prototypeRequest.taskKey) {
      return appendBlockToLatestUserMessage(
        messages,
        buildPrototypePromptBlock({ status: "no_task", subjectId: prototypeRequest.subjectId }),
      );
    }
    return appendBlockToLatestUserMessage(
      messages,
      buildPrototypePromptBlock(lookupPrototypeSubject(prototypeRequest.taskKey, prototypeRequest.subjectId)),
    );
  }

  return injectVstStudentContext(messages);
}

function buildVstStudentInfo(student) {
  const demographics = student?.demographics || {};
  return {
    registrationNo: displayStudentUserName(student?.user_name),
    name: String(demographics.Initial || "").trim(),
    gender: String(demographics.sex || "").trim(),
    age: demographics.age_years ? `${demographics.age_years}` : "",
    education: "",
    birthDate: "",
    physician: "",
    evaluationDate: String(demographics.session_date || "").trim(),
  };
}

function buildVstReportMetrics(student) {
  return VST_FEATURE_ORDER.map((featureName) => {
    const feature = getVstFeature(student, featureName) || {};
    return {
      label: featureName,
      value: formatVstNumber(feature.value),
      unit: String(feature.unit || "").trim(),
      band: String(feature.position_label_ko || "").trim(),
    };
  });
}

function buildVstReportDataFromText(text) {
  const userName = normalizeStudentUserName(text);
  if (!userName) {
    return { studentInfo: null, resultMetrics: [] };
  }

  const lookupResult = lookupVstStudent(userName);
  if (lookupResult.status !== "found") {
    return { studentInfo: null, resultMetrics: [] };
  }

  return {
    studentInfo: buildVstStudentInfo(lookupResult.student),
    resultMetrics: buildVstReportMetrics(lookupResult.student),
  };
}

function mergeReportMapWithFallback(value, fallback, keys) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const fallbackSource = fallback && typeof fallback === "object" && !Array.isArray(fallback) ? fallback : {};
  const merged = {};
  for (const key of keys) {
    const rawValue = source[key];
    merged[key] =
      rawValue !== null && rawValue !== undefined && String(rawValue).trim()
        ? rawValue
        : fallbackSource[key] || "";
  }
  return merged;
}

function reportTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

function generateReportPdf(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(REPORT_PDF_PYTHON, [REPORT_PDF_SCRIPT], {
      cwd: __dirname,
      env: {
        ...process.env,
        PDF_FONT_PATH: process.env.PDF_FONT_PATH || FILE_ENV.PDF_FONT_PATH || REPORT_PDF_FONT,
      },
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdout = [];
    const stderr = [];
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      child.kill("SIGTERM");
      reject(new Error("pdf_generation_timeout"));
    }, 60000);

    child.stdout.on("data", (chunk) => {
      stdout.push(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr.push(chunk);
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);

      const output = Buffer.concat(stdout);
      if (code === 0 && output.length > 0) {
        resolve(output);
        return;
      }

      const detail = Buffer.concat(stderr).toString("utf8").trim();
      reject(new Error(detail || `pdf_generation_failed_${code}`));
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

async function createReportPdf(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { error: "invalid_json", detail: error.message });
    return;
  }

  const answer = cleanReportField(payload.answer, 120000);
  if (!answer) {
    sendJson(res, 400, { error: "answer_required" });
    return;
  }

  const title = cleanReportField(payload.title, 200) || "센서 데이터 기반 주의 집중력 분석 보고서";
  const reportLookupText = [payload.prompt, payload.answer, payload.studentInfo?.registrationNo]
    .filter(Boolean)
    .join("\n");
  const inferredPrototypeReportData = buildPrototypeReportDataFromText(reportLookupText);
  const inferredVstReportData = buildVstReportDataFromText(reportLookupText);
  const inferredHospitalReportData = buildHospitalReportDataFromText(reportLookupText);
  const reportStudentInfo = mergeReportMapWithFallback(
    payload.studentInfo,
    inferredPrototypeReportData.studentInfo || inferredHospitalReportData.studentInfo || inferredVstReportData.studentInfo,
    REPORT_STUDENT_INFO_KEYS,
  );
  const reportMetrics = hasReportMetricValues(payload.resultMetrics)
    ? payload.resultMetrics
    : inferredPrototypeReportData.resultMetrics.length
      ? inferredPrototypeReportData.resultMetrics
      : inferredHospitalReportData.resultMetrics;
  const reportPayload = {
    title,
    answer,
    prompt: cleanReportField(payload.prompt, 12000),
    model: cleanReportField(payload.model, 200),
    kgSummary: cleanReportField(payload.kgSummary, 500),
    generatedAt: cleanReportField(payload.generatedAt, 80) || new Date().toLocaleString("ko-KR", { hour12: false }),
    studentInfo: cleanReportMap(reportStudentInfo, REPORT_STUDENT_INFO_KEYS),
    resultMetrics: cleanReportMetrics(reportMetrics),
  };

  try {
    const pdf = await generateReportPdf(reportPayload);
    sendPdf(res, `attention-report-${reportTimestamp()}.pdf`, pdf);
  } catch (error) {
    sendJson(res, 500, { error: "pdf_generation_failed", detail: error.message });
  }
}

function blankKgArchitectureEdits() {
  return {
    version: "kg_architecture_edits_v1",
    updatedAt: null,
    nodeOverrides: {},
    edgeOverrides: {},
    customNodes: [],
    customEdges: [],
  };
}

async function readKgArchitectureEdits() {
  try {
    const text = await fs.readFile(KG_ARCHITECTURE_EDITS_FILE, "utf8");
    const parsed = JSON.parse(text);
    return {
      ...blankKgArchitectureEdits(),
      ...parsed,
      nodeOverrides: parsed && typeof parsed.nodeOverrides === "object" && parsed.nodeOverrides ? parsed.nodeOverrides : {},
      edgeOverrides: parsed && typeof parsed.edgeOverrides === "object" && parsed.edgeOverrides ? parsed.edgeOverrides : {},
      customNodes: Array.isArray(parsed?.customNodes) ? parsed.customNodes : [],
      customEdges: Array.isArray(parsed?.customEdges) ? parsed.customEdges : [],
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return blankKgArchitectureEdits();
    }
    throw error;
  }
}

function sanitizeKgArchitectureEdits(payload) {
  const safe = blankKgArchitectureEdits();
  const rawOverrides = payload && typeof payload.nodeOverrides === "object" && payload.nodeOverrides ? payload.nodeOverrides : {};
  for (const [id, value] of Object.entries(rawOverrides).slice(0, 300)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    safe.nodeOverrides[String(id).slice(0, 120)] = {
      x: Number.isFinite(value.x) ? value.x : undefined,
      y: Number.isFinite(value.y) ? value.y : undefined,
      w: Number.isFinite(value.w) ? value.w : undefined,
      h: Number.isFinite(value.h) ? value.h : undefined,
      label: typeof value.label === "string" ? value.label.slice(0, 180) : undefined,
      sublabel: typeof value.sublabel === "string" ? value.sublabel.slice(0, 240) : undefined,
      footnote: typeof value.footnote === "string" ? value.footnote.slice(0, 20) : undefined,
      highlight: typeof value.highlight === "boolean" ? value.highlight : undefined,
      details: value.details && typeof value.details === "object" ? value.details : undefined,
    };
  }

  const rawEdgeOverrides = payload && typeof payload.edgeOverrides === "object" && payload.edgeOverrides ? payload.edgeOverrides : {};
  for (const [id, value] of Object.entries(rawEdgeOverrides).slice(0, 400)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    safe.edgeOverrides[String(id).slice(0, 160)] = {
      source: typeof value.source === "string" ? value.source.slice(0, 120) : undefined,
      target: typeof value.target === "string" ? value.target.slice(0, 120) : undefined,
      className: typeof value.className === "string" ? value.className.slice(0, 80) : undefined,
      label: typeof value.label === "string" ? value.label.slice(0, 160) : undefined,
      hidden: typeof value.hidden === "boolean" ? value.hidden : undefined,
      details: value.details && typeof value.details === "object" ? value.details : undefined,
    };
  }

  safe.customNodes = Array.isArray(payload?.customNodes)
    ? payload.customNodes.slice(0, 120).map((node) => ({
        id: String(node.id || "").slice(0, 120),
        label: String(node.label || "New node").slice(0, 180),
        sublabel: typeof node.sublabel === "string" ? node.sublabel.slice(0, 240) : "",
        x: Number.isFinite(node.x) ? node.x : 960,
        y: Number.isFinite(node.y) ? node.y : 360,
        w: Number.isFinite(node.w) ? node.w : 180,
        h: Number.isFinite(node.h) ? node.h : 34,
        highlight: Boolean(node.highlight),
        footnote: typeof node.footnote === "string" ? node.footnote.slice(0, 20) : "",
        details: node.details && typeof node.details === "object" ? node.details : {},
      }))
    : [];

  safe.customEdges = Array.isArray(payload?.customEdges)
    ? payload.customEdges.slice(0, 200).map((edge) => ({
        id: String(edge.id || "").slice(0, 160),
        source: String(edge.source || "").slice(0, 120),
        target: String(edge.target || "").slice(0, 120),
        className: typeof edge.className === "string" ? edge.className.slice(0, 80) : "edge highlight",
        label: typeof edge.label === "string" ? edge.label.slice(0, 160) : "",
        details: edge.details && typeof edge.details === "object" ? edge.details : {},
      }))
    : [];
  safe.updatedAt = new Date().toISOString();
  return safe;
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const decodedPath = decodeURIComponent(requestedPath);
  const filePath = path.normalize(path.join(PUBLIC_DIR, decodedPath));
  const relativePath = path.relative(PUBLIC_DIR, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    notFound(res);
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      notFound(res);
      return;
    }
    sendJson(res, 500, { error: "static_file_error", detail: error.message });
  }
}

async function checkHealth(res, targetModel = MODEL) {
  const runtimeConfig = getRuntimeConfig();
  if (isOpenAiModelValue(targetModel)) {
    sendJson(res, 200, {
      ok: true,
      model: targetModel,
      modelAvailable: runtimeConfig.openaiConfigured && targetModel === runtimeConfig.openaiModelValue,
      provider: "openai",
      openaiConfigured: runtimeConfig.openaiConfigured,
    });
    return;
  }

  if (isHfModelValue(targetModel)) {
    const isBaseHf = targetModel === runtimeConfig.hfModelValue;
    const hfAdapterConfig = getHfAdapterConfig(targetModel, runtimeConfig);
    const isFtHf = Boolean(hfAdapterConfig);
    if (!runtimeConfig.hfEnabled || (!isBaseHf && !isFtHf)) {
      sendJson(res, 200, {
        ok: true,
        model: targetModel,
        modelAvailable: false,
        provider: "hf",
        hfEnabled: runtimeConfig.hfEnabled,
        adapterAvailable: false,
      });
      return;
    }

    try {
      const response = await fetch(`${runtimeConfig.hfBackendUrl}/health`);
      const body = await response.json().catch(() => ({}));
      sendJson(res, 200, {
        ok: response.ok,
        model: targetModel,
        modelAvailable: response.ok,
        modelLoaded: Boolean(body.ready),
        provider: "hf",
        displayName: getDisplayName(targetModel, runtimeConfig),
        hfModelId: runtimeConfig.hfModelId,
        hfBackendUrl: runtimeConfig.hfBackendUrl,
        adapterAvailable: isFtHf,
        adapterDir: isFtHf ? hfAdapterConfig.adapterDir : null,
        adapterName: isFtHf ? hfAdapterConfig.adapterName : null,
        backend: body,
      });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        model: targetModel,
        modelAvailable: false,
        provider: "hf",
        displayName: getDisplayName(targetModel, runtimeConfig),
        hfModelId: runtimeConfig.hfModelId,
        hfBackendUrl: runtimeConfig.hfBackendUrl,
        error: error.message,
      });
    }
    return;
  }

  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!response.ok) {
      sendJson(res, 502, {
        ok: false,
        model: targetModel,
        ollamaUrl: OLLAMA_URL,
        error: `ollama_status_${response.status}`,
      });
      return;
    }

    const body = await response.json();
    const models = Array.isArray(body.models) ? body.models : [];
    const available = models.some((item) => item.name === targetModel);
    sendJson(res, 200, {
      ok: true,
      model: targetModel,
      modelAvailable: available,
      ollamaUrl: OLLAMA_URL,
    });
  } catch (error) {
    sendJson(res, 502, {
      ok: false,
      model: targetModel,
      ollamaUrl: OLLAMA_URL,
      error: error.message,
    });
  }
}

async function listModels(res) {
  const runtimeConfig = getRuntimeConfig();
  const models = [];
  let ollamaError = null;

  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!response.ok) {
      ollamaError = `ollama_status_${response.status}`;
    } else {
      const body = await response.json();
      if (Array.isArray(body.models)) {
        models.push(
          ...body.models
            .filter((item) => ALLOWED_MODELS.includes(item.name))
            .map((item) => ({
              name: item.name,
              displayName: getDisplayName(item.name, runtimeConfig),
              provider: "ollama",
              kgEnabled: shouldApplyKgForModel(item.name, runtimeConfig),
              size: item.size || null,
              modifiedAt: item.modified_at || null,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
    }
  } catch (error) {
    ollamaError = error.message;
  }

  if (runtimeConfig.hfEnabled) {
    models.push({
      name: runtimeConfig.hfModelValue,
      displayName: getDisplayName(runtimeConfig.hfModelValue, runtimeConfig),
      provider: "hf",
      kgEnabled: shouldApplyKgForModel(runtimeConfig.hfModelValue, runtimeConfig),
      size: null,
      modifiedAt: null,
    });

    if (runtimeConfig.hfFtConfigured) {
      models.push({
        name: runtimeConfig.hfFtModelValue,
        displayName: getDisplayName(runtimeConfig.hfFtModelValue, runtimeConfig),
        provider: "hf",
        kgEnabled: shouldApplyKgForModel(runtimeConfig.hfFtModelValue, runtimeConfig),
        size: null,
        modifiedAt: null,
      });
    }

    if (runtimeConfig.hfFt2Configured) {
      models.push({
        name: runtimeConfig.hfFt2ModelValue,
        displayName: getDisplayName(runtimeConfig.hfFt2ModelValue, runtimeConfig),
        provider: "hf",
        kgEnabled: shouldApplyKgForModel(runtimeConfig.hfFt2ModelValue, runtimeConfig),
        size: null,
        modifiedAt: null,
      });
    }

    if (runtimeConfig.hfFt3Configured) {
      models.push({
        name: runtimeConfig.hfFt3ModelValue,
        displayName: getDisplayName(runtimeConfig.hfFt3ModelValue, runtimeConfig),
        provider: "hf",
        kgEnabled: shouldApplyKgForModel(runtimeConfig.hfFt3ModelValue, runtimeConfig),
        size: null,
        modifiedAt: null,
      });
    }
  }

  if (runtimeConfig.openaiConfigured) {
    models.push({
      name: runtimeConfig.openaiModelValue,
      displayName: runtimeConfig.openaiModelValue,
      provider: "openai",
      kgEnabled: shouldApplyKgForModel(runtimeConfig.openaiModelValue, runtimeConfig),
      size: null,
      modifiedAt: null,
    });
  }

  sendJson(res, 200, {
    ok: true,
    defaultModel: MODEL,
    qwen14Model: QWEN_14_MODEL,
    hfEnabled: runtimeConfig.hfEnabled,
    hfModelId: runtimeConfig.hfEnabled ? runtimeConfig.hfModelId : null,
    hfBackendUrl: runtimeConfig.hfEnabled ? runtimeConfig.hfBackendUrl : null,
    hfFtModelValue: runtimeConfig.hfFtConfigured ? runtimeConfig.hfFtModelValue : null,
    hfFtAdapterDir: runtimeConfig.hfFtConfigured ? runtimeConfig.hfFtAdapterDir : null,
    hfFt2ModelValue: runtimeConfig.hfFt2Configured ? runtimeConfig.hfFt2ModelValue : null,
    hfFt2AdapterDir: runtimeConfig.hfFt2Configured ? runtimeConfig.hfFt2AdapterDir : null,
    hfFt3ModelValue: runtimeConfig.hfFt3Configured ? runtimeConfig.hfFt3ModelValue : null,
    hfFt3AdapterDir: runtimeConfig.hfFt3Configured ? runtimeConfig.hfFt3AdapterDir : null,
    allowedModels: getAllowedModels(runtimeConfig),
    kgEnabledModels: getKgEnabledModels(runtimeConfig),
    openaiConfigured: runtimeConfig.openaiConfigured,
    openaiModel: runtimeConfig.openaiConfigured ? runtimeConfig.openaiModel : null,
    ollamaError,
    models,
  });
}

function isSafeModelName(model) {
  return typeof model === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,80}$/.test(model);
}

async function streamPull(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { error: "invalid_json", detail: error.message });
    return;
  }

  const model = payload.model || QWEN_14_MODEL;
  if (!isSafeModelName(model)) {
    sendJson(res, 400, { error: "invalid_model_name" });
    return;
  }

  let upstream;
  try {
    upstream = await fetch(`${OLLAMA_URL}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model, stream: true }),
    });
  } catch (error) {
    sendJson(res, 502, { error: "ollama_unreachable", detail: error.message });
    return;
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    sendJson(res, 502, {
      error: "ollama_pull_error",
      status: upstream.status,
      detail,
    });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`event: meta\ndata: ${JSON.stringify({ model })}\n\n`);

  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        const chunk = JSON.parse(trimmed);
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        if (chunk.status === "success") {
          res.write(`event: done\ndata: ${JSON.stringify({ done: true, model })}\n\n`);
        }
      }
    }
  } catch (error) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
  } finally {
    res.end();
  }
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => message && typeof message.content === "string")
    .map((message) => ({
      role: ["system", "user", "assistant"].includes(message.role) ? message.role : "user",
      content: message.content.slice(0, 24000),
    }))
    .slice(-40);
}

function buildTokenStats(chunk) {
  const inputTokens = Number.isFinite(chunk.prompt_eval_count) ? chunk.prompt_eval_count : null;
  const outputTokens = Number.isFinite(chunk.eval_count) ? chunk.eval_count : null;
  return {
    inputTokens,
    outputTokens,
    totalTokens:
      Number.isFinite(inputTokens) && Number.isFinite(outputTokens)
        ? inputTokens + outputTokens
        : null,
  };
}

function buildOpenAiTokenStats(usage) {
  if (!usage) {
    return null;
  }

  const inputTokens = Number.isFinite(usage.prompt_tokens) ? usage.prompt_tokens : null;
  const outputTokens = Number.isFinite(usage.completion_tokens) ? usage.completion_tokens : null;
  const totalTokens = Number.isFinite(usage.total_tokens)
    ? usage.total_tokens
    : Number.isFinite(inputTokens) && Number.isFinite(outputTokens)
      ? inputTokens + outputTokens
      : null;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

function writeKgEvent(res, kgContext) {
  res.write(`event: kg\ndata: ${JSON.stringify(summarizeKgForClient(kgContext))}\n\n`);
}

function parseSseBlock(block) {
  let event = "message";
  const data = [];
  for (const rawLine of block.split(/\n/)) {
    const line = rawLine.trimEnd();
    if (line.startsWith("event:")) {
      event = line.slice(6).trim() || "message";
    } else if (line.startsWith("data:")) {
      data.push(line.slice(5).trimStart());
    }
  }
  return { event, data: data.join("\n") };
}

function writeDsm5SafetyAppendix() {
  // Temporarily disabled: when KG is enabled, only KG context should be attached.
}

async function streamOpenAiChat(res, { messages, modelValue, temperature, kgContext, dsm5GuardrailEnabled }) {
  const runtimeConfig = getRuntimeConfig();
  if (!runtimeConfig.openaiConfigured || modelValue !== runtimeConfig.openaiModelValue) {
    sendJson(res, 400, {
      error: "openai_not_configured",
      detail: "Set OPENAI_API_KEY in gemma-chat-ui/.env.",
    });
    return;
  }

  let upstream;
  try {
    upstream = await fetch(`${runtimeConfig.openaiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtimeConfig.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: runtimeConfig.openaiModel,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        temperature,
      }),
    });
  } catch (error) {
    sendJson(res, 502, { error: "openai_unreachable", detail: error.message });
    return;
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    sendJson(res, 502, {
      error: "openai_chat_error",
      status: upstream.status,
      detail,
    });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`event: meta\ndata: ${JSON.stringify({ model: modelValue })}\n\n`);
  writeKgEvent(res, kgContext);

  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();
  let buffer = "";
  let tokenStats = null;
  let doneSent = false;

  const handleOpenAiLine = (line) => {
    if (!line.startsWith("data:")) {
      return;
    }

    const data = line.slice(5).trim();
    if (!data) {
      return;
    }

    if (data === "[DONE]") {
      writeDsm5SafetyAppendix(res, messages, dsm5GuardrailEnabled);
      res.write(`event: done\ndata: ${JSON.stringify({ done: true, tokenStats })}\n\n`);
      doneSent = true;
      return;
    }

    const chunk = JSON.parse(data);
    if (chunk.usage) {
      tokenStats = buildOpenAiTokenStats(chunk.usage);
    }

    const content = chunk.choices?.[0]?.delta?.content || "";
    if (content) {
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        handleOpenAiLine(line.trim());
      }
    }

    if (buffer.trim()) {
      for (const line of buffer.split("\n")) {
        handleOpenAiLine(line.trim());
      }
    }

    if (!doneSent) {
      writeDsm5SafetyAppendix(res, messages, dsm5GuardrailEnabled);
      res.write(`event: done\ndata: ${JSON.stringify({ done: true, tokenStats })}\n\n`);
    }
  } catch (error) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
  } finally {
    res.end();
  }
}

async function streamHfChat(res, {
  messages,
  modelValue,
  temperature,
  maxNewTokens,
  kgContext,
  dsm5GuardrailEnabled,
}) {
  const runtimeConfig = getRuntimeConfig();
  const isBaseHf = modelValue === runtimeConfig.hfModelValue;
  const hfAdapterConfig = getHfAdapterConfig(modelValue, runtimeConfig);
  const isFtHf = Boolean(hfAdapterConfig);
  if (!runtimeConfig.hfEnabled || (!isBaseHf && !isFtHf)) {
    sendJson(res, 400, {
      error: "hf_not_configured",
      detail: "Set HF_ENABLED=1, HF_MODEL_ID, HF_BACKEND_URL, and HF_FT_ADAPTER_DIR in sllm_service_ui/.env.",
    });
    return;
  }

  let upstream;
  try {
    upstream = await fetch(`${runtimeConfig.hfBackendUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: runtimeConfig.hfModelId,
        adapter_dir: isFtHf ? hfAdapterConfig.adapterDir : null,
        adapter_name: isFtHf ? hfAdapterConfig.adapterName : null,
        messages,
        stream: true,
        temperature,
        max_new_tokens: maxNewTokens,
      }),
    });
  } catch (error) {
    sendJson(res, 502, { error: "hf_unreachable", detail: error.message });
    return;
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    sendJson(res, 502, {
      error: "hf_chat_error",
      status: upstream.status,
      detail,
    });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(
    `event: meta\ndata: ${JSON.stringify({
      model: modelValue,
      displayName: getDisplayName(modelValue, runtimeConfig),
      backendModel: runtimeConfig.hfModelId,
      loadIn4bit: !["", "0", "false", "no", "off"].includes(
        String(process.env.HF_LOAD_IN_4BIT || FILE_ENV.HF_LOAD_IN_4BIT || "0").toLowerCase(),
      ),
    })}\n\n`,
  );
  writeKgEvent(res, kgContext);

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let upstreamBuffer = "";
  let tokenStats = null;
  let doneSent = false;

  const handleHfBlock = (block) => {
    const parsedBlock = parseSseBlock(block);
    if (!parsedBlock.data) {
      return false;
    }

    let parsed;
    try {
      parsed = JSON.parse(parsedBlock.data);
    } catch (error) {
      return false;
    }

    if (parsedBlock.event === "error") {
      res.write(`event: error\ndata: ${JSON.stringify(parsed)}\n\n`);
      doneSent = true;
      return true;
    }

    if (parsedBlock.event === "done" || parsed.done) {
      tokenStats = parsed.tokenStats || parsed.usage || tokenStats;
      writeDsm5SafetyAppendix(res, messages, dsm5GuardrailEnabled);
      res.write(`event: done\ndata: ${JSON.stringify({ done: true, tokenStats })}\n\n`);
      doneSent = true;
      return true;
    }

    const content = typeof parsed.content === "string" ? parsed.content : "";
    if (content) {
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
    return false;
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      upstreamBuffer += decoder.decode(value, { stream: true });

      const blocks = upstreamBuffer.split("\n\n");
      upstreamBuffer = blocks.pop() || "";

      let terminalSeen = false;
      for (const block of blocks) {
        if (!block.trim()) {
          continue;
        }
        terminalSeen = handleHfBlock(block) || terminalSeen;
      }

      if (terminalSeen) {
        await reader.cancel().catch(() => {});
        break;
      }
    }

    if (!doneSent && upstreamBuffer.trim()) {
      for (const block of upstreamBuffer.split(/\n\n/)) {
        if (!block.trim()) {
          continue;
        }
        if (handleHfBlock(block)) {
          break;
        }
      }
    }

    if (!doneSent) {
      writeDsm5SafetyAppendix(res, messages, dsm5GuardrailEnabled);
      res.write(`event: done\ndata: ${JSON.stringify({ done: true, tokenStats })}\n\n`);
      doneSent = true;
    }
  } catch (error) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
  } finally {
    res.end();
  }
}

async function streamChat(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { error: "invalid_json", detail: error.message });
    return;
  }

  const messages = sanitizeMessages(payload.messages);
  if (messages.length === 0) {
    sendJson(res, 400, { error: "messages_required" });
    return;
  }

  const model = typeof payload.model === "string" && payload.model.trim() ? payload.model.trim() : MODEL;
  const runtimeConfig = getRuntimeConfig();
  const allowedModels = getAllowedModels(runtimeConfig);

  if (!allowedModels.includes(model)) {
    sendJson(res, 400, {
      error: "model_not_allowed",
      allowedModels,
    });
    return;
  }

  const blockingMessage = prototypeLookupBlockingMessage(messages);
  if (blockingMessage) {
    streamDirectAssistantMessage(res, { model, content: blockingMessage });
    return;
  }

  const temperature = Number.isFinite(payload.temperature) ? payload.temperature : 0;
  const maxNewTokens = Number.isFinite(payload.maxNewTokens) ? payload.maxNewTokens : undefined;
  const dsm5GuardrailEnabled = false;
  const messagesWithDataContext = injectStudentDataContext(messages);
  const kgContext = buildKgContext(messagesWithDataContext, {
    enabled: shouldApplyKgForModel(model, runtimeConfig, payload.kgEnabled),
  });
  const modelMessages = injectKgContext(messagesWithDataContext, kgContext);

  if (isOpenAiModelValue(model)) {
    await streamOpenAiChat(res, {
      messages: modelMessages,
      modelValue: model,
      temperature,
      kgContext,
      dsm5GuardrailEnabled,
    });
    return;
  }

  if (isHfModelValue(model)) {
    await streamHfChat(res, {
      messages: modelMessages,
      modelValue: model,
      temperature,
      maxNewTokens,
      kgContext,
      dsm5GuardrailEnabled,
    });
    return;
  }

  let upstream;
  try {
    upstream = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: modelMessages,
        stream: true,
        think: false,
        options: {
          temperature,
        },
      }),
    });
  } catch (error) {
    sendJson(res, 502, { error: "ollama_unreachable", detail: error.message });
    return;
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    sendJson(res, 502, {
      error: "ollama_chat_error",
      status: upstream.status,
      detail,
    });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`event: meta\ndata: ${JSON.stringify({ model })}\n\n`);
  writeKgEvent(res, kgContext);

  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        const chunk = JSON.parse(trimmed);
        const content = chunk.message && typeof chunk.message.content === "string" ? chunk.message.content : "";
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
        if (chunk.done) {
          writeDsm5SafetyAppendix(res, modelMessages, dsm5GuardrailEnabled);
          res.write(`event: done\ndata: ${JSON.stringify({ done: true, tokenStats: buildTokenStats(chunk) })}\n\n`);
        }
      }
    }

    if (buffer.trim()) {
      const chunk = JSON.parse(buffer.trim());
      const content = chunk.message && typeof chunk.message.content === "string" ? chunk.message.content : "";
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
      if (chunk.done) {
        writeDsm5SafetyAppendix(res, modelMessages, dsm5GuardrailEnabled);
        res.write(`event: done\ndata: ${JSON.stringify({ done: true, tokenStats: buildTokenStats(chunk) })}\n\n`);
      }
    }
  } catch (error) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
  } finally {
    res.end();
  }
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    await checkHealth(res, url.searchParams.get("model") || MODEL);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/models") {
    await listModels(res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/kg/context") {
    const text = url.searchParams.get("q") || "";
    const kgContext = buildKgContext([{ role: "user", content: text }], { enabled: true });
    sendJson(res, 200, {
      ...summarizeKgForClient(kgContext),
      contextText: kgContext.contextText || "",
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/kg/graph") {
    sendJson(res, 200, buildGraph());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/kg/architecture-edits") {
    sendJson(res, 200, await readKgArchitectureEdits());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/kg/architecture-edits") {
    const payload = await readJson(req);
    const edits = sanitizeKgArchitectureEdits(payload);
    await fs.mkdir(path.dirname(KG_ARCHITECTURE_EDITS_FILE), { recursive: true });
    await fs.writeFile(KG_ARCHITECTURE_EDITS_FILE, `${JSON.stringify(edits, null, 2)}\n`, "utf8");
    sendJson(res, 200, { ok: true, edits });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    await streamChat(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/report/pdf") {
    await createReportPdf(req, res);
    return;
  }

  if (req.method === "GET") {
    await serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { error: "method_not_allowed" });
}

function start(port, attempts = 0) {
  const server = http.createServer((req, res) => {
    route(req, res).catch((error) => {
      sendJson(res, 500, { error: "server_error", detail: error.message });
    });
  });

  server.on("error", (error) => {
    if (!STRICT_PORT && error.code === "EADDRINUSE" && attempts < 20) {
      start(port + 1, attempts + 1);
      return;
    }
    throw error;
  });

  server.listen(port, HOST, () => {
    fsSync.writeFileSync(PORT_FILE, String(port));
    console.log(`gemma-chat-ui listening on http://${HOST}:${port}`);
    console.log(`localModel=${MODEL} qwenModel=${QWEN_14_MODEL}`);
    maybeStartHfBackend();
  });
}

start(START_PORT);
