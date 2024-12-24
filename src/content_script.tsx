function extractDOM() {
  const pageContent = document.body.innerHTML;
  return pageContent;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.action === "updateSidePanel") {
    console.log("content script update Sidepanel");
    const pageDOM = extractDOM();
    chrome.runtime.sendMessage({ action: "sendDOM", dom: pageDOM });
  }
});
