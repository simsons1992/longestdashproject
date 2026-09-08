// Everything about the overlay order-card: opening it for a new or existing
// order, keeping PU derived from PR, the note tooltip, saving, and deleting.

import { createOrder, updateOrder, deleteOrder } from "./storage.js";
import { getStatus, DEFAULT_STATUS } from "./statuses.js";
import { openStatusPicker, isPopoverOpen } from "./status-picker.js";

const overlay = document.getElementById("overlay");
const titleInput = document.getElementById("card-title");
const statusBtn = document.getElementById("card-status");
const noteInput = document.getElementById("card-note");
const noteWrap = noteInput.parentElement;
const phoneInput = document.getElementById("card-phone");
const emailInput = document.getElementById("card-email");
const prInput = document.getElementById("card-pr");
const puInput = document.getElementById("card-pu");
const deliveryInput = document.getElementById("card-delivery");
const revenueInput = document.getElementById("card-revenue");
const deleteBtn = document.getElementById("card-delete");
const saveBtn = document.getElementById("card-save");
const closeBtn = document.getElementById("card-close");

// Up/Down cycles through these, in the order they appear on the card.
// PU is skipped since it's derived from PR and disabled.
const NAV_ORDER = [
  titleInput,
  statusBtn,
  noteInput,
  phoneInput,
  emailInput,
  deliveryInput,
  prInput,
  revenueInput,
];

let currentOrder = null; // null while creating a new order
let currentStatusId = DEFAULT_STATUS;
let onSavedCallback = () => { };
let statusJustChanged = false; // true once a status is picked by mouse, until form resets/refills

// --- Delivery date: typed as "dd.mm" (day first, month second), stored as
// a full ISO date string internally with the current year assumed. ---

// "05.09" -> day 5, month 9 -> "<currentYear>-09-05". Returns "" if invalid.
function parseDeliveryInput(str) {
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

// Stored ISO date -> "dd.mm" for display in the input field.
function formatDeliveryForInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

function setStatusPill(statusId) {
  currentStatusId = statusId;
  const status = getStatus(statusId);

  statusBtn.textContent = "";
  const dot = document.createElement("span");
  dot.className = "dot";
  const label = document.createElement("span");
  label.textContent = status.label;
  statusBtn.append(dot, label);

  statusBtn.style.setProperty("--pill-color", status.color);
  statusBtn.style.setProperty("--pill-bg", status.bg);
}

// PU is always PR - 1. It is never independently editable.
function refreshPU() {
  const pr = prInput.value === "" ? null : Number(prInput.value);
  puInput.value = pr === null || Number.isNaN(pr) ? "" : pr - 1;
}

// Feeds the custom CSS tooltip (see .note-wrap in cardstyle.css) instead of
// the native title attribute, which browsers render and can't be styled.
function refreshNoteTooltip() {
  noteWrap.dataset.tooltip = noteInput.value;
}

function resetForm() {
  currentOrder = null;
  titleInput.value = "";
  noteInput.value = "";
  phoneInput.value = "";
  emailInput.value = "";
  prInput.value = "";
  deliveryInput.value = "";
  revenueInput.value = "";
  setStatusPill(DEFAULT_STATUS);
  refreshPU();
  refreshNoteTooltip();
  statusJustChanged = false;
  deleteBtn.hidden = true;
}

function fillForm(order) {
  currentOrder = order;
  titleInput.value = order.title || "";
  noteInput.value = order.note || "";
  phoneInput.value = order.phone || "";
  emailInput.value = order.email || "";
  prInput.value = order.pr ?? "";
  deliveryInput.value = formatDeliveryForInput(order.delivery);
  revenueInput.value = order.revenue ?? "";
  setStatusPill(order.status || DEFAULT_STATUS);
  refreshPU();
  refreshNoteTooltip();
  statusJustChanged = false;
  deleteBtn.hidden = false;
}

function openCard(order) {
  if (order) {
    fillForm(order);
  } else {
    resetForm();
  }
  overlay.classList.remove("hidden");
  titleInput.focus();
}

function closeCard() {
  overlay.classList.add("hidden");
}

// Moves focus to the previous/next field in NAV_ORDER (clamped, no wraparound).
// Selects the field's text too, so typing immediately overwrites it.
function focusNav(delta) {
  const fromIndex = NAV_ORDER.indexOf(document.activeElement);
  const nextIndex = Math.min(
    Math.max((fromIndex === -1 ? 0 : fromIndex) + delta, 0),
    NAV_ORDER.length - 1
  );
  const nextEl = NAV_ORDER[nextIndex];
  nextEl.focus();
  if (typeof nextEl.select === "function") nextEl.select();
}

function flashError(inputEl) {
  inputEl.classList.add("field-error");
  inputEl.focus();
  setTimeout(() => inputEl.classList.remove("field-error"), 600);
}

function collectFormData() {
  return {
    status: currentStatusId,
    title: titleInput.value.trim(),
    note: noteInput.value.trim(),
    phone: phoneInput.value.trim(),
    email: emailInput.value.trim(),
    pr: prInput.value === "" ? null : Number(prInput.value),
    delivery: parseDeliveryInput(deliveryInput.value),
    revenue: revenueInput.value === "" ? null : Number(revenueInput.value),
  };
}

// Writes the current form data to Firestore. Does NOT close the overlay —
// callers decide separately whether closing makes sense.
async function persistOrder(data) {
  if (currentOrder) {
    await updateOrder(currentOrder.id, data);
  } else {
    currentOrder = await createOrder(data);
    deleteBtn.hidden = false;
  }
  onSavedCallback();
}

// Validates + saves the form in place, without closing the card. Resolves to
// true on success so callers (Enter-to-advance, keyboard status pick) know
// whether it's safe to move focus on. Resolves to false (and flashes the bad
// field) on validation failure.
async function saveCurrentFields() {
  const data = collectFormData();
  if (!data.title) {
    flashError(titleInput);
    return false;
  }
  if (deliveryInput.value.trim() && !data.delivery) {
    flashError(deliveryInput);
    return false;
  }
  await persistOrder(data);
  return true;
}

// Save button: an explicit, deliberate "I'm done" action — saves and closes.
async function handleSave() {
  if (await saveCurrentFields()) {
    closeCard();
  }
}

async function handleDelete() {
  if (!currentOrder) return;
  const label = currentOrder.title || "this order";
  if (!window.confirm(`Delete "${label}"? This can't be undone.`)) return;
  await deleteOrder(currentOrder.id);
  closeCard();
  onSavedCallback();
}

// Called by the status picker whenever a status is chosen. `meta.viaKeyboard`
// distinguishes Enter-inside-the-popover (save + advance to the next field,
// same as Enter anywhere else on the card) from a mouse click (just update
// the pill; a following Enter on the status button handles save + advance).
async function handleStatusSelected(statusId, meta = {}) {
  setStatusPill(statusId);

  if (!meta.viaKeyboard) {
    statusJustChanged = true;
    return;
  }

  if (await saveCurrentFields()) {
    focusNav(1);
  } else {
    statusJustChanged = true;
  }
}

function initCard(onSaved) {
  onSavedCallback = onSaved;

  statusBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    openStatusPicker(statusBtn, currentStatusId, handleStatusSelected);
  });

  prInput.addEventListener("input", refreshPU);
  noteInput.addEventListener("input", refreshNoteTooltip);
  noteWrap.addEventListener("mousemove", (event) => {
    noteWrap.style.setProperty("--tooltip-x", `${event.clientX}px`);
    noteWrap.style.setProperty("--tooltip-y", `${event.clientY}px`);
  });

  saveBtn.addEventListener("click", handleSave);
  deleteBtn.addEventListener("click", handleDelete);
  closeBtn.addEventListener("click", closeCard);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeCard();
  });

  document.addEventListener("keydown", async (event) => {
    if (overlay.classList.contains("hidden")) return;

    // While the status popover is open, it owns Up/Down/Enter/Escape entirely
    // (it also calls stopPropagation, this is just a safety net).
    if (isPopoverOpen()) return;

    if (event.key === "Escape") {
      closeCard();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusNav(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusNav(-1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (document.activeElement === statusBtn && !statusJustChanged) {
        openStatusPicker(statusBtn, currentStatusId, handleStatusSelected);
      } else {
        // Enter on any other field — or on the status button right after
        // a mouse-clicked status change — saves in place and moves on to
        // the next field, same direction as Down. Card stays open; Esc
        // closes it when you're done.
        if (await saveCurrentFields()) {
          focusNav(1);
        }
      }
    }
  });

  resetForm();
}

export { initCard, openCard };