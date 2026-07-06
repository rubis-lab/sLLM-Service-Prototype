const DEFAULT_SYSTEM_PROMPT = `[1. 개요]는 1문장만 작성하고, Task 정의나 센서 데이터 해석 용어를 포함하지 마세요.

[2]와 [3]은 서버가 제공하는 SERVER_STRUCTURED_REPORT_DATA의 Task, 검사 결과 지표, Primitive Indicator 값을 우선 사용해 작성하세요.

[4. 센서 데이터 해석 및 임상적 시사점]은 해당 Task와 연결된 KG 용어를 영문+한글 괄호 형식 그대로 포함해 작성하세요. 해당 용어를 일반 표현으로 바꾸거나 생략하지 마세요.

VST: automatic processing(초기 자동처리), central discrimination(중심시야 기반 자극 판별), intra-subject variability(수행 시간 변동성), search coverage(시선 탐색 범위)
Flanker: target orienting(목표 정보 지향), distractor-target switching(방해-목표 간 시선 전환), target processing inefficiency(목표 정보 처리 비효율)
GNG: intrusive saccade(불필요한 시선 이동), off-center gaze deviation(중앙 기준 시선 이탈), fixation maintenance(중앙 응시 유지)`;
const PREVIOUS_DEFAULT_SYSTEM_PROMPT =
  "너는 한국어로 답변하는 로컬 LLM 어시스턴트다. 사용자의 질문에 정확하게 답하고, 임상 기준처럼 누락되면 안 되는 내용은 지나치게 짧게 줄이지 말고 필요한 제한과 정보 부족을 명확히 밝혀라.";
const OLD_DEFAULT_SYSTEM_PROMPT =
  "너는 한국어로 답변하는 로컬 LLM 어시스턴트다. 사용자의 질문에 정확하고 간결하게 답하고, 모르는 내용은 추정하지 말고 한계를 밝혀라.";
const DEFAULT_MODEL = "hf:gemma-4-E4B-it_ft_v3";
const SHOW_MESSAGE_META = false;
const ALLOWED_MODELS = [DEFAULT_MODEL];
const MODEL_DISPLAY_NAMES = {
  [DEFAULT_MODEL]: "gemma4:E4B",
};
const LOG_STORAGE_KEY = "gemma-chat-ui.logs.v1";
const SYSTEM_PROMPT_STORAGE_KEY = "gemma-chat-ui.system-prompt.v4";
const MODEL_STORAGE_KEY = "gemma-chat-ui.selected-model.v1";
const KG_STORAGE_KEY = "gemma-chat-ui.kg-enabled.v1";
const KG_SUPPORTED_MODELS = [DEFAULT_MODEL];

const messagesEl = document.querySelector("#messages");
const composerEl = document.querySelector("#composer");
const promptInput = document.querySelector("#promptInput");
const sendButton = document.querySelector("#sendButton");
const newChatButton = document.querySelector("#newChat");
const logList = document.querySelector("#logList");
const settingsButton = document.querySelector("#settingsButton");
const settingsBackdrop = document.querySelector("#settingsBackdrop");
const closeSettingsButton = document.querySelector("#closeSettings");
const saveSettingsButton = document.querySelector("#saveSettings");
const resetSystemPromptButton = document.querySelector("#resetSystemPrompt");
const systemPrompt = document.querySelector("#systemPrompt");
const statusDot = document.querySelector("#statusDot");
const statusText = document.querySelector("#statusText");
const modelName = document.querySelector("#modelName");
const modelSelect = document.querySelector("#modelSelect");
const kgToggle = document.querySelector("#kgToggle");
const kgStatus = document.querySelector("#kgStatus");
const headerPill = document.querySelector("#headerPill");

let logs = [];
let activeLogId = null;
let conversation = [];
let selectedModel = DEFAULT_MODEL;
let kgEnabled = localStorage.getItem(KG_STORAGE_KEY) !== "0";
let availableModels = [];
let isGenerating = false;

function getSelectableModelNames() {
  return ALLOWED_MODELS;
}

function normalizeModel(model) {
  return DEFAULT_MODEL;
}

function getModelDisplayName(model) {
  const match = availableModels.find((item) => item.name === DEFAULT_MODEL);
  return MODEL_DISPLAY_NAMES[model] || match?.displayName || model || DEFAULT_MODEL;
}

function isKgSupportedModel(model) {
  const match = availableModels.find((item) => item.name === model);
  if (match && Object.prototype.hasOwnProperty.call(match, "kgEnabled")) {
    return Boolean(match.kgEnabled);
  }
  return KG_SUPPORTED_MODELS.includes(model);
}

function updateKgControls() {
  if (!kgToggle || !kgStatus) {
    return;
  }

  const supported = isKgSupportedModel(selectedModel);
  kgToggle.checked = kgEnabled;
  kgToggle.disabled = isGenerating;

  if (!supported) {
    kgStatus.textContent = "KG off: 선택 모델 미적용";
    kgStatus.classList.add("off");
    return;
  }

  kgStatus.textContent = kgEnabled ? "KG on: 선택 모델 적용" : "KG off";
  kgStatus.classList.toggle("off", !kgEnabled);
}

function makeId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function loadLogs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOG_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistLogs() {
  localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs));
}

function getActiveLog() {
  return logs.find((log) => log.id === activeLogId) || null;
}

function makeBlankLog() {
  const timestamp = nowIso();
  return {
    id: makeId(),
    title: "새 대화",
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [],
  };
}

function makeTitle(messages) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  if (!firstUserMessage) {
    return "새 대화";
  }

  const singleLine = firstUserMessage.content.replace(/\s+/g, " ").trim();
  return singleLine.length > 34 ? `${singleLine.slice(0, 34)}...` : singleLine;
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function saveActiveLog() {
  let log = getActiveLog();
  if (!log) {
    log = makeBlankLog();
    activeLogId = log.id;
    logs.unshift(log);
  }

  log.messages = conversation;
  log.title = makeTitle(conversation);
  log.updatedAt = nowIso();
  logs = logs
    .filter((item, index, array) => array.findIndex((other) => other.id === item.id) === index)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  persistLogs();
  renderLogList();
}

function startNewConversation() {
  const log = makeBlankLog();
  logs.unshift(log);
  activeLogId = log.id;
  conversation = [];
  persistLogs();
  renderLogList();
  renderConversation();
  promptInput.focus();
}

function loadConversation(id) {
  const log = logs.find((item) => item.id === id);
  if (!log || isGenerating) {
    return;
  }

  activeLogId = log.id;
  conversation = Array.isArray(log.messages) ? log.messages : [];
  renderLogList();
  renderConversation();
  promptInput.focus();
}

function deleteConversation(id) {
  if (isGenerating) {
    return;
  }

  const deletingActive = id === activeLogId;
  logs = logs.filter((item) => item.id !== id);

  if (logs.length === 0) {
    const log = makeBlankLog();
    logs.push(log);
  }

  if (deletingActive) {
    activeLogId = logs[0].id;
    conversation = Array.isArray(logs[0].messages) ? logs[0].messages : [];
  }

  persistLogs();
  renderLogList();
  renderConversation();
}

function renderLogList() {
  logList.innerHTML = "";

  if (logs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-log";
    empty.textContent = "저장된 대화가 없습니다.";
    logList.append(empty);
    return;
  }

  for (const log of logs) {
    const row = document.createElement("div");
    row.className = `log-item${log.id === activeLogId ? " active" : ""}`;

    const openButton = document.createElement("button");
    openButton.className = "log-open";
    openButton.type = "button";
    openButton.addEventListener("click", () => loadConversation(log.id));

    const title = document.createElement("span");
    title.className = "log-title";
    title.textContent = log.title || "새 대화";

    const meta = document.createElement("span");
    meta.className = "log-meta";
    meta.textContent = formatDate(log.updatedAt);

    const deleteButton = document.createElement("button");
    deleteButton.className = "log-delete";
    deleteButton.type = "button";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteConversation(log.id);
    });

    openButton.append(title, meta);
    row.append(openButton, deleteButton);
    logList.append(row);
  }
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function resizeInput() {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 180)}px`;
}

function formatTokenStats(stats) {
  if (!stats) {
    return "";
  }

  const input = Number.isFinite(stats.inputTokens) ? stats.inputTokens : "-";
  const output = Number.isFinite(stats.outputTokens) ? stats.outputTokens : "-";
  const total = Number.isFinite(stats.totalTokens) ? stats.totalTokens : "-";
  return `tokens: input ${input} / output ${output} / total ${total}`;
}

function formatKgMeta(meta) {
  if (!meta || !meta.enabled) {
    return "";
  }
  if (meta.applied) {
    return meta.summary || `KG on: ${meta.matchCount || 0} edge`;
  }
  return meta.summary || "KG on: no match";
}

function setMessageMeta(el, stats, kgMeta = null) {
  if (!SHOW_MESSAGE_META) {
    el.textContent = "";
    el.hidden = true;
    return;
  }

  // 토큰 정보만 다시 보이게 하려면 아래 줄을 사용하세요.
  // const text = [formatTokenStats(stats)].filter(Boolean).join(" | ");
  // KG-on 정보와 토큰 정보를 모두 다시 보이게 하려면 아래 줄을 사용하세요.
  const text = [formatKgMeta(kgMeta), formatTokenStats(stats)].filter(Boolean).join(" | ");
  el.textContent = text;
  el.hidden = !text;
}

function setTokenMeta(el, stats) {
  setMessageMeta(el, stats);
}

function cleanAssistantText(raw) {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\\text\{([^{}]*)\}/g, "$1")
    .replace(/\$\s*([^$]+?)\s*\$/g, "$1")
    .replace(/\\_/g, "_")
    .replace(/\\([#*`.[\](){}$])/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*\*\s+/gm, "- ")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`/g, "")
    .replace(/\\/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trimStart();
}

function defaultReportTitle() {
  return "센서 데이터 기반 주의 집중력 분석 보고서";
}

function reportFilenameTimestamp() {
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

function filenameFromDisposition(disposition) {
  const match = /filename="?([^";]+)"?/i.exec(disposition || "");
  return match ? match[1] : "";
}

async function downloadPdfReport(report, button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "PDF 생성 중...";

  try {
    const response = await fetch("/api/report/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: defaultReportTitle(),
        prompt: report.prompt || "",
        answer: report.answer || "",
        model: getModelDisplayName(report.model || selectedModel),
        kgSummary: formatKgMeta(report.kgMeta),
        generatedAt: new Date().toLocaleString("ko-KR", { hour12: false }),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `PDF 생성 실패: ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download =
      filenameFromDisposition(response.headers.get("Content-Disposition")) ||
      `attention-report-${reportFilenameTimestamp()}.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    button.textContent = "보고서 다운로드";
  } catch (error) {
    button.textContent = "PDF 실패";
    window.alert(`PDF 생성 중 오류가 발생했습니다.\n${error.message}`);
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = originalText;
    }, 1200);
  }
}

function addReportActions(bubble, report) {
  if (report.reportable === false) {
    return;
  }
  if (!report.answer || !report.answer.trim()) {
    return;
  }

  const actions = document.createElement("div");
  actions.className = "message-actions";

  const downloadButton = document.createElement("button");
  downloadButton.type = "button";
  downloadButton.className = "report-download-button";
  downloadButton.textContent = "보고서 다운로드";
  downloadButton.title = "이 응답을 PDF 보고서로 다운로드";
  downloadButton.addEventListener("click", () => downloadPdfReport(report, downloadButton));

  actions.append(downloadButton);
  bubble.append(actions);
}

function createMessage(role, content, pending = false, tokenStats = null, model = null, kgMeta = null, reportPrompt = "", reportable = true) {
  const article = document.createElement("article");
  article.className = `message ${role}${pending ? " pending" : ""}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "user" : "AI";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const name = document.createElement("div");
  name.className = "message-name";
  name.textContent = role === "user" ? "user" : getModelDisplayName(model || selectedModel);

  const body = document.createElement("div");
  body.className = "message-content";
  body.textContent = role === "assistant" ? cleanAssistantText(content) : content;

  const meta = document.createElement("div");
  meta.className = "token-meta";
  setMessageMeta(meta, tokenStats, kgMeta);

  bubble.append(name, body, meta);
  if (role === "assistant" && !pending && reportPrompt && reportable !== false) {
    addReportActions(bubble, {
      answer: body.textContent,
      prompt: reportPrompt,
      model: model || selectedModel,
      kgMeta,
      reportable,
    });
  }
  article.append(avatar, bubble);
  messagesEl.append(article);
  scrollToBottom();

  return { article, bubble, body, meta };
}

function renderConversation() {
  messagesEl.innerHTML = "";

  if (conversation.length === 0) {
    createMessage("assistant", "준비되었습니다. 아래 채팅창에 질문을 입력해 주세요.", false, null, selectedModel);
    return;
  }

  let lastUserPrompt = "";
  for (const message of conversation) {
    if (message.role === "user") {
      lastUserPrompt = message.content;
    }
    createMessage(
      message.role,
      message.content,
      false,
      message.tokenStats || null,
      message.model || selectedModel,
      message.kgMeta || null,
      message.role === "assistant" ? lastUserPrompt : "",
      message.reportable !== false,
    );
  }
}

function setGenerating(value) {
  isGenerating = value;
  sendButton.disabled = value;
  promptInput.disabled = value;
  modelSelect.disabled = value;
  updateKgControls();
  headerPill.textContent = value ? "generating" : "ready";
}

function setSelectedModel(model) {
  selectedModel = normalizeModel(model);
  localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
  modelName.textContent = getModelDisplayName(selectedModel);
  if (modelSelect.value !== selectedModel) {
    modelSelect.value = selectedModel;
  }
  updateKgControls();
}

function buildMessagesForApi() {
  const system = systemPrompt.value.trim();
  const apiMessages = [];

  if (system) {
    apiMessages.push({ role: "system", content: system });
  }

  return apiMessages.concat(
    conversation.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  );
}

function parseSseBuffer(buffer, onEvent) {
  const blocks = buffer.split("\n\n");
  const rest = blocks.pop() || "";

  for (const block of blocks) {
    let event = "message";
    const dataLines = [];

    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length) {
      onEvent(event, dataLines.join("\n"));
    }
  }

  return rest;
}

async function sendMessage(text) {
  if (!text || isGenerating) {
    return;
  }

  const modelForTurn = selectedModel;
  conversation.push({ role: "user", content: text });
  saveActiveLog();
  createMessage("user", text);
  const assistantMessage = createMessage("assistant", "", true, null, modelForTurn);
  setGenerating(true);

  let assistantRawText = "";
  let assistantText = "";
  let tokenStats = null;
  let kgMeta = null;
  let reportable = true;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelForTurn,
        messages: buildMessagesForApi(),
        temperature: 0,
        kgEnabled,
      }),
    });

    if (!response.ok || !response.body) {
      const detail = await response.text();
      throw new Error(detail || `request failed: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const handleEvent = (event, rawData) => {
      if (event === "message") {
        const data = JSON.parse(rawData);
        assistantRawText += data.content || "";
        assistantText = cleanAssistantText(assistantRawText);
        assistantMessage.body.textContent = assistantText;
        scrollToBottom();
      }

      if (event === "done") {
        const data = JSON.parse(rawData);
        tokenStats = data.tokenStats || null;
        reportable = data.reportable !== false;
        setMessageMeta(assistantMessage.meta, tokenStats, kgMeta);
      }

      if (event === "kg") {
        kgMeta = JSON.parse(rawData);
        setMessageMeta(assistantMessage.meta, tokenStats, kgMeta);
      }

      if (event === "error") {
        const data = JSON.parse(rawData);
        throw new Error(data.error || "stream error");
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      buffer = parseSseBuffer(buffer, handleEvent);
    }

    if (buffer.trim()) {
      parseSseBuffer(`${buffer}\n\n`, handleEvent);
    }

    assistantMessage.article.classList.remove("pending");
    conversation.push({ role: "assistant", content: assistantText, tokenStats, model: modelForTurn, kgMeta, reportable });
    if (reportable) {
      addReportActions(assistantMessage.bubble, {
        answer: assistantText,
        prompt: text,
        model: modelForTurn,
        kgMeta,
        reportable,
      });
    }
    saveActiveLog();
  } catch (error) {
    assistantMessage.article.classList.remove("pending");
    assistantMessage.body.textContent = `오류가 발생했습니다.\n${error.message}`;
  } finally {
    setGenerating(false);
    promptInput.focus();
  }
}

function renderModelOptions() {
  const configuredModel = availableModels.find((model) => model.name === DEFAULT_MODEL);
  const models = [
    configuredModel || {
      name: DEFAULT_MODEL,
      displayName: MODEL_DISPLAY_NAMES[DEFAULT_MODEL] || DEFAULT_MODEL,
      provider: "hf",
    },
  ];

  modelSelect.innerHTML = "";
  for (const model of models) {
    const option = document.createElement("option");
    option.value = model.name;
    option.textContent = model.displayName || model.name;
    modelSelect.append(option);
  }

  selectedModel = DEFAULT_MODEL;
  modelSelect.value = DEFAULT_MODEL;
  modelName.textContent = getModelDisplayName(DEFAULT_MODEL);
  updateKgControls();
}

async function refreshModels() {
  try {
    const response = await fetch("/api/models", { cache: "no-store" });
    const data = await response.json();
    availableModels = Array.isArray(data.models) ? data.models : [];
    setSelectedModel(DEFAULT_MODEL);
    renderModelOptions();
    updateKgControls();
    if (conversation.length === 0) {
      renderConversation();
    }
  } catch {
    availableModels = [];
    renderModelOptions();
    updateKgControls();
    if (conversation.length === 0) {
      renderConversation();
    }
  }
}

async function refreshHealth() {
  try {
    const response = await fetch(`/api/health?model=${encodeURIComponent(selectedModel)}`, { cache: "no-store" });
    const data = await response.json();
    modelName.textContent = getModelDisplayName(selectedModel);
    updateKgControls();

    if (data.ok && data.modelAvailable) {
      statusDot.className = "status-dot ok";
      statusText.textContent = "LLM 연결 상태: 연결됨";
      return;
    }

    statusDot.className = "status-dot fail";
    statusText.textContent = data.ok ? "LLM 연결 상태: 선택 모델 없음" : "LLM 연결 상태: 확인 필요";
  } catch {
    statusDot.className = "status-dot fail";
    statusText.textContent = "LLM 연결 상태: 서버 확인 필요";
  }
}

function openSettings() {
  settingsBackdrop.hidden = false;
  systemPrompt.focus();
}

function closeSettings() {
  settingsBackdrop.hidden = true;
  promptInput.focus();
}

composerEl.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = promptInput.value.trim();
  promptInput.value = "";
  resizeInput();
  sendMessage(text);
});

promptInput.addEventListener("input", resizeInput);

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    composerEl.requestSubmit();
  }
});

modelSelect.addEventListener("change", () => {
  setSelectedModel(modelSelect.value);
  if (conversation.length === 0) {
    renderConversation();
  }
  refreshHealth();
});

kgToggle?.addEventListener("change", () => {
  kgEnabled = kgToggle.checked;
  localStorage.setItem(KG_STORAGE_KEY, kgEnabled ? "1" : "0");
  updateKgControls();
});

newChatButton.addEventListener("click", startNewConversation);
settingsButton.addEventListener("click", openSettings);
closeSettingsButton.addEventListener("click", closeSettings);

settingsBackdrop.addEventListener("click", (event) => {
  if (event.target === settingsBackdrop) {
    closeSettings();
  }
});

saveSettingsButton.addEventListener("click", () => {
  localStorage.setItem(SYSTEM_PROMPT_STORAGE_KEY, systemPrompt.value);
  closeSettings();
});

resetSystemPromptButton.addEventListener("click", () => {
  systemPrompt.value = DEFAULT_SYSTEM_PROMPT;
  localStorage.setItem(SYSTEM_PROMPT_STORAGE_KEY, DEFAULT_SYSTEM_PROMPT);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !settingsBackdrop.hidden) {
    closeSettings();
  }
});

const storedSystemPrompt = localStorage.getItem(SYSTEM_PROMPT_STORAGE_KEY);
systemPrompt.value =
  !storedSystemPrompt ||
  storedSystemPrompt === OLD_DEFAULT_SYSTEM_PROMPT ||
  storedSystemPrompt === PREVIOUS_DEFAULT_SYSTEM_PROMPT
    ? DEFAULT_SYSTEM_PROMPT
    : storedSystemPrompt;
selectedModel = normalizeModel(selectedModel);
logs = loadLogs();
if (logs.length > 0) {
  activeLogId = logs[0].id;
  conversation = Array.isArray(logs[0].messages) ? logs[0].messages : [];
} else {
  startNewConversation();
}

setSelectedModel(selectedModel);
updateKgControls();
renderLogList();
renderConversation();
refreshModels();
refreshHealth();
setInterval(refreshHealth, 30000);
promptInput.focus();
