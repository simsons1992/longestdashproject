// reminders.js — reminder-box. Same reminder logic as notify.js (form,
// @-mentions, clickable @Title, same localStorage key), but rendered as a
// plain list inside the box: no 3-card stack, no expand handle, no bounce.
// Built with createElement only, per project convention.

import { initMention } from "../mention.js";
import { renderNoteText } from "../note-links.js";

const STORAGE_KEY = "dashedcrm-reminders"; // shared with notify.js / index.html

function cryptoId() {
  return Math.random().toString(36).slice(2, 10);
}

// "05.09" -> "<currentYear>-09-05", "" if invalid (same as notify.js).
function parseDateInput(str) {
  if (!str) return "";
  const match = str.trim().match(/^(\d{1,2})\.(\d{1,2})$/);
  if (!match) return "";
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  const year = new Date().getFullYear();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

function formatDateTime(dateStr, timeStr) {
  if (!dateStr) return timeStr || "";
  const [, month, day] = dateStr.split("-");
  if (!month || !day) return timeStr || dateStr;
  return `${day}.${month}${timeStr ? " \u2022 " + timeStr : ""}`;
}

export function initReminders({ getOrders, onOpenOrder }) {
  let reminders = loadReminders();

  const listEl = document.getElementById("reminderList");
  const bellBtn = document.getElementById("bellBtn");
  const overlayEl = document.getElementById("reminderOverlay");
  const closeFormBtn = document.getElementById("closeReminderForm");
  const textInput = document.getElementById("reminderTextInput");
  const dateInput = document.getElementById("reminderDateInput");
  const timeInput = document.getElementById("reminderTimeInput");
  const createBtn = document.getElementById("createReminderBtn");

  const mention = initMention(textInput, { getOrders });

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
    } catch {
      // storage full/blocked — still works for this session
    }
  }

  function buildCard(reminder) {
    const card = document.createElement("div");
    card.className = "reminder-card";
    card.dataset.id = reminder.id;

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
    renderNoteText(text, reminder.text, { getOrders, onOpenOrder });

    const time = document.createElement("div");
    time.className = "reminder-card-time";
    time.textContent = formatDateTime(reminder.date, reminder.time);

    body.append(text, time);

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
      reminders = reminders.filter((r) => r.id !== reminder.id);
      save();
      render();
    });

    card.append(icon, body, deleteBtn);
    return card;
  }

  function render() {
    listEl.replaceChildren(...reminders.map(buildCard));
  }

  function isFormOpen() {
    return !overlayEl.classList.contains("hidden");
  }

  function openForm() {
    textInput.value = "";
    dateInput.value = "";
    timeInput.value = "";
    overlayEl.classList.remove("hidden");
    textInput.focus();
  }

  function closeForm() {
    overlayEl.classList.add("hidden");
    mention.close();
  }

  bellBtn.addEventListener("click", openForm);
  closeFormBtn.addEventListener("click", closeForm);
  overlayEl.addEventListener("click", (event) => {
    if (event.target === overlayEl) closeForm();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isFormOpen()) closeForm();
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

    reminders.unshift({ id: cryptoId(), text, date, time });
    save();
    closeForm();
    render();
  });

  // @Title links depend on the loaded orders — redraw when they refresh.
  window.addEventListener("orders-updated", render);
  render();

  return { openForm, isFormOpen };
}