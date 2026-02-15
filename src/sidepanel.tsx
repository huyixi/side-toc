import React, { useEffect, useState } from "react";
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

function countHeadings(items: NestedHeading[]): number {
  return items.reduce((count, heading) => {
    return count + 1 + countHeadings(heading.Children);
  }, 0);
}

const SidePanel = () => {
  const [nestedHeadings, setNestedHeadings] = useState<NestedHeading[]>([]);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [activeHeadingId, setActiveHeadingId] = useState("");
  const [compactMode, setCompactMode] = useState(false);

  function loadSettings() {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
      setCompactMode(Boolean(items.compactMode));
    });
  }

  function sendMessageToActiveTab(
    payload: Record<string, unknown>,
    onConnectionError?: () => void
  ) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab.id) {
        onConnectionError?.();
        return;
      }

      chrome.tabs.sendMessage(tab.id, payload, () => {
        const messageError = chrome.runtime.lastError;
        if (messageError) {
          if (isIgnorableMessageError(messageError.message)) {
            return;
          }
          onConnectionError?.();
        }
      });
    });
  }

  function sendUpdateSidePanel() {
    setStatus("loading");
    setErrorMessage("");

    sendMessageToActiveTab(
      { action: "updateSidePanel" },
      () => {
        setStatus("error");
        setErrorMessage(
          "This page cannot be scanned (for example Chrome internal pages)."
        );
      }
    );
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
    const messageListener = (message: any) => {
      if (!message) {
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

    chrome.runtime.onMessage.addListener(messageListener);
    chrome.storage.onChanged.addListener(storageListener);

    loadSettings();
    sendUpdateSidePanel();

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.storage.onChanged.removeListener(storageListener);
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

  const headingCount = countHeadings(nestedHeadings);

  return (
    <div className={`panel-root ${compactMode ? "panel-root-compact" : ""}`}>
      <header className="panel-header">
        <h1 className="panel-title">{title || "Table of Contents"}</h1>
        {status === "ready" && (
          <p className="panel-meta">
            {headingCount} {headingCount === 1 ? "heading" : "headings"}
          </p>
        )}
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
