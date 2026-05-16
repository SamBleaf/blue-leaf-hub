import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.jsx";
import "./index.css";

async function clearDevServiceWorkers() {
  if (!import.meta.env.DEV || typeof navigator === "undefined" || !navigator.serviceWorker?.getRegistrations) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    /* ignore */
  }
}

registerSW({
  immediate: true,
  onRegisterError(error) {
    console.warn("[pwa-register]", error);
  }
});

clearDevServiceWorkers().finally(() => {
  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
