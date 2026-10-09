const nodemailer = require('nodemailer');
const db = require('./db');

/**
 * Retrieves current SMTP configuration from database
 */
function getSmtpConfig() {
  try {
    const getSetting = (key, defaultVal = '') => {
      const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
      return row ? row.value : defaultVal;
    };

    return {
      host: getSetting('smtp_host', 'smtp.gmail.com'),
      port: parseInt(getSetting('smtp_port', '587'), 10),
      user: getSetting('smtp_user', ''),
      pass: getSetting('smtp_pass', ''),
      senderName: getSetting('smtp_sender_name', "MGM's College Of Engineering Nanded")
    };
  } catch (e) {
    return {
      host: 'smtp.gmail.com',
      port: 587,
      user: '',
      pass: '',
      senderName: "MGM's College Of Engineering Nanded"
    };
  }
}

/**
 * Creates a Nodemailer transporter
 */
function createTransporter(config) {
  if (!config.user || !config.pass) {
    return null; // SMTP not configured yet
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });
}

/**
 * Generates official HTML email template
 */
function generateEmailHtml(title, subtitle, contentHtml, badgeText = 'OFFICIAL NOTICE', badgeColor = '#d97706') {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
      .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 14px rgba(0,0,0,0.06); }
      .header { background: #0f2744; color: #ffffff; padding: 28px 24px; text-align: center; }
      .header h1 { margin: 0 0 6px; font-size: 20px; font-weight: 800; letter-spacing: -0.3px; color: #ffffff; }
      .header p { margin: 0; font-size: 13px; color: #cbd5e1; text-transform: uppercase; letter-spacing: 1px; }
      .badge { display: inline-block; background: ${badgeColor}; color: #ffffff; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; margin-bottom: 12px; }
      .content { padding: 30px 24px; }
      .event-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 20px 0; }
      .table-meta { width: 100%; border-collapse: collapse; font-size: 13.5px; }
      .table-meta td { padding: 8px 6px; border-bottom: 1px solid #e2e8f0; }
      .table-meta td.label { font-weight: 700; color: #0f2744; width: 38%; }
      .footer { background: #f1f5f9; padding: 18px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <span class="badge">${badgeText}</span>
        <h1>MGM's College Of Engineering Nanded</h1>
        <p>Sir Vishveshwarya Conference Hall Portal</p>
      </div>
      <div class="content">
        <h2 style="font-size: 18px; color: #0f2744; margin-top: 0;">${title}</h2>
        <p style="font-size: 14px; color: #475569; line-height: 1.6;">${subtitle}</p>
        ${contentHtml}
      </div>
      <div class="footer">
        © 2026 Mahatma Gandhi Mission's College Of Engineering, Airport Road, Nanded - 431605.<br>
        This is an automated institutional notification from the Conference Hall Automation Portal.
      </div>
    </div>
  </body>
  </html>
  `;
}

/**
 * 1. Send Booking Request Confirmation (To Faculty & Admin)
 */
async function sendBookingRequestNotification(booking, userEmail) {
  const config = getSmtpConfig();
  const transporter = createTransporter(config);
  if (!transporter) return { success: false, reason: 'SMTP credentials not configured yet' };

  const detailsHtml = `
    <div class="event-card">
      <table class="table-meta">
        <tr><td class="label">Booking Ref:</td><td><strong>${booking.booking_ref}</strong></td></tr>
        <tr><td class="label">Venue:</td><td>${booking.hall_name || 'Sir Vishveshwarya Conference Hall'}</td></tr>
        <tr><td class="label">Event Title:</td><td>${booking.event_title}</td></tr>
        <tr><td class="label">Event Type:</td><td>${booking.event_type}</td></tr>
        <tr><td class="label">Date:</td><td>${booking.booking_date}</td></tr>
        <tr><td class="label">Time Slot:</td><td><strong>${booking.start_time} - ${booking.end_time}</strong></td></tr>
        <tr><td class="label">Department:</td><td>${booking.department}</td></tr>
        <tr><td class="label">Status:</td><td><strong style="color: #d97706;">PENDING APPROVAL</strong></td></tr>
      </table>
    </div>
    <p style="font-size: 13px; color: #64748b;">
      Your reservation request has been forwarded to the Principal & Estate Administration. You will receive an official notification once approved.
    </p>
  `;

  const html = generateEmailHtml(
    'Reservation Request Received',
    `Dear ${booking.faculty_name}, your conference hall reservation request has been successfully logged.`,
    detailsHtml,
    'REQUEST LOGGED',
    '#d97706'
  );

  try {
    await transporter.sendMail({
      from: `"${config.senderName}" <${config.user}>`,
      to: userEmail,
      subject: `[MGM Nanded] Hall Booking Request Received: ${booking.booking_ref}`,
      html
    });
    return { success: true };
  } catch (err) {
    return { success: false, reason: 'Network/SMTP delivery error' };
  }
}

/**
 * 2. Send Booking Status Update (Approved or Rejected)
 */
async function sendBookingStatusNotification(booking, status, remarks = '') {
  const config = getSmtpConfig();
  const transporter = createTransporter(config);
  if (!transporter) return { success: false, reason: 'SMTP not configured' };

  const isApproved = status === 'Approved';
  const badgeColor = isApproved ? '#059669' : '#dc2626';
  const badgeText = isApproved ? 'RESERVATION APPROVED' : 'REQUEST DECLINED';

  const detailsHtml = `
    <div class="event-card" style="border-left: 4px solid ${badgeColor};">
      <table class="table-meta">
        <tr><td class="label">Booking Ref:</td><td><strong>${booking.booking_ref}</strong></td></tr>
        <tr><td class="label">Venue:</td><td>${booking.hall_name || 'Sir Vishveshwarya Conference Hall'}</td></tr>
        <tr><td class="label">Event Title:</td><td>${booking.event_title}</td></tr>
        <tr><td class="label">Date:</td><td>${booking.booking_date}</td></tr>
        <tr><td class="label">Timing:</td><td><strong>${booking.start_time} - ${booking.end_time}</strong></td></tr>
        <tr><td class="label">Status:</td><td><strong style="color: ${badgeColor}; text-transform: uppercase;">${status}</strong></td></tr>
        <tr><td class="label">Administrative Remarks:</td><td>${remarks || (isApproved ? 'Approved by Estate & Principal Office' : 'Declined')}</td></tr>
      </table>
    </div>
    ${isApproved ? `
      <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 14px; font-size: 13px; color: #065f46;">
        <strong>✓ Institutional Protocol:</strong> Audio-Visual staff and Estate personnel will prepare Sir Vishveshwarya Conference Hall 30 minutes prior to your start time.
      </div>
    ` : ''}
  `;

  const html = generateEmailHtml(
    isApproved ? 'Conference Hall Reservation Confirmed' : 'Reservation Status Update',
    `Dear ${booking.faculty_name}, here is the official status regarding your reservation request.`,
    detailsHtml,
    badgeText,
    badgeColor
  );

  try {
    await transporter.sendMail({
      from: `"${config.senderName}" <${config.user}>`,
      to: booking.email,
      subject: `[MGM Nanded] Hall Reservation ${status}: ${booking.event_title} (${booking.booking_ref})`,
      html
    });
    return { success: true };
  } catch (err) {
    return { success: false, reason: 'SMTP delivery issue' };
  }
}

/**
 * 3. Send Upcoming Event Reminder (24h or On-Demand)
 */
async function sendEventReminderNotification(booking) {
  const config = getSmtpConfig();
  const transporter = createTransporter(config);
  if (!transporter) return { success: false, reason: 'SMTP not configured' };

  const detailsHtml = `
    <div class="event-card" style="border-left: 4px solid #2563eb;">
      <table class="table-meta">
        <tr><td class="label">Booking Ref:</td><td><strong>${booking.booking_ref}</strong></td></tr>
        <tr><td class="label">Venue:</td><td>${booking.hall_name || 'Sir Vishveshwarya Conference Hall'}</td></tr>
        <tr><td class="label">Event:</td><td><strong>${booking.event_title}</strong></td></tr>
        <tr><td class="label">Scheduled Date:</td><td><strong>${booking.booking_date}</strong></td></tr>
        <tr><td class="label">Scheduled Slot:</td><td><strong>${booking.start_time} to ${booking.end_time}</strong></td></tr>
        <tr><td class="label">Expected Attendees:</td><td>${booking.expected_attendees || 'N/A'}</td></tr>
        <tr><td class="label">AV / Setup:</td><td>${booking.requirements || 'Standard Podium & Projector'}</td></tr>
      </table>
    </div>
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px; font-size: 13px; color: #1e40af;">
      <strong>⏰ Reminder Notice:</strong> Please ensure your guest speakers and departmental coordinators report at the venue on schedule.
    </div>
  `;

  const html = generateEmailHtml(
    'Event Reminder Notice',
    `Dear ${booking.faculty_name}, this is a scheduled reminder for your upcoming event at Sir Vishveshwarya Conference Hall.`,
    detailsHtml,
    'EVENT REMINDER',
    '#2563eb'
  );

  try {
    await transporter.sendMail({
      from: `"${config.senderName}" <${config.user}>`,
      to: booking.email,
      subject: `[REMINDER] Upcoming Event at Sir Vishveshwarya Conference Hall: ${booking.event_title}`,
      html
    });
    return { success: true };
  } catch (err) {
    return { success: false, reason: 'SMTP delivery issue' };
  }
}

/**
 * 4. Send Faculty Registration Approval Notification
 */
async function sendFacultyApprovedNotification(user) {
  const config = getSmtpConfig();
  const transporter = createTransporter(config);
  if (!transporter) return { success: false, reason: 'SMTP not configured' };

  const detailsHtml = `
    <div class="event-card" style="border-left: 4px solid #16a34a;">
      <table class="table-meta">
        <tr><td class="label">Faculty Member:</td><td><strong>${user.name}</strong></td></tr>
        <tr><td class="label">Department:</td><td>${user.department}</td></tr>
        <tr><td class="label">Faculty ID:</td><td>${user.faculty_id}</td></tr>
        <tr><td class="label">Account Status:</td><td><strong style="color: #16a34a;">Approved / Active</strong></td></tr>
      </table>
    </div>
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; font-size: 13.5px; color: #166534; line-height: 1.5;">
      <strong>✅ Account Activated:</strong> You can now log in to the portal using your registered email and password to check slot availability and submit hall reservation requests for Sir Vishveshwarya Conference Hall.
    </div>
  `;

  const html = generateEmailHtml(
    'Faculty Registration Approved',
    `Dear ${user.name}, your faculty account for the MGMCEN Hall Reservation Portal has been approved by the Administration.`,
    detailsHtml,
    'ACCOUNT APPROVED',
    '#16a34a'
  );

  try {
    await transporter.sendMail({
      from: `"${config.senderName}" <${config.user}>`,
      to: user.email,
      subject: `[APPROVED] Faculty Registration Approved - MGM's CEN Hall Booking Portal`,
      html
    });
    return { success: true };
  } catch (err) {
    return { success: false, reason: 'SMTP delivery issue' };
  }
}

module.exports = {
  getSmtpConfig,
  sendBookingRequestNotification,
  sendBookingStatusNotification,
  sendEventReminderNotification,
  sendFacultyApprovedNotification
};
