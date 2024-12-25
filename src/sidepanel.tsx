import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const SidePanel = () => {
  const [nestedHeading, setNestedHeading] = useState<NestedHeading[]>([]);
  const [title, setTitle] = useState("");

  function sendUpdateSidePanel() {
    console.log("senddddddd");
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab.id) {
        console.log("sendd2222");
        chrome.tabs.sendMessage(tab.id, { action: "updateSidePanel" });
      }
    });
  }

  function updateSidePanel(pageInfo: PageInfo) {
    setNestedHeading(pageInfo.nestedHeadings);
    setTitle(pageInfo.title);
  }

  useEffect(() => {
    const messageListener = (message: any, sender: any, sendResponse: any) => {
      if (message && message.action === "sendPageInfo") {
        console.log("sidepanel receive sendpageinfo message");
        updateSidePanel(message);
      }
      return true;
    };

    chrome.runtime.onMessage.addListener(messageListener);

    sendUpdateSidePanel();

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  const HeadingTree = ({ data }: { data: NestedHeading[] }) => {
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    return (
      <ul className="heading-tree-x">
        {data.map((heading: NestedHeading) => (
          <li key={heading.text} style={{ marginLeft: `${heading.level * 4}px` }}>
            <a
              href={`#${heading.text?.toLowerCase().replace(/\s+/g, "-")}`}
              onClick={(e) => {
                e.preventDefault();
                chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
                  if (tab.id) {
                    chrome.tabs.sendMessage(tab.id, {
                      action: "scrollToHeading",
                      headingText: heading.text,
                    });
                  }
                });
              }}
            >
              {heading.text}
            </a>
            {heading.Children && heading.Children.length > 0 && <HeadingTree data={heading.Children} />}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <>
      <h1>{title}</h1>
      <div>
        <HeadingTree data={nestedHeading} />
      </div>
    </>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>
);
