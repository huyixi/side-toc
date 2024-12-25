interface NestedHeading {
  text: string;
  level: number;
  Children?: NestedHeading[];
}

interface PageInfo {
  title: string;
  nestedHeadings: NestedHeading[];
}
