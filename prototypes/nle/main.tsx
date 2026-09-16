import { createRoot } from "react-dom/client";
import App from "./app";
import "./shell.css";
import "./styles.css";
import "./timeline-only.css";
import "./timeline-controls.css";
const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
