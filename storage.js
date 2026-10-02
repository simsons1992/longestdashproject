// All persistence lives here. Firestore-backed — nothing else in the app
// knows how orders are stored.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

import { DEFAULT_STATUS } from "./statuses.js";

const firebaseConfig = {
  apiKey: "AIzaSyDNDd-gdnD2TBmKiUWqPlb3NFS1h99eHcQ",
  authDomain: "longlastingdashboard.firebaseapp.com",
  projectId: "longlastingdashboard",
  storageBucket: "longlastingdashboard.firebasestorage.app",
  messagingSenderId: "382058126263",
  appId: "1:382058126263:web:2138a449eb8f12fa156632",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const ordersCollection = collection(db, "orders");

// Done orders stay visible for this long after completedAt, then are hidden
// from the app (they remain in Firestore).
const DONE_TTL = 31 * 24 * 60 * 60 * 1000;

function isVisible(o) {
  if (o.status !== "done") return true;
  if (!o.completedAt) return true; // never hide an order without a date
  return Date.now() - o.completedAt <= DONE_TTL;
}

async function loadAllOrders() {
  try {
    const snapshot = await getDocs(ordersCollection);
    return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (err) {
    console.error("Could not read orders from Firestore", err);
    return [];
  }
}

async function loadOrders() {
  return (await loadAllOrders()).filter(isVisible);
}

async function createOrder(data) {
  const order = {
    status: data.status || DEFAULT_STATUS,
    title: data.title || "",
    note: data.note || "",
    phone: data.phone || "",
    email: data.email || "",
    pr: data.pr === "" || data.pr === undefined ? null : data.pr,
    revenue: data.revenue === "" || data.revenue === undefined ? null : data.revenue,
    delivery: data.delivery || "",
    createdAt: Date.now(),
    completedAt: data.status === "done" ? Date.now() : null,
  };
  try {
    const docRef = await addDoc(ordersCollection, order);
    return { id: docRef.id, ...order };
  } catch (err) {
    console.error("Could not save order to Firestore", err);
    return null;
  }
}

async function updateOrder(id, patch) {
  try {
    const ref = doc(db, "orders", id);
    if (patch.status !== undefined) {
      if (patch.status === "done") {
        // Only stamp on the transition to done, not on every later save.
        const current = await getDoc(ref);
        if (!current.data()?.completedAt) patch = { ...patch, completedAt: Date.now() };
      } else {
        patch = { ...patch, completedAt: null }; // reopened, so the clock resets
      }
    }
    await updateDoc(ref, patch);
    return true;
  } catch (err) {
    console.error("Could not update order in Firestore", err);
    return false;
  }
}

async function deleteOrder(id) {
  try {
    await deleteDoc(doc(db, "orders", id));
    return true;
  } catch (err) {
    console.error("Could not delete order in Firestore", err);
    return false;
  }
}

export { loadOrders, loadAllOrders, createOrder, updateOrder, deleteOrder };