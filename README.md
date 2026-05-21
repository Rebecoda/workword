# Workword

A local-first Chrome extension prototype for low-distraction vocabulary review while browsing.

## Local Preview

1. Open Chrome and go to `chrome://extensions`.
2. Turn on `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder:

   `/Users/rebeccapan/Documents/Codex/2026-05-21/chrome`

5. Open a normal website, such as `https://example.com`.
6. Click the bottom review bar once, then use the keyboard shortcuts.

Chrome cannot inject extensions into internal pages like `chrome://extensions`, the Chrome Web Store, or some browser-managed pages.

## Shortcuts

| Key | Action |
| --- | --- |
| `Option/Alt + W` | Show or hide the review bar |
| `Space` | Show or hide meaning |
| `1` | Mark as known |
| `2` | Mark as fuzzy |
| `3` | Mark as unknown |
| `Esc` | Hide the bar |

The `1/2/3` shortcuts only work after the bottom bar has focus, so regular typing on webpages is not interrupted.

## Import Format

Open the extension popup and click `管理词书`, then paste CSV/TXT content:

```csv
abandon,放弃；抛弃,abandon the plan
brief,简短的；简报,send a brief update
priority,优先事项；优先权,this task is our top priority
```

Each row can also contain only one word. JSON backup import is supported through the same text box.

## Current Scope

- Local storage only
- Bottom fixed review bar
- CSV/TXT/JSON import
- JSON export
- Webpage selected-word capture
- Simple review scheduling

No account, no cloud sync, and no third-party word app integration in this prototype.
