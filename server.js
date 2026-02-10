const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 8788;
const SESSION_DAYS = 30;

const dataDir = path.join(__dirname, 'data');
const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(dataDir, 'kartoteka.sqlite');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function nowIso() {
  return new Date().toISOString();
}

function toLocalDateString(date) {
  const d = date instanceof Date ? date : new Date(date);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function toDateOnly(input) {
  if (!input) return toLocalDateString(new Date());
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return toLocalDateString(new Date());
  return toLocalDateString(parsed);
}

function toInt(value, fallback = 0) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function newId() {
  return crypto.randomUUID();
}

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
  if (!columns.includes(column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

function normalizeUsername(value) {
  return (value || '').toString().trim().toLowerCase();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const hashed = crypto.scryptSync(password, salt, 64).toString('hex');
  const hashBuffer = Buffer.from(hash, 'hex');
  const hashedBuffer = Buffer.from(hashed, 'hex');
  if (hashBuffer.length !== hashedBuffer.length) return false;
  return crypto.timingSafeEqual(hashBuffer, hashedBuffer);
}

function upsertWorker(id, name, active = 1) {
  if (!id) return;
  const existing = db.prepare('SELECT id FROM workers WHERE id = ?').get(id);
  if (existing) {
    db.prepare('UPDATE workers SET name = ?, active = ? WHERE id = ?').run(name, active, id);
  } else {
    db.prepare('INSERT INTO workers (id, name, active, created_at) VALUES (?, ?, ?, ?)')
      .run(id, name, active, nowIso());
  }
}

function syncWorkersWithUsers() {
  const users = db.prepare('SELECT id, full_name, active FROM users').all();
  users.forEach((user) => {
    upsertWorker(user.id, user.full_name, user.active);
  });
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    createdAt,
    expiresAt
  );
  return token;
}

function getToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return req.headers['x-auth-token'];
}

function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'Nejste přihlášeni.' });

  const row = db.prepare(
    `SELECT s.token, s.user_id, s.expires_at, u.username, u.full_name, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND u.active = 1`
  ).get(token);

  if (!row) return res.status(401).json({ error: 'Neplatné přihlášení.' });

  if (row.expires_at <= nowIso()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return res.status(401).json({ error: 'Platnost přihlášení vypršela.' });
  }

  req.user = {
    id: row.user_id,
    username: row.username,
    full_name: row.full_name,
    role: row.role
  };
  req.token = token;
  return next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'Nemáte oprávnění.' });
    }
    return next();
  };
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS skin_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      form_type TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS treatments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      note TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS addons (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      skin_type_id TEXT,
      skin_notes TEXT,
      cream TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (skin_type_id) REFERENCES skin_types(id)
    );
    CREATE TABLE IF NOT EXISTS visits (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      date TEXT NOT NULL,
      service_id TEXT,
      treatment_id TEXT,
      treatment_price INTEGER NOT NULL DEFAULT 0,
      addons_json TEXT,
      addons_total INTEGER NOT NULL DEFAULT 0,
      manual_total INTEGER,
      total INTEGER NOT NULL,
      service_data TEXT,
      note TEXT,
      worker_id TEXT,
      payment_method TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id),
      FOREIGN KEY (treatment_id) REFERENCES treatments(id),
      FOREIGN KEY (worker_id) REFERENCES workers(id)
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      amount INTEGER NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );
  `);

  ensureColumn('clients', 'cream', 'TEXT');
  ensureColumn('visits', 'service_id', 'TEXT');
  ensureColumn('visits', 'service_data', 'TEXT');
}

function seedDefaults() {
  const skinCount = db.prepare('SELECT COUNT(*) as count FROM skin_types').get().count;
  if (skinCount === 0) {
    const insert = db.prepare('INSERT INTO skin_types (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)');
    const now = nowIso();
    ['Normální', 'Suchá', 'Mastná', 'Smíšená', 'Citlivá'].forEach((name, index) => {
      insert.run(newId(), name, index, now);
    });
  }

  const serviceCount = db.prepare('SELECT COUNT(*) as count FROM services').get().count;
  if (serviceCount === 0) {
    const insert = db.prepare('INSERT INTO services (id, name, form_type, created_at) VALUES (?, ?, ?, ?)');
    const now = nowIso();
    insert.run(newId(), 'Kosmetika', 'cosmetic', now);
    ['Laminace', 'Prodloužení řas', 'Masáže', 'Depilace', 'EMS a lymfodrenáž', 'Líčení'].forEach((name) => {
      insert.run(newId(), name, 'generic', now);
    });
  }

  const treatmentCount = db.prepare('SELECT COUNT(*) as count FROM treatments').get().count;
  if (treatmentCount === 0) {
    const insert = db.prepare('INSERT INTO treatments (id, name, price, note, created_at) VALUES (?, ?, ?, ?, ?)');
    const now = nowIso();
    insert.run(newId(), 'Čištění pleti', 900, 'Základní ošetření.', now);
    insert.run(newId(), 'Hydratační rituál', 1200, 'Hydratace a masáž.', now);
  }

  const addonCount = db.prepare('SELECT COUNT(*) as count FROM addons').get().count;
  if (addonCount === 0) {
    const insert = db.prepare('INSERT INTO addons (id, name, price, created_at) VALUES (?, ?, ?, ?)');
    const now = nowIso();
    insert.run(newId(), 'Ampule', 150, now);
    insert.run(newId(), 'Maska navíc', 200, now);
  }

  const workerCount = db.prepare('SELECT COUNT(*) as count FROM workers').get().count;
  if (workerCount === 0) {
    const insert = db.prepare('INSERT INTO workers (id, name, created_at) VALUES (?, ?, ?)');
    const now = nowIso();
    ['Majitelka', 'Uživatel', 'Recepční 1', 'Recepční 2', 'Recepční 3', 'Recepční 4', 'Recepční 5']
      .forEach((name) => {
        insert.run(newId(), name, now);
      });
  }
}

initDb();
seedDefaults();
syncWorkersWithUsers();

const requireAdmin = requireRole('admin');

function hasUsers() {
  const count = db.prepare('SELECT COUNT(*) as count FROM users WHERE active = 1').get().count;
  return count > 0;
}

function userView(row) {
  return {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    role: row.role
  };
}

function otherAdminCount(excludeId) {
  const row = db.prepare(
    'SELECT COUNT(*) as count FROM users WHERE active = 1 AND role = ? AND id != ?'
  ).get('admin', excludeId);
  return row.count || 0;
}

function getSettings() {
  const skinTypes = db.prepare('SELECT * FROM skin_types WHERE active = 1 ORDER BY sort_order, name').all();
  const services = db.prepare('SELECT * FROM services WHERE active = 1 ORDER BY name').all();
  const treatments = db.prepare('SELECT * FROM treatments WHERE active = 1 ORDER BY name').all();
  const addons = db.prepare('SELECT * FROM addons WHERE active = 1 ORDER BY name').all();
  const workers = db.prepare('SELECT id, full_name as name FROM users WHERE active = 1 ORDER BY full_name').all();
  return { skinTypes, services, treatments, addons, workers };
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/bootstrap', (req, res) => {
  res.json({ has_users: hasUsers() });
});

app.post('/api/setup', (req, res) => {
  if (hasUsers()) return res.status(400).json({ error: 'Uživatel už existuje.' });

  const payload = req.body || {};
  const username = normalizeUsername(payload.username);
  const fullName = (payload.full_name || '').trim();
  const password = (payload.password || '').trim();

  if (!username || !fullName || !password) {
    return res.status(400).json({ error: 'Vyplňte jméno, uživatelské jméno a heslo.' });
  }

  const id = newId();
  const now = nowIso();
  db.prepare(
    'INSERT INTO users (id, username, full_name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, username, fullName, 'admin', hashPassword(password), now);
  upsertWorker(id, fullName, 1);

  res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
  const payload = req.body || {};
  const username = normalizeUsername(payload.username);
  const password = (payload.password || '').trim();
  if (!username || !password) {
    return res.status(400).json({ error: 'Vyplňte uživatelské jméno a heslo.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Neplatné přihlašovací údaje.' });
  }

  const token = createSession(user.id);
  res.json({ token, user: userView(user) });
});

app.use('/api', requireAuth);

app.post('/api/logout', (req, res) => {
  if (req.token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  }
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/settings', (req, res) => {
  res.json(getSettings());
});

app.post('/api/services', requireAdmin, (req, res) => {
  const payload = req.body || {};
  const name = (payload.name || '').trim();
  const formType = payload.form_type === 'cosmetic' ? 'cosmetic' : 'generic';
  if (!name) return res.status(400).json({ error: 'name is required' });

  const id = newId();
  db.prepare('INSERT INTO services (id, name, form_type, created_at) VALUES (?, ?, ?, ?)')
    .run(id, name, formType, nowIso());
  res.json({ id });
});

app.put('/api/services/:id', requireAdmin, (req, res) => {
  const payload = req.body || {};
  const name = (payload.name || '').trim();
  const formType = payload.form_type === 'cosmetic' ? 'cosmetic' : 'generic';
  if (!name) return res.status(400).json({ error: 'name is required' });

  db.prepare('UPDATE services SET name = ?, form_type = ? WHERE id = ?')
    .run(name, formType, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/services/:id', requireAdmin, (req, res) => {
  db.prepare('UPDATE services SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/users', requireAdmin, (req, res) => {
  const users = db.prepare(
    'SELECT id, username, full_name, role, active FROM users WHERE active = 1 ORDER BY full_name'
  ).all();
  res.json(users);
});

app.post('/api/users', requireAdmin, (req, res) => {
  const payload = req.body || {};
  const username = normalizeUsername(payload.username);
  const fullName = (payload.full_name || '').trim();
  const password = (payload.password || '').trim();
  const role = payload.role === 'admin' ? 'admin' : payload.role === 'reception' ? 'reception' : 'worker';

  if (!username || !fullName || !password) {
    return res.status(400).json({ error: 'Vyplňte jméno, uživatelské jméno a heslo.' });
  }

  const id = newId();
  const now = nowIso();
  try {
    db.prepare(
      'INSERT INTO users (id, username, full_name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, username, fullName, role, hashPassword(password), now);
  } catch (err) {
    return res.status(400).json({ error: 'Uživatelské jméno už existuje.' });
  }
  upsertWorker(id, fullName, 1);

  res.json({ id });
});

app.put('/api/users/:id', requireAdmin, (req, res) => {
  const payload = req.body || {};
  const existing = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Uživatel nenalezen.' });

  const username = normalizeUsername(payload.username) || existing.username;
  const fullName = (payload.full_name || '').trim() || existing.full_name;
  const role = payload.role === 'admin'
    ? 'admin'
    : payload.role === 'worker'
      ? 'worker'
      : payload.role === 'reception'
        ? 'reception'
        : existing.role;
  const password = (payload.password || '').trim();

  if (!username || !fullName) {
    return res.status(400).json({ error: 'Jméno a uživatelské jméno jsou povinné.' });
  }

  if (existing.role === 'admin' && role !== 'admin' && otherAdminCount(existing.id) === 0) {
    return res.status(400).json({ error: 'Musí zůstat alespoň jeden administrátor.' });
  }

  const passwordHash = password ? hashPassword(password) : existing.password_hash;

  try {
    db.prepare(
      'UPDATE users SET username = ?, full_name = ?, role = ?, password_hash = ? WHERE id = ?'
    ).run(username, fullName, role, passwordHash, existing.id);
  } catch (err) {
    return res.status(400).json({ error: 'Uživatelské jméno už existuje.' });
  }
  upsertWorker(existing.id, fullName, 1);

  res.json({ ok: true });
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Uživatel nenalezen.' });

  if (existing.role === 'admin' && otherAdminCount(existing.id) === 0) {
    return res.status(400).json({ error: 'Musí zůstat alespoň jeden administrátor.' });
  }

  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(existing.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(existing.id);
  upsertWorker(existing.id, existing.full_name, 0);
  res.json({ ok: true });
});

app.get('/api/clients', (req, res) => {
  const search = (req.query.search || '').toString().trim();
  let rows;
  if (search) {
    const like = `%${search}%`;
    rows = db.prepare(
      `SELECT * FROM clients
       WHERE full_name LIKE ? OR phone LIKE ? OR email LIKE ?
       ORDER BY full_name`
    ).all(like, like, like);
  } else {
    rows = db.prepare('SELECT * FROM clients ORDER BY full_name').all();
  }
  res.json(rows);
});

app.get('/api/clients/:id', (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(client);
});

app.post('/api/clients', (req, res) => {
  const payload = req.body || {};
  const fullName = (payload.full_name || '').trim();
  if (!fullName) return res.status(400).json({ error: 'full_name is required' });

  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO clients (id, full_name, phone, email, skin_type_id, skin_notes, cream, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    fullName,
    payload.phone || null,
    payload.email || null,
    payload.skin_type_id || null,
    payload.skin_notes || null,
    payload.cream || null,
    now,
    now
  );

  res.json({ id });
});

app.put('/api/clients/:id', (req, res) => {
  const payload = req.body || {};
  const fullName = (payload.full_name || '').trim();
  if (!fullName) return res.status(400).json({ error: 'full_name is required' });

  const exists = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'Client not found' });

  db.prepare(
    `UPDATE clients SET
      full_name = ?,
      phone = ?,
      email = ?,
      skin_type_id = ?,
      skin_notes = ?,
      cream = ?,
      updated_at = ?
     WHERE id = ?`
  ).run(
    fullName,
    payload.phone || null,
    payload.email || null,
    payload.skin_type_id || null,
    payload.skin_notes || null,
    payload.cream || null,
    nowIso(),
    req.params.id
  );

  res.json({ ok: true });
});

app.delete('/api/clients/:id', (req, res) => {
  const info = db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  res.json({ ok: info.changes > 0 });
});

app.get('/api/clients/:id/visits', (req, res) => {
  const rows = db.prepare(
    `SELECT v.*, c.full_name as client_name, t.name as treatment_name,
            COALESCE(u.full_name, w.name) as worker_name,
            s.name as service_name, s.form_type as service_form_type
     FROM visits v
     LEFT JOIN clients c ON v.client_id = c.id
     LEFT JOIN services s ON v.service_id = s.id
     LEFT JOIN treatments t ON v.treatment_id = t.id
     LEFT JOIN users u ON v.worker_id = u.id
     LEFT JOIN workers w ON v.worker_id = w.id
     WHERE v.client_id = ?
     ORDER BY v.date DESC, v.created_at DESC`
  ).all(req.params.id);
  res.json(rows);
});

app.post('/api/clients/:id/visits', (req, res) => {
  const payload = req.body || {};
  const clientId = req.params.id;

  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const service = payload.service_id
    ? db.prepare('SELECT id, name, form_type FROM services WHERE id = ? AND active = 1').get(payload.service_id)
    : null;
  if (!service) return res.status(400).json({ error: 'Service is required' });

  const workerId = payload.worker_id || null;
  if (!workerId) return res.status(400).json({ error: 'worker_id is required' });
  const worker = db.prepare('SELECT id, full_name FROM users WHERE id = ? AND active = 1').get(workerId);
  if (!worker) return res.status(400).json({ error: 'worker_id is invalid' });
  upsertWorker(worker.id, worker.full_name, 1);

  const manualTotal = payload.manual_total !== null && payload.manual_total !== undefined && payload.manual_total !== ''
    ? toInt(payload.manual_total, 0)
    : null;

  let treatment = null;
  let addonRows = [];
  let addonsTotal = 0;
  let treatmentPrice = 0;
  let total = 0;

  if (service.form_type === 'cosmetic') {
    treatment = payload.treatment_id
      ? db.prepare('SELECT id, name, price FROM treatments WHERE id = ?').get(payload.treatment_id)
      : null;

    const addons = Array.isArray(payload.addons) ? payload.addons : [];
    addonRows = addons.length
      ? db.prepare(`SELECT id, name, price FROM addons WHERE id IN (${addons.map(() => '?').join(',')})`).all(...addons)
      : [];

    addonsTotal = addonRows.reduce((sum, item) => sum + toInt(item.price, 0), 0);
    treatmentPrice = treatment ? toInt(treatment.price, 0) : 0;
    total = manualTotal !== null ? manualTotal : treatmentPrice + addonsTotal;
  } else {
    if (manualTotal === null) {
      return res.status(400).json({ error: 'manual_total is required' });
    }
    total = manualTotal;
  }

  const id = newId();
  const serviceData = payload.service_data ? JSON.stringify(payload.service_data) : null;
  db.prepare(
    `INSERT INTO visits (
      id, client_id, date, service_id, treatment_id, treatment_price,
      addons_json, addons_total, manual_total, total, service_data, note,
      worker_id, payment_method, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    clientId,
    toDateOnly(payload.date),
    service.id,
    treatment ? treatment.id : null,
    treatmentPrice,
    addonRows.length ? JSON.stringify(addonRows) : null,
    addonsTotal,
    manualTotal,
    total,
    serviceData,
    payload.note || null,
    workerId,
    payload.payment_method || 'cash',
    nowIso()
  );

  res.json({ id });
});

app.delete('/api/visits/:id', (req, res) => {
  const info = db.prepare('DELETE FROM visits WHERE id = ?').run(req.params.id);
  res.json({ ok: info.changes > 0 });
});

app.post('/api/expenses', requireAdmin, (req, res) => {
  const payload = req.body || {};
  const title = (payload.title || '').trim();
  if (!title) return res.status(400).json({ error: 'title is required' });

  const amount = Math.abs(toInt(payload.amount, 0));
  if (!amount) return res.status(400).json({ error: 'amount is required' });

  const id = newId();
  db.prepare(
    `INSERT INTO expenses (id, date, title, amount, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, toDateOnly(payload.date), title, amount, payload.note || null, nowIso());

  res.json({ id });
});

app.get('/api/expenses', requireAdmin, (req, res) => {
  const from = toDateOnly(req.query.from || null);
  const to = toDateOnly(req.query.to || null);
  const rows = db.prepare(
    `SELECT * FROM expenses
     WHERE date BETWEEN ? AND ?
     ORDER BY date DESC, created_at DESC`
  ).all(from, to);
  res.json(rows);
});

app.delete('/api/expenses/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ ok: info.changes > 0 });
});

function economyRange(req) {
  const from = req.query.from ? toDateOnly(req.query.from) : null;
  const to = req.query.to ? toDateOnly(req.query.to) : null;
  if (from && to) return { from, to };

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fromAuto = toLocalDateString(start);
  const toAuto = toLocalDateString(end);
  return { from: from || fromAuto, to: to || toAuto };
}

app.get('/api/economy', requireAdmin, (req, res) => {
  const range = economyRange(req);

  const visits = db.prepare(
    `SELECT v.*, c.full_name as client_name, t.name as treatment_name,
            COALESCE(u.full_name, w.name) as worker_name,
            s.name as service_name
     FROM visits v
     LEFT JOIN clients c ON v.client_id = c.id
     LEFT JOIN services s ON v.service_id = s.id
     LEFT JOIN treatments t ON v.treatment_id = t.id
     LEFT JOIN users u ON v.worker_id = u.id
     LEFT JOIN workers w ON v.worker_id = w.id
     WHERE v.date BETWEEN ? AND ?
     ORDER BY v.date DESC, v.created_at DESC`
  ).all(range.from, range.to);

  const expenses = db.prepare(
    `SELECT * FROM expenses
     WHERE date BETWEEN ? AND ?
     ORDER BY date DESC, created_at DESC`
  ).all(range.from, range.to);

  const incomeTotal = visits.reduce((sum, row) => sum + toInt(row.total, 0), 0);
  const expenseTotal = expenses.reduce((sum, row) => sum + toInt(row.amount, 0), 0);

  const byWorker = db.prepare(
    `SELECT COALESCE(u.id, w.id) as worker_id,
            COALESCE(u.full_name, w.name) as worker_name,
            SUM(v.total) as total
     FROM visits v
     LEFT JOIN users u ON v.worker_id = u.id
     LEFT JOIN workers w ON v.worker_id = w.id
     WHERE v.date BETWEEN ? AND ?
     GROUP BY COALESCE(u.id, w.id)
     ORDER BY total DESC`
  ).all(range.from, range.to);

  res.json({
    range,
    totals: {
      income: incomeTotal,
      expenses: expenseTotal,
      profit: incomeTotal - expenseTotal
    },
    visits,
    expenses,
    by_worker: byWorker
  });
});

app.get('/api/summary', (req, res) => {
  const clientsCount = db.prepare('SELECT COUNT(*) as count FROM clients').get().count;
  const visitsCount = db.prepare('SELECT COUNT(*) as count FROM visits').get().count;
  const expensesCount = db.prepare('SELECT COUNT(*) as count FROM expenses').get().count;

  const range = economyRange(req);
  if (req.user?.role === 'reception') {
    res.json({
      counts: {
        clients: clientsCount,
        visits: visitsCount
      },
      totals: null,
      range
    });
    return;
  }
  if (req.user?.role !== 'admin') {
    res.json({
      counts: {
        clients: clientsCount,
        visits: visitsCount,
        expenses: expensesCount
      },
      totals: null,
      range
    });
    return;
  }

  const visitsAll = db.prepare('SELECT total FROM visits').all();
  const expensesAll = db.prepare('SELECT amount FROM expenses').all();

  const totalIncome = visitsAll.reduce((sum, row) => sum + toInt(row.total, 0), 0);
  const totalExpenses = expensesAll.reduce((sum, row) => sum + toInt(row.amount, 0), 0);

  const visitsMonth = db.prepare('SELECT total FROM visits WHERE date BETWEEN ? AND ?').all(range.from, range.to);
  const expensesMonth = db.prepare('SELECT amount FROM expenses WHERE date BETWEEN ? AND ?').all(range.from, range.to);

  const incomeMonth = visitsMonth.reduce((sum, row) => sum + toInt(row.total, 0), 0);
  const expensesMonthTotal = expensesMonth.reduce((sum, row) => sum + toInt(row.amount, 0), 0);

  res.json({
    counts: {
      clients: clientsCount,
      visits: visitsCount,
      expenses: expensesCount
    },
    totals: {
      income_all: totalIncome,
      expenses_all: totalExpenses,
      profit_all: totalIncome - totalExpenses,
      income_month: incomeMonth,
      expenses_month: expensesMonthTotal,
      profit_month: incomeMonth - expensesMonthTotal
    },
    range
  });
});

app.get('/api/backup', requireAdmin, (req, res) => {
  const data = {
    skin_types: db.prepare('SELECT * FROM skin_types').all(),
    services: db.prepare('SELECT * FROM services').all(),
    treatments: db.prepare('SELECT * FROM treatments').all(),
    addons: db.prepare('SELECT * FROM addons').all(),
    workers: db.prepare('SELECT * FROM workers').all(),
    users: db.prepare('SELECT * FROM users').all(),
    clients: db.prepare('SELECT * FROM clients').all(),
    visits: db.prepare('SELECT * FROM visits').all(),
    expenses: db.prepare('SELECT * FROM expenses').all()
  };

  res.json({
    exported_at: nowIso(),
    data
  });
});

app.post('/api/restore', requireAdmin, (req, res) => {
  const payload = req.body || {};
  if (!payload.data) return res.status(400).json({ error: 'Missing data' });

  const { data } = payload;
  const tables = ['skin_types', 'services', 'treatments', 'addons', 'workers', 'users', 'clients', 'visits', 'expenses'];

  const insertMany = (table, rows) => {
    if (!Array.isArray(rows) || rows.length === 0) return;
    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => '?').join(',');
    const stmt = db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`);
    const insert = db.transaction(() => {
      rows.forEach((row) => {
        const values = columns.map((col) => row[col]);
        stmt.run(values);
      });
    });
    insert();
  };

  const restore = db.transaction(() => {
    db.pragma('foreign_keys = OFF');
    tables.forEach((table) => db.prepare(`DELETE FROM ${table}`).run());
    insertMany('skin_types', data.skin_types || []);
    insertMany('services', data.services || []);
    insertMany('treatments', data.treatments || []);
    insertMany('addons', data.addons || []);
    insertMany('workers', data.workers || []);
    insertMany('users', data.users || []);
    insertMany('clients', data.clients || []);
    insertMany('visits', data.visits || []);
    insertMany('expenses', data.expenses || []);
    db.prepare('DELETE FROM sessions').run();
    db.pragma('foreign_keys = ON');
  });

  try {
    restore();
    syncWorkersWithUsers();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Restore failed', detail: err.message });
  }
});

function createSimpleSettingRoutes(resource, table) {
  app.post(`/api/${resource}`, requireAdmin, (req, res) => {
    const payload = req.body || {};
    const name = (payload.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });

    const id = newId();
    const now = nowIso();
    const price = toInt(payload.price, 0);
    const note = payload.note || null;

    if (table === 'treatments') {
      db.prepare('INSERT INTO treatments (id, name, price, note, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, name, price, note, now);
    } else if (table === 'addons') {
      db.prepare('INSERT INTO addons (id, name, price, created_at) VALUES (?, ?, ?, ?)')
        .run(id, name, price, now);
    } else {
      db.prepare(`INSERT INTO ${table} (id, name, created_at) VALUES (?, ?, ?)`)
        .run(id, name, now);
    }

    res.json({ id });
  });

  app.put(`/api/${resource}/:id`, requireAdmin, (req, res) => {
    const payload = req.body || {};
    const name = (payload.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });

    const price = toInt(payload.price, 0);
    const note = payload.note || null;

    if (table === 'treatments') {
      db.prepare('UPDATE treatments SET name = ?, price = ?, note = ? WHERE id = ?')
        .run(name, price, note, req.params.id);
    } else if (table === 'addons') {
      db.prepare('UPDATE addons SET name = ?, price = ? WHERE id = ?')
        .run(name, price, req.params.id);
    } else {
      db.prepare(`UPDATE ${table} SET name = ? WHERE id = ?`)
        .run(name, req.params.id);
    }

    res.json({ ok: true });
  });

  app.delete(`/api/${resource}/:id`, requireAdmin, (req, res) => {
    db.prepare(`UPDATE ${table} SET active = 0 WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });
}

createSimpleSettingRoutes('skin-types', 'skin_types');
createSimpleSettingRoutes('treatments', 'treatments');
createSimpleSettingRoutes('addons', 'addons');
createSimpleSettingRoutes('workers', 'workers');

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Interní chyba serveru.', detail: err.message });
});

app.listen(PORT, () => {
  console.log(`Kartoteka running on http://localhost:${PORT}`);
});
