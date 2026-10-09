const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'mgm.sqlite');
const db = new DatabaseSync(dbPath);

// Enable WAL mode & busy timeout for production concurrency and crash resistance
try {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA synchronous = NORMAL;');
} catch (e) {
  // Pragma fallback
}

function initDatabase() {
  db.exec(`
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

  // Ensure 'status' column exists in users table (migration for existing database)
  try {
    db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'approved'");
  } catch (e) {
    // Column already exists
  }
  db.exec("UPDATE users SET status = 'approved' WHERE status IS NULL OR status = ''");

  // Initialize faculty secret key
  const getSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?');
  const secretKeySetting = getSetting.get('faculty_secret_key');
  if (!secretKeySetting) {
    const insertSetting = db.prepare('INSERT INTO system_settings (key, value) VALUES (?, ?)');
    insertSetting.run('faculty_secret_key', 'MGM@FACULTY#2025');
  }

  // Pre-seed or ensure Sir Vishveshwarya Conference Hall is Hall ID 1
  const countHalls = db.prepare('SELECT COUNT(*) as count FROM halls').get();
  if (countHalls.count === 0) {
    const insertHall = db.prepare(`
      INSERT INTO halls (id, name, code, capacity, location, amenities, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertHall.run(
      1,
      'Sir Vishveshwarya Conference Hall',
      'MGM-SVCH-01',
      350,
      'Administrative & Academic Block, MGM College Of Engineering, Nanded',
      'Dolby Digital Sound, HD Laser Projector, Centralized Air Conditioning, Executive Stage Podium, Wireless Mics, Live Stream Ready',
      '/images/auditorium.jpg'
    );
  } else {
    // Update Hall 1 to be Sir Vishveshwarya Conference Hall
    db.prepare(`
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

  // Configurable Admin Credentials (Supports environment variables for deployment):
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 's25_suryawanshi_sanket@mgmcen.ac.in';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Sanket@123';

  // Ensure Admin account exists or updates with the credentials above
  const adminRow = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
  const salt = bcrypt.genSaltSync(10);
  const hashedAdminPass = bcrypt.hashSync(ADMIN_PASSWORD, salt);

  if (!adminRow) {
    const insertAdmin = db.prepare(`
      INSERT INTO users (name, email, password, role, department, faculty_id, phone)
      VALUES (?, ?, ?, 'admin', 'Administration', 'MGM-ADM-001', '9876543210')
    `);
    insertAdmin.run('Campus Administrator', ADMIN_EMAIL.trim().toLowerCase(), hashedAdminPass);
  } else {
    // Keep updated if changed in this file
    db.prepare(`
      UPDATE users 
      SET email = ?, password = ? 
      WHERE role = 'admin'
    `).run(ADMIN_EMAIL.trim().toLowerCase(), hashedAdminPass);
  }
}


initDatabase();

module.exports = db;
