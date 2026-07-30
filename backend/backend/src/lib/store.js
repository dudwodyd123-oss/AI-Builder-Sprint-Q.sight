import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { fileURLToPath } from "url";
import path from "path";
import { v4 as uuid } from "uuid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, "..", "..", "data", "db.json");

const defaultData = { pledges: [], documents: [] };
const adapter = new JSONFile(file);
const db = new Low(adapter, defaultData);

export async function initDb() {
  await db.read();
  db.data ||= defaultData;
  await db.write();
  return db;
}

export async function createPledge(pledge) {
  await db.read();
  const record = {
    id: uuid(),
    createdAt: new Date().toISOString(),
    status: "draft",
    ...pledge,
  };
  db.data.pledges.push(record);
  await db.write();
  return record;
}

export async function updatePledge(id, patch) {
  await db.read();
  const idx = db.data.pledges.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  db.data.pledges[idx] = { ...db.data.pledges[idx], ...patch, updatedAt: new Date().toISOString() };
  await db.write();
  return db.data.pledges[idx];
}

export async function getPledge(id) {
  await db.read();
  return db.data.pledges.find((p) => p.id === id) || null;
}

export async function listPledges() {
  await db.read();
  return db.data.pledges;
}

export async function saveDocument(doc) {
  await db.read();
  const record = { id: uuid(), createdAt: new Date().toISOString(), ...doc };
  db.data.documents.push(record);
  await db.write();
  return record;
}

export async function updateDocument(id, patch) {
  await db.read();
  const idx = db.data.documents.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  db.data.documents[idx] = { ...db.data.documents[idx], ...patch, updatedAt: new Date().toISOString() };
  await db.write();
  return db.data.documents[idx];
}

export async function listDocuments() {
  await db.read();
  return db.data.documents;
}

export async function getDocument(id) {
  await db.read();
  return db.data.documents.find((d) => d.id === id) || null;
}

export default db;
