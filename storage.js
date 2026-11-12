// All persistence lives here. Backed by a local .xlsx file — nothing else in
// the app knows how orders are stored. Same exports as the old Firestore
// version.
//
// Sheet layout (row 1 = headers, one order per row):
//   A STATUS  B TITLE  C NOTE  D PHONE  E EMAIL  F PR  G PU  H REVENUE
//   I DELIVERY  J DONE AT
// Helper columns the app needs (hide them in Excel if you like):
//   K ID  L CREATED AT  M NOTES (JSON of the quick-capture note log)
// Rows added by hand in Excel get an ID / CREATED AT automatically on the
// next load.

import { STATUSES, DEFAULT_STATUS } from "./statuses.js";
import { isReady, readFileBuffer, writeFileBlob, exclusive } from "./excel-file.js";
import { readWorkbook, writeWorkbook } from "./xlsx-sheet.js";

const HEADERS = [
  "STATUS", "TITLE", "NOTE", "PHONE", "EMAIL", "PR", "PU", "REVENUE",
  "DELIVERY", "DONE AT", "ID", "CREATED AT", "NOTES",
];

// Done orders stay visible for this long after completedAt, then are hidden
// from the app (they remain in the file).
const DONE_TTL = 31 * 24 * 60 * 60 * 1000;

function isVisible(o) {
  if (o.status !== "done") return true;
  if (!o.completedAt) return true; // never hide an order without a date
  return Date.now() - o.completedAt <= DONE_TTL;
}

// ---------- cell <-> value helpers ----------

const pad = (n) => String(n).padStart(2, "0");
const str = (v) => (v === null || v === undefined ? "" : String(v).trim());
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

// Excel date serial -> local Date (Excel dates have no timezone).
function serialToDate(n) {
  const d = new Date(Math.round((n - 25569) * 86400000));
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
}

// Cell -> "YYYY-MM-DD" (what the rest of the app expects). Accepts text
// "dd.mm.yyyy" / "dd.mm" / ISO, or a real Excel date.
function parseDelivery(v) {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") {
    const d = serialToDate(v);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/);
  if (m) {
    let year = m[3] ? Number(m[3]) : new Date().getFullYear();
    if (year < 100) year += 2000;
    return `${year}-${pad(m[2])}-${pad(m[1])}`;
  }
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
}

function formatDelivery(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

// Cell -> ms timestamp, or null. Accepts "dd.mm.yyyy[ hh:mm]" or an Excel date.
function parseDoneAt(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return serialToDate(v).getTime();
  const m = String(v).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0)).getTime();
}

function formatDoneAt(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseNotes(v) {
  if (!v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// The sheet shows the status label ("On order"); the app uses the id.
function statusToLabel(id) {
  return STATUSES.find((s) => s.id === id)?.label ?? id ?? "";
}

function labelToStatus(text) {
  const t = str(text).toLowerCase();
  const hit = STATUSES.find((s) => s.label.toLowerCase() === t || s.id.toLowerCase() === t);
  return hit ? hit.id : DEFAULT_STATUS;
}

// ---------- row <-> order ----------

function rowToOrder(row) {
  const c = Array.from({ length: HEADERS.length }, (_, i) => row[i]);
  return {
    id: str(c[10]),
    status: labelToStatus(c[0]),
    title: str(c[1]),
    note: str(c[2]),
    phone: str(c[3]),
    email: str(c[4]),
    pr: toNum(c[5]),
    revenue: toNum(c[7]),
    delivery: parseDelivery(c[8]),
    completedAt: parseDoneAt(c[9]),
    createdAt: toNum(c[11]),
    notes: parseNotes(c[12]),
  };
}

function orderToRow(o) {
  return [
    statusToLabel(o.status),
    o.title,
    o.note,
    o.phone,
    o.email,
    o.pr,
    o.pr === null || o.pr === undefined ? null : o.pr - 1, // PU is always PR - 1
    o.revenue,
    formatDelivery(o.delivery),
    formatDoneAt(o.completedAt),
    o.id,
    o.createdAt,
    o.notes && o.notes.length ? JSON.stringify(o.notes) : "",
  ];
}

const isBlankRow = (row) =>
  Array.from({ length: 10 }, (_, i) => row[i]).every((v) => v === null || v === undefined || v === "");

// ---------- file I/O ----------

async function load() {
  if (!isReady()) throw new Error("NOT_CONNECTED");
  const book = await readWorkbook(await readFileBuffer());
  const orders = [];
  let dirty = false;

  for (const row of book.rows) {
    if (isBlankRow(row)) continue;
    const order = rowToOrder(row);
    if (!order.id) {
      order.id = newId();
      dirty = true;
    }
    if (order.createdAt === null) {
      order.createdAt = Date.now() + orders.length; // keeps sheet order
      dirty = true;
    }
    orders.push(order);
  }
  return { book, orders, dirty };
}

async function save(book, orders) {
  await writeFileBlob(await writeWorkbook(book, HEADERS, orders.map(orderToRow)));
}

function report(err, what) {
  if (err.message === "NOT_CONNECTED") return; // file-connect.js is already prompting
  console.error(`Could not ${what} (Excel file)`, err);
  window.dispatchEvent(new CustomEvent("storage-error", { detail: err }));
}

// ---------- public API ----------

function loadAllOrders() {
  return exclusive(async () => {
    try {
      const { book, orders, dirty } = await load();
      if (dirty) {
        try {
          await save(book, orders); // persist generated ids for hand-added rows
        } catch (err) {
          console.warn("Could not write generated ids back to the file", err);
        }
      }
      return orders;
    } catch (err) {
      report(err, "read orders");
      return [];
    }
  });
}

async function loadOrders() {
  return (await loadAllOrders()).filter(isVisible);
}

function createOrder(data) {
  return exclusive(async () => {
    try {
      const { book, orders } = await load();
      const status = data.status || DEFAULT_STATUS;
      const order = {
        id: newId(),
        status,
        title: data.title || "",
        note: data.note || "",
        phone: data.phone || "",
        email: data.email || "",
        pr: data.pr === "" || data.pr === undefined ? null : data.pr,
        revenue: data.revenue === "" || data.revenue === undefined ? null : data.revenue,
        delivery: data.delivery || "",
        notes: Array.isArray(data.notes) ? data.notes : [],
        createdAt: Date.now(),
        completedAt: status === "done" ? Date.now() : null,
      };
      orders.push(order); // new orders land at the bottom of the sheet
      await save(book, orders);
      return order;
    } catch (err) {
      report(err, "save order");
      return null;
    }
  });
}

function updateOrder(id, patch) {
  return exclusive(async () => {
    try {
      const { book, orders } = await load();
      const order = orders.find((o) => o.id === id);
      if (!order) throw new Error(`Order ${id} not found in the file`);

      if (patch.status !== undefined) {
        if (patch.status === "done") {
          // Only stamp on the transition to done, not on every later save.
          if (!order.completedAt) patch = { ...patch, completedAt: Date.now() };
        } else {
          patch = { ...patch, completedAt: null }; // reopened, so the clock resets
        }
      }

      Object.assign(order, patch);
      await save(book, orders);
      return true;
    } catch (err) {
      report(err, "update order");
      return false;
    }
  });
}

function deleteOrder(id) {
  return exclusive(async () => {
    try {
      const { book, orders } = await load();
      const remaining = orders.filter((o) => o.id !== id);
      if (remaining.length === orders.length) throw new Error(`Order ${id} not found in the file`);
      await save(book, remaining);
      return true;
    } catch (err) {
      report(err, "delete order");
      return false;
    }
  });
}

export { loadOrders, loadAllOrders, createOrder, updateOrder, deleteOrder };