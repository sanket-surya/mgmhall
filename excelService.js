const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const EXCEL_FILE_PATH = path.join(__dirname, 'data', 'Approved_Bookings_MGMCEN.xlsx');

/**
 * Syncs all approved bookings into the Excel sheet
 * @param {Array} approvedBookings - List of approved booking records with user and hall details
 */
function syncApprovedBookingsToExcel(approvedBookings) {
  try {
    const rows = approvedBookings.map((b, index) => ({
      'Sr. No.': index + 1,
      'Booking Reference': b.booking_ref,
      'Conference Hall': b.hall_name || 'Sir Vishveshwarya Conference Hall',
      'Event Title': b.event_title,
      'Event Type': b.event_type,
      'Faculty Name': b.faculty_name,
      'Department / Branch': b.department,
      'Faculty ID': b.faculty_id || 'N/A',
      'Contact Phone': b.phone || 'N/A',
      'Booking Date': b.booking_date,
      'Start Time': b.start_time,
      'End Time': b.end_time,
      'Expected Attendees': b.expected_attendees || 0,
      'Special AV Requirements': b.requirements || 'Standard Podium & Projector',
      'Status': 'APPROVED',
      'Approval Remarks': b.admin_remarks || 'Approved by Administration',
      'Approved On': new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    }));

    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Auto calculate column widths
    const colWidths = [
      { wch: 8 },  // Sr No
      { wch: 22 }, // Ref
      { wch: 34 }, // Hall
      { wch: 30 }, // Event Title
      { wch: 18 }, // Event Type
      { wch: 22 }, // Faculty Name
      { wch: 32 }, // Dept
      { wch: 15 }, // Faculty ID
      { wch: 15 }, // Phone
      { wch: 14 }, // Date
      { wch: 12 }, // Start
      { wch: 12 }, // End
      { wch: 18 }, // Attendees
      { wch: 35 }, // Requirements
      { wch: 12 }, // Status
      { wch: 30 }, // Remarks
      { wch: 22 }  // Approved On
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Approved Reservations');

    // Ensure data directory exists
    const dir = path.dirname(EXCEL_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write file to disk
    XLSX.writeFile(workbook, EXCEL_FILE_PATH);
    return true;
  } catch (err) {
    return false;
  }
}

const FACULTY_EXCEL_PATH = path.join(__dirname, 'data', 'Registered_Faculty_MGMCEN.xlsx');

/**
 * Syncs all faculty registrations into the Faculty Excel sheet
 * @param {Array} facultyList - List of registered faculty records
 */
function syncFacultyToExcel(facultyList) {
  try {
    const rows = facultyList.map((f, index) => ({
      'Sr. No.': index + 1,
      'Faculty Name': f.name,
      'Official Email': f.email,
      'Academic Department': f.department,
      'Faculty ID': f.faculty_id || 'N/A',
      'Contact Mobile': f.phone || 'N/A',
      'Approval Status': (f.status || 'pending').toUpperCase(),
      'Registration Timestamp': f.created_at || 'N/A'
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 8 },  // Sr No
      { wch: 25 }, // Name
      { wch: 32 }, // Email
      { wch: 36 }, // Dept
      { wch: 18 }, // Faculty ID
      { wch: 16 }, // Phone
      { wch: 18 }, // Status
      { wch: 24 }  // Timestamp
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Registered Professors');

    const dir = path.dirname(FACULTY_EXCEL_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    XLSX.writeFile(workbook, FACULTY_EXCEL_PATH);
    return true;
  } catch (err) {
    return false;
  }
}

function getExcelFilePath() {
  return EXCEL_FILE_PATH;
}

function getFacultyExcelPath() {
  return FACULTY_EXCEL_PATH;
}

module.exports = {
  syncApprovedBookingsToExcel,
  getExcelFilePath,
  syncFacultyToExcel,
  getFacultyExcelPath
};
