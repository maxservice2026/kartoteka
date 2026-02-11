const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 8788;
const SESSION_DAYS = 30;
const DEFAULT_PRO_ALLOWED_IPS = ['46.135.1.58', '34.160.111.145'];
const PRO_PIN = process.env.PRO_PIN || '224234234';
const PRO_ALLOWED_IPS = (process.env.PRO_ALLOWED_IPS || DEFAULT_PRO_ALLOWED_IPS.join(','))
  .split(',')
  .map((ip) => ip.trim())
  .filter(Boolean);

const usePostgres = Boolean(process.env.DATABASE_URL);

function splitStatements(sql) {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function toPgSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function createPostgresAdapter(pool) {
  return {
    isPostgres: true,
    async get(sql, params = []) {
      const result = await pool.query(toPgSql(sql), params);
      return result.rows[0] || null;
    },
    async all(sql, params = []) {
      const result = await pool.query(toPgSql(sql), params);
      return result.rows;
    },
    async run(sql, params = []) {
      const result = await pool.query(toPgSql(sql), params);
      return { changes: result.rowCount };
    },
    async exec(sql) {
      const statements = splitStatements(sql);
      for (const statement of statements) {
        await pool.query(statement);
      }
    }
  };
}

function createSqliteAdapter(sqlite) {
  return {
    isPostgres: false,
    async get(sql, params = []) {
      return sqlite.prepare(sql).get(params);
    },
    async all(sql, params = []) {
      return sqlite.prepare(sql).all(params);
    },
    async run(sql, params = []) {
      const info = sqlite.prepare(sql).run(params);
      return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
    },
    async exec(sql) {
      sqlite.exec(sql);
    }
  };
}

let db;

if (usePostgres) {
  const needsSsl = !process.env.PGSSLMODE || process.env.PGSSLMODE !== 'disable';
  const ssl = needsSsl && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl
  });
  db = createPostgresAdapter(pool);
} else {
  const dataDir = path.join(__dirname, 'data');
  const dbPath = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(dataDir, 'kartoteka.sqlite');
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  db = createSqliteAdapter(sqlite);
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function normalizeIp(ip) {
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return normalizeIp(forwarded.split(',')[0].trim());
  }
  return normalizeIp(req.socket?.remoteAddress || '');
}

function isProAllowed(req) {
  if (!PRO_ALLOWED_IPS.length) return true;
  const ip = getClientIp(req);
  if (!ip) return false;
  if (ip === '127.0.0.1' || ip === '::1') return true;
  return PRO_ALLOWED_IPS.includes(ip);
}

function isProPinValid(req) {
  const pin = (req.headers['x-pro-pin'] || '').toString().trim();
  return Boolean(pin) && pin === PRO_PIN;
}

app.get('/rezervace', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'booking.html'));
});

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

function pad2(value) {
  return String(value).padStart(2, '0');
}

function weekdayIndex(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return (date.getDay() + 6) % 7;
}

function timeSlots() {
  const slots = [];
  for (let hour = 7; hour <= 19; hour += 1) {
    slots.push(`${pad2(hour)}:00`);
    if (hour !== 19) {
      slots.push(`${pad2(hour)}:30`);
    }
  }
  return slots;
}

function newId() {
  return crypto.randomUUID();
}

async function ensureColumn(table, column, definition) {
  if (db.isPostgres) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
    return;
  }
  const columns = await db.all(`PRAGMA table_info(${table})`);
  const names = columns.map((row) => row.name);
  if (!names.includes(column)) {
    await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
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

async function upsertWorker(id, name, active = 1) {
  if (!id) return;
  const existing = await db.get('SELECT id FROM workers WHERE id = ?', [id]);
  if (existing) {
    await db.run('UPDATE workers SET name = ?, active = ? WHERE id = ?', [name, active, id]);
  } else {
    await db.run(
      'INSERT INTO workers (id, name, active, created_at) VALUES (?, ?, ?, ?)',
      [id, name, active, nowIso()]
    );
  }
}

async function syncWorkersWithUsers() {
  const users = await db.all('SELECT id, full_name, active FROM users');
  for (const user of users) {
    await upsertWorker(user.id, user.full_name, user.active);
  }
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await db.run(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    [token, userId, createdAt, expiresAt]
  );
  return token;
}

function getToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return req.headers['x-auth-token'];
}

async function requireAuth(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Nejste přihlášeni.' });

    const row = await db.get(
      `SELECT s.token, s.user_id, s.expires_at, u.username, u.full_name, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND u.active = 1`,
      [token]
    );

    if (!row) return res.status(401).json({ error: 'Neplatné přihlášení.' });

    if (row.expires_at <= nowIso()) {
      await db.run('DELETE FROM sessions WHERE token = ?', [token]);
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
  } catch (err) {
    return next(err);
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'Nemáte oprávnění.' });
    }
    return next();
  };
}

function requireEconomyAccess(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'worker')) {
    return res.status(403).json({ error: 'Nemáte oprávnění.' });
  }
  return next();
}

function requireProAccess(req, res, next) {
  if (!isProAllowed(req) && !isProPinValid(req)) {
    return res.status(403).json({ error: 'PRO přístup pouze pro povolené zařízení.' });
  }
  return next();
}

async function initDb() {
  await db.exec(`
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
      duration_minutes INTEGER NOT NULL DEFAULT 30,
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
      vat_rate INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      worker_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS availability (
      id TEXT PRIMARY KEY,
      worker_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      time_slot TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (worker_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      service_id TEXT NOT NULL,
      worker_id TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      client_name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (service_id) REFERENCES services(id),
      FOREIGN KEY (worker_id) REFERENCES users(id)
    );
  `);

  await ensureColumn('clients', 'cream', 'TEXT');
  await ensureColumn('visits', 'service_id', 'TEXT');
  await ensureColumn('visits', 'service_data', 'TEXT');
  await ensureColumn('expenses', 'vat_rate', 'INTEGER DEFAULT 0');
  await ensureColumn('expenses', 'worker_id', 'TEXT');
  await ensureColumn('services', 'duration_minutes', 'INTEGER DEFAULT 30');
  await ensureColumn('reservations', 'duration_minutes', 'INTEGER DEFAULT 30');

  await db.run('UPDATE services SET duration_minutes = 30 WHERE duration_minutes IS NULL');
  await db.run('UPDATE reservations SET duration_minutes = 30 WHERE duration_minutes IS NULL');
}

async function seedDefaults() {
  const skinRow = await db.get('SELECT COUNT(*) as count FROM skin_types');
  const skinCount = toInt(skinRow?.count, 0);
  if (skinCount === 0) {
    const now = nowIso();
    const items = ['Normální', 'Suchá', 'Mastná', 'Smíšená', 'Citlivá'];
    for (const [index, name] of items.entries()) {
      await db.run(
        'INSERT INTO skin_types (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)',
        [newId(), name, index, now]
      );
    }
  }

  const serviceRow = await db.get('SELECT COUNT(*) as count FROM services');
  const serviceCount = toInt(serviceRow?.count, 0);
  if (serviceCount === 0) {
    const now = nowIso();
    await db.run(
      'INSERT INTO services (id, name, form_type, duration_minutes, created_at) VALUES (?, ?, ?, ?, ?)',
      [newId(), 'Kosmetika', 'cosmetic', 60, now]
    );
    const items = ['Laminace', 'Prodloužení řas', 'Masáže', 'Depilace', 'EMS a lymfodrenáž', 'Líčení'];
    for (const name of items) {
      await db.run(
        'INSERT INTO services (id, name, form_type, duration_minutes, created_at) VALUES (?, ?, ?, ?, ?)',
        [newId(), name, 'generic', 60, now]
      );
    }
  }

  const treatmentRow = await db.get('SELECT COUNT(*) as count FROM treatments');
  const treatmentCount = toInt(treatmentRow?.count, 0);
  if (treatmentCount === 0) {
    const now = nowIso();
    await db.run(
      'INSERT INTO treatments (id, name, price, note, created_at) VALUES (?, ?, ?, ?, ?)',
      [newId(), 'Čištění pleti', 900, 'Základní ošetření.', now]
    );
    await db.run(
      'INSERT INTO treatments (id, name, price, note, created_at) VALUES (?, ?, ?, ?, ?)',
      [newId(), 'Hydratační rituál', 1200, 'Hydratace a masáž.', now]
    );
  }

  const addonRow = await db.get('SELECT COUNT(*) as count FROM addons');
  const addonCount = toInt(addonRow?.count, 0);
  if (addonCount === 0) {
    const now = nowIso();
    await db.run(
      'INSERT INTO addons (id, name, price, created_at) VALUES (?, ?, ?, ?)',
      [newId(), 'Ampule', 150, now]
    );
    await db.run(
      'INSERT INTO addons (id, name, price, created_at) VALUES (?, ?, ?, ?)',
      [newId(), 'Maska navíc', 200, now]
    );
  }

  const workerRow = await db.get('SELECT COUNT(*) as count FROM workers');
  const workerCount = toInt(workerRow?.count, 0);
  if (workerCount === 0) {
    const now = nowIso();
    const items = ['Majitelka', 'Uživatel', 'Recepční 1', 'Recepční 2', 'Recepční 3', 'Recepční 4', 'Recepční 5'];
    for (const name of items) {
      await db.run('INSERT INTO workers (id, name, created_at) VALUES (?, ?, ?)', [newId(), name, now]);
    }
  }
}

const requireAdmin = requireRole('admin');

async function hasUsers() {
  const row = await db.get('SELECT COUNT(*) as count FROM users WHERE active = 1');
  return toInt(row?.count, 0) > 0;
}

function userView(row) {
  return {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    role: row.role
  };
}

async function otherAdminCount(excludeId) {
  const row = await db.get(
    'SELECT COUNT(*) as count FROM users WHERE active = 1 AND role = ? AND id != ?',
    ['admin', excludeId]
  );
  return toInt(row?.count, 0);
}

async function getSettings() {
  const skinTypes = await db.all('SELECT * FROM skin_types WHERE active = 1 ORDER BY sort_order, name');
  const services = await db.all('SELECT * FROM services WHERE active = 1 ORDER BY name');
  const treatments = await db.all('SELECT * FROM treatments WHERE active = 1 ORDER BY name');
  const addons = await db.all('SELECT * FROM addons WHERE active = 1 ORDER BY name');
  const workers = await db.all('SELECT id, full_name as name FROM users WHERE active = 1 ORDER BY full_name');
  return { skinTypes, services, treatments, addons, workers };
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: usePostgres ? 'postgres' : 'sqlite' });
});

app.get('/api/bootstrap', async (req, res) => {
  res.json({ has_users: await hasUsers() });
});

app.post('/api/setup', async (req, res) => {
  if (await hasUsers()) return res.status(400).json({ error: 'Uživatel už existuje.' });

  const payload = req.body || {};
  const username = normalizeUsername(payload.username);
  const fullName = (payload.full_name || '').trim();
  const password = (payload.password || '').trim();

  if (!username || !fullName || !password) {
    return res.status(400).json({ error: 'Vyplňte jméno, uživatelské jméno a heslo.' });
  }

  const id = newId();
  const now = nowIso();
  await db.run(
    'INSERT INTO users (id, username, full_name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, username, fullName, 'admin', hashPassword(password), now]
  );
  await upsertWorker(id, fullName, 1);

  res.json({ ok: true });
});

app.post('/api/login', async (req, res) => {
  const payload = req.body || {};
  const username = normalizeUsername(payload.username);
  const password = (payload.password || '').trim();
  if (!username || !password) {
    return res.status(400).json({ error: 'Vyplňte uživatelské jméno a heslo.' });
  }

  const user = await db.get('SELECT * FROM users WHERE username = ? AND active = 1', [username]);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Neplatné přihlašovací údaje.' });
  }

  const token = await createSession(user.id);
  res.json({ token, user: userView(user) });
});

app.get('/api/pro-access', (req, res) => {
  res.json({ allowed: isProAllowed(req) });
});

app.get('/api/public/services', async (req, res) => {
  const services = await db.all(
    'SELECT id, name, duration_minutes FROM services WHERE active = 1 ORDER BY name'
  );
  res.json({ services });
});

function parseSelectedServiceIds(rawServiceIds, rawServiceId) {
  const ids = [];
  if (rawServiceIds) {
    String(rawServiceIds)
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .forEach((id) => ids.push(id));
  } else if (rawServiceId) {
    ids.push(String(rawServiceId).trim());
  }
  return Array.from(new Set(ids));
}

async function resolveSelectedServices(serviceIds) {
  if (!serviceIds.length) {
    return { error: 'Vyberte alespoň jednu službu.', status: 400 };
  }
  const placeholders = serviceIds.map(() => '?').join(', ');
  const serviceRows = await db.all(
    `SELECT id, name, duration_minutes FROM services WHERE active = 1 AND id IN (${placeholders})`,
    serviceIds
  );
  if (serviceRows.length !== serviceIds.length) {
    return { error: 'Některá služba není platná.', status: 400 };
  }
  const serviceById = new Map(serviceRows.map((row) => [row.id, row]));
  const duration = serviceIds.reduce(
    (sum, id) => sum + Math.max(30, toInt(serviceById.get(id)?.duration_minutes, 30)),
    0
  );
  return { serviceRows, serviceById, duration };
}

async function calculatePublicAvailability(date, duration) {
  const day = weekdayIndex(date);
  if (day === null) {
    return { error: 'Neplatné datum.', status: 400 };
  }

  const requiredSlots = Math.max(1, Math.ceil(duration / 30));
  const slotList = timeSlots();
  const slotIndex = Object.fromEntries(slotList.map((slot, index) => [slot, index]));

  const slots = await db.all(
    `SELECT a.time_slot, a.worker_id, u.full_name as worker_name
     FROM availability a
     JOIN users u ON u.id = a.worker_id
     WHERE u.active = 1 AND a.day_of_week = ?
     ORDER BY a.time_slot, u.full_name`,
    [day]
  );

  const reserved = await db.all(
    `SELECT r.worker_id, r.time_slot, COALESCE(r.duration_minutes, s.duration_minutes, 30) as duration_minutes,
            u.full_name as worker_name
     FROM reservations r
     LEFT JOIN services s ON s.id = r.service_id
     JOIN users u ON u.id = r.worker_id
     WHERE r.date = ?`,
    [date]
  );

  const reservationsByWorker = new Map();
  const reservedByWorker = new Map();
  const workerNameById = new Map();
  slots.forEach((slot) => {
    workerNameById.set(slot.worker_id, slot.worker_name);
  });
  reserved.forEach((row) => {
    const startIndex = slotIndex[row.time_slot];
    if (startIndex === undefined) return;
    if (row.worker_name) {
      workerNameById.set(row.worker_id, row.worker_name);
    }
    const needed = Math.max(1, Math.ceil(toInt(row.duration_minutes, 30) / 30));
    const endIndex = startIndex + needed;
    if (!reservationsByWorker.has(row.worker_id)) reservationsByWorker.set(row.worker_id, []);
    reservationsByWorker.get(row.worker_id).push({ startIndex, endIndex });
    for (let i = 0; i < needed; i += 1) {
      const slot = slotList[startIndex + i];
      if (!slot) continue;
      const key = row.worker_id;
      if (!reservedByWorker.has(key)) reservedByWorker.set(key, new Set());
      reservedByWorker.get(key).add(slot);
    }
  });

  const availableByWorker = new Map();
  slots.forEach((slot) => {
    if (!availableByWorker.has(slot.worker_id)) {
      availableByWorker.set(slot.worker_id, {
        worker_name: slot.worker_name,
        slots: new Set()
      });
    }
    availableByWorker.get(slot.worker_id).slots.add(slot.time_slot);
  });

  const baseSlots = [];
  availableByWorker.forEach((value, workerId) => {
    const reservedSlots = reservedByWorker.get(workerId) || new Set();
    value.slots.forEach((slot) => {
      baseSlots.push({
        time_slot: slot,
        worker_id: workerId,
        worker_name: value.worker_name,
        reserved: reservedSlots.has(slot)
      });
    });
  });
  const baseSlotKeys = new Set(baseSlots.map((slot) => `${slot.worker_id}:${slot.time_slot}`));
  reservedByWorker.forEach((times, workerId) => {
    const workerName = workerNameById.get(workerId) || 'Pracovník';
    times.forEach((time) => {
      const key = `${workerId}:${time}`;
      if (baseSlotKeys.has(key)) return;
      baseSlots.push({
        time_slot: time,
        worker_id: workerId,
        worker_name: workerName,
        reserved: true
      });
      baseSlotKeys.add(key);
    });
  });

  const available = [];
  const enforceNoHalfGap = duration > 30;

  const violatesGap = (workerId, startIndex, endIndex) => {
    const list = reservationsByWorker.get(workerId) || [];
    return list.some((res) => {
      if (startIndex < res.endIndex && endIndex > res.startIndex) {
        return true;
      }
      if (!enforceNoHalfGap) return false;
      if (startIndex >= res.endIndex && startIndex - res.endIndex === 1) {
        return true;
      }
      if (res.startIndex >= endIndex && res.startIndex - endIndex === 1) {
        return true;
      }
      return false;
    });
  };

  availableByWorker.forEach((value, workerId) => {
    const reservedSlots = reservedByWorker.get(workerId) || new Set();
    slotList.forEach((slot) => {
      const startIndex = slotIndex[slot];
      if (startIndex === undefined) return;
      let ok = true;
      for (let i = 0; i < requiredSlots; i += 1) {
        const checkSlot = slotList[startIndex + i];
        if (!checkSlot) {
          ok = false;
          break;
        }
        if (!value.slots.has(checkSlot) || reservedSlots.has(checkSlot)) {
          ok = false;
          break;
        }
      }
      if (ok && violatesGap(workerId, startIndex, startIndex + requiredSlots)) {
        ok = false;
      }
      if (ok) {
        available.push({
          time_slot: slot,
          worker_id: workerId,
          worker_name: value.worker_name
        });
      }
    });
  });

  const blockedStarts = [];
  if (enforceNoHalfGap) {
    baseSlots.forEach((slot) => {
      if (slot.reserved) return;
      const startIndex = slotIndex[slot.time_slot];
      if (startIndex === undefined) return;
      if (violatesGap(slot.worker_id, startIndex, startIndex + requiredSlots)) {
        blockedStarts.push({ worker_id: slot.worker_id, time_slot: slot.time_slot });
      }
    });
  }

  available.sort((a, b) => {
    if (a.time_slot === b.time_slot) {
      return a.worker_name.localeCompare(b.worker_name, 'cs');
    }
    return a.time_slot.localeCompare(b.time_slot);
  });

  baseSlots.sort((a, b) => {
    if (a.time_slot === b.time_slot) {
      return a.worker_name.localeCompare(b.worker_name, 'cs');
    }
    return a.time_slot.localeCompare(b.time_slot);
  });

  return { slots: available, base_slots: baseSlots, blocked_starts: blockedStarts };
}

app.get('/api/public/availability', async (req, res) => {
  const date = toDateOnly(req.query.date);
  const serviceIds = parseSelectedServiceIds(req.query.service_ids, req.query.service_id);
  const selected = await resolveSelectedServices(serviceIds);
  if (selected.error) {
    return res.status(selected.status || 400).json({ error: selected.error });
  }
  const availability = await calculatePublicAvailability(date, selected.duration);
  if (availability.error) {
    return res.status(availability.status || 400).json({ error: availability.error });
  }
  res.json({ ...availability, duration: selected.duration });
});

app.get('/api/public/availability-days', async (req, res) => {
  const year = toInt(req.query.year, new Date().getFullYear());
  const month = toInt(req.query.month, new Date().getMonth() + 1);
  if (month < 1 || month > 12) {
    return res.status(400).json({ error: 'Neplatný měsíc.' });
  }
  const serviceIds = parseSelectedServiceIds(req.query.service_ids, req.query.service_id);
  const selected = await resolveSelectedServices(serviceIds);
  if (selected.error) {
    return res.status(selected.status || 400).json({ error: selected.error });
  }

  const lastDay = new Date(year, month, 0).getDate();
  const days = [];
  for (let day = 1; day <= lastDay; day += 1) {
    const date = `${year}-${pad2(month)}-${pad2(day)}`;
    const availability = await calculatePublicAvailability(date, selected.duration);
    if (!availability.error && availability.slots.length > 0) {
      days.push(day);
    }
  }
  res.json({ year, month, days });
});

app.post('/api/public/reservations', async (req, res) => {
  const payload = req.body || {};
  const serviceIds = Array.isArray(payload.service_ids)
    ? payload.service_ids.map((id) => String(id).trim()).filter(Boolean)
    : payload.service_id
      ? [String(payload.service_id).trim()]
      : [];
  const uniqueServiceIds = Array.from(new Set(serviceIds));
  const workerId = payload.worker_id;
  const date = toDateOnly(payload.date);
  const timeSlot = (payload.time || '').trim();
  const clientName = (payload.client_name || '').trim();
  const phone = (payload.phone || '').trim();
  const email = (payload.email || '').trim();
  const note = (payload.note || '').trim();

  if (!uniqueServiceIds.length || !workerId || !date || !timeSlot || !clientName) {
    return res.status(400).json({ error: 'Vyplňte služby, termín a jméno.' });
  }

  const selected = await resolveSelectedServices(uniqueServiceIds);
  if (selected.error) {
    return res.status(selected.status || 400).json({ error: selected.error });
  }
  const { serviceById, duration } = selected;
  const serviceNames = uniqueServiceIds.map((id) => serviceById.get(id)?.name).filter(Boolean);
  const primaryServiceId = uniqueServiceIds[0];
  const requiredSlots = Math.max(1, Math.ceil(duration / 30));
  const slotList = timeSlots();
  const slotIndex = Object.fromEntries(slotList.map((slot, index) => [slot, index]));
  const startIndex = slotIndex[timeSlot];
  if (startIndex === undefined) {
    return res.status(400).json({ error: 'Termín není platný.' });
  }

  const worker = await db.get('SELECT id FROM users WHERE id = ? AND active = 1', [workerId]);
  if (!worker) return res.status(400).json({ error: 'Pracovník není platný.' });

  const day = weekdayIndex(date);
  if (day === null) return res.status(400).json({ error: 'Neplatné datum.' });

  const availabilityRows = await db.all(
    'SELECT time_slot FROM availability WHERE worker_id = ? AND day_of_week = ?',
    [workerId, day]
  );
  const availabilitySet = new Set(availabilityRows.map((row) => row.time_slot));

  const existingReservations = await db.all(
    `SELECT r.time_slot, COALESCE(r.duration_minutes, s.duration_minutes, 30) as duration_minutes
     FROM reservations r
     LEFT JOIN services s ON s.id = r.service_id
     WHERE r.worker_id = ? AND r.date = ?`,
    [workerId, date]
  );
  const reservedSlots = new Set();
  existingReservations.forEach((row) => {
    const idx = slotIndex[row.time_slot];
    if (idx === undefined) return;
    const needed = Math.max(1, Math.ceil(toInt(row.duration_minutes, 30) / 30));
    const endIndex = idx + needed;
    for (let i = 0; i < needed; i += 1) {
      const slot = slotList[idx + i];
      if (slot) reservedSlots.add(slot);
    }
    row._startIndex = idx;
    row._endIndex = endIndex;
  });

  if (duration > 30) {
    const endIndex = startIndex + requiredSlots;
    const violatesGap = existingReservations.some((row) => {
      if (startIndex < row._endIndex && endIndex > row._startIndex) {
        return true;
      }
      if (startIndex >= row._endIndex && startIndex - row._endIndex === 1) {
        return true;
      }
      if (row._startIndex >= endIndex && row._startIndex - endIndex === 1) {
        return true;
      }
      return false;
    });
    if (violatesGap) {
      return res.status(409).json({ error: 'Termín není dostupný.' });
    }
  }

  for (let i = 0; i < requiredSlots; i += 1) {
    const slot = slotList[startIndex + i];
    if (!slot || !availabilitySet.has(slot) || reservedSlots.has(slot)) {
      return res.status(409).json({ error: 'Termín není dostupný.' });
    }
  }

  const finalNote =
    serviceNames.length > 1
      ? `[Služby: ${serviceNames.join(', ')}]${note ? ` ${note}` : ''}`
      : note || null;

  await db.run(
    `INSERT INTO reservations (id, date, time_slot, service_id, worker_id, duration_minutes, client_name, phone, email, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      date,
      timeSlot,
      primaryServiceId,
      workerId,
      duration,
      clientName,
      phone || null,
      email || null,
      finalNote,
      nowIso()
    ]
  );

  res.json({ ok: true });
});

app.use('/api', requireAuth);

app.post('/api/logout', async (req, res) => {
  if (req.token) {
    await db.run('DELETE FROM sessions WHERE token = ?', [req.token]);
  }
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/settings', async (req, res) => {
  res.json(await getSettings());
});

app.get('/api/availability', requireProAccess, async (req, res) => {
  if (req.user.role === 'reception') {
    return res.status(403).json({ error: 'Nemáte oprávnění.' });
  }

  const rows = await db.all(
    'SELECT day_of_week, time_slot FROM availability WHERE worker_id = ?',
    [req.user.id]
  );
  const days = Array.from(new Set(rows.map((row) => row.day_of_week))).sort();
  const times = Array.from(new Set(rows.map((row) => row.time_slot))).sort();
  res.json({ days, times });
});

app.post('/api/availability', requireProAccess, async (req, res) => {
  if (req.user.role === 'reception') {
    return res.status(403).json({ error: 'Nemáte oprávnění.' });
  }

  const payload = req.body || {};
  const rawDays = Array.isArray(payload.days) ? payload.days : [];
  const rawTimes = Array.isArray(payload.times) ? payload.times : [];
  const days = Array.from(new Set(rawDays.map((day) => toInt(day, -1)).filter((day) => day >= 0 && day <= 6)));
  const times = Array.from(new Set(rawTimes.map((time) => String(time)).filter((time) => time)));

  await db.run('DELETE FROM availability WHERE worker_id = ?', [req.user.id]);

  const now = nowIso();
  for (const day of days) {
    for (const time of times) {
      await db.run(
        'INSERT INTO availability (id, worker_id, day_of_week, time_slot, created_at) VALUES (?, ?, ?, ?, ?)',
        [newId(), req.user.id, day, time, now]
      );
    }
  }

  res.json({ ok: true });
});

app.get('/api/reservations/calendar', requireProAccess, async (req, res) => {
  const year = toInt(req.query.year, new Date().getFullYear());
  const month = toInt(req.query.month, new Date().getMonth() + 1);
  if (month < 1 || month > 12) {
    return res.status(400).json({ error: 'Neplatný měsíc.' });
  }

  const lastDay = new Date(year, month, 0).getDate();
  const start = `${year}-${pad2(month)}-01`;
  const end = `${year}-${pad2(month)}-${pad2(lastDay)}`;

  const rows = await db.all(
    'SELECT date FROM reservations WHERE date BETWEEN ? AND ? GROUP BY date',
    [start, end]
  );
  let days = rows.map((row) => row.date);

  if (!days.length && month === 2) {
    days = [2, 5, 8, 12, 14, 18, 21, 26].map((day) => `${year}-${pad2(month)}-${pad2(day)}`);
  }

  res.json({ days });
});

app.get('/api/reservations', requireProAccess, async (req, res) => {
  const year = toInt(req.query.year, new Date().getFullYear());
  const month = toInt(req.query.month, new Date().getMonth() + 1);
  const lastDay = new Date(year, month, 0).getDate();
  const from = `${year}-${pad2(month)}-01`;
  const to = `${year}-${pad2(month)}-${pad2(lastDay)}`;

  const where = ['r.date BETWEEN ? AND ?'];
  const params = [from, to];
  if (req.user.role === 'worker') {
    where.push('r.worker_id = ?');
    params.push(req.user.id);
  }

  const rows = await db.all(
    `SELECT r.date, r.time_slot, r.client_name, r.phone, r.email, r.note,
            s.name as service_name, u.full_name as worker_name
     FROM reservations r
     LEFT JOIN services s ON s.id = r.service_id
     LEFT JOIN users u ON u.id = r.worker_id
     WHERE ${where.join(' AND ')}
     ORDER BY r.date, r.time_slot`,
    params
  );

  res.json({ reservations: rows });
});

app.post('/api/services', requireAdmin, async (req, res) => {
  const payload = req.body || {};
  const name = (payload.name || '').trim();
  const formType = payload.form_type === 'cosmetic' ? 'cosmetic' : 'generic';
  const duration = toInt(payload.duration_minutes, 30);
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (duration < 30 || duration % 30 !== 0) {
    return res.status(400).json({ error: 'duration must be in 30 minute steps' });
  }

  const id = newId();
  await db.run(
    'INSERT INTO services (id, name, form_type, duration_minutes, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, name, formType, duration, nowIso()]
  );
  res.json({ id });
});

app.put('/api/services/:id', requireAdmin, async (req, res) => {
  const payload = req.body || {};
  const name = (payload.name || '').trim();
  const formType = payload.form_type === 'cosmetic' ? 'cosmetic' : 'generic';
  const duration = toInt(payload.duration_minutes, 30);
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (duration < 30 || duration % 30 !== 0) {
    return res.status(400).json({ error: 'duration must be in 30 minute steps' });
  }

  await db.run('UPDATE services SET name = ?, form_type = ?, duration_minutes = ? WHERE id = ?', [
    name,
    formType,
    duration,
    req.params.id
  ]);
  res.json({ ok: true });
});

app.delete('/api/services/:id', requireAdmin, async (req, res) => {
  await db.run('UPDATE services SET active = 0 WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/users', requireAdmin, async (req, res) => {
  const users = await db.all(
    'SELECT id, username, full_name, role, active FROM users WHERE active = 1 ORDER BY full_name'
  );
  res.json(users);
});

app.post('/api/users', requireAdmin, async (req, res) => {
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
    await db.run(
      'INSERT INTO users (id, username, full_name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, username, fullName, role, hashPassword(password), now]
    );
  } catch (err) {
    return res.status(400).json({ error: 'Uživatelské jméno už existuje.' });
  }
  await upsertWorker(id, fullName, 1);

  res.json({ id });
});

app.put('/api/users/:id', requireAdmin, async (req, res) => {
  const payload = req.body || {};
  const existing = await db.get('SELECT * FROM users WHERE id = ? AND active = 1', [req.params.id]);
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

  if (existing.role === 'admin' && role !== 'admin' && (await otherAdminCount(existing.id)) === 0) {
    return res.status(400).json({ error: 'Musí zůstat alespoň jeden administrátor.' });
  }

  const passwordHash = password ? hashPassword(password) : existing.password_hash;

  try {
    await db.run(
      'UPDATE users SET username = ?, full_name = ?, role = ?, password_hash = ? WHERE id = ?',
      [username, fullName, role, passwordHash, existing.id]
    );
  } catch (err) {
    return res.status(400).json({ error: 'Uživatelské jméno už existuje.' });
  }
  await upsertWorker(existing.id, fullName, 1);

  res.json({ ok: true });
});

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
  const existing = await db.get('SELECT * FROM users WHERE id = ? AND active = 1', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Uživatel nenalezen.' });

  if (existing.role === 'admin' && (await otherAdminCount(existing.id)) === 0) {
    return res.status(400).json({ error: 'Musí zůstat alespoň jeden administrátor.' });
  }

  await db.run('UPDATE users SET active = 0 WHERE id = ?', [existing.id]);
  await db.run('DELETE FROM sessions WHERE user_id = ?', [existing.id]);
  await upsertWorker(existing.id, existing.full_name, 0);
  res.json({ ok: true });
});

app.get('/api/clients', async (req, res) => {
  const search = (req.query.search || '').toString().trim();
  let rows;
  if (search) {
    const like = `%${search}%`;
    rows = await db.all(
      `SELECT * FROM clients
       WHERE full_name LIKE ? OR phone LIKE ? OR email LIKE ?
       ORDER BY full_name`
      ,
      [like, like, like]
    );
  } else {
    rows = await db.all('SELECT * FROM clients ORDER BY full_name');
  }
  res.json(rows);
});

app.get('/api/clients/:id', async (req, res) => {
  const client = await db.get('SELECT * FROM clients WHERE id = ?', [req.params.id]);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(client);
});

app.post('/api/clients', async (req, res) => {
  const payload = req.body || {};
  const fullName = (payload.full_name || '').trim();
  if (!fullName) return res.status(400).json({ error: 'full_name is required' });

  const id = newId();
  const now = nowIso();
  await db.run(
    `INSERT INTO clients (id, full_name, phone, email, skin_type_id, skin_notes, cream, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ,
    [
      id,
      fullName,
      payload.phone || null,
      payload.email || null,
      payload.skin_type_id || null,
      payload.skin_notes || null,
      payload.cream || null,
      now,
      now
    ]
  );

  res.json({ id });
});

app.put('/api/clients/:id', async (req, res) => {
  const payload = req.body || {};
  const fullName = (payload.full_name || '').trim();
  if (!fullName) return res.status(400).json({ error: 'full_name is required' });

  const exists = await db.get('SELECT id FROM clients WHERE id = ?', [req.params.id]);
  if (!exists) return res.status(404).json({ error: 'Client not found' });

  await db.run(
    `UPDATE clients SET
      full_name = ?,
      phone = ?,
      email = ?,
      skin_type_id = ?,
      skin_notes = ?,
      cream = ?,
      updated_at = ?
     WHERE id = ?`
    ,
    [
      fullName,
      payload.phone || null,
      payload.email || null,
      payload.skin_type_id || null,
      payload.skin_notes || null,
      payload.cream || null,
      nowIso(),
      req.params.id
    ]
  );

  res.json({ ok: true });
});

app.delete('/api/clients/:id', async (req, res) => {
  const info = await db.run('DELETE FROM clients WHERE id = ?', [req.params.id]);
  res.json({ ok: info.changes > 0 });
});

app.get('/api/clients/:id/visits', async (req, res) => {
  const rows = await db.all(
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
    ,
    [req.params.id]
  );
  res.json(rows);
});

app.post('/api/clients/:id/visits', async (req, res) => {
  const payload = req.body || {};
  const clientId = req.params.id;

  const client = await db.get('SELECT id FROM clients WHERE id = ?', [clientId]);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const service = payload.service_id
    ? await db.get('SELECT id, name, form_type FROM services WHERE id = ? AND active = 1', [payload.service_id])
    : null;
  if (!service) return res.status(400).json({ error: 'Service is required' });

  const workerId = payload.worker_id || null;
  if (!workerId) return res.status(400).json({ error: 'worker_id is required' });
  const worker = await db.get('SELECT id, full_name FROM users WHERE id = ? AND active = 1', [workerId]);
  if (!worker) return res.status(400).json({ error: 'worker_id is invalid' });
  await upsertWorker(worker.id, worker.full_name, 1);

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
      ? await db.get('SELECT id, name, price FROM treatments WHERE id = ?', [payload.treatment_id])
      : null;

    const addons = Array.isArray(payload.addons) ? payload.addons : [];
    addonRows = addons.length
      ? await db.all(
        `SELECT id, name, price FROM addons WHERE id IN (${addons.map(() => '?').join(',')})`,
        addons
      )
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
  await db.run(
    `INSERT INTO visits (
      id, client_id, date, service_id, treatment_id, treatment_price,
      addons_json, addons_total, manual_total, total, service_data, note,
      worker_id, payment_method, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ,
    [
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
    ]
  );

  res.json({ id });
});

app.delete('/api/visits/:id', async (req, res) => {
  const info = await db.run('DELETE FROM visits WHERE id = ?', [req.params.id]);
  res.json({ ok: info.changes > 0 });
});

app.post('/api/expenses', requireEconomyAccess, async (req, res) => {
  const payload = req.body || {};
  const title = (payload.title || '').trim();
  if (!title) return res.status(400).json({ error: 'title is required' });

  const amount = Math.abs(toInt(payload.amount, 0));
  if (!amount) return res.status(400).json({ error: 'amount is required' });

  const vatRate = Math.max(0, toInt(payload.vat_rate, 0));
  const workerId = req.user.id;
  const worker = await db.get('SELECT id, full_name FROM users WHERE id = ? AND active = 1', [workerId]);
  if (!worker) return res.status(400).json({ error: 'worker_id is invalid' });
  await upsertWorker(worker.id, worker.full_name, 1);

  const id = newId();
  await db.run(
    `INSERT INTO expenses (id, date, title, amount, vat_rate, note, worker_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ,
    [id, toDateOnly(payload.date), title, amount, vatRate, payload.note || null, workerId, nowIso()]
  );

  res.json({ id });
});

app.get('/api/expenses', requireEconomyAccess, async (req, res) => {
  const from = toDateOnly(req.query.from || null);
  const to = toDateOnly(req.query.to || null);
  const workerFilter = req.user.id;
  const where = ['e.date BETWEEN ? AND ?'];
  const params = [from, to];
  where.push('e.worker_id = ?');
  params.push(workerFilter);
  const rows = await db.all(
    `SELECT e.*, COALESCE(u.full_name, w.name) as worker_name
     FROM expenses e
     LEFT JOIN users u ON e.worker_id = u.id
     LEFT JOIN workers w ON e.worker_id = w.id
     WHERE ${where.join(' AND ')}
     ORDER BY e.date DESC, e.created_at DESC`
    ,
    params
  );
  res.json(rows);
});

app.delete('/api/expenses/:id', requireEconomyAccess, async (req, res) => {
  if (req.user.role === 'admin') {
    const info = await db.run('DELETE FROM expenses WHERE id = ?', [req.params.id]);
    return res.json({ ok: info.changes > 0 });
  }

  const exists = await db.get('SELECT id, worker_id FROM expenses WHERE id = ?', [req.params.id]);
  if (!exists) return res.json({ ok: false });
  if (exists.worker_id !== req.user.id) {
    return res.status(403).json({ error: 'Nemáte oprávnění.' });
  }
  const info = await db.run('DELETE FROM expenses WHERE id = ?', [req.params.id]);
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

function lastSixMonthsFrom(toDateStr) {
  const end = new Date(`${toDateStr}T00:00:00`);
  if (Number.isNaN(end.getTime())) return [];
  const anchor = new Date(end.getFullYear(), end.getMonth(), 1);
  const items = [];
  for (let i = 5; i >= 0; i -= 1) {
    const monthDate = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth() + 1;
    const from = `${year}-${pad2(month)}-01`;
    const to = toLocalDateString(new Date(year, month, 0));
    items.push({
      key: `${year}-${pad2(month)}`,
      label: `${pad2(month)}/${year}`,
      from,
      to
    });
  }
  return items;
}

app.get('/api/economy', requireEconomyAccess, requireProAccess, async (req, res) => {
  const range = economyRange(req);
  const role = req.user.role;
  const serviceFilter = req.query.service_id || null;
  const workerFilter = role === 'worker' ? req.user.id : (req.query.worker_id || null);
  const myWorkerId = req.user.id;

  const myVisitsWhere = ['v.date BETWEEN ? AND ?', 'v.worker_id = ?'];
  const myVisitsParams = [range.from, range.to, myWorkerId];
  if (serviceFilter) {
    myVisitsWhere.push('v.service_id = ?');
    myVisitsParams.push(serviceFilter);
  }
  const myVisits = await db.all(
    `SELECT v.total
     FROM visits v
     WHERE ${myVisitsWhere.join(' AND ')}`,
    myVisitsParams
  );

  const myExpensesWhere = ['e.date BETWEEN ? AND ?', 'e.worker_id = ?'];
  const myExpensesParams = [range.from, range.to, myWorkerId];
  const myExpenses = await db.all(
    `SELECT e.amount
     FROM expenses e
     WHERE ${myExpensesWhere.join(' AND ')}`,
    myExpensesParams
  );

  const incomeTotal = myVisits.reduce((sum, row) => sum + toInt(row.total, 0), 0);
  const expenseTotal = myExpenses.reduce((sum, row) => sum + toInt(row.amount, 0), 0);

  const visitsWhere = ['v.date BETWEEN ? AND ?'];
  const visitsParams = [range.from, range.to];
  if (workerFilter) {
    visitsWhere.push('v.worker_id = ?');
    visitsParams.push(workerFilter);
  }
  if (serviceFilter) {
    visitsWhere.push('v.service_id = ?');
    visitsParams.push(serviceFilter);
  }

  const visits = await db.all(
    `SELECT v.*, c.full_name as client_name, t.name as treatment_name,
            COALESCE(u.full_name, w.name) as worker_name,
            s.name as service_name
     FROM visits v
     LEFT JOIN clients c ON v.client_id = c.id
     LEFT JOIN services s ON v.service_id = s.id
     LEFT JOIN treatments t ON v.treatment_id = t.id
     LEFT JOIN users u ON v.worker_id = u.id
     LEFT JOIN workers w ON v.worker_id = w.id
     WHERE ${visitsWhere.join(' AND ')}
     ORDER BY v.date DESC, v.created_at DESC`
    ,
    visitsParams
  );

  const expenses = await db.all(
    `SELECT e.*, COALESCE(u.full_name, w.name) as worker_name
     FROM expenses e
     LEFT JOIN users u ON e.worker_id = u.id
     LEFT JOIN workers w ON e.worker_id = w.id
     WHERE e.date BETWEEN ? AND ? AND e.worker_id = ?
     ORDER BY e.date DESC, e.created_at DESC`
    ,
    [range.from, range.to, myWorkerId]
  );

  let byWorker = [];
  if (role === 'admin') {
    const byWorkerWhere = ['v.date BETWEEN ? AND ?'];
    const byWorkerParams = [range.from, range.to];
    if (serviceFilter) {
      byWorkerWhere.push('v.service_id = ?');
      byWorkerParams.push(serviceFilter);
    }
    if (workerFilter) {
      byWorkerWhere.push('v.worker_id = ?');
      byWorkerParams.push(workerFilter);
    }
    byWorker = await db.all(
      `SELECT COALESCE(u.id, w.id) as worker_id,
              COALESCE(u.full_name, w.name) as worker_name,
              SUM(v.total) as total
       FROM visits v
       LEFT JOIN users u ON v.worker_id = u.id
       LEFT JOIN workers w ON v.worker_id = w.id
       WHERE ${byWorkerWhere.join(' AND ')}
       GROUP BY COALESCE(u.id, w.id), COALESCE(u.full_name, w.name)
       ORDER BY total DESC`
      ,
      byWorkerParams
    );
  }

  let totalsAllIncome = null;
  if (role === 'admin') {
    const allWhere = ['date BETWEEN ? AND ?'];
    const allParams = [range.from, range.to];
    if (serviceFilter) {
      allWhere.push('service_id = ?');
      allParams.push(serviceFilter);
    }
    const visitsAll = await db.all(
      `SELECT total FROM visits WHERE ${allWhere.join(' AND ')}`,
      allParams
    );
    totalsAllIncome = visitsAll.reduce((sum, row) => sum + toInt(row.total, 0), 0);
  }

  const monthlyIncomeLast6 = [];
  const monthWindows = lastSixMonthsFrom(range.to);
  for (const monthItem of monthWindows) {
    const monthWhere = ['date BETWEEN ? AND ?'];
    const monthParams = [monthItem.from, monthItem.to];
    if (workerFilter) {
      monthWhere.push('worker_id = ?');
      monthParams.push(workerFilter);
    }
    if (serviceFilter) {
      monthWhere.push('service_id = ?');
      monthParams.push(serviceFilter);
    }
    const monthRows = await db.all(
      `SELECT total FROM visits WHERE ${monthWhere.join(' AND ')}`,
      monthParams
    );
    monthlyIncomeLast6.push({
      key: monthItem.key,
      label: monthItem.label,
      total: monthRows.reduce((sum, row) => sum + toInt(row.total, 0), 0)
    });
  }

  res.json({
    range,
    totals: {
      income: incomeTotal,
      expenses: expenseTotal,
      profit: incomeTotal - expenseTotal
    },
    monthly_income_last6: monthlyIncomeLast6,
    totals_all_income: totalsAllIncome,
    visits,
    expenses,
    by_worker: byWorker
  });
});

app.get('/api/summary', async (req, res) => {
  const clientsRow = await db.get('SELECT COUNT(*) as count FROM clients');
  const visitsRow = await db.get('SELECT COUNT(*) as count FROM visits');
  const expensesRow = await db.get('SELECT COUNT(*) as count FROM expenses');
  const clientsCount = toInt(clientsRow?.count, 0);
  const visitsCount = toInt(visitsRow?.count, 0);
  const expensesCount = toInt(expensesRow?.count, 0);

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

  const visitsAll = await db.all('SELECT total FROM visits');
  const expensesAll = await db.all('SELECT amount FROM expenses');

  const totalIncome = visitsAll.reduce((sum, row) => sum + toInt(row.total, 0), 0);
  const totalExpenses = expensesAll.reduce((sum, row) => sum + toInt(row.amount, 0), 0);

  const visitsMonth = await db.all('SELECT total FROM visits WHERE date BETWEEN ? AND ?', [range.from, range.to]);
  const expensesMonth = await db.all('SELECT amount FROM expenses WHERE date BETWEEN ? AND ?', [range.from, range.to]);

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

app.get('/api/backup', requireAdmin, async (req, res) => {
  const data = {
    skin_types: await db.all('SELECT * FROM skin_types'),
    services: await db.all('SELECT * FROM services'),
    treatments: await db.all('SELECT * FROM treatments'),
    addons: await db.all('SELECT * FROM addons'),
    workers: await db.all('SELECT * FROM workers'),
    users: await db.all('SELECT * FROM users'),
    availability: await db.all('SELECT * FROM availability'),
    clients: await db.all('SELECT * FROM clients'),
    visits: await db.all('SELECT * FROM visits'),
    expenses: await db.all('SELECT * FROM expenses'),
    reservations: await db.all('SELECT * FROM reservations')
  };

  res.json({
    exported_at: nowIso(),
    data
  });
});

app.post('/api/restore', requireAdmin, async (req, res) => {
  const payload = req.body || {};
  if (!payload.data) return res.status(400).json({ error: 'Missing data' });

  const { data } = payload;
  const deleteOrder = [
    'reservations',
    'availability',
    'visits',
    'clients',
    'users',
    'workers',
    'addons',
    'treatments',
    'services',
    'skin_types',
    'expenses'
  ];
  const insertOrder = [
    'skin_types',
    'services',
    'treatments',
    'addons',
    'workers',
    'users',
    'availability',
    'clients',
    'visits',
    'expenses',
    'reservations'
  ];

  const insertMany = async (table, rows) => {
    if (!Array.isArray(rows) || rows.length === 0) return;
    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => '?').join(',');
    for (const row of rows) {
      const values = columns.map((col) => row[col]);
      await db.run(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`, values);
    }
  };

  try {
    await db.exec('BEGIN');
    for (const table of deleteOrder) {
      await db.run(`DELETE FROM ${table}`);
    }
    await db.run('DELETE FROM sessions');
    for (const table of insertOrder) {
      await insertMany(table, data[table] || []);
    }
    await db.exec('COMMIT');
    await syncWorkersWithUsers();
    res.json({ ok: true });
  } catch (err) {
    await db.exec('ROLLBACK');
    res.status(500).json({ error: 'Restore failed', detail: err.message });
  }
});

function createSimpleSettingRoutes(resource, table) {
  app.post(`/api/${resource}`, requireAdmin, async (req, res) => {
    const payload = req.body || {};
    const name = (payload.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });

    const id = newId();
    const now = nowIso();
    const price = toInt(payload.price, 0);
    const note = payload.note || null;

    if (table === 'treatments') {
      await db.run('INSERT INTO treatments (id, name, price, note, created_at) VALUES (?, ?, ?, ?, ?)', [
        id,
        name,
        price,
        note,
        now
      ]);
    } else if (table === 'addons') {
      await db.run('INSERT INTO addons (id, name, price, created_at) VALUES (?, ?, ?, ?)', [
        id,
        name,
        price,
        now
      ]);
    } else {
      await db.run(`INSERT INTO ${table} (id, name, created_at) VALUES (?, ?, ?)`, [id, name, now]);
    }

    res.json({ id });
  });

  app.put(`/api/${resource}/:id`, requireAdmin, async (req, res) => {
    const payload = req.body || {};
    const name = (payload.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });

    const price = toInt(payload.price, 0);
    const note = payload.note || null;

    if (table === 'treatments') {
      await db.run('UPDATE treatments SET name = ?, price = ?, note = ? WHERE id = ?', [
        name,
        price,
        note,
        req.params.id
      ]);
    } else if (table === 'addons') {
      await db.run('UPDATE addons SET name = ?, price = ? WHERE id = ?', [name, price, req.params.id]);
    } else {
      await db.run(`UPDATE ${table} SET name = ? WHERE id = ?`, [name, req.params.id]);
    }

    res.json({ ok: true });
  });

  app.delete(`/api/${resource}/:id`, requireAdmin, async (req, res) => {
    await db.run(`UPDATE ${table} SET active = 0 WHERE id = ?`, [req.params.id]);
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

async function startServer() {
  await initDb();
  await seedDefaults();
  await syncWorkersWithUsers();
  app.listen(PORT, () => {
    console.log(`Kartoteka running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
