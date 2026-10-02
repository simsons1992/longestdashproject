// Everything about the overlay order-card: opening it for a new or existing
// order, keeping PU derived from PR, the note tooltip, saving, and deleting.

import { createOrder, updateOrder, deleteOrder } from "./storage.js";
import { getStatus, DEFAULT_STATUS } from "./statuses.js";
import { openStatusPicker, isPopoverOpen } from "./status-picker.js";
import { showToast } from "./toast.js"; // <-- add

const overlay = document.getElementById("overlay");
const cardShell = document.getElementById("card-shell");
const titleInput = document.getElementById("card-title");
// near the other element refs, after statusBtn
const noteCounterEl = document.getElementById("note-counter");
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
const copyBtn = document.getElementById("card-copy");
const copyIconEl = document.getElementById("card-copy-icon");

// Expanding notes panel (right side, quick-capture note log)
const newNoteInput = document.getElementById("card-note-new");
const noteListEl = document.getElementById("note-list");
const noteListEmptyEl = document.getElementById("note-list-empty");

// Up/Down cycles through these, in the order they appear on the card.
// PU is skipped since it's derived from PR and disabled. The notes-panel
// textarea is intentionally excluded — its Enter key does something else.
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
let currentNotes = []; // { id, text, createdAt } — newest first
let onSavedCallback = () => { };
let statusJustChanged = false; // true once a status is picked by mouse, until form resets/refills
let elementFocusedBeforeExpand = null; // so Alt+Left can restore focus sensibly

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


// Status id that triggers the auto delivery date. Must match the id in statuses.js.
const ON_ORDER_STATUS = "on-order"; // <-- adjust if your id differs

// Today + 2 days; if that lands on Sat/Sun, roll forward to Monday.
// Returns "dd.mm" for the delivery input.
function defaultDeliveryDate() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  const day = d.getDay(); // 0 = Sun, 6 = Sat
  if (day === 6) d.setDate(d.getDate() + 2);
  else if (day === 0) d.setDate(d.getDate() + 1);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
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

  copyBtn.hidden = statusId !== "stock";
}


// Syncs the note-counter pill next to the status button. Uses the
// counter_0..counter_9 glyph ligatures from Material Symbols for 1-9 notes;
// beyond that the icon font has no glyph, so it falls back to plain digits
// via .note-counter-text (see CSS).
function updateNoteCounter() {
  const count = currentNotes.length;

  if (count === 0) {
    noteCounterEl.hidden = true;
    return;
  }

  noteCounterEl.hidden = false;

  if (count <= 9) {
    noteCounterEl.classList.remove("note-counter-text");
    noteCounterEl.textContent = `counter_${count}`;
  } else {
    noteCounterEl.classList.add("note-counter-text");
    noteCounterEl.textContent = String(count);
  }
}





// PU is always PR - 1. It is never independently editable.
function refreshPU() {
  const pr = prInput.value === "" ? null : Number(prInput.value);
  puInput.value = pr === null || Number.isNaN(pr) ? "" : pr - 1;
}

// Builds the Latvian pickup-ready message, pulling the order number from PR.
function buildPickupMessage() {
  const pr = prInput.value.trim() || "—";
  return `Informējam, ka Jūsu pasūtījums ${pr} ir sagatavots saņemšanai.\n\nPasūtījumu varat izņemt adresē:\nZemzaru iela 1, Mārupe.\nDarba dienās no 9:00 līdz 17:30.\nAr cieņu, VEHO`;
}

async function handleCopy() {
  const text = buildPickupMessage();
  try {
    await navigator.clipboard.writeText(text);
    showToast("Message copied to clipboard"); // <-- new
    copyIconEl.textContent = "check";
    copyBtn.classList.add("copied");
    setTimeout(() => {
      copyIconEl.textContent = "content_copy";
      copyBtn.classList.remove("copied");
    }, 1200);
  } catch (err) {
    console.error("Clipboard copy failed:", err);
    showToast("Copy failed", { type: "error" }); // <-- new
  }
}

async function handleCopyPU() {
  const value = puInput.value.trim();
  if (!value) {
    showToast("Nothing to copy", { type: "error" });
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    showToast("PU copied to clipboard");
  } catch (err) {
    console.error("Clipboard copy failed:", err);
    showToast("Copy failed", { type: "error" });
  }
}




// Feeds the custom CSS tooltip (see .note-wrap in cardstyle.css) instead of
// the native title attribute, which browsers render and can't be styled.
function refreshNoteTooltip() {
  noteWrap.dataset.tooltip = noteInput.value;
}

// --- Expanding notes panel: open/close + quick-capture note log. ---

function setExpanded(expanded) {
  cardShell.classList.toggle("expanded", expanded);
}

function isExpanded() {
  return cardShell.classList.contains("expanded");
}

// "2026-09-08T14:32:00.000Z" -> { date: "08.09", time: "14:32" }, in the
// dd.mm convention already used for delivery, plus 24h local time.
function formatNoteTimestamp(iso) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return { date: `${dd}.${mm}`, time: `${hh}:${min}` };
}

// Rebuilds the note list DOM from currentNotes. No innerHTML/markup strings,
// per project convention — built with createElement throughout.
function renderNotes() {
  noteListEl.textContent = "";

  noteListEmptyEl.classList.toggle("hidden", currentNotes.length > 0);

  updateNoteCounter(); // <-- new

  for (const note of currentNotes) {
    const { date, time } = formatNoteTimestamp(note.createdAt);

    const item = document.createElement("div");
    item.className = "note-item";

    const meta = document.createElement("div");
    meta.className = "note-item-meta";

    const dateEl = document.createElement("span");
    dateEl.className = "note-item-date";
    dateEl.textContent = date;

    const timeEl = document.createElement("span");
    timeEl.className = "note-item-time";
    timeEl.textContent = time;

    meta.append(dateEl, timeEl);

    const textEl = document.createElement("div");
    textEl.className = "note-item-text";
    textEl.textContent = note.text;

    item.append(textEl, meta);
    noteListEl.appendChild(item);
  }
}

// Saves the text currently typed in the quick-capture field as a new note:
// prepends it (newest first) to currentNotes, re-renders, clears the input,
// and keeps focus there so multiple notes can be typed back-to-back.
// Persists immediately for existing orders; for a brand-new, not-yet-saved
// order there's no document to patch yet, so the note just rides along in
// currentNotes until the order is created via the normal Save flow (see
// collectFormData).
async function addNote() {
  const text = newNoteInput.value.trim();
  if (!text) return;

  const note = {
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36),
    text,
    createdAt: new Date().toISOString(),
  };

  currentNotes = [note, ...currentNotes];
  renderNotes();
  newNoteInput.value = "";

  if (currentOrder) {
    await updateOrder(currentOrder.id, { notes: currentNotes });
  }

  newNoteInput.focus();
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
  currentNotes = [];
  newNoteInput.value = "";
  renderNotes();
  setStatusPill(DEFAULT_STATUS);
  refreshPU();
  refreshNoteTooltip();
  setExpanded(false);
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
  currentNotes = Array.isArray(order.notes) ? [...order.notes] : [];
  newNoteInput.value = "";
  renderNotes();
  setStatusPill(order.status || DEFAULT_STATUS);
  refreshPU();
  refreshNoteTooltip();
  setExpanded(false);
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
  setExpanded(false);
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
    notes: currentNotes,
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
  const previousStatusId = currentStatusId;
  setStatusPill(statusId);

  // Only when actually switching into "on order" — still freely editable after.
  if (statusId === ON_ORDER_STATUS && previousStatusId !== statusId) {
    deliveryInput.value = defaultDeliveryDate();
  }

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




// Opens (if needed) and focuses the quick-capture note field. Shared by
// Alt+Right (open the panel) and Alt+N (jump straight to note-taking).
function focusNewNote() {
  if (!isExpanded()) {
    elementFocusedBeforeExpand = document.activeElement;
    setExpanded(true);
  }
  newNoteInput.focus();
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
  copyBtn.addEventListener("click", handleCopy);
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

    // Alt+C: same as the copy button, so only when status is "stock".
    // event.code so it also works on macOS, where Option+C types "ç".
    if (event.altKey && event.code === "KeyC") {
      event.preventDefault();
      if (currentStatusId === "stock") handleCopy();
      return;
    }




    // Alt+N: jump straight into quick note-taking from anywhere in the card,
    // opening the panel first if it's closed.
    if (event.altKey && event.key.toLowerCase() === "n") {
      event.preventDefault();
      focusNewNote();
      return;
    }

        // Ctrl+Shift+C: copy the PU value (works from any field).
    // event.code so it's layout-independent.
    if (event.ctrlKey && event.shiftKey && !event.altKey && event.code === "KeyC") {
      event.preventDefault(); // stops the browser's DevTools inspect shortcut
      handleCopyPU();
      return;
    }

    // Alt+Right / Alt+Left open/close the notes panel. Checked unconditionally
    // (regardless of focus) since Alt+Arrow isn't used for in-field text
    // navigation on Windows/Linux. On macOS this does collide with
    // Option+Arrow's word-jump inside text fields — worth knowing if it ever
    // feels off while typing.
    if (event.altKey && event.key === "ArrowRight") {
      event.preventDefault();
      if (!isExpanded()) focusNewNote();
      return;
    }

    if (event.altKey && event.key === "ArrowLeft") {
      event.preventDefault();
      if (isExpanded()) {
        setExpanded(false);
        (elementFocusedBeforeExpand || titleInput).focus();
      }
      return;
    }

    // While typing in the quick-capture note field, it owns its own keys:
    // Enter saves the note (Shift+Enter still inserts a newline normally),
    // and Up/Down/Left/Right are left alone for normal cursor movement
    // instead of triggering field-to-field navigation.
    if (document.activeElement === newNoteInput) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        await addNote();
      }
      return;
    }

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