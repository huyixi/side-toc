import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type LoadState = "loading" | "ready" | "empty" | "error";

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

  function loadSettings() {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
      setCompactMode(Boolean(items.compactMode));
    });
  }

  function showPageScanError() {
    setNestedHeadings([]);
    setActiveHeadingId("");
    setStatus("error");
    setErrorMessage(
      "This page cannot be scanned (for example Chrome internal pages)."
    );
  }

  function syncActiveTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      const tabId = typeof tab?.id === "number" ? tab.id : null;
      activeTabIdRef.current = tabId;
      setStatus("loading");
      setErrorMessage("");
      setActiveHeadingId("");
    });
  }

  function requestRefreshFromBackground() {
    setStatus("loading");
    setErrorMessage("");

    chrome.runtime.sendMessage({ action: "refreshActiveTabToc" }, (response) => {
      const messageError = chrome.runtime.lastError;
      if (messageError && !isIgnorableMessageError(messageError.message)) {
        showPageScanError();
        return;
      }

      if (!response || response.ok !== true) {
        showPageScanError();
      }
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
        onConnectionError?.();
        return;
      }

      sendMessageToTab(tab.id, payload, onConnectionError);
    });
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
        if (typeof senderTabId === "number") {
          activeTabIdRef.current = senderTabId;
        }
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

      if (message.action === "sidePanelSyncError") {
        const failedTabId =
          typeof message.tabId === "number" ? message.tabId : null;
        if (
          failedTabId !== null &&
          typeof activeTabIdRef.current === "number" &&
          failedTabId !== activeTabIdRef.current
        ) {
          return;
        }

        if (failedTabId !== null) {
          activeTabIdRef.current = failedTabId;
        }
        showPageScanError();
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
      activeTabIdRef.current = activeInfo.tabId;
      setStatus("loading");
      setErrorMessage("");
      setActiveHeadingId("");
    };

    const windowFocusChangedListener = (windowId: number) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) {
        return;
      }
      syncActiveTab();
    };

    chrome.runtime.onMessage.addListener(messageListener);
    chrome.storage.onChanged.addListener(storageListener);
    chrome.tabs.onActivated.addListener(tabActivatedListener);
    chrome.windows.onFocusChanged.addListener(windowFocusChangedListener);

    loadSettings();
    syncActiveTab();
    requestRefreshFromBackground();

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.storage.onChanged.removeListener(storageListener);
      chrome.tabs.onActivated.removeListener(tabActivatedListener);
      chrome.windows.onFocusChanged.removeListener(windowFocusChangedListener);
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
              <button
                type="button"
                className={`toc-link ${isActive ? "toc-link-active" : ""}`}
                aria-current={isActive ? "location" : undefined}
                onClick={() => {
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
              </button>
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
