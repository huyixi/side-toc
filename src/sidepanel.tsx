import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

const SidePanel = () => {
  const [pageContent, setPageContent] = useState("");

  useEffect(() => {
    const messageListener = (message: any, sender: any, sendResponse: any) => {
      console.log("Message received in sidepanel:", message); // Debug log
      if (message && message.action === "sendDOM") {
        console.log("received dom", message.dom);
        setPageContent(message.dom);
      }
      return true;
    };

    chrome.runtime.onMessage.addListener(messageListener);

    // Test that messaging works
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      console.log("Current active tab:", tabs[0]?.id);
    });

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  return (
    <>
      <p>side panel</p>
      <p>{pageContent}</p> {/* Show first 100 chars for debugging */}
    </>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>
);
