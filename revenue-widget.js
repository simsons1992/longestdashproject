import { loadAllOrders } from "./storage.js";

const STATUS_DONE = "done";
const STATUS_STOCK = "stock";

// Which timestamp (ms) places an order in a month:
// done orders by completedAt, stock orders by createdAt.

const DATE_FIELD = {
  [STATUS_DONE]: "completedAt",
  [STATUS_STOCK]: "createdAt",
};

function toNumber(value) {
  if (typeof value === "number") return value;
  const n = parseFloat(
    String(value ?? "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, ""),
  );
  return isNaN(n) ? 0 : n;
}

function eur(n) {
  return n.toFixed(2) + "€";
}

function sumFor(orders, status, year, month) {
    let total = 0;
    for (const o of orders) {
        if (o.status !== status) continue;
        if (status === STATUS_STOCK) {
            total += toNumber(o.revenue); // stock: no month filter, it's money not yet collected
            continue;
        }
        const ts = o[DATE_FIELD[status]];
        if (!ts) continue;
        const d = new Date(ts);
        if (d.getFullYear() !== year || d.getMonth() !== month) continue;
        total += toNumber(o.revenue);
    }
    return total;
}

function render(root, orders) {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const current = sumFor(
    orders,
    STATUS_DONE,
    now.getFullYear(),
    now.getMonth(),
  );
  const last = sumFor(orders, STATUS_DONE, prev.getFullYear(), prev.getMonth());
  const stock = sumFor(orders, STATUS_STOCK, now.getFullYear(), now.getMonth());

  const diff = current - last;
  const isUp = diff >= 0;

  root.querySelector(".this-month-revenue").textContent = eur(current);
  root.querySelector(".stock-volume").textContent = eur(stock);

  const pill = root.querySelector(".last-month-revenue");
  pill.classList.toggle("is-up", isUp);
  pill.classList.toggle("is-down", !isUp);
  pill.querySelector(".material-symbols-rounded").textContent = isUp
    ? "arrow_drop_up"
    : "arrow_drop_down";
  pill.querySelector(".last-month-text").textContent =
    (isUp ? "+" : "−") + eur(Math.abs(diff)) + " vs last month";
}

export async function initRevenueWidget() {
  const root = document.querySelector(".revenue-widget");
  if (!root) return;
  const orders = await loadAllOrders();

  render(root, orders);
}
