// Reads the first worksheet of an .xlsx into plain arrays, and writes arrays
// back into it. Only <sheetData> is replaced; column widths, header styling,
// other sheets etc. are left exactly as Excel saved them.

import { readZip, writeZip, entryText, setEntryText } from "./xlsx-zip.js";

const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const parseXml = (text) => new DOMParser().parseFromString(text, "application/xml");

function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

function colName(index) {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    name = String.fromCharCode(65 + m) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function escapeXml(text) {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function findSheetPath(entries) {
  try {
    const wb = parseXml(await entryText(entries.get("xl/workbook.xml")));
    const rid = wb.getElementsByTagNameNS("*", "sheet")[0].getAttributeNS(REL_NS, "id");
    const rels = parseXml(await entryText(entries.get("xl/_rels/workbook.xml.rels")));
    for (const rel of rels.getElementsByTagNameNS("*", "Relationship")) {
      if (rel.getAttribute("Id") !== rid) continue;
      const target = rel.getAttribute("Target");
      const path = target.startsWith("/") ? target.slice(1) : "xl/" + target;
      if (entries.has(path)) return path;
    }
  } catch {
    // fall through to the guess below
  }
  const guess = [...entries.keys()].find((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  if (!guess) throw new Error("No worksheet found in the .xlsx file");
  return guess;
}

async function readSharedStrings(entries) {
  const entry = entries.get("xl/sharedStrings.xml");
  if (!entry) return [];
  const doc = parseXml(await entryText(entry));
  return [...doc.getElementsByTagNameNS("*", "si")].map((si) =>
    [...si.getElementsByTagNameNS("*", "t")]
      .filter((t) => t.parentNode.localName !== "rPh")
      .map((t) => t.textContent)
      .join("")
  );
}

// -> string | number | null
function cellValue(cell, shared) {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") {
    return [...cell.getElementsByTagNameNS("*", "t")].map((t) => t.textContent).join("");
  }
  const v = cell.getElementsByTagNameNS("*", "v")[0];
  if (!v) return null;
  const raw = v.textContent;
  if (type === "s") return shared[Number(raw)] ?? "";
  if (type === "str" || type === "e") return raw;
  if (type === "b") return raw === "1" ? "TRUE" : "FALSE";
  const n = Number(raw);
  return Number.isNaN(n) ? raw : n;
}

// Resolves to { rows, ...ctx }. `rows` are the data rows (row 2 onwards) as
// sparse arrays indexed by column (A = 0). Pass the whole result to
// writeWorkbook() later.
async function readWorkbook(buffer) {
  const entries = readZip(buffer);
  const sheetPath = await findSheetPath(entries);
  const sheetXml = await entryText(entries.get(sheetPath));
  const shared = await readSharedStrings(entries);
  const doc = parseXml(sheetXml);

  const rows = [];
  const headerStyles = {};
  let counter = 0;

  for (const rowEl of doc.getElementsByTagNameNS("*", "row")) {
    counter++;
    const rowNum = Number(rowEl.getAttribute("r")) || counter;
    const values = [];
    for (const cell of rowEl.getElementsByTagNameNS("*", "c")) {
      const ref = cell.getAttribute("r");
      const idx = ref ? colIndex(ref) : values.length;
      if (rowNum === 1) {
        const style = cell.getAttribute("s");
        if (style !== null) headerStyles[idx] = style;
        continue;
      }
      values[idx] = cellValue(cell, shared);
    }
    if (rowNum > 1) rows.push(values);
  }

  return { entries, sheetPath, sheetXml, headerStyles, rows };
}

function rowXml(rowNum, values, styles = {}) {
  let cells = "";
  values.forEach((v, i) => {
    const ref = `${colName(i)}${rowNum}`;
    const s = styles[i] !== undefined ? ` s="${styles[i]}"` : "";
    if (v === null || v === undefined || v === "") {
      if (s) cells += `<c r="${ref}"${s}/>`;
    } else if (typeof v === "number" && Number.isFinite(v)) {
      cells += `<c r="${ref}"${s}><v>${v}</v></c>`;
    } else {
      cells += `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(v))}</t></is></c>`;
    }
  });
  return `<row r="${rowNum}">${cells}</row>`;
}

async function patchText(entries, name, fn) {
  const entry = entries.get(name);
  if (entry) await setEntryText(entries, name, fn(await entryText(entry)));
}

// Replaces the sheet's data with `headers` + `dataRows` and returns a Blob
// ready to be written to disk.
async function writeWorkbook(book, headers, dataRows) {
  const { entries, sheetPath, sheetXml, headerStyles } = book;

  if (!/<sheetData/.test(sheetXml)) throw new Error("Worksheet has no <sheetData>");

  const body = [
    rowXml(1, headers, headerStyles),
    ...dataRows.map((values, i) => rowXml(i + 2, values)),
  ].join("");
  const ref = `A1:${colName(headers.length - 1)}${dataRows.length + 1}`;

  // Function replacers on purpose: a string replacement would mangle "$&" etc.
  let xml = sheetXml.replace(/<sheetData\s*\/>|<sheetData[\s\S]*?<\/sheetData>/, () => `<sheetData>${body}</sheetData>`);
  xml = xml.replace(/<dimension\s+ref="[^"]*"\s*\/>/, () => `<dimension ref="${ref}"/>`);
  await setEntryText(entries, sheetPath, xml);

  // We write plain values, never formulas. A leftover calcChain pointing at
  // formulas that no longer exist makes Excel show a "repair" prompt.
  if (entries.has("xl/calcChain.xml")) {
    entries.delete("xl/calcChain.xml");
    await patchText(entries, "[Content_Types].xml", (x) => x.replace(/<Override[^>]*calcChain[^>]*\/>/g, ""));
    await patchText(entries, "xl/_rels/workbook.xml.rels", (x) => x.replace(/<Relationship[^>]*calcChain[^>]*\/>/g, ""));
  }

  return writeZip(entries);
}

export { readWorkbook, writeWorkbook };