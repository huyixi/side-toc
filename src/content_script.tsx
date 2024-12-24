import { Children } from "react";

interface FlatHeading {
  text: string | null;
  level: number;
}

interface NestedHeading extends FlatHeading {
  Children: NestedHeading[];
}

function extractHeading(): FlatHeading[] {
  const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");

  const flatHeadings = Array.from(headings).map((heading) => ({
    text: heading.textContent,
    level: parseInt(heading.tagName.substring(1)),
  }));

  return flatHeadings;
}

const convertToNestedHeading = (flatHeadings: FlatHeading[]): NestedHeading[] => {
  const root: { Children: NestedHeading[] } = {
    Children: [],
  };
  const stack = [root];

  for (const heading of flatHeadings) {
    const node: NestedHeading = {
      text: heading.text,
      level: heading.level,
      Children: [],
    };

    while (stack.length > 1 && (stack[stack.length - 1] as NestedHeading).level >= node.level) {
      stack.pop();
    }
    stack[stack.length - 1].Children.push(node);
    stack.push(node);
  }
  console.log("root", root);
  return root.Children;
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.action === "updateSidePanel") {
    console.log("content script received updateSidePanel message");
    const headings = extractHeading();
    const nestedHeadings = convertToNestedHeading(headings);
    console.log("sending headings to sidepanel:", nestedHeadings);

    chrome.runtime.sendMessage({
      action: "sendNestedHeadings",
      nestedHeadings,
    });
  } else if (message && message.action === "scrollToHeading") {
    const headingText = message.headingText;
    scrollToHeading(headingText);
  }
});
function scrollToHeading(headingText: string) {
  const heading = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).find((h) => h.textContent === headingText);
  heading?.scrollIntoView({ behavior: "smooth" });
}
