import { createRoot } from "react-dom/client";
import { App } from "@/client/App";

function start() {
  // biome-ignore lint/style/noNonNullAssertion: Entry point always exists.
  const root = createRoot(document.getElementById("root")!);
  root.render(<App />);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
