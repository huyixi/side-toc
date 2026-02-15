interface FlatHeading {
  id: string;
  text: string;
  level: number;
}

interface NestedHeading extends FlatHeading {
  Children: NestedHeading[];
}

const UPDATE_DEBOUNCE_MS = 150;
const URL_POLL_INTERVAL_MS = 500;
const ACTIVE_HEADING_TOP_OFFSET = 120;

const DEFAULT_SETTINGS: TocSettings = {
  includeH1: false,
  maxDepth: 6,
  smoothScroll: true,
  compactMode: false,
};

const TOC_SETTING_KEYS: Array<keyof TocSettings> = [
  "includeH1",
  "maxDepth",
  "smoothScroll",
  "compactMode",
];

let currentSettings: TocSettings = { ...DEFAULT_SETTINGS };
let lastSentSignature = "";
let lastActiveHeadingId = "";
let scheduleActiveHeadingUpdate: (() => void) | null = null;

function normalizeSettings(
  rawSettings?: Partial<TocSettings>
): TocSettings {
  const maxDepthValue = Number(rawSettings?.maxDepth);
  const maxDepth = Number.isFinite(maxDepthValue)
    ? Math.min(6, Math.max(2, Math.round(maxDepthValue)))
    : DEFAULT_SETTINGS.maxDepth;

  return {
    includeH1:
      typeof rawSettings?.includeH1 === "boolean"
        ? rawSettings.includeH1
        : DEFAULT_SETTINGS.includeH1,
    maxDepth,
    smoothScroll:
      typeof rawSettings?.smoothScroll === "boolean"
        ? rawSettings.smoothScroll
        : DEFAULT_SETTINGS.smoothScroll,
    compactMode:
      typeof rawSettings?.compactMode === "boolean"
        ? rawSettings.compactMode
        : DEFAULT_SETTINGS.compactMode,
  };
}

function loadSettings(onLoaded?: () => void) {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
    currentSettings = normalizeSettings(items as Partial<TocSettings>);
    onLoaded?.();
  });
}

function getHeadingSelector(): string {
  const selectors: string[] = [];
  const startLevel = currentSettings.includeH1 ? 1 : 2;

  for (let level = startLevel; level <= currentSettings.maxDepth; level += 1) {
    selectors.push(`h${level}`);
  }

  return selectors.join(", ");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function getHeadingText(heading: Element): string {
  const text = heading.textContent?.trim();
  return text && text.length > 0 ? text : "Untitled section";
}

function ensureUniqueHeadingId(
  heading: HTMLHeadingElement,
  usedIds: Set<string>
): string {
  const existingId = heading.id.trim();
  const baseId =
    existingId.length > 0 ? existingId : slugify(getHeadingText(heading));
  const normalizedBaseId = baseId.length > 0 ? baseId : "section";
  let candidateId = normalizedBaseId;
  let suffix = 2;

  while (
    usedIds.has(candidateId) ||
    (document.getElementById(candidateId) !== null &&
      document.getElementById(candidateId) !== heading)
  ) {
    candidateId = `${normalizedBaseId}-${suffix}`;
    suffix += 1;
  }

  if (heading.id !== candidateId) {
    heading.id = candidateId;
  }
  usedIds.add(candidateId);

  return candidateId;
}

function getHeadingElementsWithIds(): HTMLHeadingElement[] {
  const selector = getHeadingSelector();
  if (!selector) {
    return [];
  }

  const headings = document.querySelectorAll<HTMLHeadingElement>(selector);
  const usedIds = new Set<string>();
  const headingArray = Array.from(headings);

  headingArray.forEach((heading) => {
    ensureUniqueHeadingId(heading, usedIds);
  });

  return headingArray;
}

function extractHeadings(): FlatHeading[] {
  const headings = getHeadingElementsWithIds();
  return headings.map((heading) => ({
    id: heading.id,
    text: getHeadingText(heading),
    level: parseInt(heading.tagName.substring(1), 10),
  }));
}

function convertToNestedHeadings(flatHeadings: FlatHeading[]): NestedHeading[] {
  const root: { Children: NestedHeading[] } = { Children: [] };
  const stack = [root];

  for (const heading of flatHeadings) {
    const node: NestedHeading = {
      id: heading.id,
      text: heading.text,
      level: heading.level,
      Children: [],
    };

    while (
      stack.length > 1 &&
      (stack[stack.length - 1] as NestedHeading).level >= node.level
    ) {
      stack.pop();
    }
    stack[stack.length - 1].Children.push(node);
    stack.push(node);
  }

  return root.Children;
}

function getPageTitle(): string {
  const docTitle = document.title?.trim();
  if (docTitle) {
    return docTitle;
  }

  const headingTitle = document.querySelector("h1")?.textContent?.trim();
  if (headingTitle) {
    return headingTitle;
  }

  return "Untitled page";
}

function getPageInfo(): { pageInfo: PageInfo; signature: string } {
  const headings = extractHeadings();
  const nestedHeadings = convertToNestedHeadings(headings);
  const title = getPageTitle();
  const signature = [
    title,
    currentSettings.includeH1 ? "h1:on" : "h1:off",
    `max:${currentSettings.maxDepth}`,
    ...headings.map((heading) => `${heading.id}:${heading.level}:${heading.text}`),
  ].join("|");

  return {
    pageInfo: {
      title,
      nestedHeadings,
    },
    signature,
  };
}

function getCurrentActiveHeadingId(): string {
  const headings = getHeadingElementsWithIds();
  if (headings.length === 0) {
    return "";
  }

  // Prefer the first heading currently visible in the viewport.
  // This keeps parent sections (for example h1) active until they leave view.
  const viewportHeight = window.innerHeight;
  const firstVisibleHeading = headings.find((heading) => {
    const rect = heading.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < viewportHeight;
  });

  if (firstVisibleHeading) {
    return firstVisibleHeading.id;
  }

  // Fallback when no heading is visible (for example between sections):
  // use the most recent heading above the reading line.
  let activeHeading = headings[0];
  for (const heading of headings) {
    if (heading.getBoundingClientRect().top <= ACTIVE_HEADING_TOP_OFFSET) {
      activeHeading = heading;
      continue;
    }
    break;
  }

  return activeHeading.id;
}

function sendActiveHeading(headingId: string) {
  if (headingId === lastActiveHeadingId) {
    return;
  }

  lastActiveHeadingId = headingId;
  chrome.runtime.sendMessage(
    {
      action: "activeHeadingChanged",
      headingId,
    },
    () => {
      void chrome.runtime.lastError;
    }
  );
}

function sendPageInfo(force = false) {
  const { pageInfo, signature } = getPageInfo();
  if (!force && signature === lastSentSignature) {
    sendActiveHeading(getCurrentActiveHeadingId());
    return;
  }

  lastSentSignature = signature;
  chrome.runtime.sendMessage(
    {
      action: "sendPageInfo",
      title: pageInfo.title,
      nestedHeadings: pageInfo.nestedHeadings,
    },
    () => {
      void chrome.runtime.lastError;
    }
  );

  sendActiveHeading(getCurrentActiveHeadingId());
}

function scrollToHeading(headingId: string) {
  const heading = document.getElementById(headingId);
  if (!heading) {
    return;
  }

  heading.scrollIntoView({
    behavior: currentSettings.smoothScroll ? "smooth" : "auto",
    block: "start",
  });
}

function setupAutoSync() {
  let timeoutId: number | null = null;
  let previousUrl = location.href;

  const scheduleSync = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }

    timeoutId = window.setTimeout(() => {
      timeoutId = null;
      sendPageInfo();
    }, UPDATE_DEBOUNCE_MS);
  };

  const observer = new MutationObserver(() => {
    scheduleSync();
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  window.setInterval(() => {
    if (location.href !== previousUrl) {
      previousUrl = location.href;
      scheduleSync();
    }
  }, URL_POLL_INTERVAL_MS);

  window.addEventListener("popstate", scheduleSync);
  window.addEventListener("hashchange", scheduleSync);
}

function setupActiveHeadingTracking() {
  let isTicking = false;

  const updateActiveHeading = () => {
    isTicking = false;
    sendActiveHeading(getCurrentActiveHeadingId());
  };

  const schedule = () => {
    if (isTicking) {
      return;
    }
    isTicking = true;
    window.requestAnimationFrame(updateActiveHeading);
  };

  scheduleActiveHeadingUpdate = schedule;

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  window.addEventListener("hashchange", schedule);
  schedule();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.action === "updateSidePanel") {
    sendPageInfo(true);
    sendResponse({ ok: true });
    return false;
  }

  if (message && message.action === "scrollToHeading") {
    const headingId = message.headingId;
    if (typeof headingId === "string") {
      scrollToHeading(headingId);
    }
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") {
    return;
  }

  const hasRelevantChange = TOC_SETTING_KEYS.some((key) => key in changes);
  if (!hasRelevantChange) {
    return;
  }

  loadSettings(() => {
    lastSentSignature = "";
    sendPageInfo(true);
    scheduleActiveHeadingUpdate?.();
  });
});

loadSettings(() => {
  sendPageInfo(true);
  setupAutoSync();
  setupActiveHeadingTracking();
});
