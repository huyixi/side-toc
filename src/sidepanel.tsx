import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type LoadState = "loading" | "ready" | "empty" | "error";
const ACTIVE_TAB_POLL_INTERVAL_MS = 800;

const DEFAULT_SETTINGS: TocSettings = {
  includeH1: false,
  maxDepth: 6,
  smoothScroll: true,
  compactMode: false,
};

function isIgnorableMessageError(message?: string): boolean {
  if (!message) {
    return false;
  }

  return (
    message.includes("A listener indicated an asynchronous response") ||
    message.includes("The message port closed before a response was received")
  );
}

const SidePanel = () => {
  const [nestedHeadings, setNestedHeadings] = useState<NestedHeading[]>([]);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [activeHeadingId, setActiveHeadingId] = useState("");
  const [compactMode, setCompactMode] = useState(false);
  const activeTabIdRef = useRef<number | null>(null);
  const activeTabUrlRef = useRef<string | null>(null);

  function loadSettings() {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
      setCompactMode(Boolean(items.compactMode));
    });
  }

  function sendMessageToTab(
    tabId: number,
    payload: Record<string, unknown>,
    onConnectionError?: () => void
  ) {
    activeTabIdRef.current = tabId;
    chrome.tabs.sendMessage(tabId, payload, () => {
      const messageError = chrome.runtime.lastError;
      if (messageError) {
        if (isIgnorableMessageError(messageError.message)) {
          return;
        }
        onConnectionError?.();
      }
    });
  }

  function sendMessageToActiveTab(
    payload: Record<string, unknown>,
    onConnectionError?: () => void
  ) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab.id) {
        activeTabIdRef.current = null;
        activeTabUrlRef.current = null;
        onConnectionError?.();
        return;
      }

      activeTabUrlRef.current = typeof tab.url === "string" ? tab.url : null;
      sendMessageToTab(tab.id, payload, onConnectionError);
    });
  }

  function sendUpdateSidePanel(tabId?: number) {
    setStatus("loading");
    setErrorMessage("");

    const onConnectionError = () => {
      setStatus("error");
      setErrorMessage(
        "This page cannot be scanned (for example Chrome internal pages)."
      );
    };

    if (typeof tabId === "number") {
      sendMessageToTab(tabId, { action: "updateSidePanel" }, onConnectionError);
      return;
    }

    sendMessageToActiveTab({ action: "updateSidePanel" }, onConnectionError);
  }

  function updateSidePanel(pageInfo: PageInfo) {
    const pageTitle =
      typeof pageInfo.title === "string" && pageInfo.title.trim()
        ? pageInfo.title.trim()
        : "Untitled page";
    const headings = Array.isArray(pageInfo.nestedHeadings)
      ? pageInfo.nestedHeadings
      : [];

    setNestedHeadings(headings);
    setTitle(pageTitle);
    setStatus(headings.length > 0 ? "ready" : "empty");
    setErrorMessage("");
  }

  useEffect(() => {
    const messageListener = (
      message: any,
      sender: chrome.runtime.MessageSender
    ) => {
      if (!message) {
        return;
      }

      const senderTabId = sender.tab?.id;
      if (
        typeof senderTabId === "number" &&
        typeof activeTabIdRef.current === "number" &&
        senderTabId !== activeTabIdRef.current
      ) {
        return;
      }

      if (message.action === "sendPageInfo") {
        updateSidePanel({
          title: message.title,
          nestedHeadings: message.nestedHeadings,
        });
      }

      if (message.action === "activeHeadingChanged") {
        setActiveHeadingId(
          typeof message.headingId === "string" ? message.headingId : ""
        );
      }
    };

    const storageListener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== "sync") {
        return;
      }

      if (changes.compactMode) {
        setCompactMode(Boolean(changes.compactMode.newValue));
      }
    };

    const tabActivatedListener = (activeInfo: chrome.tabs.TabActiveInfo) => {
      chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (chrome.runtime.lastError) {
          return;
        }
        activeTabUrlRef.current = typeof tab?.url === "string" ? tab.url : null;
      });
      sendUpdateSidePanel(activeInfo.tabId);
    };

    const tabUpdatedListener = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab
    ) => {
      if (!tab.active) {
        return;
      }

      if (changeInfo.status === "complete" || typeof changeInfo.url === "string") {
        activeTabUrlRef.current = typeof tab.url === "string" ? tab.url : null;
        sendUpdateSidePanel(tabId);
      }
    };

    const windowFocusChangedListener = (windowId: number) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) {
        return;
      }
      sendUpdateSidePanel();
    };

    const syncActiveTab = () => {
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        const tabId = typeof tab?.id === "number" ? tab.id : null;
        const tabUrl = typeof tab?.url === "string" ? tab.url : null;

        if (tabId === null) {
          activeTabIdRef.current = null;
          activeTabUrlRef.current = null;
          return;
        }

        const isChanged =
          tabId !== activeTabIdRef.current || tabUrl !== activeTabUrlRef.current;

        if (!isChanged) {
          return;
        }

        activeTabUrlRef.current = tabUrl;
        sendUpdateSidePanel(tabId);
      });
    };

    chrome.runtime.onMessage.addListener(messageListener);
    chrome.storage.onChanged.addListener(storageListener);
    chrome.tabs.onActivated.addListener(tabActivatedListener);
    chrome.tabs.onUpdated.addListener(tabUpdatedListener);
    chrome.windows.onFocusChanged.addListener(windowFocusChangedListener);

    loadSettings();
    sendUpdateSidePanel();
    const syncInterval = window.setInterval(syncActiveTab, ACTIVE_TAB_POLL_INTERVAL_MS);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.storage.onChanged.removeListener(storageListener);
      chrome.tabs.onActivated.removeListener(tabActivatedListener);
      chrome.tabs.onUpdated.removeListener(tabUpdatedListener);
      chrome.windows.onFocusChanged.removeListener(windowFocusChangedListener);
      window.clearInterval(syncInterval);
    };
  }, []);

  const HeadingTree = ({
    data,
    depth = 0,
  }: {
    data: NestedHeading[];
    depth?: number;
  }) => {
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    return (
      <ul className={`heading-tree-x ${depth > 0 ? "heading-tree-nested" : ""}`}>
        {data.map((heading: NestedHeading) => {
          const isActive = activeHeadingId === heading.id;

          return (
            <li className="toc-item" key={heading.id}>
              <a
                className={`toc-link ${isActive ? "toc-link-active" : ""}`}
                aria-current={isActive ? "location" : undefined}
                href={`#${heading.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveHeadingId(heading.id);

                  sendMessageToActiveTab(
                    {
                      action: "scrollToHeading",
                      headingId: heading.id,
                    },
                    () => {
                      setStatus("error");
                      setErrorMessage(
                        "Could not connect to the page. Reload the tab and try again."
                      );
                    }
                  );
                }}
              >
                <span className="toc-label">{heading.text}</span>
              </a>
              {heading.Children.length > 0 && (
                <HeadingTree data={heading.Children} depth={depth + 1} />
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className={`panel-root ${compactMode ? "panel-root-compact" : ""}`}>
      <header className="panel-header">
        <h1 className="panel-title">{title || "Table of Contents"}</h1>
      </header>

      {status === "loading" && <p className="panel-state">Loading headings...</p>}
      {status === "empty" && (
        <p className="panel-state">No headings found on this page.</p>
      )}
      {status === "error" && (
        <p className="panel-state panel-state-error">
          {errorMessage || "Unable to read this page."}
        </p>
      )}
      {status === "ready" && (
        <nav className="toc-nav" aria-label="Table of contents">
          <HeadingTree data={nestedHeadings} />
        </nav>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>
);
