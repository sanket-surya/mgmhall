const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { syncApprovedBookingsToExcel, getExcelFilePath } = require('./excelService');
const {
  getSmtpConfig,
  sendBookingRequestNotification,
  sendBookingStatusNotification,
  sendEventReminderNotification,
  sendFacultyApprovedNotification
} = require('./emailService');

const app = express();
const PORT = process.env.PORT || 3000;

// Standardized departments list for MGM's College Of Engineering Nanded
const ALLOWED_DEPARTMENTS = [
  'Computer Science & Engineering (CSE)',
  'Artificial Intelligence & Data Science (AI & DS)',
  'Automation & Robotics (A&R)',
  'Information Technology (IT)',
  'Electronics & Telecommunication (ENTC)',
  'Mechanical Engineering (MECH)',
  'Civil Engineering (CIVIL)',
  'Electrical Engineering (EE)',
  'Chemical Engineering (CHEM)',
  'Applied Sciences & Humanities (FE)'
];

// Production reverse proxy support (Render, Railway, Nginx, HTTPS)
app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session configuration
const SESSION_SECRET = process.env.SESSION_SECRET || 'mgm_nanded_autonomous_secret_2025_98127391';
app.use(session({
  name: 'mgm_session_id',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: 'auto', // Automatically uses secure cookies if request is HTTPS, works locally & in production
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  }
}));

// Cloud deployment health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: "MGM's CEN Conference Hall Portal",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Prevent browser caching for sensitive pages and back-button issues
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Direct entry: redirect root '/' directly to '/login.html'
app.get('/', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard.html');
  }
  return res.redirect('/login.html');
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({
    success: false,
    message: 'System issue: Session expired. Please log in again.'
  });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: 'System issue: Administrative privileges required.'
  });
}

// -------------------------------------------------------------
// METADATA & DEPARTMENTS API
// -------------------------------------------------------------
app.get('/api/departments', (req, res) => {
  return res.json({
    success: true,
    departments: ALLOWED_DEPARTMENTS
  });
});

// -------------------------------------------------------------
// AUTHENTICATION ROUTES
// -------------------------------------------------------------

// Faculty / Staff Registration (Protected by Faculty Key)
app.post('/api/auth/register', (req, res) => {
  try {
    const { name, email, password, department, faculty_id, phone, faculty_key } = req.body;

    if (!name || !email || !password || !department || !faculty_id) {
      return res.status(400).json({
        success: false,
        message: 'System issue: Please fill in all required fields.'
      });
    }

    if (!ALLOWED_DEPARTMENTS.includes(department.trim())) {
      return res.status(400).json({
        success: false,
        message: 'System issue: Please select a valid department from the dropdown list.'
      });
    }

    // Faculty Key verification
    const settingStmt = db.prepare('SELECT value FROM system_settings WHERE key = ?');
    const secretRow = settingStmt.get('faculty_secret_key');
    const expectedKey = secretRow ? secretRow.value : 'MGM@FACULTY#2025';

    if (!faculty_key || faculty_key.trim() !== expectedKey.trim()) {
      return res.status(403).json({
        success: false,
        message: 'System issue: Invalid Faculty Authorization Key. Unauthorized access is restricted.'
      });
    }

    // Check if user already exists
    const checkStmt = db.prepare('SELECT id FROM users WHERE email = ?');
    const existing = checkStmt.get(email.trim().toLowerCase());
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'System issue: An account with this email address already exists.'
      });
    }

    // Hash password
    const hashedPassword = bcrypt.hashSync(password, 10);

    const insertStmt = db.prepare(`
      INSERT INTO users (name, email, password, role, department, faculty_id, phone, status)
      VALUES (?, ?, ?, 'faculty', ?, ?, ?, 'pending')
    `);

    insertStmt.run(
      name.trim(),
      email.trim().toLowerCase(),
      hashedPassword,
      department.trim(),
      faculty_id.trim().toUpperCase(),
      phone ? phone.trim() : ''
    );

    // Registration requires admin approval: do NOT auto-login
    return res.json({
      success: true,
      pending_approval: true,
      message: 'नोंदणी अर्ज यशस्वीरित्या सादर करण्यात आला आहे! Admin (Estate Office) कडून मंजुरी (Approval) मिळाल्यावर तुम्ही लॉगिन करू शकाल.'
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'System issue. Please try again later.'
    });
  }
});

// Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'System issue: Email and password are required.'
      });
    }

    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    const user = stmt.get(email.trim().toLowerCase());

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'System issue: Invalid email or password credentials.'
      });
    }

    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'System issue: Invalid email or password credentials.'
      });
    }

    // Check faculty approval status
    if (user.role === 'faculty') {
      if (user.status === 'pending') {
        return res.status(403).json({
          success: false,
          status_pending: true,
          message: 'तुमचे खाते Admin मंजुरीच्या प्रतीक्षेत आहे (Pending Admin Approval). Admin कडून मंजुरी मिळाल्यावर तुम्ही लॉगिन करू शकाल.'
        });
      }
      if (user.status === 'rejected') {
        return res.status(403).json({
          success: false,
          status_rejected: true,
          message: 'तुमचा नोंदणी अर्ज Admin कडून नाकारला गेला आहे (Registration Rejected). कृपया अधिक माहितीसाठी Admin शी संपर्क साधा.'
        });
      }
    }

    // Set session
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      faculty_id: user.faculty_id
    };

    return res.json({
      success: true,
      message: 'Authentication successful.',
      user: req.session.user
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'System issue. Please try again later.'
    });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(() => {
      res.clearCookie('mgm_session_id');
      return res.json({
        success: true,
        message: 'Session terminated successfully.'
      });
    });
  } else {
    res.clearCookie('mgm_session_id');
    return res.json({
      success: true,
      message: 'Session terminated successfully.'
    });
  }
});

// Current User Profile
app.get('/api/auth/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({
      success: true,
      authenticated: true,
      user: req.session.user
    });
  }
  return res.json({
    success: false,
    authenticated: false
  });
});

// -------------------------------------------------------------
// HALL MANAGEMENT & AVAILABILITY
// -------------------------------------------------------------

// Get list of halls
app.get('/api/halls', (req, res) => {
  try {
    const stmt = db.prepare("SELECT * FROM halls WHERE status = 'active' ORDER BY id ASC");
    const halls = stmt.all();
    return res.json({ success: true, halls });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'System issue. Please try again later.'
    });
  }
});

// Get hall availability for a specific date
app.get('/api/halls/:id/availability', (req, res) => {
  try {
    const hallId = req.params.id;
    const date = req.query.date;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'System issue: Date parameter is required.'
      });
    }

    const stmt = db.prepare(`
      SELECT booking_ref, event_title, department, booking_date, start_time, end_time, status
      FROM bookings
      WHERE hall_id = ? AND booking_date = ? AND status != 'Rejected'
      ORDER BY start_time ASC
    `);

    const bookings = stmt.all(hallId, date);
    return res.json({ success: true, bookings });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'System issue. Please try again later.'
    });
  }
});

// -------------------------------------------------------------
// BOOKING ROUTES
// -------------------------------------------------------------

// Submit a new booking
app.post('/api/bookings', requireAuth, (req, res) => {
  try {
    const {
      hall_id,
      event_title,
      event_type,
      booking_date,
      start_time,
      end_time,
      expected_attendees,
      requirements
    } = req.body;

    if (!hall_id || !event_title || !event_type || !booking_date || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: 'System issue: Missing required booking parameters.'
      });
    }

    if (start_time >= end_time) {
      return res.status(400).json({
        success: false,
        message: 'System issue: End time must be later than start time.'
      });
    }

    const today = new Date().toISOString().split('T')[0];
    if (booking_date < today) {
      return res.status(400).json({
        success: false,
        message: 'System issue: Selected booking date cannot be in the past.'
      });
    }

    // Check time conflict with existing pending or approved bookings
    const conflictStmt = db.prepare(`
      SELECT id, event_title, start_time, end_time, status
      FROM bookings
      WHERE hall_id = ? 
        AND booking_date = ? 
        AND status IN ('Pending', 'Approved')
        AND NOT (end_time <= ? OR start_time >= ?)
    `);

    const conflict = conflictStmt.get(hall_id, booking_date, start_time, end_time);

    if (conflict) {
      return res.status(409).json({
        success: false,
        message: `System issue: Slot conflicts with an existing reservation (${conflict.start_time} - ${conflict.end_time}). Please choose another slot.`
      });
    }

    const bookingRef = 'MGM-BK-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(100 + Math.random() * 900);

    const insertStmt = db.prepare(`
      INSERT INTO bookings (
        booking_ref, hall_id, user_id, faculty_name, department, 
        event_title, event_type, booking_date, start_time, end_time, 
        expected_attendees, requirements, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')
    `);

    insertStmt.run(
      bookingRef,
      hall_id,
      req.session.user.id,
      req.session.user.name,
      req.session.user.department,
      event_title.trim(),
      event_type.trim(),
      booking_date,
      start_time,
      end_time,
      expected_attendees ? parseInt(expected_attendees, 10) : 0,
      requirements ? requirements.trim() : ''
    );

    // Asynchronously dispatch booking request email (Safe background fire-and-forget)
    sendBookingRequestNotification({
      booking_ref: bookingRef,
      hall_name: 'Sir Vishveshwarya Conference Hall',
      faculty_name: req.session.user.name,
      department: req.session.user.department,
      event_title: event_title.trim(),
      event_type: event_type.trim(),
      booking_date,
      start_time,
      end_time
    }, req.session.user.email).catch(() => {});

    return res.json({
      success: true,
      message: 'Hall reservation request submitted successfully. Awaiting administrative approval.',
      booking_ref: bookingRef
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'System issue. Please try again later.'
    });
  }
});

// Get user's own bookings
app.get('/api/bookings/my', requireAuth, (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT b.*, h.name as hall_name, h.location as hall_location
      FROM bookings b
      JOIN halls h ON b.hall_id = h.id
      WHERE b.user_id = ?
      ORDER BY b.booking_date DESC, b.start_time DESC
    `);

    const bookings = stmt.all(req.session.user.id);
    return res.json({ success: true, bookings });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'System issue. Please try again later.'
    });
  }
});

// Admin: Get all bookings
app.get('/api/bookings/all', requireAdmin, (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT b.*, h.name as hall_name, h.location as hall_location, u.faculty_id, u.phone
      FROM bookings b
      JOIN halls h ON b.hall_id = h.id
      JOIN users u ON b.user_id = u.id
      ORDER BY b.booking_date DESC, b.start_time DESC
    `);

    const bookings = stmt.all();
    return res.json({ success: true, bookings });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'System issue. Please try again later.'
    });
  }
});

// Admin: Update booking status (Approved / Rejected) -> AUTO EXCEL SYNC
app.patch('/api/bookings/:id/status', requireAdmin, (req, res) => {
  try {
    const { status, admin_remarks } = req.body;
    const bookingId = req.params.id;

    if (!['Approved', 'Rejected', 'Pending'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'System issue: Invalid status update parameter.'
      });
    }

    const stmt = db.prepare(`
      UPDATE bookings 
      SET status = ?, admin_remarks = ?
      WHERE id = ?
    `);

    stmt.run(status, admin_remarks || '', bookingId);

    // Query booking detail with faculty email
    const bookingDetail = db.prepare(`
      SELECT b.*, h.name as hall_name, u.email
      FROM bookings b
      JOIN halls h ON b.hall_id = h.id
      JOIN users u ON b.user_id = u.id
      WHERE b.id = ?
    `).get(bookingId);

    // AUTO-SYNC TO EXCEL SHEET WHEN STATUS IS APPROVED
    if (status === 'Approved') {
      const approvedQuery = db.prepare(`
        SELECT b.*, h.name as hall_name, h.location as hall_location, u.faculty_id, u.phone
        FROM bookings b
        JOIN halls h ON b.hall_id = h.id
        JOIN users u ON b.user_id = u.id
        WHERE b.status = 'Approved'
        ORDER BY b.booking_date DESC, b.start_time DESC
      `);
      const allApproved = approvedQuery.all();
      syncApprovedBookingsToExcel(allApproved);
    }

    // Send official email status notification to faculty (Safe background fire-and-forget)
    if (bookingDetail) {
      sendBookingStatusNotification(bookingDetail, status, admin_remarks).catch(() => {});
    }

    return res.json({
      success: true,
      message: `Reservation status updated to ${status}. ${status === 'Approved' ? 'Entry synchronized to Excel and notification dispatched.' : 'Status notification dispatched.'}`
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'System issue. Please try again later.'
    });
  }
});

// Admin: Send on-demand event reminder email
app.post('/api/bookings/:id/remind', requireAdmin, async (req, res) => {
  try {
    const booking = db.prepare(`
      SELECT b.*, h.name as hall_name, u.email
      FROM bookings b
      JOIN halls h ON b.hall_id = h.id
      JOIN users u ON b.user_id = u.id
      WHERE b.id = ?
    `).get(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'System issue: Booking record not found.'
      });
    }

    const emailRes = await sendEventReminderNotification(booking);
    return res.json({
      success: true,
      message: emailRes.success
        ? `Official reminder email dispatched to ${booking.faculty_name} (${booking.email}).`
        : `Reminder logged. (${emailRes.reason})`
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: 'System issue sending reminder notice.'
    });
  }
});

// Admin: Get SMTP configuration
app.get('/api/admin/smtp', requireAdmin, (req, res) => {
  try {
    const config = getSmtpConfig();
    return res.json({
      success: true,
      config: {
        host: config.host,
        port: config.port,
        user: config.user,
        senderName: config.senderName,
        isConfigured: !!(config.user && config.pass)
      }
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'System issue.' });
  }
});

// Admin: Update SMTP configuration
app.post('/api/admin/smtp', requireAdmin, (req, res) => {
  try {
    const { host, port, user, pass, senderName } = req.body;

    const setSetting = (key, val) => {
      const stmt = db.prepare('INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?');
      stmt.run(key, val, val);
    };

    if (host) setSetting('smtp_host', host.trim());
    if (port) setSetting('smtp_port', String(port).trim());
    if (user) setSetting('smtp_user', user.trim());
    if (pass) setSetting('smtp_pass', pass.trim());
    if (senderName) setSetting('smtp_sender_name', senderName.trim());

    return res.json({
      success: true,
      message: 'SMTP Email settings saved successfully.'
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'System issue updating SMTP settings.' });
  }
});

// Admin: Export/Download Excel Sheet directly
app.get('/api/admin/export-excel', requireAdmin, (req, res) => {
  try {
    const approvedQuery = db.prepare(`
      SELECT b.*, h.name as hall_name, h.location as hall_location, u.faculty_id, u.phone
      FROM bookings b
      JOIN halls h ON b.hall_id = h.id
      JOIN users u ON b.user_id = u.id
      WHERE b.status = 'Approved'
      ORDER BY b.booking_date DESC, b.start_time DESC
    `);
    const allApproved = approvedQuery.all();
    syncApprovedBookingsToExcel(allApproved);

    const filePath = getExcelFilePath();
    if (fs.existsSync(filePath)) {
      return res.download(filePath, 'MGM_Nanded_Approved_Hall_Bookings.xlsx');
    } else {
      return res.status(404).json({
        success: false,
        message: 'System issue: No approved bookings available to export.'
      });
    }
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'System issue. Please try again later.'
    });
  }
});

// -------------------------------------------------------------
// ADMIN FACULTY APPROVAL & MANAGEMENT
// -------------------------------------------------------------

// Admin: Get all pending faculty registrations
app.get('/api/admin/faculty/pending', requireAdmin, (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT id, name, email, department, faculty_id, phone, status, created_at
      FROM users
      WHERE role = 'faculty' AND status = 'pending'
      ORDER BY created_at DESC
    `);
    const pendingFaculty = stmt.all();
    return res.json({ success: true, pendingFaculty });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'System issue. Please try again later.'
    });
  }
});

// Admin: Get all faculty members
app.get('/api/admin/faculty/all', requireAdmin, (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT id, name, email, department, faculty_id, phone, status, created_at
      FROM users
      WHERE role = 'faculty'
      ORDER BY created_at DESC
    `);
    const faculty = stmt.all();
    return res.json({ success: true, faculty });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'System issue. Please try again later.'
    });
  }
});

// Admin: Approve faculty registration
app.patch('/api/admin/faculty/:id/approve', requireAdmin, async (req, res) => {
  try {
    const facultyId = req.params.id;
    const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'faculty'").get(facultyId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'System issue: Faculty account record not found.'
      });
    }

    db.prepare("UPDATE users SET status = 'approved' WHERE id = ?").run(facultyId);

    // Send email notification to the faculty member (Safe background fire-and-forget)
    sendFacultyApprovedNotification(user).catch(() => {});

    return res.json({
      success: true,
      message: `${user.name} यांचे शिक्षक खाते मंजूर (Approved) करण्यात आले आहे.`
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'System issue approving faculty account.'
    });
  }
});

// Admin: Reject faculty registration
app.patch('/api/admin/faculty/:id/reject', requireAdmin, (req, res) => {
  try {
    const facultyId = req.params.id;
    const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'faculty'").get(facultyId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'System issue: Faculty account record not found.'
      });
    }

    db.prepare("UPDATE users SET status = 'rejected' WHERE id = ?").run(facultyId);

    return res.json({
      success: true,
      message: `${user.name} यांचा नोंदणी अर्ज नाकारण्यात आला (Rejected).`
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'System issue rejecting faculty account.'
    });
  }
});

// -------------------------------------------------------------
// ADMIN ANALYTICS & SYSTEM SETTINGS
// -------------------------------------------------------------

// Admin Dashboard Analytics
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  try {
    const totalBookings = db.prepare('SELECT COUNT(*) as count FROM bookings').get().count;
    const pendingBookings = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status = 'Pending'").get().count;
    const approvedBookings = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status = 'Approved'").get().count;
    const totalFaculty = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'faculty'").get().count;
    const pendingFaculty = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'faculty' AND status = 'pending'").get().count;
    const approvedFaculty = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'faculty' AND status = 'approved'").get().count;
    const totalHalls = db.prepare("SELECT COUNT(*) as count FROM halls WHERE status = 'active'").get().count;

    return res.json({
      success: true,
      stats: {
        totalBookings,
        pendingBookings,
        approvedBookings,
        totalFaculty,
        pendingFaculty,
        approvedFaculty,
        totalHalls
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'System issue. Please try again later.'
    });
  }
});

// Get Faculty Authorization Key (Admin only)
app.get('/api/admin/faculty-key', requireAdmin, (req, res) => {
  try {
    const stmt = db.prepare('SELECT value FROM system_settings WHERE key = ?');
    const row = stmt.get('faculty_secret_key');
    return res.json({
      success: true,
      faculty_key: row ? row.value : 'MGM@FACULTY#2025'
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'System issue. Please try again later.'
    });
  }
});

// Update Faculty Authorization Key (Admin only)
app.post('/api/admin/faculty-key', requireAdmin, (req, res) => {
  try {
    const { faculty_key } = req.body;
    if (!faculty_key || faculty_key.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: 'System issue: Key must be at least 5 characters.'
      });
    }

    const stmt = db.prepare('UPDATE system_settings SET value = ? WHERE key = ?');
    stmt.run(faculty_key.trim(), 'faculty_secret_key');

    return res.json({
      success: true,
      message: 'Faculty authorization key updated successfully.'
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'System issue. Please try again later.'
    });
  }
});

// Fallback 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'System issue: Requested endpoint not found.'
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  res.status(500).json({
    success: false,
    message: 'System issue. Please try again later.'
  });
});

// Global Process Protection (Guarantees zero-crash resilience in production)
process.on('unhandledRejection', () => {
  // Gracefully prevent unhandled rejection crashes
});

process.on('uncaughtException', () => {
  // Gracefully prevent sudden process exits
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`MGM Nanded Portal running on port ${PORT}\n`);
});
