// Search-and-copy template list. Up to 3 matches shown at once; Up/Down
// moves the highlighted match, Enter (or a click) copies it.

import { TEMPLATES } from "./templates-data.js";

const searchInput = document.getElementById("template-search");
const resultsEl = document.getElementById("template-results");

let visibleTemplates = [];
let selectedIndex = 0;

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function renderTemplates() {
  const query = searchInput.value.trim().toLowerCase();
  visibleTemplates = TEMPLATES.filter((template) =>
    template.title.toLowerCase().includes(query)
  ).slice(0, 3);

  selectedIndex = Math.min(selectedIndex, Math.max(visibleTemplates.length - 1, 0));

  resultsEl.textContent = "";

  if (visibleTemplates.length === 0) {
    const empty = el("p", "no-template-results");
    empty.textContent = "No matching templates";
    resultsEl.appendChild(empty);
    return;
  }

  visibleTemplates.forEach((template, index) => {
    const button = el("button", "template-result");
    button.type = "button";
    if (index === selectedIndex) button.classList.add("is-selected");
    button.dataset.templateIndex = String(index);

    const title = document.createElement("strong");
    title.textContent = template.title;

    const copyLabel = document.createElement("span");
    copyLabel.textContent = "Copy";

    button.append(title, copyLabel);
    resultsEl.appendChild(button);
  });
}

async function copyTemplate(index) {
  const template = visibleTemplates[index];
  if (!template) return;

  const copyLabel = resultsEl.querySelector(`[data-template-index="${index}"] span`);

  try {
    await navigator.clipboard.writeText(template.text);
    if (copyLabel) {
      copyLabel.textContent = "Copied";
      window.setTimeout(() => {
        copyLabel.textContent = "Copy";
      }, 1500);
    }
  } catch {
    window.prompt("Copy this template text:", template.text);
  }
}

function initTemplateWidget() {
  if (!searchInput || !resultsEl) return;

  searchInput.addEventListener("input", () => {
    selectedIndex = 0;
    renderTemplates();
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && visibleTemplates.length) {
      event.preventDefault();
      event.stopPropagation();
      selectedIndex = (selectedIndex + 1) % visibleTemplates.length;
      renderTemplates();
    } else if (event.key === "ArrowUp" && visibleTemplates.length) {
      event.preventDefault();
      event.stopPropagation();
      selectedIndex = (selectedIndex - 1 + visibleTemplates.length) % visibleTemplates.length;
      renderTemplates();
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      copyTemplate(selectedIndex);
    }
  });

  resultsEl.addEventListener("click", (event) => {
    const item = event.target.closest(".template-result");
    if (!item) return;
    copyTemplate(Number(item.dataset.templateIndex));
  });

  renderTemplates();
}

export { initTemplateWidget };