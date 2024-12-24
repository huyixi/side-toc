import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

const SidePanel = () => {
  const [nestedHeading, setNestedHeading] = useState([]);

  useEffect(() => {
    const messageListener = (message: any, sender: any, sendResponse: any) => {
      if (message && message.action === "sendNestedHeadings") {
        console.log("received nestedHeadings", message.nestedHeadings);
        setNestedHeading(message.nestedHeadings);
        console.log("nestedHeading", nestedHeading);
      }
      return true;
    };

    chrome.runtime.onMessage.addListener(messageListener);

    return;
  }, [nestedHeading]);

  interface NestedHeading {
    text: string;
    Children?: NestedHeading[];
  }

  const HeadingTree = ({ data }: { data: NestedHeading[] }) => {
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    return (
      <ul>
        {data.map((heading: NestedHeading) => (
          <li key={heading.text}>
            <a
              href={`#${heading.text?.toLowerCase().replace(/\s+/g, "-")}`}
              onClick={(e) => {
                e.preventDefault();
                console.log("clicked on heading", heading.text);
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
      <h1>side panel</h1>
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
