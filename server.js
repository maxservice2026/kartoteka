const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 8788;
const SESSION_DAYS = 30;
const DEFAULT_TENANT_SLUG = normalizeSlug(process.env.DEFAULT_TENANT_SLUG || 'default') || 'default';
const DEFAULT_TENANT_NAME = (process.env.DEFAULT_TENANT_NAME || 'softmax.cz').toString().trim();
const DEFAULT_TENANT_PLAN = (process.env.DEFAULT_TENANT_PLAN || 'enterprise').toString().trim().toLowerCase();
const FEATURE_DEFINITIONS = [
  { key: 'economy', label: 'Ekonomika', defaults: { basic: false, pro: true, enterprise: true } },
  { key: 'calendar', label: 'Kalendář', defaults: { basic: false, pro: true, enterprise: true } },
  { key: 'billing', label: 'Fakturace', defaults: { basic: false, pro: true, enterprise: true } },
  { key: 'notifications', label: 'Notifikace', defaults: { basic: false, pro: true, enterprise: true } }
];
const FEATURE_KEY_SET = new Set(FEATURE_DEFINITIONS.map((feature) => feature.key));

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
let defaultTenantId = null;

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

app.use(['/api', '/rezervace'], async (req, res, next) => {
  try {
    const tenant = await resolveTenantForRequest(req);
    if (!tenant) {
      return res.status(500).json({ error: 'Tenant nenalezen.' });
    }
    req.tenant = tenant;
    return next();
  } catch (err) {
    return next(err);
  }
});

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

function normalizeSlug(value) {
  return (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeHost(rawHost) {
  const host = (rawHost || '').toString().trim().toLowerCase();
  if (!host) return '';
  return host.split(':')[0];
}

const SERVICE_SCHEMA_VERSION = 1;
const SERVICE_FIELD_TYPES = new Set(['text', 'textarea', 'number', 'checkbox', 'select', 'multiselect', 'heading']);
const MAX_SERVICE_SCHEMA_FIELDS = 40;
const MAX_SERVICE_SCHEMA_OPTIONS = 80;

function normalizeServiceSchema(rawSchema) {
  if (rawSchema === null) return null;
  if (!rawSchema || typeof rawSchema !== 'object') return null;

  const rawFields = Array.isArray(rawSchema.fields) ? rawSchema.fields : [];
  const fields = [];

  for (const rawField of rawFields.slice(0, MAX_SERVICE_SCHEMA_FIELDS)) {
    if (!rawField || typeof rawField !== 'object') continue;
    const id = (rawField.id || '').toString().trim();
    const type = (rawField.type || '').toString().trim();
    const label = (rawField.label || '').toString().trim();
    if (!id || !label || !SERVICE_FIELD_TYPES.has(type)) continue;

    const required = rawField.required === true || rawField.required === 1 || rawField.required === '1';
    const field = { id, type, label, required };

    if (type === 'checkbox') {
      field.price_delta = toInt(rawField.price_delta, 0);
    }

    if (type === 'select' || type === 'multiselect') {
      const rawOptions = Array.isArray(rawField.options) ? rawField.options : [];
      const options = [];
      for (const rawOption of rawOptions.slice(0, MAX_SERVICE_SCHEMA_OPTIONS)) {
        if (!rawOption || typeof rawOption !== 'object') continue;
        const optionId = (rawOption.id || '').toString().trim();
        const optionLabel = (rawOption.label || '').toString().trim();
        if (!optionId || !optionLabel) continue;
        options.push({ id: optionId, label: optionLabel, price_delta: toInt(rawOption.price_delta, 0) });
      }
      field.options = options;
    }

    fields.push(field);
  }

  return { version: SERVICE_SCHEMA_VERSION, fields };
}

function parseServiceSchemaJson(schemaJson) {
  const raw = (schemaJson || '').toString().trim();
  if (!raw) return null;
  try {
    return normalizeServiceSchema(JSON.parse(raw));
  } catch (err) {
    return null;
  }
}

function truthyValue(value) {
  if (value === true) return true;
  if (value === 1) return true;
  if (value === '1') return true;
  const normalized = (value || '').toString().trim().toLowerCase();
  return normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function sanitizeServiceDataBySchema(schema, rawData) {
  const result = { data: null, extras_total: 0 };
  if (!schema || !Array.isArray(schema.fields) || !schema.fields.length) return result;

  const input = rawData && typeof rawData === 'object' ? rawData : {};
  const data = {};
  let extrasTotal = 0;

  for (const field of schema.fields) {
    const rawValue = input[field.id];

    if (field.type === 'heading') continue;

    if (field.type === 'text' || field.type === 'textarea') {
      const value = (rawValue || '').toString().trim();
      if (value) {
        data[field.id] = value.slice(0, 2000);
      }
      continue;
    }

    if (field.type === 'number') {
      const n = Number(rawValue);
      if (Number.isFinite(n)) {
        data[field.id] = n;
      }
      continue;
    }

    if (field.type === 'checkbox') {
      const checked = truthyValue(rawValue);
      data[field.id] = checked;
      if (checked) {
        extrasTotal += toInt(field.price_delta, 0);
      }
      continue;
    }

    if (field.type === 'select') {
      const selected = (rawValue || '').toString().trim();
      const option = (field.options || []).find((item) => item.id === selected);
      if (option) {
        data[field.id] = option.id;
        extrasTotal += toInt(option.price_delta, 0);
      }
      continue;
    }

    if (field.type === 'multiselect') {
      const values = Array.isArray(rawValue) ? rawValue : rawValue ? [rawValue] : [];
      const selectedIds = values.map((item) => (item || '').toString().trim()).filter(Boolean);
      const allowed = new Set((field.options || []).map((opt) => opt.id));
      const filtered = Array.from(new Set(selectedIds.filter((id) => allowed.has(id))));
      if (filtered.length) {
        data[field.id] = filtered;
        const optionMap = new Map((field.options || []).map((opt) => [opt.id, opt]));
        for (const id of filtered) {
          const opt = optionMap.get(id);
          if (opt) extrasTotal += toInt(opt.price_delta, 0);
        }
      } else {
        data[field.id] = [];
      }
      continue;
    }
  }

  result.data = data;
  result.extras_total = extrasTotal;
  return result;
}

async function findTenantBySlug(slug) {
  const normalized = normalizeSlug(slug);
  if (!normalized) return null;
  return db.get(
    'SELECT id, name, slug, domain, logo_data FROM tenants WHERE active = 1 AND slug = ?',
    [normalized]
  );
}

async function findTenantByDomain(domain) {
  const normalized = normalizeHost(domain);
  if (!normalized) return null;
  return db.get(
    'SELECT id, name, slug, domain, logo_data FROM tenants WHERE active = 1 AND LOWER(domain) = ?',
    [normalized]
  );
}

async function ensureTenantRecord({ name, slug, domain }) {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) return null;

  let tenant = await findTenantBySlug(normalizedSlug);
  const normalizedDomain = normalizeHost(domain);
  const now = nowIso();

  if (!tenant && normalizedDomain) {
    tenant = await findTenantByDomain(normalizedDomain);
  }

  if (!tenant) {
    const tenantId = newId();
    await db.run(
      `INSERT INTO tenants (id, name, slug, domain, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, (name || normalizedSlug).toString().trim() || normalizedSlug, normalizedSlug, normalizedDomain || null, 1, now, now]
    );
    tenant = await db.get('SELECT id, name, slug, domain, logo_data FROM tenants WHERE id = ?', [tenantId]);
    return tenant;
  }

  await db.run(
    'UPDATE tenants SET name = ?, domain = ?, updated_at = ? WHERE id = ?',
    [(name || tenant.name || normalizedSlug).toString().trim() || normalizedSlug, normalizedDomain || tenant.domain || null, now, tenant.id]
  );
  return db.get('SELECT id, name, slug, domain, logo_data FROM tenants WHERE id = ?', [tenant.id]);
}

async function getDefaultTenant() {
  if (defaultTenantId) {
    const cached = await db.get(
      'SELECT id, name, slug, domain, logo_data FROM tenants WHERE id = ? AND active = 1',
      [defaultTenantId]
    );
    if (cached) return cached;
  }
  const tenant = await ensureTenantRecord({
    name: DEFAULT_TENANT_NAME,
    slug: DEFAULT_TENANT_SLUG,
    domain: normalizeHost(process.env.DEFAULT_TENANT_DOMAIN || '')
  });
  defaultTenantId = tenant?.id || null;
  return tenant;
}

async function resolveTenantForRequest(req) {
  const requestedTenantId = (req.headers['x-tenant-id'] || req.query.tenant_id || '').toString().trim();
  if (requestedTenantId) {
    const tenant = await db.get(
      'SELECT id, name, slug, domain, logo_data FROM tenants WHERE id = ? AND active = 1',
      [requestedTenantId]
    );
    if (tenant) return tenant;
  }

  const requestedSlug = (req.headers['x-tenant-slug'] || req.query.tenant || '').toString().trim();
  if (requestedSlug) {
    const tenant = await findTenantBySlug(requestedSlug);
    if (tenant) return tenant;
  }

  const forwardedHost = (req.headers['x-forwarded-host'] || '').toString().split(',')[0].trim();
  const host = normalizeHost(forwardedHost || req.headers.host || '');
  if (host) {
    const byDomain = await findTenantByDomain(host);
    if (byDomain) return byDomain;
  }

  return getDefaultTenant();
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

function generateTemporaryPassword() {
  const chunk = crypto.randomBytes(4).toString('hex');
  return `Tmp-${chunk}-224`;
}

function buildRecoveryUsername(slug) {
  const base = (normalizeSlug(slug) || 'tenant').replace(/-/g, '');
  const username = `recovery${base}`.slice(0, 30);
  return username || 'recoveryadmin';
}

async function writeAdminAuditLog({
  actorTenantId,
  actorUserId,
  action,
  targetTenantId = null,
  targetCloneId = null,
  metadata = null
}) {
  const id = newId();
  const payload = metadata ? JSON.stringify(metadata) : null;
  await db.run(
    `INSERT INTO admin_audit_logs (
      id, actor_tenant_id, actor_user_id, action, target_tenant_id, target_clone_id, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, actorTenantId || null, actorUserId || null, action, targetTenantId, targetCloneId, payload, nowIso()]
  );
}

async function upsertWorker(id, name, active = 1, tenantId = null) {
  if (!id) return;
  const existing = await db.get('SELECT id FROM workers WHERE id = ?', [id]);
  const finalTenantId = tenantId || defaultTenantId;
  if (existing) {
    await db.run('UPDATE workers SET name = ?, active = ?, tenant_id = ? WHERE id = ?', [name, active, finalTenantId, id]);
  } else {
    await db.run(
      'INSERT INTO workers (id, tenant_id, name, active, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, finalTenantId, name, active, nowIso()]
    );
  }
}

async function syncWorkersWithUsers() {
  const users = await db.all('SELECT id, full_name, active, tenant_id FROM users');
  for (const user of users) {
    await upsertWorker(user.id, user.full_name, user.active, user.tenant_id);
  }
}

async function createSession(userId, tenantId) {
  const token = crypto.randomBytes(32).toString('hex');
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await db.run(
    'INSERT INTO sessions (token, user_id, tenant_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    [token, userId, tenantId, createdAt, expiresAt]
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
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ error: 'Tenant není dostupný.' });

    const row = await db.get(
      `SELECT s.token, s.user_id, s.expires_at, u.username, u.full_name, u.role, u.is_superadmin
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.tenant_id = ? AND u.active = 1 AND u.tenant_id = ?`,
      [token, tenantId, tenantId]
    );

    if (!row) return res.status(401).json({ error: 'Neplatné přihlášení.' });

    if (row.expires_at <= nowIso()) {
      await db.run('DELETE FROM sessions WHERE token = ? AND tenant_id = ?', [token, tenantId]);
      return res.status(401).json({ error: 'Platnost přihlášení vypršela.' });
    }

    req.user = {
      id: row.user_id,
      username: row.username,
      full_name: row.full_name,
      role: row.role,
      is_superadmin: toInt(row.is_superadmin, 0) === 1
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
      tenant_id TEXT,
      name TEXT NOT NULL,
      form_type TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      form_schema_json TEXT,
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
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      domain TEXT UNIQUE,
      logo_data TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      username TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      is_superadmin INTEGER NOT NULL DEFAULT 0,
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tenant_id TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
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
      tenant_id TEXT,
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
      tenant_id TEXT,
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      amount INTEGER NOT NULL,
      vat_rate INTEGER NOT NULL DEFAULT 0,
      recurring_type TEXT NOT NULL DEFAULT 'none',
      note TEXT,
      worker_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS availability (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      worker_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      time_slot TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (worker_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
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
    CREATE TABLE IF NOT EXISTS clones (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      domain TEXT,
      plan TEXT NOT NULL DEFAULT 'basic',
      status TEXT NOT NULL DEFAULT 'draft',
      admin_name TEXT,
      admin_email TEXT,
      note TEXT,
      template_json TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tenant_features (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      feature_key TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      actor_tenant_id TEXT,
      actor_user_id TEXT,
      action TEXT NOT NULL,
      target_tenant_id TEXT,
      target_clone_id TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );
  `);

  await ensureColumn('clients', 'cream', 'TEXT');
  await ensureColumn('visits', 'service_id', 'TEXT');
  await ensureColumn('visits', 'service_data', 'TEXT');
  await ensureColumn('expenses', 'vat_rate', 'INTEGER DEFAULT 0');
  await ensureColumn('expenses', 'worker_id', 'TEXT');
  await ensureColumn('expenses', 'recurring_type', "TEXT DEFAULT 'none'");
  await ensureColumn('services', 'duration_minutes', 'INTEGER DEFAULT 30');
  await ensureColumn('services', 'form_schema_json', 'TEXT');
  await ensureColumn('reservations', 'duration_minutes', 'INTEGER DEFAULT 30');
  await ensureColumn('tenants', 'domain', 'TEXT');
  await ensureColumn('tenants', 'logo_data', 'TEXT');
  await ensureColumn('tenants', 'active', 'INTEGER DEFAULT 1');
  await ensureColumn('tenants', 'updated_at', 'TEXT');
  await ensureColumn('users', 'tenant_id', 'TEXT');
  await ensureColumn('users', 'is_superadmin', 'INTEGER DEFAULT 0');
  await ensureColumn('workers', 'tenant_id', 'TEXT');
  await ensureColumn('sessions', 'tenant_id', 'TEXT');
  await ensureColumn('services', 'tenant_id', 'TEXT');
  await ensureColumn('clients', 'tenant_id', 'TEXT');
  await ensureColumn('visits', 'tenant_id', 'TEXT');
  await ensureColumn('expenses', 'tenant_id', 'TEXT');
  await ensureColumn('availability', 'tenant_id', 'TEXT');
  await ensureColumn('reservations', 'tenant_id', 'TEXT');
  await ensureColumn('clones', 'tenant_id', 'TEXT');
  await ensureColumn('clones', 'domain', 'TEXT');
  await ensureColumn('clones', 'plan', "TEXT DEFAULT 'basic'");
  await ensureColumn('clones', 'status', "TEXT DEFAULT 'draft'");
  await ensureColumn('clones', 'admin_name', 'TEXT');
  await ensureColumn('clones', 'admin_email', 'TEXT');
  await ensureColumn('clones', 'note', 'TEXT');
  await ensureColumn('clones', 'template_json', 'TEXT');
  await ensureColumn('clones', 'active', 'INTEGER DEFAULT 1');
  await ensureColumn('clones', 'updated_at', 'TEXT');
  await ensureColumn('tenant_features', 'tenant_id', 'TEXT');
  await ensureColumn('tenant_features', 'feature_key', 'TEXT');
  await ensureColumn('tenant_features', 'enabled', 'INTEGER DEFAULT 0');
  await ensureColumn('tenant_features', 'updated_at', 'TEXT');

  if (db.isPostgres) {
    await db.exec('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key');
  }
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_username_idx ON users (tenant_id, username)');

  await db.run('UPDATE services SET duration_minutes = 30 WHERE duration_minutes IS NULL');
  await db.run('UPDATE reservations SET duration_minutes = 30 WHERE duration_minutes IS NULL');
  await db.run("UPDATE expenses SET recurring_type = 'none' WHERE recurring_type IS NULL");
  await db.run('UPDATE users SET is_superadmin = 0 WHERE is_superadmin IS NULL');
  await db.run('UPDATE tenants SET active = 1 WHERE active IS NULL');
  await db.run('UPDATE tenants SET updated_at = created_at WHERE updated_at IS NULL');
  const defaultTenant = await getDefaultTenant();
  defaultTenantId = defaultTenant?.id || null;
  if (!defaultTenantId) {
    throw new Error('Nelze inicializovat výchozí tenant.');
  }
  await db.run('UPDATE users SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = ?', [defaultTenantId, '']);
  await db.run('UPDATE workers SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = ?', [defaultTenantId, '']);
  await db.run('UPDATE sessions SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = ?', [defaultTenantId, '']);
  await db.run('UPDATE services SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = ?', [defaultTenantId, '']);
  await db.run('UPDATE clients SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = ?', [defaultTenantId, '']);
  await db.run('UPDATE visits SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = ?', [defaultTenantId, '']);
  await db.run('UPDATE expenses SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = ?', [defaultTenantId, '']);
  await db.run('UPDATE availability SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = ?', [defaultTenantId, '']);
  await db.run('UPDATE reservations SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = ?', [defaultTenantId, '']);
  await db.run('UPDATE clones SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = ?', [defaultTenantId, '']);
  await db.run("UPDATE clones SET plan = 'basic' WHERE plan IS NULL");
  await db.run("UPDATE clones SET status = 'draft' WHERE status IS NULL");
  await db.run('UPDATE clones SET active = 1 WHERE active IS NULL');
  await db.run('UPDATE clones SET updated_at = created_at WHERE updated_at IS NULL');
  await db.run('DELETE FROM tenant_features WHERE tenant_id IS NULL OR tenant_id = ?', ['']);
  await db.run('DELETE FROM tenant_features WHERE feature_key IS NULL OR feature_key = ?', ['']);
  await db.run('UPDATE tenant_features SET updated_at = created_at WHERE updated_at IS NULL');

  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS tenant_features_tenant_feature_key_idx ON tenant_features (tenant_id, feature_key)');

  const cloneRows = await db.all('SELECT id, name, slug, domain, tenant_id FROM clones WHERE active = 1');
  for (const clone of cloneRows) {
    const tenant = await ensureTenantRecord({
      name: clone.name,
      slug: clone.slug,
      domain: clone.domain
    });
    if (tenant?.id && clone.tenant_id !== tenant.id) {
      await db.run('UPDATE clones SET tenant_id = ?, updated_at = ? WHERE id = ?', [tenant.id, nowIso(), clone.id]);
    }
  }

  const superAdminRow = await db.get('SELECT COUNT(*) as count FROM users WHERE active = 1 AND is_superadmin = 1');
  if (toInt(superAdminRow?.count, 0) === 0) {
    const firstAdmin = await db.get(
      "SELECT id FROM users WHERE active = 1 AND role = 'admin' ORDER BY created_at ASC LIMIT 1"
    );
    if (firstAdmin?.id) {
      await db.run('UPDATE users SET is_superadmin = 1 WHERE id = ?', [firstAdmin.id]);
    }
  }
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

  const serviceRow = await db.get('SELECT COUNT(*) as count FROM services WHERE tenant_id = ?', [defaultTenantId]);
  const serviceCount = toInt(serviceRow?.count, 0);
  if (serviceCount === 0) {
    const now = nowIso();
    await db.run(
      'INSERT INTO services (id, tenant_id, name, form_type, duration_minutes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [newId(), defaultTenantId, 'Kosmetika', 'cosmetic', 60, now]
    );
    const items = ['Laminace', 'Prodloužení řas', 'Masáže', 'Depilace', 'EMS a lymfodrenáž', 'Líčení'];
    for (const name of items) {
      await db.run(
        'INSERT INTO services (id, tenant_id, name, form_type, duration_minutes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [newId(), defaultTenantId, name, 'generic', 60, now]
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

  const workerRow = await db.get('SELECT COUNT(*) as count FROM workers WHERE tenant_id = ?', [defaultTenantId]);
  const workerCount = toInt(workerRow?.count, 0);
  if (workerCount === 0) {
    const now = nowIso();
    const items = ['Majitelka', 'Uživatel', 'Recepční 1', 'Recepční 2', 'Recepční 3', 'Recepční 4', 'Recepční 5'];
    for (const name of items) {
      await db.run('INSERT INTO workers (id, tenant_id, name, created_at) VALUES (?, ?, ?, ?)', [newId(), defaultTenantId, name, now]);
    }
  }
}

const requireAdmin = requireRole('admin');
const requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin' || !req.user.is_superadmin) {
    return res.status(403).json({ error: 'Přístup pouze pro super administrátora.' });
  }
  return next();
};
const requireFeature = (featureKey) => async (req, res, next) => {
  if (!FEATURE_KEY_SET.has(featureKey)) {
    return res.status(500).json({ error: 'Neznámá feature.' });
  }
  try {
    const access = await getTenantFeatureAccess(req.tenant.id);
    if (!access.effective[featureKey]) {
      return res.status(403).json({ error: 'Tato funkce není pro tento klon aktivní.' });
    }
    req.featureAccess = access;
    return next();
  } catch (err) {
    return next(err);
  }
};

async function hasUsers(tenantId) {
  const row = await db.get('SELECT COUNT(*) as count FROM users WHERE active = 1 AND tenant_id = ?', [tenantId]);
  return toInt(row?.count, 0) > 0;
}

function userView(row) {
  return {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    role: row.role,
    tenant_id: row.tenant_id || null,
    is_superadmin: toInt(row.is_superadmin, 0) === 1
  };
}

async function otherAdminCount(excludeId, tenantId) {
  const row = await db.get(
    'SELECT COUNT(*) as count FROM users WHERE active = 1 AND role = ? AND tenant_id = ? AND id != ?',
    ['admin', tenantId, excludeId]
  );
  return toInt(row?.count, 0);
}

async function otherSuperAdminCount(excludeId, tenantId) {
  const row = await db.get(
    'SELECT COUNT(*) as count FROM users WHERE active = 1 AND role = ? AND is_superadmin = 1 AND tenant_id = ? AND id != ?',
    ['admin', tenantId, excludeId]
  );
  return toInt(row?.count, 0);
}

async function getSettings(tenantId) {
  const skinTypes = await db.all('SELECT * FROM skin_types WHERE active = 1 ORDER BY sort_order, name');
  const services = await db.all('SELECT * FROM services WHERE active = 1 AND tenant_id = ? ORDER BY name', [tenantId]);
  const treatments = await db.all('SELECT * FROM treatments WHERE active = 1 ORDER BY name');
  const addons = await db.all('SELECT * FROM addons WHERE active = 1 ORDER BY name');
  const workers = await db.all('SELECT id, full_name as name FROM users WHERE active = 1 AND tenant_id = ? ORDER BY full_name', [tenantId]);
  return { skinTypes, services, treatments, addons, workers };
}

function normalizeClonePlan(value) {
  const raw = (value || '').toString().trim().toLowerCase();
  if (raw === 'pro' || raw === 'enterprise') return raw;
  return 'basic';
}

function featureCatalogView() {
  return FEATURE_DEFINITIONS.map((feature) => ({
    key: feature.key,
    label: feature.label
  }));
}

function defaultFeatureForPlan(plan, featureKey) {
  const normalizedPlan = normalizeClonePlan(plan);
  const feature = FEATURE_DEFINITIONS.find((item) => item.key === featureKey);
  if (!feature) return false;
  return Boolean(feature.defaults[normalizedPlan]);
}

async function getTenantPlan(tenantId) {
  if (!tenantId) return normalizeClonePlan(DEFAULT_TENANT_PLAN);
  if (tenantId === defaultTenantId) return normalizeClonePlan(DEFAULT_TENANT_PLAN);
  const clone = await db.get(
    'SELECT plan FROM clones WHERE tenant_id = ? AND active = 1 ORDER BY updated_at DESC LIMIT 1',
    [tenantId]
  );
  return normalizeClonePlan(clone?.plan || 'basic');
}

async function getTenantFeatureAccess(tenantId, tenantPlan = null) {
  const plan = normalizeClonePlan(tenantPlan || (await getTenantPlan(tenantId)));
  const rows = await db.all(
    'SELECT feature_key, enabled FROM tenant_features WHERE tenant_id = ?',
    [tenantId]
  );
  const overrides = {};
  rows.forEach((row) => {
    if (!FEATURE_KEY_SET.has(row.feature_key)) return;
    overrides[row.feature_key] = toInt(row.enabled, 0) === 1;
  });

  const effective = {};
  FEATURE_DEFINITIONS.forEach((feature) => {
    if (Object.prototype.hasOwnProperty.call(overrides, feature.key)) {
      effective[feature.key] = overrides[feature.key];
    } else {
      effective[feature.key] = defaultFeatureForPlan(plan, feature.key);
    }
  });

  return { plan, overrides, effective };
}

function normalizeCloneStatus(value) {
  const raw = (value || '').toString().trim().toLowerCase();
  if (raw === 'active' || raw === 'suspended') return raw;
  return 'draft';
}

async function buildCloneTemplateSnapshot(tenantId) {
  const targetTenantId = tenantId || defaultTenantId;
  const services = await db.all(
    'SELECT name, form_type, duration_minutes FROM services WHERE active = 1 AND tenant_id = ? ORDER BY name',
    [targetTenantId]
  );
  const skinTypes = await db.all('SELECT name, sort_order FROM skin_types WHERE active = 1 ORDER BY sort_order, name');
  const treatments = await db.all('SELECT name, price, note FROM treatments WHERE active = 1 ORDER BY name');
  const addons = await db.all('SELECT name, price FROM addons WHERE active = 1 ORDER BY name');

  return {
    generated_at: nowIso(),
    settings: {
      services,
      skin_types: skinTypes,
      treatments,
      addons
    }
  };
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: usePostgres ? 'postgres' : 'sqlite' });
});

app.get('/api/bootstrap', async (req, res) => {
  res.json({ has_users: await hasUsers(req.tenant.id), tenant: req.tenant });
});

app.post('/api/setup', async (req, res) => {
  if (await hasUsers(req.tenant.id)) return res.status(400).json({ error: 'Uživatel už existuje.' });

  const payload = req.body || {};
  const username = normalizeUsername(payload.username);
  const fullName = (payload.full_name || '').trim();
  const password = (payload.password || '').trim();

  if (!username || !fullName || !password) {
    return res.status(400).json({ error: 'Vyplňte jméno, uživatelské jméno a heslo.' });
  }

  const id = newId();
  const now = nowIso();
  const isSuperAdmin = req.tenant.id === defaultTenantId ? 1 : 0;
  await db.run(
    'INSERT INTO users (id, tenant_id, username, full_name, role, is_superadmin, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, req.tenant.id, username, fullName, 'admin', isSuperAdmin, hashPassword(password), now]
  );
  await upsertWorker(id, fullName, 1, req.tenant.id);

  res.json({ ok: true });
});

app.post('/api/login', async (req, res) => {
  const payload = req.body || {};
  const username = normalizeUsername(payload.username);
  const password = (payload.password || '').trim();
  if (!username || !password) {
    return res.status(400).json({ error: 'Vyplňte uživatelské jméno a heslo.' });
  }

  const user = await db.get(
    'SELECT * FROM users WHERE username = ? AND tenant_id = ? AND active = 1',
    [username, req.tenant.id]
  );
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Neplatné přihlašovací údaje.' });
  }

  const token = await createSession(user.id, req.tenant.id);
  res.json({ token, user: userView(user) });
});

app.get('/api/pro-access', (req, res) => {
  res.json({ allowed: true });
});

app.get('/api/public/services', async (req, res) => {
  const services = await db.all(
    'SELECT id, name, duration_minutes FROM services WHERE active = 1 AND tenant_id = ? ORDER BY name',
    [req.tenant.id]
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

async function resolveSelectedServices(serviceIds, tenantId) {
  if (!serviceIds.length) {
    return { error: 'Vyberte alespoň jednu službu.', status: 400 };
  }
  const placeholders = serviceIds.map(() => '?').join(', ');
  const params = [tenantId, ...serviceIds];
  const serviceRows = await db.all(
    `SELECT id, name, duration_minutes FROM services WHERE active = 1 AND tenant_id = ? AND id IN (${placeholders})`,
    params
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

async function calculatePublicAvailability(tenantId, date, duration) {
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
     WHERE u.active = 1 AND a.day_of_week = ? AND a.tenant_id = ? AND u.tenant_id = ?
     ORDER BY a.time_slot, u.full_name`,
    [day, tenantId, tenantId]
  );

  const reserved = await db.all(
    `SELECT r.worker_id, r.time_slot, COALESCE(r.duration_minutes, s.duration_minutes, 30) as duration_minutes,
            u.full_name as worker_name
     FROM reservations r
     LEFT JOIN services s ON s.id = r.service_id
     JOIN users u ON u.id = r.worker_id
     WHERE r.date = ? AND r.tenant_id = ? AND u.tenant_id = ?`,
    [date, tenantId, tenantId]
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
  const selected = await resolveSelectedServices(serviceIds, req.tenant.id);
  if (selected.error) {
    return res.status(selected.status || 400).json({ error: selected.error });
  }
  const availability = await calculatePublicAvailability(req.tenant.id, date, selected.duration);
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
  const selected = await resolveSelectedServices(serviceIds, req.tenant.id);
  if (selected.error) {
    return res.status(selected.status || 400).json({ error: selected.error });
  }

  const lastDay = new Date(year, month, 0).getDate();
  const days = [];
  for (let day = 1; day <= lastDay; day += 1) {
    const date = `${year}-${pad2(month)}-${pad2(day)}`;
    const availability = await calculatePublicAvailability(req.tenant.id, date, selected.duration);
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

  const selected = await resolveSelectedServices(uniqueServiceIds, req.tenant.id);
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

  const worker = await db.get('SELECT id FROM users WHERE id = ? AND tenant_id = ? AND active = 1', [workerId, req.tenant.id]);
  if (!worker) return res.status(400).json({ error: 'Pracovník není platný.' });

  const day = weekdayIndex(date);
  if (day === null) return res.status(400).json({ error: 'Neplatné datum.' });

  const availabilityRows = await db.all(
    'SELECT time_slot FROM availability WHERE worker_id = ? AND day_of_week = ? AND tenant_id = ?',
    [workerId, day, req.tenant.id]
  );
  const availabilitySet = new Set(availabilityRows.map((row) => row.time_slot));

  const existingReservations = await db.all(
    `SELECT r.time_slot, COALESCE(r.duration_minutes, s.duration_minutes, 30) as duration_minutes
     FROM reservations r
     LEFT JOIN services s ON s.id = r.service_id
     WHERE r.worker_id = ? AND r.date = ? AND r.tenant_id = ?`,
    [workerId, date, req.tenant.id]
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
    `INSERT INTO reservations (id, tenant_id, date, time_slot, service_id, worker_id, duration_minutes, client_name, phone, email, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      req.tenant.id,
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
    await db.run('DELETE FROM sessions WHERE token = ? AND tenant_id = ?', [req.token, req.tenant.id]);
  }
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({ user: req.user, tenant: req.tenant });
});

app.get('/api/features', async (req, res) => {
  const access = await getTenantFeatureAccess(req.tenant.id);
  res.json({
    tenant_id: req.tenant.id,
    catalog: featureCatalogView(),
    plan: access.plan,
    overrides: access.overrides,
    effective: access.effective
  });
});

app.get('/api/settings', async (req, res) => {
  res.json(await getSettings(req.tenant.id));
});

app.put('/api/tenant/logo', requireAdmin, async (req, res) => {
  const payload = req.body || {};
  const rawLogo = payload.logo_data === undefined ? '' : String(payload.logo_data || '').trim();
  const clear = payload.clear === true || !rawLogo;
  const logoData = clear ? null : rawLogo;

  if (logoData) {
    if (!logoData.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Logo musí být obrázek.' });
    }
    if (!logoData.includes('base64,')) {
      return res.status(400).json({ error: 'Logo musí být ve formátu base64.' });
    }
    if (logoData.length > 250_000) {
      return res.status(400).json({ error: 'Logo je příliš velké. Zmenšete soubor.' });
    }
  }

  await db.run('UPDATE tenants SET logo_data = ?, updated_at = ? WHERE id = ?', [logoData, nowIso(), req.tenant.id]);
  const tenant = await db.get('SELECT id, name, slug, domain, logo_data FROM tenants WHERE id = ?', [req.tenant.id]);
  res.json({ ok: true, tenant });
});

app.get('/api/availability', requireFeature('calendar'), async (req, res) => {
  if (req.user.role === 'reception') {
    return res.status(403).json({ error: 'Nemáte oprávnění.' });
  }

  const rows = await db.all(
    'SELECT day_of_week, time_slot FROM availability WHERE worker_id = ? AND tenant_id = ?',
    [req.user.id, req.tenant.id]
  );
  const days = Array.from(new Set(rows.map((row) => row.day_of_week))).sort();
  const times = Array.from(new Set(rows.map((row) => row.time_slot))).sort();
  res.json({ days, times });
});

app.post('/api/availability', requireFeature('calendar'), async (req, res) => {
  if (req.user.role === 'reception') {
    return res.status(403).json({ error: 'Nemáte oprávnění.' });
  }

  const payload = req.body || {};
  const rawDays = Array.isArray(payload.days) ? payload.days : [];
  const rawTimes = Array.isArray(payload.times) ? payload.times : [];
  const days = Array.from(new Set(rawDays.map((day) => toInt(day, -1)).filter((day) => day >= 0 && day <= 6)));
  const times = Array.from(new Set(rawTimes.map((time) => String(time)).filter((time) => time)));

  await db.run('DELETE FROM availability WHERE worker_id = ? AND tenant_id = ?', [req.user.id, req.tenant.id]);

  const now = nowIso();
  for (const day of days) {
    for (const time of times) {
      await db.run(
        'INSERT INTO availability (id, tenant_id, worker_id, day_of_week, time_slot, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [newId(), req.tenant.id, req.user.id, day, time, now]
      );
    }
  }

  res.json({ ok: true });
});

app.get('/api/reservations/calendar', requireFeature('calendar'), async (req, res) => {
  const year = toInt(req.query.year, new Date().getFullYear());
  const month = toInt(req.query.month, new Date().getMonth() + 1);
  if (month < 1 || month > 12) {
    return res.status(400).json({ error: 'Neplatný měsíc.' });
  }

  const lastDay = new Date(year, month, 0).getDate();
  const start = `${year}-${pad2(month)}-01`;
  const end = `${year}-${pad2(month)}-${pad2(lastDay)}`;

  const rows = await db.all(
    'SELECT date FROM reservations WHERE date BETWEEN ? AND ? AND tenant_id = ? GROUP BY date',
    [start, end, req.tenant.id]
  );
  let days = rows.map((row) => row.date);

  if (!days.length && month === 2) {
    days = [2, 5, 8, 12, 14, 18, 21, 26].map((day) => `${year}-${pad2(month)}-${pad2(day)}`);
  }

  res.json({ days });
});

app.get('/api/reservations', requireFeature('calendar'), async (req, res) => {
  const year = toInt(req.query.year, new Date().getFullYear());
  const month = toInt(req.query.month, new Date().getMonth() + 1);
  const lastDay = new Date(year, month, 0).getDate();
  const from = `${year}-${pad2(month)}-01`;
  const to = `${year}-${pad2(month)}-${pad2(lastDay)}`;

  const where = ['r.date BETWEEN ? AND ?', 'r.tenant_id = ?'];
  const params = [from, to, req.tenant.id];
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
  const schemaProvided = Object.prototype.hasOwnProperty.call(payload, 'form_schema');
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (duration < 30 || duration % 30 !== 0) {
    return res.status(400).json({ error: 'duration must be in 30 minute steps' });
  }

  let schemaJson = null;
  if (schemaProvided) {
    if (payload.form_schema === null) {
      schemaJson = null;
    } else {
      let rawSchema = payload.form_schema;
      if (typeof rawSchema === 'string') {
        try {
          rawSchema = JSON.parse(rawSchema);
        } catch (err) {
          rawSchema = null;
        }
      }
      const schema = normalizeServiceSchema(rawSchema);
      if (!schema) return res.status(400).json({ error: 'form_schema is invalid' });
      schemaJson = JSON.stringify(schema);
      if (schemaJson.length > 200_000) {
        return res.status(400).json({ error: 'form_schema je příliš velké.' });
      }
    }
  }

  const id = newId();
  await db.run(
    'INSERT INTO services (id, tenant_id, name, form_type, duration_minutes, form_schema_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, req.tenant.id, name, formType, duration, schemaJson, nowIso()]
  );
  res.json({ id });
});

app.put('/api/services/:id', requireAdmin, async (req, res) => {
  const payload = req.body || {};
  const name = (payload.name || '').trim();
  const formType = payload.form_type === 'cosmetic' ? 'cosmetic' : 'generic';
  const duration = toInt(payload.duration_minutes, 30);
  const schemaProvided = Object.prototype.hasOwnProperty.call(payload, 'form_schema');
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (duration < 30 || duration % 30 !== 0) {
    return res.status(400).json({ error: 'duration must be in 30 minute steps' });
  }

  const existing = await db.get(
    'SELECT id, form_schema_json FROM services WHERE id = ? AND tenant_id = ? AND active = 1',
    [req.params.id, req.tenant.id]
  );
  if (!existing) return res.status(404).json({ error: 'Služba nenalezena.' });

  let schemaJson = existing.form_schema_json;
  if (schemaProvided) {
    if (payload.form_schema === null) {
      schemaJson = null;
    } else {
      let rawSchema = payload.form_schema;
      if (typeof rawSchema === 'string') {
        try {
          rawSchema = JSON.parse(rawSchema);
        } catch (err) {
          rawSchema = null;
        }
      }
      const schema = normalizeServiceSchema(rawSchema);
      if (!schema) return res.status(400).json({ error: 'form_schema is invalid' });
      schemaJson = JSON.stringify(schema);
      if (schemaJson.length > 200_000) {
        return res.status(400).json({ error: 'form_schema je příliš velké.' });
      }
    }
  }

  await db.run(
    'UPDATE services SET name = ?, form_type = ?, duration_minutes = ?, form_schema_json = ? WHERE id = ? AND tenant_id = ?',
    [name, formType, duration, schemaJson, req.params.id, req.tenant.id]
  );
  res.json({ ok: true });
});

app.delete('/api/services/:id', requireAdmin, async (req, res) => {
  await db.run('UPDATE services SET active = 0 WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant.id]);
  res.json({ ok: true });
});

app.get('/api/users', requireAdmin, async (req, res) => {
  const users = await db.all(
    'SELECT id, username, full_name, role, is_superadmin, active FROM users WHERE active = 1 AND tenant_id = ? ORDER BY full_name',
    [req.tenant.id]
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
      'INSERT INTO users (id, tenant_id, username, full_name, role, is_superadmin, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.tenant.id, username, fullName, role, 0, hashPassword(password), now]
    );
  } catch (err) {
    return res.status(400).json({ error: 'Uživatelské jméno už existuje.' });
  }
  await upsertWorker(id, fullName, 1, req.tenant.id);

  res.json({ id });
});

app.put('/api/users/:id', requireAdmin, async (req, res) => {
  const payload = req.body || {};
  const existing = await db.get('SELECT * FROM users WHERE id = ? AND tenant_id = ? AND active = 1', [req.params.id, req.tenant.id]);
  if (!existing) return res.status(404).json({ error: 'Uživatel nenalezen.' });
  if (toInt(existing.is_superadmin, 0) === 1 && !req.user.is_superadmin) {
    return res.status(403).json({ error: 'Nelze upravit super administrátora.' });
  }

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

  if (existing.role === 'admin' && role !== 'admin' && (await otherAdminCount(existing.id, existing.tenant_id)) === 0) {
    return res.status(400).json({ error: 'Musí zůstat alespoň jeden administrátor.' });
  }
  if (toInt(existing.is_superadmin, 0) === 1 && role !== 'admin' && (await otherSuperAdminCount(existing.id, existing.tenant_id)) === 0) {
    return res.status(400).json({ error: 'Musí zůstat alespoň jeden super administrátor.' });
  }

  const passwordHash = password ? hashPassword(password) : existing.password_hash;

  try {
    await db.run(
      'UPDATE users SET username = ?, full_name = ?, role = ?, password_hash = ? WHERE id = ? AND tenant_id = ?',
      [username, fullName, role, passwordHash, existing.id, existing.tenant_id]
    );
  } catch (err) {
    return res.status(400).json({ error: 'Uživatelské jméno už existuje.' });
  }
  await upsertWorker(existing.id, fullName, 1, existing.tenant_id);

  res.json({ ok: true });
});

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
  const existing = await db.get('SELECT * FROM users WHERE id = ? AND tenant_id = ? AND active = 1', [req.params.id, req.tenant.id]);
  if (!existing) return res.status(404).json({ error: 'Uživatel nenalezen.' });
  if (toInt(existing.is_superadmin, 0) === 1 && !req.user.is_superadmin) {
    return res.status(403).json({ error: 'Nelze smazat super administrátora.' });
  }

  if (existing.role === 'admin' && (await otherAdminCount(existing.id, existing.tenant_id)) === 0) {
    return res.status(400).json({ error: 'Musí zůstat alespoň jeden administrátor.' });
  }
  if (toInt(existing.is_superadmin, 0) === 1 && (await otherSuperAdminCount(existing.id, existing.tenant_id)) === 0) {
    return res.status(400).json({ error: 'Musí zůstat alespoň jeden super administrátor.' });
  }

  await db.run('UPDATE users SET active = 0 WHERE id = ? AND tenant_id = ?', [existing.id, existing.tenant_id]);
  await db.run('DELETE FROM sessions WHERE user_id = ? AND tenant_id = ?', [existing.id, existing.tenant_id]);
  await upsertWorker(existing.id, existing.full_name, 0, existing.tenant_id);
  res.json({ ok: true });
});

app.get('/api/clones', requireSuperAdmin, async (req, res) => {
  const rows = await db.all(
    `SELECT id, tenant_id, name, slug, domain, plan, status, admin_name, admin_email, note, created_at, updated_at
     FROM clones
     WHERE active = 1
     ORDER BY created_at DESC`
  );
  res.json({ clones: rows });
});

app.post('/api/clones', requireSuperAdmin, async (req, res) => {
  const payload = req.body || {};
  const name = (payload.name || '').trim();
  const slug = normalizeSlug(payload.slug || payload.name);
  const domain = (payload.domain || '').trim() || null;
  const plan = normalizeClonePlan(payload.plan);
  const status = normalizeCloneStatus(payload.status);
  const adminName = (payload.admin_name || '').trim() || null;
  const adminEmail = (payload.admin_email || '').trim() || null;
  const note = (payload.note || '').trim() || null;

  if (!name) {
    return res.status(400).json({ error: 'Vyplňte název klonu.' });
  }
  if (!slug || slug.length < 3) {
    return res.status(400).json({ error: 'Slug musí mít alespoň 3 znaky.' });
  }
  if (adminEmail && !adminEmail.includes('@')) {
    return res.status(400).json({ error: 'E-mail administrátora není platný.' });
  }

  const tenant = await ensureTenantRecord({
    name,
    slug,
    domain
  });
  if (!tenant?.id) {
    return res.status(400).json({ error: 'Tenant pro klon nelze vytvořit.' });
  }

  const template = await buildCloneTemplateSnapshot(req.tenant.id);
  const id = newId();
  const now = nowIso();
  try {
    await db.run(
      `INSERT INTO clones (
        id, tenant_id, name, slug, domain, plan, status, admin_name, admin_email, note, template_json, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tenant.id,
        name,
        slug,
        domain,
        plan,
        status,
        adminName,
        adminEmail,
        note,
        JSON.stringify(template),
        1,
        now,
        now
      ]
    );
  } catch (err) {
    return res.status(400).json({ error: 'Slug už existuje.' });
  }

  res.json({ id });
});

app.put('/api/clones/:id', requireSuperAdmin, async (req, res) => {
  const existing = await db.get('SELECT * FROM clones WHERE id = ? AND active = 1', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ error: 'Klon nenalezen.' });
  }

  const payload = req.body || {};
  const name = (payload.name || existing.name || '').trim();
  const slug = normalizeSlug(payload.slug || existing.slug);
  const domain = payload.domain !== undefined
    ? ((payload.domain || '').trim() || null)
    : existing.domain;
  const plan = normalizeClonePlan(payload.plan || existing.plan);
  const status = normalizeCloneStatus(payload.status || existing.status);
  const adminName = payload.admin_name !== undefined
    ? ((payload.admin_name || '').trim() || null)
    : existing.admin_name;
  const adminEmail = payload.admin_email !== undefined
    ? ((payload.admin_email || '').trim() || null)
    : existing.admin_email;
  const note = payload.note !== undefined
    ? ((payload.note || '').trim() || null)
    : existing.note;

  if (!name) {
    return res.status(400).json({ error: 'Vyplňte název klonu.' });
  }
  if (!slug || slug.length < 3) {
    return res.status(400).json({ error: 'Slug musí mít alespoň 3 znaky.' });
  }
  if (adminEmail && !adminEmail.includes('@')) {
    return res.status(400).json({ error: 'E-mail administrátora není platný.' });
  }

  const tenant = await ensureTenantRecord({
    name,
    slug,
    domain
  });
  if (!tenant?.id) {
    return res.status(400).json({ error: 'Tenant pro klon nelze vytvořit.' });
  }

  const refreshTemplate = payload.refresh_template === true;
  const templateJson = refreshTemplate
    ? JSON.stringify(await buildCloneTemplateSnapshot(req.tenant.id))
    : existing.template_json;

  try {
    await db.run(
      `UPDATE clones SET
        tenant_id = ?, name = ?, slug = ?, domain = ?, plan = ?, status = ?, admin_name = ?, admin_email = ?, note = ?, template_json = ?, updated_at = ?
       WHERE id = ?`,
      [tenant.id, name, slug, domain, plan, status, adminName, adminEmail, note, templateJson, nowIso(), existing.id]
    );
  } catch (err) {
    return res.status(400).json({ error: 'Slug už existuje.' });
  }

  res.json({ ok: true });
});

app.post('/api/clones/:id/recover-admin', requireSuperAdmin, async (req, res) => {
  const clone = await db.get(
    'SELECT id, tenant_id, name, slug, domain, active FROM clones WHERE id = ? AND active = 1',
    [req.params.id]
  );
  if (!clone) {
    return res.status(404).json({ error: 'Klon nenalezen.' });
  }
  if (!clone.tenant_id) {
    return res.status(400).json({ error: 'Klon nemá přiřazený tenant.' });
  }

  const tenant = await db.get(
    'SELECT id, name, slug, domain, active FROM tenants WHERE id = ? AND active = 1',
    [clone.tenant_id]
  );
  if (!tenant) {
    return res.status(400).json({ error: 'Tenant klonu není aktivní.' });
  }

  const payload = req.body || {};
  const requestedFullName = (payload.full_name || '').trim();
  let recoveryUsername = normalizeUsername(payload.username) || buildRecoveryUsername(clone.slug);
  const recoveryUserId = `recovery-${clone.id}`;
  const temporaryPassword = (payload.password || '').trim() || generateTemporaryPassword();
  const recoveryFullName = requestedFullName || `Obnova ${clone.name}`;

  const usernameConflict = await db.get(
    'SELECT id FROM users WHERE tenant_id = ? AND username = ?',
    [clone.tenant_id, recoveryUsername]
  );
  if (usernameConflict && usernameConflict.id !== recoveryUserId) {
    recoveryUsername = `${recoveryUsername}${clone.id.replace(/[^a-z0-9]/gi, '').slice(0, 4).toLowerCase()}`.slice(0, 40);
  }

  const existing = await db.get(
    'SELECT id FROM users WHERE id = ? AND tenant_id = ?',
    [recoveryUserId, clone.tenant_id]
  );
  if (existing) {
    await db.run(
      `UPDATE users
       SET username = ?, full_name = ?, role = ?, is_superadmin = 0, password_hash = ?, active = 1
       WHERE id = ? AND tenant_id = ?`,
      [recoveryUsername, recoveryFullName, 'admin', hashPassword(temporaryPassword), recoveryUserId, clone.tenant_id]
    );
  } else {
    await db.run(
      `INSERT INTO users (
        id, tenant_id, username, full_name, role, is_superadmin, password_hash, active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [recoveryUserId, clone.tenant_id, recoveryUsername, recoveryFullName, 'admin', 0, hashPassword(temporaryPassword), 1, nowIso()]
    );
  }

  await db.run('DELETE FROM sessions WHERE user_id = ? AND tenant_id = ?', [recoveryUserId, clone.tenant_id]);
  await upsertWorker(recoveryUserId, recoveryFullName, 1, clone.tenant_id);
  await writeAdminAuditLog({
    actorTenantId: req.tenant.id,
    actorUserId: req.user.id,
    action: 'clone_admin_recovery',
    targetTenantId: clone.tenant_id,
    targetCloneId: clone.id,
    metadata: {
      clone_name: clone.name,
      clone_slug: clone.slug,
      recovery_username: recoveryUsername,
      recovery_domain: clone.domain || tenant.domain || null
    }
  });

  res.json({
    ok: true,
    recovery: {
      clone_id: clone.id,
      clone_name: clone.name,
      tenant_id: clone.tenant_id,
      domain: clone.domain || tenant.domain || null,
      username: recoveryUsername,
      full_name: recoveryFullName,
      temporary_password: temporaryPassword,
      role: 'admin'
    }
  });
});

app.post('/api/clones/:id/template-refresh', requireSuperAdmin, async (req, res) => {
  const existing = await db.get('SELECT id, tenant_id FROM clones WHERE id = ? AND active = 1', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ error: 'Klon nenalezen.' });
  }

  const template = await buildCloneTemplateSnapshot(req.tenant.id);
  await db.run('UPDATE clones SET template_json = ?, updated_at = ? WHERE id = ?', [
    JSON.stringify(template),
    nowIso(),
    existing.id
  ]);
  res.json({ ok: true });
});

app.get('/api/clones/:id/template', requireSuperAdmin, async (req, res) => {
  const row = await db.get('SELECT template_json FROM clones WHERE id = ? AND active = 1', [req.params.id]);
  if (!row) {
    return res.status(404).json({ error: 'Klon nenalezen.' });
  }
  let template = {};
  if (row.template_json) {
    try {
      template = JSON.parse(row.template_json);
    } catch (err) {
      template = {};
    }
  }
  res.json({ template });
});

app.delete('/api/clones/:id', requireSuperAdmin, async (req, res) => {
  const existing = await db.get('SELECT id FROM clones WHERE id = ? AND active = 1', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ error: 'Klon nenalezen.' });
  }
  await db.run('UPDATE clones SET active = 0, updated_at = ? WHERE id = ?', [nowIso(), existing.id]);
  res.json({ ok: true });
});

app.get('/api/admin/feature-matrix', requireSuperAdmin, async (req, res) => {
  const rows = await db.all(
    `SELECT t.id as tenant_id,
            t.name as tenant_name,
            t.slug as tenant_slug,
            t.domain as tenant_domain,
            c.id as clone_id,
            c.plan as clone_plan,
            c.status as clone_status
     FROM tenants t
     LEFT JOIN clones c ON c.tenant_id = t.id AND c.active = 1
     WHERE t.active = 1
     ORDER BY CASE WHEN t.id = ? THEN 0 ELSE 1 END, t.name ASC`,
    [defaultTenantId]
  );

  const tenants = [];
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.tenant_id)) continue;
    seen.add(row.tenant_id);
    const plan = row.tenant_id === defaultTenantId
      ? normalizeClonePlan(DEFAULT_TENANT_PLAN)
      : normalizeClonePlan(row.clone_plan || 'basic');
    const access = await getTenantFeatureAccess(row.tenant_id, plan);
    const defaults = {};
    FEATURE_DEFINITIONS.forEach((feature) => {
      defaults[feature.key] = defaultFeatureForPlan(plan, feature.key);
    });
    const overrides = {};
    FEATURE_DEFINITIONS.forEach((feature) => {
      overrides[feature.key] = Object.prototype.hasOwnProperty.call(access.overrides, feature.key)
        ? access.overrides[feature.key]
        : null;
    });

    tenants.push({
      tenant_id: row.tenant_id,
      name: row.tenant_name,
      slug: row.tenant_slug,
      domain: row.tenant_domain,
      is_default: row.tenant_id === defaultTenantId,
      clone_id: row.clone_id || null,
      status: row.clone_status || (row.tenant_id === defaultTenantId ? 'active' : 'draft'),
      plan,
      defaults,
      overrides,
      features: access.effective
    });
  }

  res.json({
    features: featureCatalogView(),
    tenants
  });
});

app.put('/api/admin/feature-matrix', requireSuperAdmin, async (req, res) => {
  const payload = req.body || {};
  const tenantId = (payload.tenant_id || '').toString().trim();
  const featureKey = (payload.feature_key || '').toString().trim();
  const enabled = payload.enabled;

  if (!tenantId) {
    return res.status(400).json({ error: 'tenant_id je povinné.' });
  }
  if (!FEATURE_KEY_SET.has(featureKey)) {
    return res.status(400).json({ error: 'Neplatná feature.' });
  }
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled musí být true/false.' });
  }

  const tenant = await db.get('SELECT id FROM tenants WHERE id = ? AND active = 1', [tenantId]);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant nenalezen.' });
  }

  const plan = await getTenantPlan(tenantId);
  const defaultValue = defaultFeatureForPlan(plan, featureKey);

  await db.run('DELETE FROM tenant_features WHERE tenant_id = ? AND feature_key = ?', [tenantId, featureKey]);
  if (enabled !== defaultValue) {
    await db.run(
      `INSERT INTO tenant_features (id, tenant_id, feature_key, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newId(), tenantId, featureKey, enabled ? 1 : 0, nowIso(), nowIso()]
    );
  }

  const access = await getTenantFeatureAccess(tenantId, plan);
  res.json({
    ok: true,
    tenant_id: tenantId,
    feature_key: featureKey,
    enabled: access.effective[featureKey],
    plan,
    default_enabled: defaultValue
  });
});

app.get('/api/clients', async (req, res) => {
  const search = (req.query.search || '').toString().trim();
  let rows;
  if (search) {
    const like = `%${search}%`;
    rows = await db.all(
      `SELECT * FROM clients
       WHERE tenant_id = ? AND (full_name LIKE ? OR phone LIKE ? OR email LIKE ?)
       ORDER BY full_name`
      ,
      [req.tenant.id, like, like, like]
    );
  } else {
    rows = await db.all('SELECT * FROM clients WHERE tenant_id = ? ORDER BY full_name', [req.tenant.id]);
  }
  res.json(rows);
});

app.get('/api/clients/:id', async (req, res) => {
  const client = await db.get('SELECT * FROM clients WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant.id]);
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
    `INSERT INTO clients (id, tenant_id, full_name, phone, email, skin_type_id, skin_notes, cream, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ,
    [
      id,
      req.tenant.id,
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

  const exists = await db.get('SELECT id FROM clients WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant.id]);
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
     WHERE id = ? AND tenant_id = ?`
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
      ,
      req.tenant.id
    ]
  );

  res.json({ ok: true });
});

app.delete('/api/clients/:id', async (req, res) => {
  const info = await db.run('DELETE FROM clients WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant.id]);
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
     WHERE v.client_id = ? AND v.tenant_id = ?
     ORDER BY v.date DESC, v.created_at DESC`
    ,
    [req.params.id, req.tenant.id]
  );
  res.json(rows);
});

app.post('/api/clients/:id/visits', async (req, res) => {
  const payload = req.body || {};
  const clientId = req.params.id;

  const client = await db.get('SELECT id FROM clients WHERE id = ? AND tenant_id = ?', [clientId, req.tenant.id]);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const service = payload.service_id
    ? await db.get('SELECT id, name, form_type, form_schema_json FROM services WHERE id = ? AND tenant_id = ? AND active = 1', [payload.service_id, req.tenant.id])
    : null;
  if (!service) return res.status(400).json({ error: 'Service is required' });

  const workerId = payload.worker_id || null;
  if (!workerId) return res.status(400).json({ error: 'worker_id is required' });
  const worker = await db.get('SELECT id, full_name, tenant_id FROM users WHERE id = ? AND tenant_id = ? AND active = 1', [workerId, req.tenant.id]);
  if (!worker) return res.status(400).json({ error: 'worker_id is invalid' });
  await upsertWorker(worker.id, worker.full_name, 1, worker.tenant_id);

  const manualTotal = payload.manual_total !== null && payload.manual_total !== undefined && payload.manual_total !== ''
    ? toInt(payload.manual_total, 0)
    : null;

  let treatment = null;
  let addonRows = [];
  let addonsTotal = 0;
  let treatmentPrice = 0;
  let total = 0;
  const schema = parseServiceSchemaJson(service.form_schema_json);
  const schemaResult = sanitizeServiceDataBySchema(schema, payload.service_data);
  const schemaExtrasTotal = toInt(schemaResult.extras_total, 0);

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
    const base = manualTotal !== null ? manualTotal : treatmentPrice + addonsTotal;
    total = base + schemaExtrasTotal;
  } else {
    if (manualTotal === null) {
      return res.status(400).json({ error: 'manual_total is required' });
    }
    total = manualTotal + schemaExtrasTotal;
  }

  const id = newId();
  let serviceData = null;
  if (schemaResult.data !== null) {
    serviceData = JSON.stringify(schemaResult.data);
  } else if (payload.service_data) {
    serviceData = JSON.stringify(payload.service_data);
  }
  await db.run(
    `INSERT INTO visits (
      id, tenant_id, client_id, date, service_id, treatment_id, treatment_price,
      addons_json, addons_total, manual_total, total, service_data, note,
      worker_id, payment_method, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ,
    [
      id,
      req.tenant.id,
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
  const info = await db.run('DELETE FROM visits WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant.id]);
  res.json({ ok: info.changes > 0 });
});

app.post('/api/expenses', requireEconomyAccess, requireFeature('economy'), async (req, res) => {
  const payload = req.body || {};
  const title = (payload.title || '').trim();
  if (!title) return res.status(400).json({ error: 'title is required' });

  const amount = Math.abs(toInt(payload.amount, 0));
  if (!amount) return res.status(400).json({ error: 'amount is required' });

  const vatRate = Math.max(0, toInt(payload.vat_rate, 0));
  const recurringTypeRaw = (payload.recurring_type || 'none').toString().trim().toLowerCase();
  const recurringType = ['none', 'weekly', 'monthly', 'quarterly', 'yearly'].includes(recurringTypeRaw)
    ? recurringTypeRaw
    : 'none';
  const workerId = req.user.id;
  const worker = await db.get('SELECT id, full_name, tenant_id FROM users WHERE id = ? AND tenant_id = ? AND active = 1', [workerId, req.tenant.id]);
  if (!worker) return res.status(400).json({ error: 'worker_id is invalid' });
  await upsertWorker(worker.id, worker.full_name, 1, worker.tenant_id);

  const id = newId();
  await db.run(
    `INSERT INTO expenses (id, tenant_id, date, title, amount, vat_rate, recurring_type, note, worker_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ,
    [id, req.tenant.id, toDateOnly(payload.date), title, amount, vatRate, recurringType, payload.note || null, workerId, nowIso()]
  );

  res.json({ id });
});

function recurringOccurrenceDate(startDate, recurringType, index) {
  if (recurringType === 'weekly') {
    return new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + index * 7);
  }
  const monthStep = recurringType === 'monthly' ? 1 : recurringType === 'quarterly' ? 3 : recurringType === 'yearly' ? 12 : 0;
  if (!monthStep) return new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const targetMonth = startDate.getMonth() + index * monthStep;
  const year = startDate.getFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const maxDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(startDate.getDate(), maxDay);
  return new Date(year, month, day);
}

function parseIsoDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function expandExpenses(rows, fromDateStr, toDateStr) {
  const fromDate = parseIsoDate(fromDateStr);
  const toDate = parseIsoDate(toDateStr);
  if (!fromDate || !toDate) return [];

  const expanded = [];
  rows.forEach((row) => {
    const recurringTypeRaw = (row.recurring_type || 'none').toString().toLowerCase();
    const recurringType = ['none', 'weekly', 'monthly', 'quarterly', 'yearly'].includes(recurringTypeRaw)
      ? recurringTypeRaw
      : 'none';
    const startDate = parseIsoDate(row.date);
    if (!startDate) return;

    if (recurringType === 'none') {
      if (startDate >= fromDate && startDate <= toDate) {
        expanded.push({ ...row, date: toLocalDateString(startDate) });
      }
      return;
    }

    let index = 0;
    let occ = recurringOccurrenceDate(startDate, recurringType, index);
    let guard = 0;
    while (occ < fromDate && guard < 4000) {
      index += 1;
      occ = recurringOccurrenceDate(startDate, recurringType, index);
      guard += 1;
    }

    while (occ <= toDate && guard < 8000) {
      expanded.push({ ...row, date: toLocalDateString(occ) });
      index += 1;
      occ = recurringOccurrenceDate(startDate, recurringType, index);
      guard += 1;
    }
  });

  expanded.sort((a, b) => {
    if (a.date === b.date) {
      return (b.created_at || '').localeCompare(a.created_at || '');
    }
    return b.date.localeCompare(a.date);
  });
  return expanded;
}

app.get('/api/expenses', requireEconomyAccess, requireFeature('economy'), async (req, res) => {
  const from = toDateOnly(req.query.from || null);
  const to = toDateOnly(req.query.to || null);
  const workerFilter = req.user.id;
  const rows = await db.all(
    `SELECT e.*, COALESCE(u.full_name, w.name) as worker_name
     FROM expenses e
     LEFT JOIN users u ON e.worker_id = u.id
     LEFT JOIN workers w ON e.worker_id = w.id
     WHERE e.worker_id = ? AND e.tenant_id = ? AND e.date <= ?
     ORDER BY e.date DESC, e.created_at DESC`
    ,
    [workerFilter, req.tenant.id, to]
  );
  res.json(expandExpenses(rows, from, to));
});

app.delete('/api/expenses/:id', requireEconomyAccess, requireFeature('economy'), async (req, res) => {
  if (req.user.role === 'admin') {
    const info = await db.run('DELETE FROM expenses WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant.id]);
    return res.json({ ok: info.changes > 0 });
  }

  const exists = await db.get('SELECT id, worker_id FROM expenses WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant.id]);
  if (!exists) return res.json({ ok: false });
  if (exists.worker_id !== req.user.id) {
    return res.status(403).json({ error: 'Nemáte oprávnění.' });
  }
  const info = await db.run('DELETE FROM expenses WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant.id]);
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

app.get('/api/economy', requireEconomyAccess, requireFeature('economy'), async (req, res) => {
  const range = economyRange(req);
  const role = req.user.role;
  const serviceFilter = req.query.service_id || null;
  const workerFilter = role === 'worker' ? req.user.id : (req.query.worker_id || null);
  const myWorkerId = req.user.id;

  const myVisitsWhere = ['v.date BETWEEN ? AND ?', 'v.worker_id = ?', 'v.tenant_id = ?'];
  const myVisitsParams = [range.from, range.to, myWorkerId, req.tenant.id];
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

  const myExpensesRaw = await db.all(
    `SELECT e.*
     FROM expenses e
     WHERE e.worker_id = ? AND e.tenant_id = ? AND e.date <= ?`,
    [myWorkerId, req.tenant.id, range.to]
  );
  const myExpenses = expandExpenses(myExpensesRaw, range.from, range.to);

  const incomeTotal = myVisits.reduce((sum, row) => sum + toInt(row.total, 0), 0);
  const expenseTotal = myExpenses.reduce((sum, row) => sum + toInt(row.amount, 0), 0);

  const visitsWhere = ['v.date BETWEEN ? AND ?', 'v.tenant_id = ?'];
  const visitsParams = [range.from, range.to, req.tenant.id];
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

  const expensesRaw = await db.all(
    `SELECT e.*, COALESCE(u.full_name, w.name) as worker_name
     FROM expenses e
     LEFT JOIN users u ON e.worker_id = u.id
     LEFT JOIN workers w ON e.worker_id = w.id
     WHERE e.worker_id = ? AND e.tenant_id = ? AND e.date <= ?
     ORDER BY e.date DESC, e.created_at DESC`
    ,
    [myWorkerId, req.tenant.id, range.to]
  );
  const expenses = expandExpenses(expensesRaw, range.from, range.to);

  let byWorker = [];
  if (role === 'admin') {
    const byWorkerWhere = ['v.date BETWEEN ? AND ?', 'v.tenant_id = ?'];
    const byWorkerParams = [range.from, range.to, req.tenant.id];
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
    const allWhere = ['date BETWEEN ? AND ?', 'tenant_id = ?'];
    const allParams = [range.from, range.to, req.tenant.id];
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
    const monthWhere = ['date BETWEEN ? AND ?', 'tenant_id = ?'];
    const monthParams = [monthItem.from, monthItem.to, req.tenant.id];
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
  const clientsRow = await db.get('SELECT COUNT(*) as count FROM clients WHERE tenant_id = ?', [req.tenant.id]);
  const visitsRow = await db.get('SELECT COUNT(*) as count FROM visits WHERE tenant_id = ?', [req.tenant.id]);
  const expensesRow = await db.get('SELECT COUNT(*) as count FROM expenses WHERE tenant_id = ?', [req.tenant.id]);
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

  const visitsAll = await db.all('SELECT total FROM visits WHERE tenant_id = ?', [req.tenant.id]);
  const expensesAll = await db.all('SELECT amount FROM expenses WHERE tenant_id = ?', [req.tenant.id]);

  const totalIncome = visitsAll.reduce((sum, row) => sum + toInt(row.total, 0), 0);
  const totalExpenses = expensesAll.reduce((sum, row) => sum + toInt(row.amount, 0), 0);

  const visitsMonth = await db.all('SELECT total FROM visits WHERE tenant_id = ? AND date BETWEEN ? AND ?', [req.tenant.id, range.from, range.to]);
  const expensesMonth = await db.all('SELECT amount FROM expenses WHERE tenant_id = ? AND date BETWEEN ? AND ?', [req.tenant.id, range.from, range.to]);

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

app.get('/api/backup', requireSuperAdmin, async (req, res) => {
  const data = {
    tenants: await db.all('SELECT * FROM tenants'),
    tenant_features: await db.all('SELECT * FROM tenant_features'),
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
    reservations: await db.all('SELECT * FROM reservations'),
    clones: await db.all('SELECT * FROM clones'),
    admin_audit_logs: await db.all('SELECT * FROM admin_audit_logs')
  };

  res.json({
    exported_at: nowIso(),
    data
  });
});

app.post('/api/restore', requireSuperAdmin, async (req, res) => {
  const payload = req.body || {};
  if (!payload.data) return res.status(400).json({ error: 'Missing data' });

  const { data } = payload;
  const deleteOrder = [
    'admin_audit_logs',
    'tenant_features',
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
    'expenses',
    'clones',
    'tenants'
  ];
  const insertOrder = [
    'tenants',
    'tenant_features',
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
    'reservations',
    'clones',
    'admin_audit_logs'
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
    const defaultTenant = await getDefaultTenant();
    defaultTenantId = defaultTenant?.id || defaultTenantId;
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
    } else if (table === 'workers') {
      await db.run('INSERT INTO workers (id, tenant_id, name, created_at) VALUES (?, ?, ?, ?)', [
        id,
        req.tenant.id,
        name,
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
    } else if (table === 'workers') {
      await db.run('UPDATE workers SET name = ? WHERE id = ? AND tenant_id = ?', [name, req.params.id, req.tenant.id]);
    } else if (table === 'addons') {
      await db.run('UPDATE addons SET name = ?, price = ? WHERE id = ?', [name, price, req.params.id]);
    } else {
      await db.run(`UPDATE ${table} SET name = ? WHERE id = ?`, [name, req.params.id]);
    }

    res.json({ ok: true });
  });

  app.delete(`/api/${resource}/:id`, requireAdmin, async (req, res) => {
    if (table === 'workers') {
      await db.run('UPDATE workers SET active = 0 WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant.id]);
    } else {
      await db.run(`UPDATE ${table} SET active = 0 WHERE id = ?`, [req.params.id]);
    }
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
