import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const contentScriptPath = path.resolve("src/content_script.tsx");
const contentScriptSource = readFileSync(contentScriptPath, "utf8");
const backgroundPath = path.resolve("src/background.ts");
const backgroundSource = readFileSync(backgroundPath, "utf8");
const sidePanelPath = path.resolve("src/sidepanel.tsx");
const sidePanelSource = readFileSync(sidePanelPath, "utf8");

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

test("guards against duplicate content script initialization", () => {
  assert.match(
    contentScriptSource,
    /const CONTENT_SCRIPT_INITIALIZED_FLAG = "__SIDE_TOC_CONTENT_SCRIPT_INITIALIZED__";/
  );
  assert.match(
    contentScriptSource,
    /if \(!contentScriptWindow\[CONTENT_SCRIPT_INITIALIZED_FLAG\]\) \{[\s\S]*initializeContentScript\(\);[\s\S]*\}/
  );
});

test("repairs missing receivers by injecting the content script and retrying", () => {
  assert.match(
    backgroundSource,
    /chrome\.scripting\.executeScript\(\s*\{[\s\S]*files:\s*CONTENT_SCRIPT_FILES,[\s\S]*\}\s*\)/
  );
  assert.match(backgroundSource, /if \(!isInjectablePageUrl\(tabUrl\)\) \{/);
  assert.match(
    backgroundSource,
    /const retryResult = await sendMessageToTab\(tabId,\s*\{[\s\S]*action:\s*"updateSidePanel",[\s\S]*\}\);/
  );
});

test("only notifies connected side panels about sync errors", () => {
  assert.match(backgroundSource, /const sidePanelPorts = new Set<chrome\.runtime\.Port>\(\);/);
  assert.match(backgroundSource, /if \(sidePanelPorts\.size === 0\) \{\s*return;\s*\}/);
  assert.match(backgroundSource, /chrome\.runtime\.onConnect\.addListener\(\(port\) => \{/);
  assert.match(backgroundSource, /port\.postMessage\(message\);/);
  assert.match(
    sidePanelSource,
    /const sidePanelPort = chrome\.runtime\.connect\(\{\s*name:\s*"sidepanel"\s*\}\);/
  );
});

test("distinguishes unsupported pages from stale or missing content scripts", () => {
  assert.match(sidePanelSource, /status === "unsupported" \|\| status === "disconnected"/);
  assert.match(
    sidePanelSource,
    /This page is supported, but the content script is missing or stale\./
  );
  assert.match(
    sidePanelSource,
    /This page cannot be scanned \(for example Chrome internal pages\)\./
  );
});
