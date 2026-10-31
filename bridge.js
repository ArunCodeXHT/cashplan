import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite } from '@capacitor-community/sqlite';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { SCHEMA, saveState, loadState } from './dbcore.js';

const DB = 'cashplan';
const LOCAL_KEY = 'cashplan.local.state';
const native = Capacitor.isNativePlatform();
let mode = 'local';

const sqliteDriver = {
  run: set => CapacitorSQLite.executeSet({ database: DB, set, transaction: true, readonly: false }),
  query: async (statement, values = []) => {
    const r = await CapacitorSQLite.query({ database: DB, statement, values, readonly: false });
    return r.values || [];
  }
};

async function init() {
  if (!native) return;
  try {
    try { await CapacitorSQLite.createConnection({ database: DB, version: 1, encrypted: false, mode: 'no-encryption', readonly: false }); } catch (e) { /* already exists */ }
    await CapacitorSQLite.open({ database: DB, readonly: false });
    await CapacitorSQLite.execute({ database: DB, statements: SCHEMA.join(';\n') + ';', transaction: true, readonly: false });
    mode = 'sqlite';
  } catch (e) {
    console.error('SQLite unavailable, using local storage', e);
    mode = 'local';
  }
}

async function load() {
  if (mode === 'sqlite') return loadState(sqliteDriver);
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)); } catch (e) { return null; }
}

async function persist(S) {
  if (mode === 'sqlite') return saveState(sqliteDriver, S);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(S));
}

let chain = Promise.resolve(), seq = 0;
function save(S) {
  const snap = JSON.stringify(S), my = ++seq;
  chain = chain.then(() => (my === seq ? persist(JSON.parse(snap)) : null)).catch(e => { api.lastError = e; console.error('save failed', e); });
  return chain;
}

async function savePdf(b64, filename) {
  let savedTo = null;
  try {
    await Filesystem.writeFile({ path: 'CashPlan/' + filename, data: b64, directory: Directory.Documents, recursive: true });
    savedTo = 'Documents/CashPlan/' + filename;
  } catch (e) { /* not allowed on some Android versions; the share sheet below still works */ }
  const f = await Filesystem.writeFile({ path: filename, data: b64, directory: Directory.Cache });
  try { await Share.share({ title: 'Cash Plan report', dialogTitle: 'Open or save report', url: f.uri }); } catch (e) { /* user closed the sheet */ }
  return { savedTo };
}

const api = { native, get mode() { return mode; }, init, load, save, savePdf, lastError: null };
window.DBB = api;
