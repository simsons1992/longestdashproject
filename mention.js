// mention.js — @-mention popup for note/textarea fields.
// Matches typed text against order records (title, PR, PU, revenue) and
// inserts a plain "@Title" tag into the field on selection. No innerHTML —
// DOM built via createElement, per project convention.

// ---- Seed data (sandbox only — swap for storage.js/Firestore later) ----
export const orders = [
    { id: "o1", title: "Elvins Tabanovs", PR: "15535", PU: "15534", revenue: "19" },
    { id: "o2", title: "TARRO", PR: "15488", PU: "15487", revenue: "1204.50" },
    { id: "o3", title: "KESTREL", PR: "15602", PU: "15601", revenue: "399.00" },
    { id: "o4", title: "MOLINA", PR: "15577", PU: "15576", revenue: "2110.00" },
    { id: "o5", title: "BRAVUS", PR: "15340", PU: "15339", revenue: "678.20" },
    { id: "o6", title: "ORVELL", PR: "15419", PU: "15418", revenue: "955.00" },
];

const MAX_RESULTS = 6;
const SEARCH_FIELDS = ["title", "PR", "PU", "revenue"];

// ---- Caret pixel position (mirror-div technique) ----
const MIRROR_PROPS = [
    "boxSizing", "width", "height", "overflowX", "overflowY",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize",
    "lineHeight", "fontFamily", "textAlign", "textTransform", "textIndent",
    "letterSpacing", "wordSpacing",
];

function getCaretCoordinates(el, position) {
    const style = getComputedStyle(el);
    const mirror = document.createElement("div");

    MIRROR_PROPS.forEach((prop) => {
        mirror.style[prop] = style[prop];
    });
    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";
    mirror.style.top = "0";
    mirror.style.left = "-9999px";

    mirror.textContent = el.value.substring(0, position);

    const marker = document.createElement("span");
    marker.textContent = el.value.substring(position) || ".";
    mirror.appendChild(marker);

    document.body.appendChild(mirror);
    const fieldRect = el.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    document.body.removeChild(mirror);

    return {
        top: fieldRect.top + (markerRect.top - mirrorRect.top) - el.scrollTop,
        left: fieldRect.left + (markerRect.left - mirrorRect.left) - el.scrollLeft,
        lineHeight: parseFloat(style.lineHeight) || 18,
    };
}

// ---- Trigger detection: find an "@" that starts the token the caret sits in ----
function findMentionTrigger(value, caretPos) {
    let i = caretPos - 1;
    while (i >= 0) {
        const ch = value[i];
        if (ch === "@") {
            const prevChar = i === 0 ? " " : value[i - 1];
            if (/\s/.test(prevChar)) {
                return { start: i, query: value.slice(i + 1, caretPos) };
            }
            return null;
        }
        if (/\s/.test(ch)) return null;
        i--;
    }
    return null;
}

function matchOrders(query, source) {
    const q = query.trim().toLowerCase();
    const pool = q === ""
        ? source
        : source.filter((order) =>
            SEARCH_FIELDS.some((field) =>
                String(order[field]).toLowerCase().includes(q)
            )
        );
    return pool.slice(0, MAX_RESULTS);
}

// ---- Public entry point ----
export function initMention(textarea, options = {}) {
    const getOrders = options.getOrders || (() => orders);
    const popup = document.createElement("div");
    popup.className = "mention-popup";
    popup.hidden = true;
    document.body.appendChild(popup);

    let trigger = null;   // { start, query }
    let results = [];
    let activeIndex = 0;

    function renderResults() {
        popup.textContent = "";

        if (results.length === 0) {
            const empty = document.createElement("div");
            empty.className = "mention-empty";
            empty.textContent = "No matching orders";
            popup.appendChild(empty);
            return;
        }

        results.forEach((order, index) => {
            const item = document.createElement("div");
            item.className = "mention-item";
            if (index === activeIndex) item.classList.add("mention-item-active");

            const title = document.createElement("div");
            title.className = "mention-item-title";
            title.textContent = order.title;

            const meta = document.createElement("div");
            meta.className = "mention-item-meta";
            meta.textContent = `PR ${order.PR} \u00b7 PU ${order.PU} \u00b7 \u20ac${order.revenue}`;

            item.appendChild(title);
            item.appendChild(meta);

            // mousedown (not click) fires before the textarea's blur, so the
            // popup is still open and selection still has the trigger info
            item.addEventListener("mousedown", (event) => {
                event.preventDefault();
                selectOrder(order);
            });

            popup.appendChild(item);
        });
    }

    function positionPopup() {
        const coords = getCaretCoordinates(textarea, textarea.selectionStart);
        popup.style.top = `${coords.top + coords.lineHeight + 4}px`;
        popup.style.left = `${coords.left}px`;
    }

    function openPopup() {
        positionPopup();
        renderResults();
        popup.hidden = false;
    }

    function closePopup() {
        popup.hidden = true;
        trigger = null;
        results = [];
        activeIndex = 0;
    }

    function selectOrder(order) {
        if (!trigger) return;
        const caretPos = textarea.selectionStart;
        const before = textarea.value.slice(0, trigger.start);
        const after = textarea.value.slice(caretPos);
        const tag = `@${order.title} `;

        textarea.value = before + tag + after;
        const newCaret = before.length + tag.length;
        textarea.setSelectionRange(newCaret, newCaret);
        textarea.focus();
        closePopup();
    }

    function refresh() {
        const found = findMentionTrigger(textarea.value, textarea.selectionStart);
        if (!found) {
            closePopup();
            return;
        }
        trigger = found;
        results = matchOrders(found.query, getOrders());
        activeIndex = 0;
        openPopup();
    }

    textarea.addEventListener("input", refresh);
    textarea.addEventListener("click", refresh);

    textarea.addEventListener("keydown", (event) => {
        if (popup.hidden) return;

        if (event.key === "ArrowDown") {
            event.preventDefault();
            if (results.length === 0) return;
            activeIndex = (activeIndex + 1) % results.length;
            renderResults();
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            if (results.length === 0) return;
            activeIndex = (activeIndex - 1 + results.length) % results.length;
            renderResults();
        } else if (event.key === "Enter" || event.key === "Tab") {
            if (results.length === 0) return;
            event.preventDefault();
            selectOrder(results[activeIndex]);
        } else if (event.key === "Escape") {
            event.preventDefault();
            closePopup();
        }
    });

    textarea.addEventListener("blur", () => {
        // slight delay so a mousedown-triggered selectOrder can still run
        setTimeout(closePopup, 0);
    });

    return { close: closePopup };
}