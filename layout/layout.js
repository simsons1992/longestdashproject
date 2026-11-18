// layout.js — entry point for layout.html (second view of the app).
// Loads orders once from Firestore (storage.js), hands them to the three
// boxes, and owns search, selection and the keyboard shortcuts.
//
//   Ctrl+1  new order          1  order-box · Billed
//   Ctrl+P  search             2  order-box · Stock
//   Alt+N   new reminder       3  calendar-box (on order)
//   Up / Down      move selection inside the active box
//   Left / Right   switch active box: ← calendar-box · → order-box
//                  (works from the search box too)
//   Shift+← / →    calendar only: jump to previous / next day
//   Enter          open the selected order
//   [  ]    calendar: earlier / later week     0  calendar: this week

import { loadOrders } from "../storage.js";
import { initCard, openCard } from "../ui-card.js";
import { isPopoverOpen } from "../status-picker.js";
import { createCalendar } from "./calendar.js";
import { createOrderBox } from "./orderbox.js";
import { initReminders } from "./reminders.js";

const overlay = document.getElementById("overlay");
const searchInput = document.getElementById("order-search");
const newOrderBtn = document.getElementById("new-order-btn");

let allOrders = [];
let searchTerm = "";
let zone = "orders"; // "orders" | "calendar" — where arrows/Enter act
let tab = "billed"; // order-box tab: "billed" | "stock"

// Per zone: the selected order id (survives re-renders) + index fallback.
const selected = {
  orders: { id: null, index: 0 },
  calendar: { id: null, index: 0 },
};

function openFrom(zoneName, order) {
  zone = zoneName;
  selected[zoneName] = { id: order.id, index: 0 };
  applySelection();
  openCard(order);
}

const calendar = createCalendar(document.querySelector(".calendar-box"), {
  onOpen: (order) => openFrom("calendar", order),
  onNavigate: () => {
    zone = "calendar";
    selected.calendar = { id: null, index: 0 };
    applySelection();
  },
});

const orderBox = createOrderBox(document.querySelector(".order-box"), {
  onOpen: (order) => openFrom("orders", order),
  onTabChange: (status) => setTab(status),
  onChanged: () => refresh(),
});

const reminders = initReminders({
  getOrders: () => allOrders,
  onOpenOrder: openCard,
});

// ---------- render ----------

function items(zoneName) {
  return zoneName === "orders" ? orderBox.getRows() : calendar.getCards();
}

function applySelection() {
  ["orders", "calendar"].forEach((z) =>
    items(z).forEach((item) => item.el.classList.remove("is-selected"))
  );

  const list = items(zone);
  if (list.length === 0) return;

  const sel = selected[zone];
  let index = sel.id ? list.findIndex((i) => i.order.id === sel.id) : -1;
  if (index === -1) index = Math.min(sel.index, list.length - 1);

  sel.index = index;
  sel.id = list[index].order.id;
  list[index].el.classList.add("is-selected");
  list[index].el.scrollIntoView({ block: "nearest" });
}

function renderAll() {
  calendar.render(allOrders, searchTerm);
  orderBox.render(allOrders, { tab, term: searchTerm });
  applySelection();
}

async function refresh() {
  allOrders = await loadOrders();
  window.dispatchEvent(new CustomEvent("orders-updated"));
  renderAll();
}

// ---------- tab / zone ----------

function setTab(status) {
  tab = status;
  orderBox.setTab(status);
  zone = "orders";
  selected.orders = { id: null, index: 0 };
  renderAll();
}

function setZone(zoneName) {
  zone = zoneName;
  applySelection();
}

// Left / Right arrows: move the active box. Does nothing when the target
// box has nothing to select (e.g. no on-order cards in the shown week or
// search matches), so the selection never disappears.
function switchZone(zoneName) {
  if (zoneName === zone) return;
  if (items(zoneName).length === 0) return;
  setZone(zoneName);
}

// ---------- selection movement ----------

function moveSelection(delta) {
  const list = items(zone);
  if (list.length === 0) return;
  const sel = selected[zone];
  sel.index = Math.min(Math.max(sel.index + delta, 0), list.length - 1);
  sel.id = null; // index wins, applySelection re-pins the id
  applySelection();
}

// Calendar only: jump to the previous/next day that has cards, keeping the
// same position within the day where possible.
function moveDay(delta) {
  const list = items("calendar");
  if (list.length === 0) return;
  const sel = selected.calendar;
  const current = list[Math.min(sel.index, list.length - 1)];
  const posInDay = list.filter((i) => i.day === current.day).indexOf(current);

  for (let day = current.day + delta; day >= 0 && day <= 4; day += delta) {
    const dayCards = list.filter((i) => i.day === day);
    if (dayCards.length === 0) continue;
    const target = dayCards[Math.min(posInDay, dayCards.length - 1)];
    sel.index = list.indexOf(target);
    sel.id = null;
    applySelection();
    return;
  }
}

function openSelected() {
  const list = items(zone);
  const item = list[selected[zone].index];
  if (item) openCard(item.order);
}

// ---------- search ----------

searchInput.addEventListener("input", () => {
  searchTerm = searchInput.value;
  renderAll();
});

newOrderBtn.addEventListener("click", () => openCard(null));

// ---------- shortcuts ----------

document.addEventListener("keydown", (event) => {
  // The order card, the reminder form and the status popover own their own keys.
  if (!overlay.classList.contains("hidden")) return;
  if (reminders.isFormOpen()) return;
  if (isPopoverOpen()) return;

  if (event.ctrlKey && event.key === "1") {
    event.preventDefault();
    openCard(null);
    return;
  }

  // Ctrl+P normally prints — jump into search instead (same as app.js).
  if (event.ctrlKey && event.key.toLowerCase() === "p") {
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
    return;
  }

  if (event.altKey && event.key.toLowerCase() === "n") {
    event.preventDefault();
    reminders.openForm();
    return;
  }

  if (event.ctrlKey || event.altKey || event.metaKey) return;

  const active = document.activeElement;
  const inField = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
  const inSearch = active === searchInput;

  // Calendar weeks: [ earlier · ] later · 0 this week (not while typing).
  if (!inField && (event.key === "[" || event.key === "]" || event.key === "0")) {
    event.preventDefault();
    calendar.navigate(event.key === "[" ? "prev" : event.key === "]" ? "next" : "today");
    setZone("calendar");
    return;
  }

  // 1 / 2 / 3 — never while typing (e.g. "15531" in search).
  if (!inField && /^[1-3]$/.test(event.key)) {
    event.preventDefault();
    if (event.key === "1") setTab("billed");
    else if (event.key === "2") setTab("stock");
    else setZone("calendar");
    return;
  }

  // Arrows / Enter work from the search box too; other fields keep their keys.
  if (inField && !inSearch) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveSelection(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSelection(-1);
  } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    const left = event.key === "ArrowLeft";
    if (event.shiftKey) {
      // Shift+← / → : day jump in the calendar (Shift+arrows keep selecting
      // text while typing in search).
      if (inSearch || zone !== "calendar") return;
      event.preventDefault();
      moveDay(left ? -1 : 1);
    } else {
      // ← calendar-box · → order-box (also from search; there the arrows no
      // longer move the text caret — Home / End / mouse still do).
      event.preventDefault();
      switchZone(left ? "calendar" : "orders");
    }
  } else if (event.key === "Enter") {
    event.preventDefault();
    openSelected();
  }
});

// ---------- init ----------

initCard(() => refresh());
orderBox.setTab(tab);
refresh();