// Entry point. Wires the two ways to create a new order (button + Ctrl+1)
// and starts the list and card modules.

import { initList, renderList, moveSelection, openSelectedOrder } from "./ui-list.js";
import { initCard, openCard } from "./ui-card.js";

const newOrderBtn = document.getElementById("new-order-btn");
const searchInput = document.getElementById("order-search");
const overlay = document.getElementById("overlay");
const reminderOverlay = document.getElementById("reminderOverlay");
const filterEl = document.getElementById("status-filter");

// 1-5 jump straight to a status filter chip. Matched by the chip's visible
// label text rather than statuses.js's internal id, so this keeps working
// regardless of id naming or the order STATUSES is defined in — it only
// breaks if a label's wording changes.
const STATUS_SHORTCUT_LABELS = {
  "1": "all",
  "2": "billed",
  "3": "on order",
  "4": "stock",
  "5": "done",
};

function selectStatusChip(key) {
  const targetLabel = STATUS_SHORTCUT_LABELS[key];
  if (!targetLabel || !filterEl) return false;

  const chip = [...filterEl.children].find((c) =>
    targetLabel === "all"
      ? c.dataset.status === "all"
      : c.textContent.trim().toLowerCase() === targetLabel
  );
  if (!chip) return false;

  chip.click(); // reuses ui-list.js's own delegated click handler/renderList
  return true;
}

initCard(() => renderList());
initList();

newOrderBtn.addEventListener("click", () => openCard(null));

document.addEventListener("keydown", (event) => {
  // While the order card or the reminder form is open, they own their own
  // keyboard handling entirely — this listener must not also act.
  if (!overlay.classList.contains("hidden")) return;
  if (reminderOverlay && !reminderOverlay.classList.contains("hidden")) return;

  if (event.ctrlKey && event.key === "1") {
    event.preventDefault();
    openCard(null);
    return;
  }

  // Ctrl+P normally opens the browser's print dialog — take it over to
  // jump into search instead, the way Ctrl+F does for native find.
  if (event.ctrlKey && event.key.toLowerCase() === "p") {
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
    return;
  }

  // Plain 1-5 (no modifiers) switch the status filter — but never while
  // the user is typing somewhere (e.g. "15531" in the search box).
  if (!event.ctrlKey && !event.altKey && !event.metaKey && /^[1-5]$/.test(event.key)) {
    const active = document.activeElement;
    const isTyping = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
    if (!isTyping && selectStatusChip(event.key)) {
      event.preventDefault();
      return;
    }
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveSelection(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSelection(-1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    openSelectedOrder();
  }
});