// Pure SQL mapping between the app's state object and normalised SQLite tables.
// `driver` = { run(set:[{statement,values}]) -> Promise, query(sql, values) -> Promise<row[]> }
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS debts(id INTEGER PRIMARY KEY, pos INTEGER NOT NULL, name TEXT NOT NULL, note TEXT, prepay INTEGER NOT NULL DEFAULT 1, extended INTEGER NOT NULL DEFAULT 0, ext_json TEXT, got_date TEXT, got_amt REAL)`,
  `CREATE TABLE IF NOT EXISTS debt_items(id INTEGER PRIMARY KEY AUTOINCREMENT, debt_id INTEGER NOT NULL, pos INTEGER NOT NULL, due_date TEXT, amount REAL NOT NULL, paid INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS daily_log(date TEXT PRIMARY KEY, zepto REAL, side REAL, cod REAL, cod_sp REAL, cod_bank REAL, extra TEXT)`,
  `CREATE TABLE IF NOT EXISTS expenses(id TEXT PRIMARY KEY, date TEXT NOT NULL, cat TEXT, amount REAL NOT NULL, note TEXT)`,
  `CREATE TABLE IF NOT EXISTS cod_settlements(date TEXT PRIMARY KEY, amount REAL NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_items_debt ON debt_items(debt_id)`,
  `CREATE INDEX IF NOT EXISTS idx_exp_date ON expenses(date)`
];
const FLAGS = ['m2', 'm3', 'm4', 'm5', 'm6', 'm7'];
const LOGCOL = { zepto: 'zepto', side: 'side', cod: 'cod', codSp: 'cod_sp', codBank: 'cod_bank' };
const TABLES = ['meta', 'settings', 'debts', 'debt_items', 'daily_log', 'expenses', 'cod_settlements'];
const num = v => { v = +v; return Number.isFinite(v) ? v : 0 };

export async function saveState(driver, S) {
  const set = TABLES.map(t => ({ statement: `DELETE FROM ${t} WHERE 1=?`, values: [1] }));
  const ins = (sql, values) => set.push({ statement: sql, values });
  ins(`INSERT INTO meta(key,value) VALUES(?,?)`, ['v', String(S.v || 1)]);
  ins(`INSERT INTO meta(key,value) VALUES(?,?)`, ['planId', String(S.planId)]);
  ins(`INSERT INTO meta(key,value) VALUES(?,?)`, ['nid', String(S.nid || 100)]);
  FLAGS.forEach(f => { if (S[f] !== undefined) ins(`INSERT INTO meta(key,value) VALUES(?,?)`, [f, S[f] ? '1' : '0']) });
  Object.keys(S.st || {}).forEach(k => ins(`INSERT INTO settings(key,value) VALUES(?,?)`, [k, JSON.stringify(S.st[k])]));
  (S.debts || []).forEach((db, i) => {
    ins(`INSERT INTO debts(id,pos,name,note,prepay,extended,ext_json,got_date,got_amt) VALUES(?,?,?,?,?,?,?,?,?)`,
      [db.id, i, db.name || '', db.note || '', db.prepay === false ? 0 : 1, db.extended ? 1 : 0,
        db.ext ? JSON.stringify(db.ext) : '', db.got ? (db.got.date || '') : '', db.got ? num(db.got.amt) : -1]);
    (db.items || []).forEach((it, j) =>
      ins(`INSERT INTO debt_items(debt_id,pos,due_date,amount,paid) VALUES(?,?,?,?,?)`, [db.id, j, it.date || '', num(it.amt), it.paid ? 1 : 0]));
  });
  Object.keys(S.log || {}).forEach(d => {
    const L = S.log[d] || {}, v = {}, extra = {};
    Object.keys(L).forEach(k => { if (LOGCOL[k]) v[LOGCOL[k]] = num(L[k]); else extra[k] = L[k] });
    const col = c => (v[c] === undefined ? null : v[c]);
    ins(`INSERT INTO daily_log(date,zepto,side,cod,cod_sp,cod_bank,extra) VALUES(?,?,?,?,?,?,?)`,
      [d, col('zepto'), col('side'), col('cod'), col('cod_sp'), col('cod_bank'), Object.keys(extra).length ? JSON.stringify(extra) : '']);
  });
  (S.exp || []).forEach(e => ins(`INSERT INTO expenses(id,date,cat,amount,note) VALUES(?,?,?,?,?)`, [String(e.id), e.date || '', e.cat || '', num(e.amt), e.note || '']));
  Object.keys(S.stl || {}).forEach(d => ins(`INSERT INTO cod_settlements(date,amount) VALUES(?,?)`, [d, num(S.stl[d])]));
  await driver.run(set);
}

export async function loadState(driver) {
  const meta = {};
  (await driver.query(`SELECT key,value FROM meta`, [])).forEach(r => { meta[r.key] = r.value });
  if (meta.v === undefined) return null;
  const S = { v: +meta.v, planId: +meta.planId, nid: +meta.nid || 100, st: {}, debts: [], log: {}, exp: [], stl: {} };
  FLAGS.forEach(f => { if (meta[f] !== undefined) S[f] = meta[f] === '1' });
  (await driver.query(`SELECT key,value FROM settings`, [])).forEach(r => { try { S.st[r.key] = JSON.parse(r.value) } catch (e) { S.st[r.key] = r.value } });
  const items = await driver.query(`SELECT debt_id,pos,due_date,amount,paid FROM debt_items ORDER BY debt_id,pos`, []);
  (await driver.query(`SELECT * FROM debts ORDER BY pos`, [])).forEach(r => {
    const db = { id: r.id, name: r.name, note: r.note || '', prepay: !!r.prepay, items: [] };
    if (r.ext_json) { try { db.ext = JSON.parse(r.ext_json) } catch (e) {} }
    if (r.extended) db.extended = true;
    if (r.got_amt !== null && r.got_amt >= 0 && r.got_date) db.got = { date: r.got_date, amt: r.got_amt };
    items.filter(x => x.debt_id === r.id).forEach(x => db.items.push({ date: x.due_date || '', amt: x.amount, paid: !!x.paid }));
    S.debts.push(db);
  });
  (await driver.query(`SELECT * FROM daily_log ORDER BY date`, [])).forEach(r => {
    const o = {};
    Object.keys(LOGCOL).forEach(k => { const v = r[LOGCOL[k]]; if (v !== null && v !== undefined) o[k] = v });
    if (r.extra) { try { Object.assign(o, JSON.parse(r.extra)) } catch (e) {} }
    S.log[r.date] = o;
  });
  (await driver.query(`SELECT * FROM expenses ORDER BY rowid`, [])).forEach(r => S.exp.push({ id: r.id, date: r.date, cat: r.cat, amt: r.amount, note: r.note || '' }));
  (await driver.query(`SELECT date,amount FROM cod_settlements`, [])).forEach(r => { S.stl[r.date] = r.amount });
  return S;
}
