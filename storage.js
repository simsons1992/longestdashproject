// All persistence lives here. Firestore-backed — nothing else in the app
// knows how orders are stored.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
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

// One-time fetch — call this whenever you need a fresh list (app launch,
// after a save/delete). No live listener; nothing updates until you call
// this again.
async function loadOrders() {
  try {
    const snapshot = await getDocs(ordersCollection);
    return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (err) {
    console.error("Could not read orders from Firestore", err);
    return [];
  }
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
    await updateDoc(doc(db, "orders", id), patch);
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

export { loadOrders, createOrder, updateOrder, deleteOrder };