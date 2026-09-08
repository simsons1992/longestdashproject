// A small popover of the 4 statuses, positioned under whatever pill opened it.
// Used both by list rows (quick status change without opening the card) and
// by the card's own status pill. Supports mouse and keyboard: Up/Down moves
// a highlighted option, Enter picks it, Escape closes without picking.

import { STATUSES } from "./statuses.js";

let activePopover = null;
let optionEls = [];
let highlightedIndex = -1;
let outsideClickHandler = null;
let keyHandler = null;

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function isPopoverOpen() {
  return activePopover !== null;
}

function closeActivePopover() {
  if (!activePopover) return;
  activePopover.remove();
  activePopover = null;
  optionEls = [];
  highlightedIndex = -1;
  document.removeEventListener("click", outsideClickHandler, true);
  document.removeEventListener("keydown", keyHandler, true);
}

function setHighlighted(index) {
  highlightedIndex = index;
  optionEls.forEach((opt, i) => opt.classList.toggle("is-highlighted", i === index));
}

function openStatusPicker(anchorEl, currentStatusId, onSelect) {
  closeActivePopover();

  const popover = el("div", "status-popover");
  optionEls = [];

  STATUSES.forEach((status, index) => {
    const option = el("button", "status-popover-option");
    option.type = "button";
    if (status.id === currentStatusId) option.classList.add("is-active");
    option.style.setProperty("--pill-color", status.color);
    option.style.setProperty("--pill-bg", status.bg);

    const dot = el("span", "dot");
    const label = document.createElement("span");
    label.textContent = status.label;
    option.append(dot, label);

    option.addEventListener("click", (event) => {
      event.stopPropagation();
      onSelect(status.id, { viaKeyboard: false });
      closeActivePopover();
    });

    popover.appendChild(option);
    optionEls.push(option);
  });

  document.body.appendChild(popover);

  const rect = anchorEl.getBoundingClientRect();
  popover.style.top = `${rect.bottom + window.scrollY + 6}px`;
  popover.style.left = `${rect.left + window.scrollX}px`;

  activePopover = popover;

  const startIndex = STATUSES.findIndex((status) => status.id === currentStatusId);
  setHighlighted(startIndex === -1 ? 0 : startIndex);

  outsideClickHandler = (event) => {
    if (!popover.contains(event.target) && event.target !== anchorEl) {
      closeActivePopover();
    }
  };

  keyHandler = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      setHighlighted((highlightedIndex + 1) % optionEls.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      setHighlighted((highlightedIndex - 1 + optionEls.length) % optionEls.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      onSelect(STATUSES[highlightedIndex].id, { viaKeyboard: true });
      closeActivePopover();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeActivePopover();
    }
  };

  // Deferred so the click/Enter that opened the popover doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener("click", outsideClickHandler, true);
    document.addEventListener("keydown", keyHandler, true);
  }, 0);
}

export { openStatusPicker, closeActivePopover, isPopoverOpen };