interface NestedHeading {
  id: string;
  text: string;
  level: number;
  Children: NestedHeading[];
}

interface PageInfo {
  title: string;
  nestedHeadings: NestedHeading[];
}

type SidePanelSyncErrorReason = "unsupportedPage" | "missingContentScript";

interface TocSettings {
  includeH1: boolean;
  maxDepth: number;
  smoothScroll: boolean;
  compactMode: boolean;
}
