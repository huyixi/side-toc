import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

const SidePanel = () => {
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
