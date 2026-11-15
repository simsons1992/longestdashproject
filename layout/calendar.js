// calendar.js — Mon–Fri week view of "on order" orders (calendar-box).
// Cards show Title + PU only; the note appears as a hover tooltip.
// Never touches Firestore: layout.js hands it the loaded orders.
//
// Week navigation: ‹ / › jump to the nearest week that has on-order orders
// in that direction; each button carries the count of orders that way.
// "This week" returns to now. Search narrows the counts too, so a match in
// another week is one click away.

import { getStatus } from "../statuses.js";
import { el, buildStatusIcon, getDisplayFields, highlightInto, matchesSearch, attachNoteTooltip } from "./helpers.js";

const ON_ORDER_STATUS = "on-order"; // must match the id in statuses.js

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function mondayOf(date) {
  const dow = (date.getDay() + 6) % 7; // Mon = 0 … Sun = 6
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - dow);
}

// Week shown on load: this week; on Sat/Sun the coming one.
function currentWeekStart() {
  const today = new Date();
  const dow = (today.getDay() + 6) % 7;
  const offset = dow >= 5 ? 7 - dow : -dow;
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset).getTime();
}

// Delivery is stored as "YYYY-MM-DD" (see ui-card.js). Parsed by hand so the
// date stays local. A Sat/Sun delivery counts as the following Monday
// (same rule as ui-card.js's default delivery date).
function effectiveDate(order) {
  if (!order.delivery) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(order.delivery));
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(order.delivery);
  if (Number.isNaN(d.getTime())) return null;
  const dow = d.getDay();
  if (dow === 6) d.setDate(d.getDate() + 2);
  else if (dow === 0) d.setDate(d.getDate() + 1);
  return d;
}

function formatRange(startMs) {
  const start = new Date(startMs);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 4);
  const month = (d) => d.toLocaleDateString("en-GB", { month: "short" });
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()} – ${end.getDate()} ${month(end)}`
    : `${start.getDate()} ${month(start)} – ${end.getDate()} ${month(end)}`;
}

export function createCalendar(root, { onOpen, onNavigate }) {
  const dayEls = [...root.querySelectorAll(".cal-day")];
  const prevBtn = root.querySelector('[data-nav="prev"]');
  const todayBtn = root.querySelector('[data-nav="today"]');
  const nextBtn = root.querySelector('[data-nav="next"]');
  const toggleEl = root.querySelector(".seg-toggle");
  const rangeEl = root.querySelector(".cal-nav-range");

  let cards = []; // flat, Mon→Fri order: { el, order, day }
  let viewWeek = currentWeekStart();
  let prevTarget = null;
  let nextTarget = null;
  let lastOrders = [];
  let lastTerm = "";

  function buildCard(order, term) {
    const fields = getDisplayFields(order);
    const card = el("div", "cal-card");
    card.dataset.id = order.id;
    card.style.setProperty("--status-color", getStatus(order.status).color);

    const icon = buildStatusIcon(order.status);
    const title = el("span", "cal-title");
    const pu = el("span", "cal-pu");
    highlightInto(title, fields.title, term);
    highlightInto(pu, fields.pu, term);
    card.append(icon, title, pu);

    attachNoteTooltip(card, order.note);
    card.addEventListener("click", () => onOpen(order));
    return card;
  }

  function setNavButton(btn, count, label) {
    btn.querySelector(".cal-nav-count").textContent = count;
    btn.disabled = count === 0;
    btn.title = `${count} ${count === 1 ? "order" : "orders"} ${label}`;
  }

  function render(orders, term) {
    lastOrders = orders;
    lastTerm = term;

    const today = new Date();
    const scheduled = orders
      .filter((o) => o.status === ON_ORDER_STATUS && matchesSearch(o, term))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map((order) => ({ order, date: effectiveDate(order) }))
      .filter((x) => x.date)
      .map((x) => ({ ...x, week: mondayOf(x.date).getTime() }));

    // week navigation
    const earlier = scheduled.filter((x) => x.week < viewWeek);
    const later = scheduled.filter((x) => x.week > viewWeek);
    prevTarget = earlier.length ? Math.max(...earlier.map((x) => x.week)) : null;
    nextTarget = later.length ? Math.min(...later.map((x) => x.week)) : null;
    setNavButton(prevBtn, earlier.length, "in earlier weeks");
    setNavButton(nextBtn, later.length, "in later weeks");

    // thumb: left = viewing an earlier week, middle = this week, right = later
    const position = Math.sign(viewWeek - currentWeekStart()) + 1; // 0 | 1 | 2
    toggleEl.style.setProperty("--seg-index", position);
    [prevBtn, todayBtn, nextBtn].forEach((btn, i) => btn.classList.toggle("is-active", i === position));
    rangeEl.textContent = formatRange(viewWeek);

    // day panels
    const start = new Date(viewWeek);
    cards = [];
    dayEls.forEach((dayEl, i) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const dayOrders = scheduled
        .filter((x) => x.week === viewWeek && sameDay(x.date, date))
        .map((x) => x.order);

      dayEl.classList.toggle("is-today", sameDay(date, today));
      dayEl.classList.toggle("is-empty", dayOrders.length === 0);
      dayEl.querySelector(".cal-day-num").textContent = date.getDate();

      const cardEls = dayOrders.map((o) => buildCard(o, term));
      dayEl.querySelector(".cal-list").replaceChildren(...cardEls);
      dayOrders.forEach((order, k) => cards.push({ el: cardEls[k], order, day: i }));
    });
  }

  // dir: "prev" | "next" | "today". Returns true when the week changed.
  function navigate(dir) {
    const target = dir === "today" ? currentWeekStart() : dir === "prev" ? prevTarget : nextTarget;
    if (target === null || target === viewWeek) return false;
    viewWeek = target;
    render(lastOrders, lastTerm);
    onNavigate();
    return true;
  }

  [prevBtn, todayBtn, nextBtn].forEach((btn) =>
    btn.addEventListener("click", () => navigate(btn.dataset.nav))
  );

  return { render, navigate, getCards: () => cards };
}