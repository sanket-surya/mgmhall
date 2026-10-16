require('dotenv').config();
const { createClient } = require('@libsql/client');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

let db;

if (TURSO_URL && TURSO_TOKEN) {
  console.log('[DATABASE] Connecting to Turso Cloud Database:', TURSO_URL);
  const client = createClient({
    url: TURSO_URL,
    authToken: TURSO_TOKEN
  });

  db = {
    isCloud: true,
    async exec(sql) {
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      for (const s of statements) {
        await client.execute(s);
      }
    },
    prepare(sql) {
      return {
        async get(...params) {
          const args = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          const rs = await client.execute({ sql, args });
          return rs.rows[0] ? Object.assign({}, rs.rows[0]) : undefined;
        },
        async all(...params) {
          const args = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          const rs = await client.execute({ sql, args });
          return Array.from(rs.rows).map(r => Object.assign({}, r));
        },
        async run(...params) {
          const args = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          const rs = await client.execute({ sql, args });
          return {
            changes: rs.rowsAffected,
            lastInsertRowid: Number(rs.lastInsertRowid || 0)
          };
        }
      };
    }
  };
} else {
  console.log('[DATABASE] Using local SQLite file storage');
  const dataDir = process.env.VERCEL
    ? path.join('/tmp', 'data')
    : path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'mgm.sqlite');
  const localDb = new Database(dbPath);

  try {
    localDb.exec('PRAGMA journal_mode = WAL;');
    localDb.exec('PRAGMA busy_timeout = 5000;');
    localDb.exec('PRAGMA synchronous = NORMAL;');
  } catch (e) {}

  db = {
    isCloud: false,
    async exec(sql) {
      localDb.exec(sql);
    },
    prepare(sql) {
      const stmt = localDb.prepare(sql);
      return {
        async get(...params) {
          const args = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          return stmt.get(...args);
        },
        async all(...params) {
          const args = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          return stmt.all(...args);
        },
        async run(...params) {
          const args = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          return stmt.run(...args);
        }
      };
    }
  };
}

async function initDatabase() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'faculty',
      department TEXT NOT NULL,
      faculty_id TEXT NOT NULL,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'approved',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS halls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      capacity INTEGER NOT NULL,
      location TEXT NOT NULL,
      amenities TEXT NOT NULL,
      image_url TEXT,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_ref TEXT UNIQUE NOT NULL,
      hall_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      faculty_name TEXT NOT NULL,
      department TEXT NOT NULL,
      event_title TEXT NOT NULL,
      event_type TEXT NOT NULL,
      booking_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      expected_attendees INTEGER,
      requirements TEXT,
      status TEXT DEFAULT 'Pending',
      admin_remarks TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (hall_id) REFERENCES halls(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      priority TEXT DEFAULT 'Normal',
      posted_by TEXT,
      date TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try {
    await db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'approved'");
  } catch (e) {}

  await db.exec("UPDATE users SET status = 'approved' WHERE status IS NULL OR status = ''");

  // Faculty Secret Key
  const secretKeySetting = await db.prepare('SELECT value FROM system_settings WHERE key = ?').get('faculty_secret_key');
  if (!secretKeySetting) {
    await db.prepare('INSERT INTO system_settings (key, value) VALUES (?, ?)').run('faculty_secret_key', 'MGM@FACULTY#2025');
  }

  // Pre-seed Hall 1
  const countHalls = await db.prepare('SELECT COUNT(*) as count FROM halls').get();
  if (!countHalls || Number(countHalls.count) === 0) {
    await db.prepare(`
      INSERT INTO halls (id, name, code, capacity, location, amenities, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'Sir Vishveshwarya Conference Hall',
      'MGM-SVCH-01',
      350,
      'Administrative & Academic Block, MGM College Of Engineering, Nanded',
      'Dolby Digital Sound, HD Laser Projector, Centralized Air Conditioning, Executive Stage Podium, Wireless Mics, Live Stream Ready',
      '/images/auditorium.jpg'
    );
  } else {
    await db.prepare(`
      UPDATE halls 
      SET name = 'Sir Vishveshwarya Conference Hall',
          code = 'MGM-SVCH-01',
          capacity = 350,
          location = 'Administrative & Academic Block, MGM College Of Engineering, Nanded',
          amenities = 'Dolby Digital Sound, HD Laser Projector, Centralized Air Conditioning, Executive Stage Podium, Wireless Mics, Live Stream Ready',
          image_url = '/images/auditorium.jpg'
      WHERE id = 1
    `).run();
  }

  // Admin Account
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 's25_suryawanshi_sanket@mgmcen.ac.in';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Sanket@123';
  const adminRow = await db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
  const salt = bcrypt.genSaltSync(10);
  const hashedAdminPass = bcrypt.hashSync(ADMIN_PASSWORD, salt);

  if (!adminRow) {
    await db.prepare(`
      INSERT INTO users (name, email, password, role, department, faculty_id, phone)
      VALUES (?, ?, ?, 'admin', 'Administration', 'MGM-ADM-001', '9876543210')
    `).run('Campus Administrator', ADMIN_EMAIL.trim().toLowerCase(), hashedAdminPass);
  } else {
    await db.prepare(`
      UPDATE users 
      SET email = ?, password = ? 
      WHERE role = 'admin'
    `).run(ADMIN_EMAIL.trim().toLowerCase(), hashedAdminPass);
  }

  console.log('[DATABASE] Database ready. Mode:', db.isCloud ? 'TURSO CLOUD' : 'LOCAL SQLITE');
}

db.initPromise = initDatabase();

module.exports = db;
