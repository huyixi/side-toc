import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const SidePanel = () => {
  const [nestedHeading, setNestedHeading] = useState([]);
  const [title, setTitle] = useState("");

  useEffect(() => {
    const messageListener = (message: any, sender: any, sendResponse: any) => {
      if (message && message.action === "sendPageInfo") {
        setNestedHeading(message.nestedHeadings);
        setTitle(message.title);
      }
      return true;
    };

    chrome.runtime.onMessage.addListener(messageListener);

    return;
  }, [nestedHeading]);

  interface NestedHeading {
    text: string;
    level: number;
    Children?: NestedHeading[];
  }

  const HeadingTree = ({ data }: { data: NestedHeading[] }) => {
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    return (
      <ul className="heading-tree-x">
        {data.map((heading: NestedHeading) => (
          <li
            key={heading.text}
            style={{ marginLeft: `${heading.level * 4}px` }}
          >
            <a
              href={`#${heading.text?.toLowerCase().replace(/\s+/g, "-")}`}
              onClick={(e) => {
                e.preventDefault();
                chrome.tabs.query(
                  { active: true, currentWindow: true },
                  ([tab]) => {
                    if (tab.id) {
                      chrome.tabs.sendMessage(tab.id, {
                        action: "scrollToHeading",
                        headingText: heading.text,
                      });
                    }
                  }
                );
              }}
            >
              {heading.text}
            </a>
            {heading.Children && heading.Children.length > 0 && (
              <HeadingTree data={heading.Children} />
            )}
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
