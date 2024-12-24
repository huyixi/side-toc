import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

const SidePanel = () => {
  const [pageContent, setPageContent] = useState("");

  useEffect(() => {
    const messageListener = (message: any, sender: any, sendResponse: any) => {
      console.log("Message received in sidepanel:", message); // Debug log
      if (message && message.action === "sendDOM") {
        console.log("received nestedHeadings", message.nestedHeadings);
        setPageContent(message.nestedHeadings);
      }
      return true;
    };

    chrome.runtime.onMessage.addListener(messageListener);

    return;
  }, []);

  return (
    <>
      <p>side panel</p>
    </>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>
);
