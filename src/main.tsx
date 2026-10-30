import React from "react";
import ReactDOM from "react-dom/client";
import { importHandoff } from "./lib/bridge/import";
import { isFloatingPlayerWindow } from "./lib/floating-player";
import "./index.css";

// Suppress the WebView2 / Chromium native right-click menu (Back,
// Refresh, Save as, Inspect, …). Our Radix ContextMenu triggers run
// their own `preventDefault` first to open custom menus, so this
// global handler only fires for clicks on areas without a custom menu.
// DevTools stay reachable via F12 / Ctrl+Shift+I.
window.addEventListener("contextmenu", (e) => e.preventDefault());

async function boot() {
  // Bring the old app's data in before any store module loads, so the stores
  // hydrate from it. The floating window skips this (the main window does it).
  if (!isFloatingPlayerWindow()) await importHandoff().catch(() => {});

  // Dynamic so the stores (which hydrate at module load) come after the import.
  const { default: App } = await import("./App");
  // Applies the Interface font setting to <html> in both windows.
  await import("./lib/interface-font");
  // Applies the active look to <html> in both windows.
  await import("./lib/theme/apply");

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void boot();
