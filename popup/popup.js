const DEFAULT_SETTINGS = {
  enabled: true,
  compact: false,
  autoShowMeaning: false,
  dailyTarget: 10
};

const enabled = document.querySelector("#enabled");
const stats = document.querySelector("#stats");
const optionsButton = document.querySelector("#open-options");

init();

async function init() {
  const data = await chrome.storage.local.get(["settings", "words"]);
  const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  const words = Array.isArray(data.words) ? data.words : [];
  const due = words.filter((word) => !word.archived && (!word.dueAt || word.dueAt <= Date.now())).length;

  enabled.checked = settings.enabled;
  stats.textContent = `${due} 个待复习 · ${words.length} 个词`;

  enabled.addEventListener("change", async () => {
    await chrome.storage.local.set({
      settings: { ...settings, enabled: enabled.checked }
    });
    stats.textContent = enabled.checked ? `${due} 个待复习 · ${words.length} 个词` : "已暂停";
  });

  optionsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

}
