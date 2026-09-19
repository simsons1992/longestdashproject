// note-links.js — renders note/reminder text with clickable @Title
// mentions. Only titles that match a real order become links; anything
// else stays plain text (e.g. an order that's since been deleted).
//
// At integration time, swap the defaults below:
//   - getOrders    -> the app's live in-memory orders array/state
//   - onOpenOrder  -> the existing function that opens the real
//                     order-card overlay (ui-card.js)
// Everything in the "placeholder order preview" section further down
// can be deleted once that swap happens.

import { orders as seedOrders } from "./mention.js";

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---- Placeholder order preview (temporary — delete at integration) ----

let placeholderModal = null;

function buildPlaceholderModal() {
    const overlay = document.createElement("div");
    overlay.className = "overlay hidden";

    const card = document.createElement("div");
    card.className = "order-preview-card";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "card-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", () => overlay.classList.add("hidden"));

    const title = document.createElement("div");
    title.className = "order-preview-title";

    const meta = document.createElement("div");
    meta.className = "order-preview-meta";

    const note = document.createElement("div");
    note.className = "order-preview-note";
    note.textContent = "Placeholder preview \u2014 wire this to the real order card at integration time.";

    card.appendChild(closeBtn);
    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(note);
    overlay.appendChild(card);

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) overlay.classList.add("hidden");
    });

    document.body.appendChild(overlay);

    return {
        open(order) {
            title.textContent = order.title;
            const pu = order.pr == null ? "" : order.pr - 1;
            meta.textContent = `PR ${order.pr} \u00b7 PU ${pu} \u00b7 \u20ac${order.revenue}`;
            overlay.classList.remove("hidden");
        },
    };
}

function defaultOnOpenOrder(order) {
    if (!placeholderModal) placeholderModal = buildPlaceholderModal();
    placeholderModal.open(order);
}

// ---- Public entry point ----

export function renderNoteText(container, text, options = {}) {
    const getOrders = options.getOrders || (() => seedOrders);
    const onOpenOrder = options.onOpenOrder || defaultOnOpenOrder;

    container.textContent = "";

    const currentOrders = getOrders();
    if (!text || currentOrders.length === 0) {
        container.textContent = text || "";
        return;
    }

    // longest titles first, so "VISLA X" doesn't get cut short by a
    // shorter title that happens to be a prefix of it
    const titles = currentOrders
        .map((o) => o.title)
        .sort((a, b) => b.length - a.length);
    const pattern = new RegExp(`@(${titles.map(escapeRegex).join("|")})(?=\\s|$)`, "gi");

    let lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
            container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }

        const matchedTitle = match[1];
        const order = currentOrders.find(
            (o) => o.title.toLowerCase() === matchedTitle.toLowerCase()
        );

        const link = document.createElement("span");
        link.className = "note-mention-link";
        link.textContent = `@${matchedTitle}`;
        link.addEventListener("click", (event) => {
            event.stopPropagation();
            onOpenOrder(order);
        });

        container.appendChild(link);
        lastIndex = pattern.lastIndex;
    }

    if (lastIndex < text.length) {
        container.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
}