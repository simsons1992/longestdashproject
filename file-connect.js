// Startup gate: browsers only allow file access after a user click, so if the
// Excel file isn't connected yet this shows a one-button overlay. Also turns
// storage errors (e.g. file open in Excel) into toasts. No innerHTML.

import { isSupported, restoreHandle, connectFile } from "./excel-file.js";
import { showToast } from "./toast.js";

function describeError(err) {
  if (err.name === "NoModificationAllowedError" || err.name === "NotReadableError") {
    return "Can't access the Excel file — close it in Excel and try again";
  }
  if (err.name === "NotAllowedError" || err.name === "SecurityError") {
    return "No permission for the Excel file — reload and reconnect";
  }
  return `Excel file error: ${err.message || err.name}`;
}

function buildOverlay(state, onConnected) {
  const wrap = document.createElement("div");
  wrap.className = "file-connect";

  const box = document.createElement("div");
  box.className = "file-connect-box";

  const text = document.createElement("p");
  text.textContent =
    state === "needs-permission"
      ? "Allow access to your orders file to continue."
      : "Pick the orders .xlsx file to use as storage.";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "file-connect-btn";
  button.textContent = state === "needs-permission" ? "Allow access" : "Choose file";

  const other = document.createElement("button");
  other.type = "button";
  other.className = "file-connect-link";
  other.textContent = "Use a different file";
  other.hidden = state !== "needs-permission";

  async function run(forcePick) {
    try {
      await connectFile(forcePick);
      wrap.remove();
      onConnected();
    } catch (err) {
      if (err.name !== "AbortError") showToast(describeError(err), { type: "error" });
    }
  }

  button.addEventListener("click", () => run(false));
  other.addEventListener("click", () => run(true));

  box.append(text, button, other);
  wrap.appendChild(box);
  document.body.appendChild(wrap);
}

async function initFileConnect(onConnected) {
  let restored = false; // the list loads before the saved file is restored; ignore that early miss

  // Any failed read/write lands here. "Not connected" re-opens the overlay
  // (once, and only after startup restore has finished); everything else is a toast.
  window.addEventListener("storage-error", (event) => {
    if (event.detail.message === "NOT_CONNECTED") {
      if (restored && !document.querySelector(".file-connect")) buildOverlay("needs-permission", onConnected);
      return;
    }
    showToast(describeError(event.detail), { type: "error" });
  });

  if (!isSupported()) {
    showToast("Local file access needs Chrome or Edge", { type: "error" });
    return;
  }

  const state = await restoreHandle();
  restored = true;
  if (state === "ready") {
    onConnected();
    return;
  }
  buildOverlay(state, onConnected);
}

export { initFileConnect };