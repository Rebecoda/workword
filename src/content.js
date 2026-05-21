(() => {
  const ROOT_ID = "workword-root";
  const DAY = 24 * 60 * 60 * 1000;
  const DEFAULT_SETTINGS = {
    enabled: true,
    compact: false,
    autoShowMeaning: false,
    dailyTarget: 10
  };

  if (window.top !== window || document.getElementById(ROOT_ID)) return;

  let root;
  let shadow;
  let state = {
    settings: DEFAULT_SETTINGS,
    words: [],
    current: null,
    meaningVisible: false,
    minimized: false,
    lastFeedback: "",
    active: false
  };

  init();

  async function init() {
    const data = await chrome.storage.local.get(["words", "settings", "session"]);
    state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    state.words = Array.isArray(data.words) ? data.words : [];
    state.minimized = data.session?.minimized || false;
    state.meaningVisible = state.settings.autoShowMeaning;

    mount();
    chooseCurrent();
    render();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.words) state.words = changes.words.newValue || [];
      if (changes.settings) state.settings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
      chooseCurrent();
      render();
    });

    document.addEventListener("keydown", handleKeydown, true);
    document.addEventListener("selectionchange", handleSelection);
  }

  function mount() {
    root = document.createElement("div");
    root.id = ROOT_ID;
    shadow = root.attachShadow({ mode: "open" });
    document.documentElement.appendChild(root);
  }

  function chooseCurrent() {
    const now = Date.now();
    const due = state.words
      .filter((word) => !word.archived && (!word.dueAt || word.dueAt <= now))
      .sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));
    const pool = due.length ? due : state.words.filter((word) => !word.archived);
    state.current = pool[0] || null;
    state.meaningVisible = state.settings.autoShowMeaning;
  }

  function handleKeydown(event) {
    const target = event.target;
    const isTyping = target && (
      target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
    );

    if (event.altKey && event.key.toLowerCase() === "w") {
      event.preventDefault();
      state.minimized = !state.minimized;
      chrome.storage.local.set({ session: { minimized: state.minimized } });
      render();
      return;
    }

    if (!state.settings.enabled || state.minimized || isTyping) return;
    if (!state.active && !["Escape"].includes(event.key)) return;

    if (event.key === "Escape") {
      state.minimized = true;
      chrome.storage.local.set({ session: { minimized: true } });
      render();
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      state.meaningVisible = !state.meaningVisible;
      render();
      return;
    }

    if (event.key === "1") {
      event.preventDefault();
      review("known");
    } else if (event.key === "2") {
      event.preventDefault();
      review("fuzzy");
    } else if (event.key === "3") {
      event.preventDefault();
      review("unknown");
    }
  }

  function handleSelection() {
    const selection = window.getSelection()?.toString().trim();
    const word = selection?.match(/^[A-Za-z][A-Za-z'-]{1,40}$/)?.[0];
    const addButton = shadow?.querySelector("[data-add-selection]");
    if (!addButton) return;
    addButton.textContent = word ? `Add "${word}"` : "Add selection";
    addButton.disabled = !word;
    addButton.dataset.word = word || "";
  }

  async function addSelectedWord() {
    const selection = window.getSelection()?.toString().trim();
    const term = selection?.match(/^[A-Za-z][A-Za-z'-]{1,40}$/)?.[0];
    if (!term) return;

    const sentence = findSentence(term);
    const normalized = term.toLowerCase();
    const exists = state.words.some((word) => word.term.toLowerCase() === normalized);
    if (exists) {
      state.lastFeedback = "Already saved";
      render();
      return;
    }

    const word = {
      id: crypto.randomUUID(),
      term,
      meaning: "",
      example: sentence,
      source: location.hostname,
      status: "new",
      dueAt: Date.now(),
      reviewCount: 0,
      createdAt: Date.now()
    };
    await chrome.storage.local.set({ words: [word, ...state.words] });
    state.lastFeedback = "Saved";
    setTimeout(() => {
      state.lastFeedback = "";
      render();
    }, 900);
  }

  function findSentence(term) {
    const text = document.body?.innerText || "";
    const index = text.toLowerCase().indexOf(term.toLowerCase());
    if (index < 0) return "";
    const start = Math.max(0, text.lastIndexOf(".", index - 1) + 1);
    const endCandidates = [".", "!", "?", "\n"].map((mark) => text.indexOf(mark, index)).filter((i) => i > index);
    const end = endCandidates.length ? Math.min(...endCandidates) + 1 : Math.min(text.length, index + 160);
    return text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 220);
  }

  async function review(result) {
    if (!state.current) return;
    const now = Date.now();
    const intervals = {
      known: 3 * DAY,
      fuzzy: DAY,
      unknown: 10 * 60 * 1000
    };
    const labels = {
      known: "认识",
      fuzzy: "模糊",
      unknown: "不认识"
    };
    const updated = state.words.map((word) => {
      if (word.id !== state.current.id) return word;
      return {
        ...word,
        status: result,
        dueAt: now + intervals[result],
        reviewCount: (word.reviewCount || 0) + 1,
        lastReviewedAt: now
      };
    });

    state.words = updated;
    state.lastFeedback = `已标记：${labels[result]}`;
    await chrome.storage.local.set({ words: updated });
    setTimeout(() => {
      state.lastFeedback = "";
      chooseCurrent();
      render();
    }, 260);
    render();
  }

  function render() {
    if (!shadow) return;

    const dueCount = state.words.filter((word) => !word.archived && (!word.dueAt || word.dueAt <= Date.now())).length;
    const total = state.words.filter((word) => !word.archived).length;
    const word = state.current;
    const hidden = !state.settings.enabled || state.minimized;

    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .bar {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 2147483647;
          display: ${hidden ? "none" : "grid"};
          grid-template-columns: minmax(96px, 0.45fr) minmax(160px, 1fr) auto;
          align-items: center;
          gap: 8px;
          width: 100vw;
          min-height: 30px;
          box-sizing: border-box;
          padding: 3px 8px 3px 10px;
          border-top: 1px solid rgba(31, 35, 40, 0.12);
          background: rgba(248, 249, 250, 0.92);
          box-shadow: 0 -1px 5px rgba(0, 0, 0, 0.05);
          color: #202124;
          font: 12px/1.25 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          backdrop-filter: blur(8px);
          opacity: 0.88;
          transition: opacity 120ms ease, background 120ms ease;
        }
        .bar:hover,
        .bar:focus-within {
          background: rgba(255, 255, 255, 0.97);
          opacity: 1;
        }
        .bar:focus-within {
          outline: 1px solid rgba(31, 111, 235, 0.45);
          outline-offset: -1px;
        }
        .term {
          display: inline;
          font-size: 13px;
          font-weight: 650;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .meaning {
          color: #2f343d;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .example {
          display: none;
        }
        .actions {
          display: flex;
          align-items: center;
          gap: 4px;
          justify-content: flex-end;
          white-space: nowrap;
        }
        button {
          min-height: 22px;
          border: 1px solid rgba(31, 35, 40, 0.1);
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.56);
          color: #3c4043;
          padding: 2px 6px;
          font: inherit;
          cursor: pointer;
        }
        button:hover { background: rgba(232, 240, 254, 0.8); }
        button:disabled {
          cursor: not-allowed;
          display: none;
        }
        .primary {
          border-color: #1f6feb;
          background: #1f6feb;
          color: white;
        }
        .ghost {
          background: transparent;
        }
        .meta {
          display: inline;
          margin-left: 6px;
          color: #80868b;
          font-size: 11px;
        }
        .feedback {
          color: #188038;
          font-weight: 600;
        }
        .dock {
          position: fixed;
          right: 10px;
          bottom: 8px;
          z-index: 2147483647;
          display: ${hidden ? "block" : "none"};
          border: 1px solid rgba(31, 35, 40, 0.12);
          border-radius: 5px;
          background: rgba(248, 249, 250, 0.92);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          color: #5f6368;
          padding: 4px 8px;
          font: 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          cursor: pointer;
        }
        @media (max-width: 700px) {
          .bar {
            grid-template-columns: minmax(80px, 0.7fr) minmax(100px, 1fr) auto;
            gap: 5px;
            padding: 3px 5px;
          }
          .actions {
            overflow-x: auto;
          }
        }
      </style>
      <button class="dock" data-show>Workword ${dueCount}/${total}</button>
      <section class="bar" tabindex="0" aria-label="Workword review bar">
        <div>
          <div class="term">${escapeHtml(word?.term || "No words due")}</div>
          <div class="meta">${state.lastFeedback ? `<span class="feedback">${escapeHtml(state.lastFeedback)}</span>` : `${dueCount} due · ${total} total`}</div>
        </div>
        <div>
          <div class="meaning">${word ? escapeHtml(state.meaningVisible ? (word.meaning || "未填写释义，可在设置页补充") : "Space 查看释义") : "导入词书或选中网页单词后添加"}</div>
          <div class="example">${escapeHtml(word?.example || "Alt+W 显示/隐藏 · 点击底栏后 1/2/3 快速复习")}</div>
        </div>
        <div class="actions">
          <button data-add-selection disabled>Add selection</button>
          <button class="ghost" data-toggle-meaning>${state.meaningVisible ? "Hide" : "Space"}</button>
          <button data-review="known">1</button>
          <button data-review="fuzzy">2</button>
          <button data-review="unknown">3</button>
          <button class="ghost" data-hide>Esc</button>
        </div>
      </section>
    `;

    shadow.querySelector(".bar")?.addEventListener("focusin", () => {
      state.active = true;
    });
    shadow.querySelector(".bar")?.addEventListener("click", () => {
      state.active = true;
      shadow.querySelector(".bar")?.focus();
    });
    shadow.querySelector("[data-show]")?.addEventListener("click", () => {
      state.minimized = false;
      chrome.storage.local.set({ session: { minimized: false } });
      render();
    });
    shadow.querySelector("[data-hide]")?.addEventListener("click", () => {
      state.minimized = true;
      chrome.storage.local.set({ session: { minimized: true } });
      render();
    });
    shadow.querySelector("[data-toggle-meaning]")?.addEventListener("click", () => {
      state.meaningVisible = !state.meaningVisible;
      render();
    });
    shadow.querySelectorAll("[data-review]").forEach((button) => {
      button.addEventListener("click", () => review(button.dataset.review));
      button.disabled = !word;
    });
    shadow.querySelector("[data-add-selection]")?.addEventListener("click", addSelectedWord);
    handleSelection();
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
