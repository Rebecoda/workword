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
          left: 50%;
          bottom: 14px;
          transform: translateX(-50%);
          z-index: 2147483647;
          display: ${hidden ? "none" : "grid"};
          grid-template-columns: minmax(120px, 0.8fr) minmax(220px, 1.4fr) auto;
          align-items: center;
          gap: 12px;
          width: min(920px, calc(100vw - 28px));
          min-height: 48px;
          box-sizing: border-box;
          padding: 8px 10px 8px 14px;
          border: 1px solid rgba(32, 36, 41, 0.12);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
          color: #16181d;
          font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          backdrop-filter: blur(10px);
        }
        .bar:focus-within {
          outline: 2px solid #2f6feb;
          outline-offset: 2px;
        }
        .term {
          font-size: 18px;
          font-weight: 700;
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
          color: #69717d;
          font-size: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .actions {
          display: flex;
          align-items: center;
          gap: 6px;
          justify-content: flex-end;
          white-space: nowrap;
        }
        button {
          border: 1px solid rgba(32, 36, 41, 0.14);
          border-radius: 6px;
          background: #f6f8fa;
          color: #1f2328;
          padding: 6px 9px;
          font: inherit;
          cursor: pointer;
        }
        button:hover { background: #eef2f6; }
        button:disabled {
          cursor: not-allowed;
          opacity: 0.52;
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
          color: #69717d;
          font-size: 12px;
        }
        .feedback {
          color: #1a7f37;
          font-weight: 600;
        }
        .dock {
          position: fixed;
          right: 16px;
          bottom: 16px;
          z-index: 2147483647;
          display: ${hidden ? "block" : "none"};
          border: 1px solid rgba(32, 36, 41, 0.14);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.94);
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.16);
          color: #1f2328;
          padding: 7px 11px;
          font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          cursor: pointer;
        }
        @media (max-width: 700px) {
          .bar {
            grid-template-columns: 1fr;
            align-items: stretch;
          }
          .actions {
            justify-content: flex-start;
            flex-wrap: wrap;
          }
          .meaning,
          .example {
            white-space: normal;
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
          <button data-review="known">1 认识</button>
          <button data-review="fuzzy">2 模糊</button>
          <button data-review="unknown">3 不认识</button>
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
