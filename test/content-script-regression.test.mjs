import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const contentScriptPath = path.resolve("src/content_script.tsx");
const contentScriptSource = readFileSync(contentScriptPath, "utf8");

test("keeps a URL polling fallback for SPA navigations", () => {
  assert.match(
    contentScriptSource,
    /const URL_POLL_INTERVAL_MS = \d+;/
  );
  assert.match(
    contentScriptSource,
    /window\.setInterval\(\s*scheduleSyncOnUrlChange,\s*URL_POLL_INTERVAL_MS\s*\)/
  );
});

test("observes text-node mutations for heading label updates", () => {
  const observerOptionsMatch = contentScriptSource.match(
    /observer\.observe\(document\.documentElement,\s*\{([\s\S]*?)\}\);/
  );

  assert.ok(
    observerOptionsMatch,
    "Expected mutation observer options block in content_script.tsx"
  );
  assert.match(observerOptionsMatch[1], /characterData:\s*true/);
});
