chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== "install") return;

  const existing = await chrome.storage.local.get(["words", "settings"]);
  const words = Array.isArray(existing.words) && existing.words.length
    ? existing.words
    : [
        {
          id: crypto.randomUUID(),
          term: "abandon",
          meaning: "放弃；抛弃",
          example: "The team decided to abandon the old plan.",
          source: "starter",
          status: "new",
          dueAt: Date.now(),
          reviewCount: 0,
          createdAt: Date.now()
        },
        {
          id: crypto.randomUUID(),
          term: "brief",
          meaning: "简短的；简报",
          example: "Send me a brief update before the meeting.",
          source: "starter",
          status: "new",
          dueAt: Date.now(),
          reviewCount: 0,
          createdAt: Date.now()
        },
        {
          id: crypto.randomUUID(),
          term: "priority",
          meaning: "优先事项；优先权",
          example: "This task is our top priority today.",
          source: "starter",
          status: "new",
          dueAt: Date.now(),
          reviewCount: 0,
          createdAt: Date.now()
        }
      ];

  const settings = existing.settings || {
    enabled: true,
    compact: false,
    autoShowMeaning: false,
    dailyTarget: 10
  };

  await chrome.storage.local.set({ words, settings });
});
