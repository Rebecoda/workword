const DEFAULT_SETTINGS = {
  enabled: true,
  compact: false,
  autoShowMeaning: false,
  dailyTarget: 10
};

const els = {
  importText: document.querySelector("#import-text"),
  fileInput: document.querySelector("#file-input"),
  importButton: document.querySelector("#import-button"),
  importStatus: document.querySelector("#import-status"),
  wordList: document.querySelector("#word-list"),
  enabled: document.querySelector("#enabled"),
  autoShow: document.querySelector("#auto-show"),
  dailyTarget: document.querySelector("#daily-target"),
  clearWords: document.querySelector("#clear-words"),
  exportJson: document.querySelector("#export-json")
};

let settings = DEFAULT_SETTINGS;
let words = [];

init();

async function init() {
  await load();
  bindEvents();
  render();
}

async function load() {
  const data = await chrome.storage.local.get(["words", "settings"]);
  words = Array.isArray(data.words) ? data.words : [];
  settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
}

function bindEvents() {
  els.importButton.addEventListener("click", importWords);
  els.fileInput.addEventListener("change", readFile);
  els.enabled.addEventListener("change", saveSettings);
  els.autoShow.addEventListener("change", saveSettings);
  els.dailyTarget.addEventListener("change", saveSettings);
  els.clearWords.addEventListener("click", clearWords);
  els.exportJson.addEventListener("click", exportJson);
}

async function readFile() {
  const file = els.fileInput.files?.[0];
  if (!file) return;
  els.importText.value = await file.text();
}

async function importWords() {
  const text = els.importText.value.trim();
  if (!text) {
    showStatus("请先粘贴词书内容或选择文件。");
    return;
  }

  let imported;
  try {
    imported = parseImport(text);
  } catch (error) {
    showStatus(error.message || "导入失败。");
    return;
  }

  const existing = new Set(words.map((word) => word.term.toLowerCase()));
  const fresh = imported.filter((word) => {
    const key = word.term.toLowerCase();
    if (existing.has(key)) return false;
    existing.add(key);
    return true;
  });

  words = [...fresh, ...words];
  await chrome.storage.local.set({ words });
  els.importText.value = "";
  showStatus(`导入 ${fresh.length} 个新词，跳过 ${imported.length - fresh.length} 个重复词。`);
  render();
}

function parseImport(text) {
  if (text.startsWith("[") || text.startsWith("{")) {
    const data = JSON.parse(text);
    const rawWords = Array.isArray(data) ? data : data.words;
    if (!Array.isArray(rawWords)) throw new Error("JSON 需要是数组或包含 words 数组。");
    return rawWords.map(normalizeWord).filter(Boolean);
  }

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseLine)
    .filter(Boolean);
}

function parseLine(line) {
  const cells = splitCsvLine(line);
  const [term, meaning = "", example = ""] = cells;
  if (!term || !/^[A-Za-z][A-Za-z'\-\s]{0,80}$/.test(term)) return null;
  return normalizeWord({ term, meaning, example, source: "import" });
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if ((char === "," || char === "\t") && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function normalizeWord(input) {
  const term = String(input.term || input.word || "").trim();
  if (!term) return null;
  return {
    id: input.id || crypto.randomUUID(),
    term,
    meaning: String(input.meaning || input.definition || "").trim(),
    example: String(input.example || input.sentence || "").trim(),
    source: String(input.source || "import").trim(),
    status: input.status || "new",
    dueAt: Number(input.dueAt || Date.now()),
    reviewCount: Number(input.reviewCount || 0),
    createdAt: Number(input.createdAt || Date.now())
  };
}

async function saveSettings() {
  settings = {
    ...settings,
    enabled: els.enabled.checked,
    autoShowMeaning: els.autoShow.checked,
    dailyTarget: Number(els.dailyTarget.value || 10)
  };
  await chrome.storage.local.set({ settings });
}

async function clearWords() {
  if (!confirm("确定清空本地词库吗？这个操作不可恢复。")) return;
  words = [];
  await chrome.storage.local.set({ words });
  render();
}

function exportJson() {
  const blob = new Blob([JSON.stringify({ words, settings }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "workword-backup.json";
  a.click();
  URL.revokeObjectURL(url);
}

function render() {
  els.enabled.checked = settings.enabled;
  els.autoShow.checked = settings.autoShowMeaning;
  els.dailyTarget.value = settings.dailyTarget;

  if (!words.length) {
    els.wordList.innerHTML = '<div class="empty">暂无词汇。导入词书或在网页中选中单词添加。</div>';
    return;
  }

  els.wordList.innerHTML = words
    .slice()
    .sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0))
    .map((word) => `
      <div class="word-row">
        <div>
          <div class="term">${escapeHtml(word.term)}</div>
          <div class="meaning">${escapeHtml(word.meaning || "未填写释义")}</div>
          <div class="meta">${escapeHtml(word.example || word.source || "")}</div>
        </div>
        <div class="meta">${word.reviewCount || 0} 次复习</div>
      </div>
    `)
    .join("");
}

function showStatus(message) {
  els.importStatus.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
