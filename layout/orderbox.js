// orderbox.js — Billed / Stock rows (order-box). Same row design and
// behaviour as ui-list.js: status pill quick-change, delete, click opens
// the card. Rows show a status icon, Title (note on hover), PU, Revenue, Delivery.

import { updateOrder, deleteOrder } from "../storage.js";
import { getStatus } from "../statuses.js";
import { openStatusPicker } from "../status-picker.js";
import { el, buildStatusIcon, getDisplayFields, highlightInto, matchesSearch, attachNoteTooltip } from "./helpers.js";

const BOX_STATUSES = ["billed", "stock"]; // ids from statuses.js

export function createOrderBox(root, { onOpen, onTabChange, onChanged }) {
  const toggleEl = root.querySelector(".seg-toggle");
  const listEl = root.querySelector(".order-list");
  const emptyEl = root.querySelector(".orders-empty");
  let rows = []; // { el, order }

  toggleEl.addEventListener("click", (event) => {
    const btn = event.target.closest(".seg-toggle-btn");
    if (btn) onTabChange(btn.dataset.status);
  });

  // --seg-index moves the sliding thumb in CSS; clicks and the 1 / 2
  // shortcuts both land here, so they animate the same way.
  function setTab(status) {
    const buttons = [...toggleEl.querySelectorAll(".seg-toggle-btn")];
    toggleEl.style.setProperty("--seg-index", buttons.findIndex((b) => b.dataset.status === status));
    buttons.forEach((b) => b.classList.toggle("is-active", b.dataset.status === status));
  }

  // Icon only (label lives in the tooltip); still opens the status picker.
  function buildStatusPill(order) {
    const status = getStatus(order.status);
    const btn = el("button", "status-pill");
    btn.type = "button";
    btn.title = status.label;
    btn.style.setProperty("--pill-color", status.color);
    btn.style.setProperty("--pill-bg", status.bg);
    btn.appendChild(buildStatusIcon(order.status));

    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      openStatusPicker(btn, order.status, async (newStatusId) => {
        await updateOrder(order.id, { status: newStatusId });
        onChanged();
      });
    });
    return btn;
  }

  function buildCell(className, text, term, note) {
    const cell = el("div", className);
    highlightInto(cell, text, term);
    if (note) attachNoteTooltip(cell, note);
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
        onChanged();
      }
    });
    return btn;
  }

  function buildRow(order, term) {
    const row = el("div", "orderbox");
    row.dataset.id = order.id;
    const fields = getDisplayFields(order);

    row.append(
      buildStatusPill(order),
      buildCell("title", fields.title, term, order.note),
      buildCell ("note", fields.note, term),
      buildCell("PU", fields.pu, term),
      buildCell("revenue", fields.revenue, term),
      buildCell("Delivery", fields.delivery, term),
      buildDeleteButton(order)
    );

    row.addEventListener("click", () => onOpen(order));
    return row;
  }

  // While searching, the tab is ignored: every matching billed/stock order
  // shows (the pill tells them apart). Otherwise only the active tab.
  function render(orders, { tab, term }) {
    const searching = term.trim() !== "";
    const pool = orders
      .filter((o) => BOX_STATUSES.includes(o.status))
      .filter((o) => (searching ? matchesSearch(o, term) : o.status === tab))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const rowEls = pool.map((o) => buildRow(o, term));
    listEl.replaceChildren(...rowEls);
    rows = pool.map((order, i) => ({ el: rowEls[i], order }));
    listEl.hidden = pool.length === 0;
    emptyEl.hidden = pool.length > 0;
  }

  return { render, setTab, getRows: () => rows };
}