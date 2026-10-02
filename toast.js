// Bottom pop-up notifications. Usage:
//   import { showToast } from "./toast.js";
//   showToast("Copied to clipboard");
//   showToast("Something failed", { type: "error", duration: 3000 });
// Requires toast.css. Built with createElement only (no markup strings).

const ICONS = { success: "check_circle", error: "error" };

let container = null;

function getContainer() {
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  return container;
}

function showToast(message, { type = "success", duration = 1800 } = {}) {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.textContent = ICONS[type] || ICONS.success;

  const text = document.createElement("span");
  text.textContent = message;

  toast.append(icon, text);
  getContainer().appendChild(toast);

  // Next frame, so the transition from the hidden state actually runs.
  requestAnimationFrame(() => toast.classList.add("visible"));

  setTimeout(() => {
    toast.classList.remove("visible");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  }, duration);
}

export { showToast };