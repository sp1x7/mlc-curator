import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Three variable fonts the stylesheets address by family name.
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/space-grotesk";
import "./index.css";
import App from "./App";

// The page hands over one element; anything else stops the boot.
const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
