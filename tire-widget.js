// Tire quote calculator. Total / Total dep update live as you type in either
// field. The Copy button copies a formatted client + department price pair
// to the clipboard.

const frontInput = document.getElementById("tire-front");
const rearInput = document.getElementById("tire-rear");
const totalEl = document.getElementById("tire-total");
const totalDepEl = document.getElementById("tire-total-dep");
const copyBtn = document.getElementById("tire-copy-btn");

// Returns the client-facing total (with margin, with VAT), or null if
// neither field has a usable number in it yet.
function calculatePrice() {
  const front = Number.parseFloat(frontInput.value);
  const rear = Number.parseFloat(rearInput.value);

  const hasFront = Number.isFinite(front);
  const hasRear = Number.isFinite(rear);

  if (!hasFront && !hasRear) return null;

  let basePrice;
  if (hasFront && hasRear) {
    // Both sizes: (front + rear) × 2
    basePrice = (front + rear) * 2;
  } else if (hasFront) {
    // Only front: × 4
    basePrice = front * 4;
  } else {
    // Only rear: × 4
    basePrice = rear * 4;
  }

  // 35% margin
  return basePrice * 1.35;
}

function formatPrice(amount) {
  return amount.toFixed(2);
}

function refreshTotals() {
  const total = calculatePrice();

  if (total === null) {
    totalEl.textContent = "\u2014";
    totalDepEl.textContent = "\u2014";
    return;
  }

  // Strip 21% VAT, then take 80% for the department price
  const departmentPrice = (total / 1.21) * 0.8;

  totalEl.textContent = `${formatPrice(total)} EUR`;
  totalDepEl.textContent = `${formatPrice(departmentPrice)} EUR`;
}

async function copyTotals() {
  const total = calculatePrice();
  if (total === null) return;

  const departmentPrice = (total / 1.21) * 0.8;
  const clientLine = `Klienta cena: ${formatPrice(total)} EUR ar PVN`;
  const departmentLine = `Nodaļas cena: ${formatPrice(departmentPrice)} EUR bez PVN`;
  const output = `${clientLine}\n${departmentLine}`;

  try {
    await navigator.clipboard.writeText(output);
    copyBtn.textContent = "Copied";
    window.setTimeout(() => {
      copyBtn.textContent = "Copy";
    }, 1500);
  } catch {
    window.prompt("Copy this manually:", output);
  }
}

function initTireWidget() {
  if (!frontInput || !rearInput || !copyBtn) return;

  frontInput.addEventListener("input", refreshTotals);
  rearInput.addEventListener("input", refreshTotals);
  copyBtn.addEventListener("click", copyTotals);

  refreshTotals();
}

export { initTireWidget };