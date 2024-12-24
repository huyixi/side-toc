import React from "react";
import { createRoot } from "react-dom/client";

const Options = () => {
  return (
    <>
      <button>Save</button>
    </>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>
);
