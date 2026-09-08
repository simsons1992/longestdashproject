// Single source of truth for the 4 statuses. Add/rename a status here and
// every part of the UI (row pill, card pill, popover, filter chips) updates.

const STATUSES = [
  { id: "billed", label: "Billed", color: "#2563EB", bg: "#E8F0FE" },
  { id: "on-order", label: "On Order", color: "#D97706", bg: "#FEF3E2" },
  { id: "stock", label: "Stock", color: "#7C3AED", bg: "#F1EAFE" },
  { id: "done", label: "Done", color: "#16A34A", bg: "#E6F6EA" },
];

const DEFAULT_STATUS = STATUSES[0].id;

function getStatus(id) {
  return STATUSES.find((s) => s.id === id) || STATUSES[0];
}

export { STATUSES, DEFAULT_STATUS, getStatus };