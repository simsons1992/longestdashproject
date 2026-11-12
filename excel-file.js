// Owns the link to the local .xlsx file via the File System Access API
// (Chrome / Edge). The file handle is remembered in IndexedDB so the file only
// has to be picked once; the browser may ask to re-grant permission after a
// restart, which needs one click (see file-connect.js).

const DB_NAME = "orders-excel";
const STORE = "handles";
const KEY = "orders-file";
const PERM = { mode: "readwrite" };

let handle = null;
let ready = false;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadSavedHandle() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function saveHandle(h) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(h, KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

const isSupported = () => "showOpenFilePicker" in window;
const isReady = () => ready;

// Call once at startup. -> "ready" | "needs-permission" | "none"
async function restoreHandle() {
  handle = await loadSavedHandle();
  if (!handle) return "none";
  ready = (await handle.queryPermission(PERM)) === "granted";
  return ready ? "ready" : "needs-permission";
}

// Must be called from a click. Re-grants access to the remembered file, or
// opens the picker if there isn't one (or if forcePick is set).
async function connectFile(forcePick = false) {
  if (handle && !forcePick && (await handle.requestPermission(PERM)) === "granted") {
    ready = true;
    return;
  }
  const [picked] = await window.showOpenFilePicker({
    types: [
      {
        description: "Excel workbook",
        accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
      },
    ],
  });
  if ((await picked.requestPermission(PERM)) !== "granted") {
    throw new Error("Permission to edit the file was denied");
  }
  handle = picked;
  ready = true;
  await saveHandle(handle);
}

async function readFileBuffer() {
  return (await handle.getFile()).arrayBuffer();
}

async function writeFileBlob(blob) {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

// Every read-modify-write runs one at a time, so quick back-to-back saves
// (Enter-to-advance, note adds) can't overwrite each other.
let queue = Promise.resolve();
function exclusive(task) {
  const run = queue.then(() => task());
  queue = run.catch(() => {});
  return run;
}

export { isSupported, isReady, restoreHandle, connectFile, readFileBuffer, writeFileBlob, exclusive };