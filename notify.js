// notify.js — reminder/notification widget.
// No innerHTML/markup strings, DOM built via createElement, per project
// convention.

import { initMention } from "./mention.js";
import { renderNoteText } from "./note-links.js";
import { openCard } from "./ui-card.js";
import { getOrders } from "./ui-list.js";

const VISIBLE_DEPTH = 3; // how many cards show in the stacked preview
const STORAGE_KEY = "dashedcrm-reminders";

function cryptoId() {
  return Math.random().toString(36).slice(2, 10);
}

// "05.09" -> "<currentYear>-09-05" ISO date string, "" if invalid. Same
// dd.mm-current-year-assumed convention as ui-card.js's delivery field.
function parseDateInput(str) {
  if (!str) return "";
  const match = str.trim().match(/^(\d{1,2})\.(\d{1,2})$/);
  if (!match) return "";
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  const year = new Date().getFullYear();
  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

// "9:5" -> "09:05", 24h only, "" if invalid.
function parseTimeInput(str) {
  if (!str) return "";
  const match = str.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return "";
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function flashFieldError(inputEl) {
  inputEl.classList.add("field-error");
  inputEl.focus();
  setTimeout(() => inputEl.classList.remove("field-error"), 600);
}

// ---- localStorage persistence ----
// Reminders are local-only for now (not synced to Firestore) — a
// per-browser convenience layer on top of the real order data.

function loadReminders() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveReminders() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
  } catch {
    // storage full/unavailable/blocked — reminders still work for
    // this session, they just won't survive a reload
  }
}

let reminders = loadReminders();

// ---- DOM refs ----
const stackEl = document.getElementById("reminderStack");
const moreLabelEl = document.getElementById("moreLabel");
const expandHandleEl = document.getElementById("expandHandle");
const expandedPanelEl = document.getElementById("expandedPanel");
const expandedListEl = document.getElementById("expandedList");
const bellBtn = document.getElementById("bellBtn");

const overlayEl = document.getElementById("reminderOverlay");
const closeFormBtn = document.getElementById("closeReminderForm");
const textInput = document.getElementById("reminderTextInput");
const dateInput = document.getElementById("reminderDateInput");
const timeInput = document.getElementById("reminderTimeInput");
const createBtn = document.getElementById("createReminderBtn");

const mention = initMention(textInput, { getOrders });

let isExpanded = false;

// ---- Rendering ----

function formatDateTime(dateStr, timeStr) {
  if (!dateStr) return timeStr || "";
  const [, month, day] = dateStr.split("-");
  if (!month || !day) return timeStr || dateStr;
  return `${day}.${month}${timeStr ? " \u2022 " + timeStr : ""}`;
}

function buildReminderCard(reminder, depth) {
  const card = document.createElement("div");
  card.className = "reminder-card";
  card.dataset.id = reminder.id;
  if (depth !== null) card.dataset.depth = String(depth);

  const icon = document.createElement("div");
  icon.className = "reminder-card-icon";
  const iconSpan = document.createElement("span");
  iconSpan.className = "material-symbols-rounded";
  iconSpan.textContent = "notifications_active";
  icon.appendChild(iconSpan);

  const body = document.createElement("div");
  body.className = "reminder-card-body";

  const text = document.createElement("div");
  text.className = "reminder-card-text";
  renderNoteText(text, reminder.text, { getOrders, onOpenOrder: openCard });

  const time = document.createElement("div");
  time.className = "reminder-card-time";
  time.textContent = formatDateTime(reminder.date, reminder.time);

  body.appendChild(text);
  body.appendChild(time);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "reminder-card-delete";
  deleteBtn.setAttribute("aria-label", "Delete reminder");
  const deleteIcon = document.createElement("span");
  deleteIcon.className = "material-symbols-rounded";
  deleteIcon.textContent = "close";
  deleteBtn.appendChild(deleteIcon);
  deleteBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    deleteReminder(reminder.id);
  });

  card.appendChild(icon);
  card.appendChild(body);
  card.appendChild(deleteBtn);

  return card;
}

function renderStack() {
  stackEl.textContent = "";

  const count = reminders.length;
  stackEl.classList.toggle("has-cards", count > 0);

  const visible = reminders.slice(0, VISIBLE_DEPTH);
  visible.forEach((reminder, depth) => {
    stackEl.appendChild(buildReminderCard(reminder, depth));
  });

  const remaining = count - VISIBLE_DEPTH;
  if (remaining > 0) {
    moreLabelEl.textContent = `${remaining} more`;
    moreLabelEl.hidden = false;
    expandHandleEl.hidden = false;
  } else {
    moreLabelEl.hidden = true;
    expandHandleEl.hidden = true;
    collapse();
  }

  renderExpandedList();
}

function renderExpandedList() {
  expandedListEl.textContent = "";
  reminders.forEach((reminder) => {
    expandedListEl.appendChild(buildReminderCard(reminder, null));
  });

  if (isExpanded) {
    // re-measure so height stays correct if content changed while open
    setExpandedHeight();
  }
}

function setExpandedHeight() {
  const height = expandedListEl.scrollHeight + 14; // + top padding
  expandedPanelEl.style.setProperty("--expanded-height", `${height}px`);
}

function expand() {
  if (isExpanded) return;
  isExpanded = true;
  setExpandedHeight();
  expandedPanelEl.classList.add("open");
}

function collapse() {
  if (!isExpanded) return;
  isExpanded = false;
  expandedPanelEl.classList.remove("open");
}

function toggleExpanded() {
  if (isExpanded) collapse();
  else expand();
}

// ---- Delete ----

function deleteReminder(id) {
  const card =
    stackEl.querySelector(`[data-id="${id}"]`) ||
    expandedListEl.querySelector(`[data-id="${id}"]`);
  if (card) {
    card.classList.add("bounce");
    setTimeout(() => {
      reminders = reminders.filter((r) => r.id !== id);
      saveReminders();
      renderStack();
    }, 160);
  } else {
    reminders = reminders.filter((r) => r.id !== id);
    saveReminders();
    renderStack();
  }
}

// ---- Expand handle drag (bounce/slide) ----

let dragStartY = null;
let dragActive = false;
const DRAG_THRESHOLD = 24;

expandHandleEl.addEventListener("pointerdown", (event) => {
  dragStartY = event.clientY;
  dragActive = true;
  expandHandleEl.classList.add("dragging");
  expandHandleEl.setPointerCapture(event.pointerId);
});

expandHandleEl.addEventListener("pointermove", (event) => {
  if (!dragActive || dragStartY === null) return;
  const delta = event.clientY - dragStartY;
  if (delta > DRAG_THRESHOLD && !isExpanded) {
    expand();
  } else if (delta < -DRAG_THRESHOLD && isExpanded) {
    collapse();
  }
});

function endDrag(event) {
  if (!dragActive) return;
  dragActive = false;
  dragStartY = null;
  expandHandleEl.classList.remove("dragging");
}

expandHandleEl.addEventListener("pointerup", endDrag);
expandHandleEl.addEventListener("pointercancel", endDrag);

// plain click also toggles, for accessibility / non-pointer input
expandHandleEl.addEventListener("click", (event) => {
  // avoid double-firing right after a drag that already toggled state
  if (dragStartY !== null) return;
  toggleExpanded();
});

// clicking the reminder stack itself also toggles the expanded panel
stackEl.addEventListener("click", (event) => {
  // Don't expand when clicking the delete button or interactive content
  if (event.target.closest("button, a, input, textarea, select")) {
    return;
  }

  toggleExpanded();
});

// ---- New reminder overlay ----

function openReminderForm() {
  textInput.value = "";
  dateInput.value = "";
  timeInput.value = "";
  overlayEl.classList.remove("hidden");
  textInput.focus();
}

function closeReminderForm() {
  overlayEl.classList.add("hidden");
  mention.close();
}

bellBtn.addEventListener("click", openReminderForm);
closeFormBtn.addEventListener("click", closeReminderForm);

overlayEl.addEventListener("click", (event) => {
  if (event.target === overlayEl) closeReminderForm();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !overlayEl.classList.contains("hidden")) {
    closeReminderForm();
  }
});

createBtn.addEventListener("click", () => {
  const text = textInput.value.trim();
  if (!text) {
    textInput.focus();
    return;
  }

  const date = parseDateInput(dateInput.value);
  if (dateInput.value.trim() && !date) {
    flashFieldError(dateInput);
    return;
  }

  const time = parseTimeInput(timeInput.value);
  if (timeInput.value.trim() && !time) {
    flashFieldError(timeInput);
    return;
  }

  reminders.unshift({
    id: cryptoId(),
    text,
    date,
    time,
  });
  saveReminders();
  closeReminderForm();
  renderStack();
});

function refreshMentions() {
  stackEl.textContent = "";
  reminders.slice(0, VISIBLE_DEPTH).forEach((reminder, depth) => {
    stackEl.appendChild(buildReminderCard(reminder, depth));
  });
  renderExpandedList();
}
window.addEventListener("orders-updated", refreshMentions);

// ---- Init ----
renderStack();
