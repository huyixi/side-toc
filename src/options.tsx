import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const DEFAULT_SETTINGS: TocSettings = {
  includeH1: false,
  maxDepth: 6,
  smoothScroll: true,
  compactMode: false,
};

const MAX_DEPTH_OPTIONS = [2, 3, 4, 5, 6];

function normalizeSettings(rawSettings?: Partial<TocSettings>): TocSettings {
  const maxDepthValue = Number(rawSettings?.maxDepth);
  const maxDepth = Number.isFinite(maxDepthValue)
    ? Math.min(6, Math.max(2, Math.round(maxDepthValue)))
    : DEFAULT_SETTINGS.maxDepth;

  return {
    includeH1:
      typeof rawSettings?.includeH1 === "boolean"
        ? rawSettings.includeH1
        : DEFAULT_SETTINGS.includeH1,
    maxDepth,
    smoothScroll:
      typeof rawSettings?.smoothScroll === "boolean"
        ? rawSettings.smoothScroll
        : DEFAULT_SETTINGS.smoothScroll,
    compactMode:
      typeof rawSettings?.compactMode === "boolean"
        ? rawSettings.compactMode
        : DEFAULT_SETTINGS.compactMode,
  };
}

const Options = () => {
  const [settings, setSettings] = useState<TocSettings>(DEFAULT_SETTINGS);
  const [statusText, setStatusText] = useState("Loading settings...");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (storedSettings) => {
      setSettings(normalizeSettings(storedSettings as Partial<TocSettings>));
      setStatusText("");
    });
  }, []);

  function setField<K extends keyof TocSettings>(field: K, value: TocSettings[K]) {
    setSettings((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function saveSettings() {
    setIsSaving(true);
    setStatusText("Saving...");

    chrome.storage.sync.set(settings, () => {
      setIsSaving(false);
      setStatusText("Saved");
      window.setTimeout(() => {
        setStatusText("");
      }, 1200);
    });
  }

  function resetToDefaults() {
    setSettings(DEFAULT_SETTINGS);
    setStatusText("Reset to defaults. Click Save to apply.");
  }

  return (
    <main className="options-root">
      <h1 className="options-title">SideTOC Options</h1>

      <section className="options-card" aria-label="Settings">
        <label className="option-row" htmlFor="include-h1">
          <span className="option-text">
            <strong>Include H1</strong>
            <span className="option-help">Show page H1 in the table of contents.</span>
          </span>
          <input
            checked={settings.includeH1}
            id="include-h1"
            onChange={(e) => setField("includeH1", e.target.checked)}
            type="checkbox"
          />
        </label>

        <label className="option-row" htmlFor="max-depth">
          <span className="option-text">
            <strong>Maximum depth</strong>
            <span className="option-help">Limit heading levels included in the TOC.</span>
          </span>
          <select
            id="max-depth"
            value={settings.maxDepth}
            onChange={(e) => setField("maxDepth", Number(e.target.value))}
          >
            {MAX_DEPTH_OPTIONS.map((depth) => (
              <option key={depth} value={depth}>
                Up to H{depth}
              </option>
            ))}
          </select>
        </label>

        <label className="option-row" htmlFor="smooth-scroll">
          <span className="option-text">
            <strong>Smooth scrolling</strong>
            <span className="option-help">Animate scroll when jumping to headings.</span>
          </span>
          <input
            checked={settings.smoothScroll}
            id="smooth-scroll"
            onChange={(e) => setField("smoothScroll", e.target.checked)}
            type="checkbox"
          />
        </label>

        <label className="option-row" htmlFor="compact-mode">
          <span className="option-text">
            <strong>Compact mode</strong>
            <span className="option-help">Reduce spacing in side panel list items.</span>
          </span>
          <input
            checked={settings.compactMode}
            id="compact-mode"
            onChange={(e) => setField("compactMode", e.target.checked)}
            type="checkbox"
          />
        </label>
      </section>

      <div className="options-actions">
        <button className="btn btn-primary" onClick={saveSettings} disabled={isSaving}>
          Save
        </button>
        <button className="btn btn-secondary" onClick={resetToDefaults} disabled={isSaving}>
          Reset
        </button>
        <span className="options-status" role="status">
          {statusText}
        </span>
      </div>
    </main>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>
);
