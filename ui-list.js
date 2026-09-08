// Renders the list of .orderbox rows on the landing page, and wires up
// search, the status filter chips, per-row status quick-change, delete,
// and opening a row in the card for full editing.

import { loadOrders, updateOrder, deleteOrder } from "./storage.js";
import { STATUSES, getStatus } from "./statuses.js";
import { openStatusPicker } from "./status-picker.js";
import { openCard } from "./ui-card.js";

const listEl = document.getElementById("orders-list");
const emptyEl = document.getElementById("orders-empty");
const searchInput = document.getElementById("order-search");
const filterEl = document.getElementById("status-filter");

let searchTerm = "";
let statusFilter = "all";
let currentOrders = []; // last rendered, filtered + sorted list — index-aligned with the rows on screen
let selectedIndex = -1; // which row Up/Down/Enter currently act on

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function formatRevenue(value) {
  if (value === null || value === undefined) return "";
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

// Splits `text` on every case-insensitive match of `term` and writes it into
// `container` as plain text nodes plus <mark class="search-highlight"> spans,
// the same shape a browser's own Ctrl+F highlighting produces.
function highlightInto(container, text, term) {
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

// One place that turns a raw order into the exact strings shown on the row,
// used both for searching and for rendering, so what matches is what's shown.
function getDisplayFields(order) {
  const status = getStatus(order.status);
  const pu = order.pr === null || order.pr === undefined ? null : order.pr - 1;
  return {
    statusLabel: status.label,
    title: order.title || "",
    note: order.note || "",
    phone: order.phone || "",
    email: order.email || "",
    pr: order.pr === null || order.pr === undefined ? "" : String(order.pr),
    pu: pu === null ? "" : String(pu),
    revenue: formatRevenue(order.revenue),
    delivery: formatDate(order.delivery),
  };
}

function buildStatusPill(order, fields) {
  const status = getStatus(order.status);
  const btn = el("button", "status-pill");
  btn.type = "button";
  btn.style.setProperty("--pill-color", status.color);
  btn.style.setProperty("--pill-bg", status.bg);

  const dot = el("span", "dot");
  const label = document.createElement("span");
  btn.append(dot, label);
  highlightInto(label, fields.statusLabel, searchTerm);

  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    openStatusPicker(btn, order.status, async (newStatusId) => {
      await updateOrder(order.id, { status: newStatusId });
      renderList();
    });
  });

  return btn;
}

// Cursor-following tooltip for a cell: same idea as the card's note field,
// duplicated here rather than shared, so this file has no dependency on
// ui-card.js's own copy. Styling is in the shared .tooltip-target CSS rule.
function attachCellTooltip(cell, text) {
  cell.dataset.tooltip = String(text);
  cell.classList.add("tooltip-target");
  cell.addEventListener("mousemove", (event) => {
    cell.style.setProperty("--tooltip-x", `${event.clientX}px`);
    cell.style.setProperty("--tooltip-y", `${event.clientY}px`);
  });
}

function buildCell(className, text) {
  const cell = el("div", className);
  if (text) attachCellTooltip(cell, text);
  highlightInto(cell, text, searchTerm);
  return cell;
}

function buildDeleteButton(order) {
  const btn = el("button", "row-delete");
  btn.type = "button";
  btn.textContent = "\u00d7";
  btn.title = "Delete order";
  btn.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (window.confirm(`Delete "${order.title || "this order"}"?`)) {
      await deleteOrder(order.id);
      renderList();
    }
  });
  return btn;
}

function buildRow(order, index) {
  const row = el("div", "orderbox");
  row.dataset.id = order.id;

  const fields = getDisplayFields(order);

  row.append(
    buildStatusPill(order, fields),
    buildCell("title", fields.title),
    buildCell("note", fields.note),
    buildCell("phone", fields.phone),
    buildCell("email", fields.email),
    buildCell("PR", fields.pr),
    buildCell("PU", fields.pu),
    buildCell("revenue", fields.revenue),
    buildCell("Delivery", fields.delivery),
    buildDeleteButton(order)
  );

  row.addEventListener("click", () => {
    selectedIndex = index;
    applySelection();
    openCard(order);
  });

  return row;
}

// Searches every property (not just title/phone/email), matching against the
// same display strings the row renders so highlighting always lines up.
function matchesFilters(order) {
  const term = searchTerm.trim().toLowerCase();
  const matchesStatus = statusFilter === "all" || order.status === statusFilter;
  if (!term) return matchesStatus;

  const fields = getDisplayFields(order);
  const matchesSearch = Object.values(fields).some((value) =>
    value.toLowerCase().includes(term)
  );
  return matchesSearch && matchesStatus;
}

function buildFilterChips() {
  filterEl.textContent = "";

  const allChip = el("button", "filter-chip is-active");
  allChip.type = "button";
  allChip.textContent = "All";
  allChip.dataset.status = "all";
  filterEl.appendChild(allChip);

  STATUSES.forEach((status) => {
    const chip = el("button", "filter-chip");
    chip.type = "button";
    chip.textContent = status.label;
    chip.dataset.status = status.id;
    filterEl.appendChild(chip);
  });

  filterEl.addEventListener("click", (event) => {
    const chip = event.target.closest(".filter-chip");
    if (!chip) return;
    statusFilter = chip.dataset.status;
    [...filterEl.children].forEach((c) => c.classList.toggle("is-active", c === chip));
    renderList();
  });
}

// Highlights the row at selectedIndex and scrolls it into view — this is a
// plain JS state, not native DOM focus, since .orderbox rows are <div>s.
function applySelection() {
  [...listEl.children].forEach((row, i) => {
    row.classList.toggle("is-selected", i === selectedIndex);
  });
  const selectedRow = listEl.children[selectedIndex];
  if (selectedRow) selectedRow.scrollIntoView({ block: "nearest" });
}

// Called by app.js on ArrowUp/ArrowDown while the card is closed. Works the
// same whether focus is on a row or still inside the search input.
function moveSelection(delta) {
  if (currentOrders.length === 0) return;
  const from = selectedIndex === -1 ? 0 : selectedIndex;
  selectedIndex = Math.min(Math.max(from + delta, 0), currentOrders.length - 1);
  applySelection();
}

// Called by app.js on Enter while the card is closed — opens whichever row
// is currently selected, same as clicking it.
function openSelectedOrder() {
  const order = currentOrders[selectedIndex];
  if (order) openCard(order);
}

async function renderList() {
  const orders = await loadOrders();
  currentOrders = orders
    .filter(matchesFilters)
    .sort((a, b) => b.createdAt - a.createdAt);

  listEl.textContent = "";

  if (currentOrders.length === 0) {
    emptyEl.hidden = false;
    selectedIndex = -1;
  } else {
    emptyEl.hidden = true;
    currentOrders.forEach((order, index) => listEl.appendChild(buildRow(order, index)));
    if (selectedIndex === -1 || selectedIndex >= currentOrders.length) {
      selectedIndex = 0;
    }
    applySelection();
  }
}

function initList() {
  buildFilterChips();
  searchInput.addEventListener("input", () => {
    searchTerm = searchInput.value;
    renderList();
  });
  renderList();
}

export { initList, renderList, moveSelection, openSelectedOrder };