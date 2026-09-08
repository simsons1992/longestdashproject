// Entry point. Wires the two ways to create a new order (button + Ctrl+1)
// and starts the list and card modules.

import { initList, renderList, moveSelection, openSelectedOrder } from "./ui-list.js";
import { initCard, openCard } from "./ui-card.js";

const newOrderBtn = document.getElementById("new-order-btn");
const searchInput = document.getElementById("order-search");
const overlay = document.getElementById("overlay");

initCard(() => renderList());
initList();

newOrderBtn.addEventListener("click", () => openCard(null));

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.key === "1") {
    event.preventDefault();
    openCard(null);
    return;
  }

  // Ctrl+P normally opens the browser's print dialog — take it over to
  // jump into search instead, the way Ctrl+F does for native find.
  if (event.ctrlKey && event.key.toLowerCase() === "p") {
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
    return;
  }

  // While the card is open, ui-card.js owns Arrow/Enter for field navigation.
  if (!overlay.classList.contains("hidden")) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveSelection(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSelection(-1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    openSelectedOrder();
  }
});