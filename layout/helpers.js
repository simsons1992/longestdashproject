// helpers.js — small shared helpers for the layout view.
// Copied from ui-list.js on purpose: that file grabs index.html's DOM at
// import time, so the layout page can't import from it. Same logic, same
// output, so rows/cards match the list view exactly.

import { getStatus } from "../statuses.js";

export function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

// Material Symbols icon per status id (layout view only). A status that is
// not listed here (e.g. "done") falls back to the plain colored dot.
const STATUS_ICONS = {
  billed: "receipt",
  stock: "trolley",
  "on-order": "delivery_truck_speed",
};

// Icon (or dot) in the status color — the parent sets `color`.
export function buildStatusIcon(statusId) {
  const name = STATUS_ICONS[statusId];
  if (!name) return el("span", "dot");
  const icon = el("span", "material-symbols-rounded status-icon");
  icon.textContent = name;
  return icon;
}

export function formatRevenue(value) {
  if (value === null || value === undefined) return "";
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(value);
}

export function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (date.toDateString() === new Date().toDateString()) return "Today";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

// Writes `text` into `container` as text nodes + <mark class="search-highlight">
// for every case-insensitive match of `term`.
export function highlightInto(container, text, term) {
  container.textContent = "";
  const str = text || "";
  const trimmedTerm = (term || "").trim();

  if (!str) return;
  if (!trimmedTerm) {
    container.textContent = str;
    return;
  }

  const lowerStr = str.toLowerCase();
  const lowerTerm = trimmedTerm.toLowerCase();
  let cursor = 0;
  let matchIndex = lowerStr.indexOf(lowerTerm);

  if (matchIndex === -1) {
    container.textContent = str;
    return;
  }

  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      container.appendChild(document.createTextNode(str.slice(cursor, matchIndex)));
    }
    const mark = document.createElement("mark");
    mark.className = "search-highlight";
    mark.textContent = str.slice(matchIndex, matchIndex + trimmedTerm.length);
    container.appendChild(mark);
    cursor = matchIndex + trimmedTerm.length;
    matchIndex = lowerStr.indexOf(lowerTerm, cursor);
  }

  if (cursor < str.length) {
    container.appendChild(document.createTextNode(str.slice(cursor)));
  }
}

export function getDisplayFields(order) {
  const status = getStatus(order.status);
  const hasPr = order.pr !== null && order.pr !== undefined;
  return {
    statusLabel: status.label,
    title: order.title || "",
    note: order.note || "",
    phone: order.phone || "",
    email: order.email || "",
    pr: hasPr ? String(order.pr) : "",
    pu: hasPr ? String(order.pr - 1) : "",
    revenue: formatRevenue(order.revenue),
    delivery: formatDate(order.delivery),
  };
}

// Same rule as ui-list.js: every displayed property is searchable.
export function matchesSearch(order, term) {
  const t = (term || "").trim().toLowerCase();
  if (!t) return true;
  return Object.values(getDisplayFields(order)).some((v) => v.toLowerCase().includes(t));
}

// Note tooltip: same cursor-following mechanism as ui-list.js/ui-card.js
// (.tooltip-target rule in style.css). Does nothing when there is no note.
export function attachNoteTooltip(node, note) {
  const text = String(note || "").trim();
  if (!text) return;
  node.dataset.tooltip = text;
  node.classList.add("tooltip-target");
  node.addEventListener("mousemove", (event) => {
    node.style.setProperty("--tooltip-x", `${event.clientX}px`);
    node.style.setProperty("--tooltip-y", `${event.clientY}px`);
  });
}