import {
  collection, deleteDoc, doc, getDoc, getDocs, orderBy, query,
  serverTimestamp, setDoc
} from "firebase/firestore";
import { db } from "../firebase.js";

function requireDatabase() {
  if (!db) throw new Error("Cloud database is not configured. PaperSpace remains in local-only mode.");
  return db;
}

function requireUid(uid) {
  if (!uid || typeof uid !== "string") throw new Error("A signed-in account is required.");
  return uid;
}

const cleanString = value => typeof value === "string" ? value.trim() : "";

/**
 * Creates/updates the signed-in user's minimal profile.
 * Call only after Firebase Authentication has confirmed the user.
 */
export async function ensureUserProfile(user) {
  const database = requireDatabase();
  const uid = requireUid(user?.uid);
  const profileRef = doc(database, "users", uid);
  const existing = await getDoc(profileRef);
  const profile = {
    displayName: cleanString(user.displayName),
    email: cleanString(user.email),
    createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  await setDoc(profileRef, profile);
  return profileRef;
}

export async function listPaperRecords(uid) {
  const database = requireDatabase();
  const papersRef = collection(database, "users", requireUid(uid), "papers");
  const snapshot = await getDocs(query(papersRef, orderBy("updatedAt", "desc")));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

export async function savePaperRecord(uid, paper) {
  const database = requireDatabase();
  const userId = requireUid(uid);
  if (!paper?.id) throw new Error("A stable paper ID is required.");
  const paperRef = doc(database, "users", userId, "papers", paper.id);
  const existing = await getDoc(paperRef);
  const record = {
    title: cleanString(paper.title),
    authors: cleanString(paper.authors),
    publication: cleanString(paper.publication),
    driveFileId: cleanString(paper.driveFileId),
    driveFileName: cleanString(paper.driveFileName),
    createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  await setDoc(paperRef, record);
  return record;
}

export async function deletePaperRecord(uid, paperId) {
  const database = requireDatabase();
  await deleteDoc(doc(database, "users", requireUid(uid), "papers", paperId));
}

export async function listPaperSubcollection(uid, paperId, subcollectionName) {
  const database = requireDatabase();
  if (!["notes", "annotations"].includes(subcollectionName)) {
    throw new Error("Unsupported paper subcollection.");
  }
  const ref = collection(database, "users", requireUid(uid), "papers", paperId, subcollectionName);
  const snapshot = await getDocs(ref);
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}
