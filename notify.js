// notify.js — standalone reminder/notification sandbox.
// Mirrors card.html/cardstyle.css conventions: flat structure, no
// innerHTML/markup strings, DOM built via createElement.

import { initMention } from "./mention.js";
import { renderNoteText } from "./note-links.js";

const VISIBLE_DEPTH = 3; // how many cards show in the stacked preview

// ---- Seed data (sandbox only — no persistence yet) ----
let reminders = [
    { id: cryptoId(), text: "Call @elpar about parts", date: "2026-09-13", time: "15:00" },

];

function cryptoId() {
    return Math.random().toString(36).slice(2, 10);
}

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

const mention = initMention(textInput);

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
    renderNoteText(text, reminder.text);

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
    const card = stackEl.querySelector(`[data-id="${id}"]`) ||
                 expandedListEl.querySelector(`[data-id="${id}"]`);
    if (card) {
        card.classList.add("bounce");
        setTimeout(() => {
            reminders = reminders.filter((r) => r.id !== id);
            renderStack();
        }, 160);
    } else {
        reminders = reminders.filter((r) => r.id !== id);
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
    reminders.unshift({
        id: cryptoId(),
        text,
        date: dateInput.value,
        time: timeInput.value,
    });
    closeReminderForm();
    renderStack();
});

// ---- Init ----
renderStack();