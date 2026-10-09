// Faculty & Admin Dashboard Logic

let currentUser = null;
let hallsList = [];

// Generic Alert Display
function showDashboardAlert(message, type = 'danger') {
  const alertBox = document.getElementById('dashboardAlert');
  if (!alertBox) return;

  alertBox.className = `alert alert-${type}`;
  alertBox.textContent = message;
  alertBox.style.display = 'flex';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  setTimeout(() => {
    alertBox.style.display = 'none';
  }, 6000);
}

function showModalAlert(message, type = 'danger') {
  const box = document.getElementById('modalAlert');
  if (!box) return;

  box.className = `alert alert-${type}`;
  box.textContent = message;
  box.style.display = 'flex';
}

// Session check & Initialization
async function initDashboard() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) {
      window.location.replace('/login.html');
      return;
    }

    const data = await res.json();
    if (!data.authenticated || !data.user) {
      window.location.replace('/login.html');
      return;
    }

    currentUser = data.user;
    renderUserInfo();
    await loadHalls();
    await loadMyBookings();

    if (currentUser.role === 'admin') {
      document.getElementById('adminPanel').style.display = 'block';
      await loadAdminDashboard();
    }
  } catch (e) {
    showDashboardAlert('Network issue. Please refresh the page.', 'danger');
  }
}

// Window load and back/forward navigation sync
document.addEventListener('DOMContentLoaded', initDashboard);
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    initDashboard();
  }
});

// Render user profile info in navbar
function renderUserInfo() {
  document.getElementById('userFullName').textContent = currentUser.name;
  const roleLabel = currentUser.role === 'admin' ? 'Administrator' : 'Faculty';
  document.getElementById('userDeptBadge').textContent = `${currentUser.department} • ${roleLabel}`;

  // Prefill booking department dropdown to current user's department
  const bookDept = document.getElementById('bookDept');
  if (bookDept && currentUser.department) {
    bookDept.value = currentUser.department;
  }

  // Set min date for booking to today
  const bookDate = document.getElementById('bookDate');
  if (bookDate) {
    const today = new Date().toISOString().split('T')[0];
    bookDate.min = today;
    bookDate.value = today;
  }
}

// Logout
async function handleLogout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
  } catch (e) {
    // Suppress
  }
  window.location.replace('/login.html');
}

// Load Halls
async function loadHalls() {
  try {
    const res = await fetch('/api/halls');
    const data = await res.json();
    if (res.ok && data.success) {
      hallsList = data.halls;
      populateHallsUI();
    }
  } catch (e) {
    showDashboardAlert('System issue loading hall details.', 'danger');
  }
}

function populateHallsUI() {
  // Populate Select in Modal
  const select = document.getElementById('bookHall');
  select.innerHTML = '<option value="" disabled selected>-- Select Venue --</option>' +
    hallsList.map(h => `<option value="${h.id}">${h.name} (${h.capacity} seats)</option>`).join('');

  // Populate Hall Overview Cards in Faculty View
  const cardsContainer = document.getElementById('facultyHallsCards');
  if (cardsContainer) {
    cardsContainer.innerHTML = hallsList.map(h => `
      <div class="card" style="padding: 16px;">
        <h4 style="font-size: 1.05rem; margin-bottom: 6px;">${h.name}</h4>
        <div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 8px;">
          <i class="fas fa-users"></i> Capacity: <strong>${h.capacity}</strong> | <i class="fas fa-map-marker-alt"></i> ${h.location}
        </div>
        <p style="font-size: 0.8rem; color: var(--text-main); margin-bottom: 12px; background: #f8fafc; padding: 6px 10px; border-radius: 4px;">
          ${h.amenities}
        </p>
        <button class="btn btn-outline-dark btn-sm" style="width: 100%;" onclick="quickSelectHall(${h.id})">
          <i class="fas fa-calendar-plus"></i> Select & Book
        </button>
      </div>
    `).join('');
  }
}

function quickSelectHall(hallId) {
  openBookingModal();
  const select = document.getElementById('bookHall');
  select.value = hallId;
  checkSlotAvailability();
}

// Check real-time slot availability for selected hall & date
async function checkSlotAvailability() {
  const hallId = document.getElementById('bookHall').value;
  const date = document.getElementById('bookDate').value;
  const preview = document.getElementById('availabilityPreview');
  const list = document.getElementById('availabilitySlotsList');

  if (!hallId || !date) {
    preview.style.display = 'none';
    return;
  }

  try {
    const res = await fetch(`/api/halls/${hallId}/availability?date=${date}`);
    const data = await res.json();

    if (res.ok && data.success) {
      preview.style.display = 'block';
      if (data.bookings.length === 0) {
        list.innerHTML = '<span style="color: var(--success);"><i class="fas fa-check-circle"></i> All slots are completely available for this date.</span>';
      } else {
        list.innerHTML = data.bookings.map(b => `
          <div style="padding: 4px 0; border-bottom: 1px dashed #e2e8f0;">
            <strong style="color: var(--primary);">${b.start_time} - ${b.end_time}</strong>: ${b.event_title} (${b.department}) 
            <span class="status-badge ${b.status === 'Approved' ? 'status-approved' : 'status-pending'}" style="font-size: 0.7rem; padding: 1px 6px;">${b.status}</span>
          </div>
        `).join('');
      }
    }
  } catch (e) {
    // Suppress
  }
}

// Open / Close Booking Modal
function openBookingModal() {
  document.getElementById('modalAlert').style.display = 'none';
  document.getElementById('bookingModal').classList.add('active');
  checkSlotAvailability();
}

function closeBookingModal() {
  document.getElementById('bookingModal').classList.remove('active');
}

// Submit Booking Request
async function submitBooking(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSubmitBooking');
  btn.disabled = true;
  btn.innerText = 'Submitting Request...';

  const payload = {
    hall_id: parseInt(document.getElementById('bookHall').value, 10),
    event_title: document.getElementById('bookEventTitle').value.trim(),
    event_type: document.getElementById('bookEventType').value,
    department: document.getElementById('bookDept').value,
    booking_date: document.getElementById('bookDate').value,
    start_time: document.getElementById('bookStartTime').value,
    end_time: document.getElementById('bookEndTime').value,
    expected_attendees: parseInt(document.getElementById('bookAttendees').value, 10),
    requirements: document.getElementById('bookRequirements').value.trim()
  };

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success) {
      closeBookingModal();
      showDashboardAlert(data.message, 'success');
      document.getElementById('bookingForm').reset();
      renderUserInfo();
      await loadMyBookings();
      if (currentUser.role === 'admin') {
        await loadAdminDashboard();
      }
    } else {
      showModalAlert(data.message || 'System issue. Please try another time slot.', 'danger');
    }
  } catch (err) {
    showModalAlert('Network issue. Please check your internet connection.', 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check-circle"></i> Submit Reservation Request';
  }
}

// Load Faculty's Own Bookings
async function loadMyBookings() {
  try {
    const res = await fetch('/api/bookings/my', { credentials: 'include' });
    const data = await res.json();

    const tbody = document.getElementById('myBookingsTableBody');
    if (res.ok && data.success) {
      if (data.bookings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">No reservation requests placed yet. Click "Reserve a Conference Hall" above.</td></tr>';
        return;
      }

      tbody.innerHTML = data.bookings.map(b => {
        let badgeClass = 'status-pending';
        if (b.status === 'Approved') badgeClass = 'status-approved';
        if (b.status === 'Rejected') badgeClass = 'status-rejected';

        return `
          <tr>
            <td><code>${b.booking_ref}</code></td>
            <td><strong>${b.hall_name}</strong><br><small style="color: var(--text-muted);">${b.hall_location}</small></td>
            <td>${b.event_title}<br><small class="status-badge" style="background:#f1f5f9; color:var(--text-main);">${b.event_type}</small></td>
            <td>${b.booking_date}</td>
            <td><strong>${b.start_time} - ${b.end_time}</strong></td>
            <td>${b.department}</td>
            <td><span class="status-badge ${badgeClass}">${b.status}</span></td>
            <td><small>${b.admin_remarks || '—'}</small></td>
          </tr>
        `;
      }).join('');
    }
  } catch (e) {
    showDashboardAlert('System issue loading reservation history.', 'danger');
  }
}

// -------------------------------------------------------------
// ADMIN FUNCTIONALITY
// -------------------------------------------------------------
async function loadAdminDashboard() {
  await Promise.all([
    loadAdminStats(),
    loadPendingFaculty(),
    loadAdminBookings(),
    loadFacultySecretKey()
  ]);
}

async function loadAdminStats() {
  try {
    const res = await fetch('/api/admin/stats', { credentials: 'include' });
    const data = await res.json();
    if (res.ok && data.success) {
      document.getElementById('statTotalBookings').textContent = data.stats.totalBookings;
      document.getElementById('statPendingBookings').textContent = data.stats.pendingBookings;
      document.getElementById('statApprovedBookings').textContent = data.stats.approvedBookings;
      document.getElementById('statPendingFaculty').textContent = data.stats.pendingFaculty || 0;
      document.getElementById('statTotalFaculty').textContent = data.stats.approvedFaculty || data.stats.totalFaculty;

      const badge = document.getElementById('pendingFacultyBadge');
      if (badge) {
        const count = data.stats.pendingFaculty || 0;
        badge.textContent = `${count} Awaiting Review`;
        badge.style.background = count > 0 ? '#fef3c7' : '#f1f5f9';
        badge.style.color = count > 0 ? '#b45309' : '#64748b';
      }
    }
  } catch (e) {
    // Suppress
  }
}

async function loadPendingFaculty() {
  try {
    const res = await fetch('/api/admin/faculty/pending', { credentials: 'include' });
    const data = await res.json();

    const tbody = document.getElementById('adminFacultyTableBody');
    if (!tbody) return;

    if (res.ok && data.success) {
      if (!data.pendingFaculty || data.pendingFaculty.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;"><i class="fas fa-check-circle" style="color: var(--success); margin-right: 6px;"></i> कोणतेही प्रलंबित शिक्षक नोंदणी अर्ज नाहीत (All faculty accounts are approved).</td></tr>';
        return;
      }

      tbody.innerHTML = data.pendingFaculty.map(f => {
        const regDate = f.created_at ? f.created_at.substring(0, 10) : '—';
        return `
          <tr>
            <td><strong>${f.name}</strong></td>
            <td><a href="mailto:${f.email}" style="color: var(--primary); text-decoration: underline;">${f.email}</a></td>
            <td><span class="badge" style="background: #e0f2fe; color: #0369a1; font-size: 0.78rem;">${f.department}</span></td>
            <td><code>${f.faculty_id}</code></td>
            <td>${f.phone || '—'}</td>
            <td><small style="color: var(--text-muted);">${regDate}</small></td>
            <td>
              <div style="display: flex; gap: 6px;">
                <button class="btn btn-success btn-sm" onclick="approveFaculty(${f.id}, '${f.name.replace(/'/g, "\\'")}')" title="Approve Faculty (मंजूर करा)">
                  <i class="fas fa-check"></i> Approve
                </button>
                <button class="btn btn-danger btn-sm" onclick="rejectFaculty(${f.id}, '${f.name.replace(/'/g, "\\'")}')" title="Reject Faculty (नाकारा)">
                  <i class="fas fa-times"></i> Reject
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (e) {
    showDashboardAlert('System issue loading pending faculty registrations.', 'danger');
  }
}

async function approveFaculty(userId, facultyName) {
  if (!confirm(`${facultyName} यांचे शिक्षक खाते मंजूर (Approve) करायचे आहे का? मंजुरीनंतर ते पोर्टलवर लॉगिन करू शकतील.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/faculty/${userId}/approve`, {
      method: 'PATCH',
      credentials: 'include'
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showDashboardAlert(data.message || `${facultyName} यांचे खाते मंजूर करण्यात आले.`, 'success');
      await loadAdminDashboard();
    } else {
      showDashboardAlert(data.message || 'System issue approving faculty.', 'danger');
    }
  } catch (e) {
    showDashboardAlert('Network issue approving faculty.', 'danger');
  }
}

async function rejectFaculty(userId, facultyName) {
  if (!confirm(`${facultyName} यांचा नोंदणी अर्ज नाकारायचा (Reject) आहे का?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/faculty/${userId}/reject`, {
      method: 'PATCH',
      credentials: 'include'
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showDashboardAlert(data.message || `${facultyName} यांचा अर्ज नाकारला गेला.`, 'warning');
      await loadAdminDashboard();
    } else {
      showDashboardAlert(data.message || 'System issue rejecting faculty.', 'danger');
    }
  } catch (e) {
    showDashboardAlert('Network issue rejecting faculty.', 'danger');
  }
}

async function loadFacultySecretKey() {
  try {
    const res = await fetch('/api/admin/faculty-key', { credentials: 'include' });
    const data = await res.json();
    if (res.ok && data.success) {
      document.getElementById('adminFacultyKeyInput').value = data.faculty_key;
    }
  } catch (e) {
    // Suppress
  }
}

async function saveAdminFacultyKey() {
  const newKey = document.getElementById('adminFacultyKeyInput').value.trim();
  if (!newKey) {
    showDashboardAlert('System issue: Key cannot be empty.', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/admin/faculty-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ faculty_key: newKey })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showDashboardAlert('Faculty Authorization Key updated successfully.', 'success');
    } else {
      showDashboardAlert(data.message || 'System issue updating key.', 'danger');
    }
  } catch (e) {
    showDashboardAlert('Network issue. Please try again.', 'danger');
  }
}

async function loadAdminBookings() {
  try {
    const res = await fetch('/api/bookings/all', { credentials: 'include' });
    const data = await res.json();

    const tbody = document.getElementById('adminBookingsTableBody');
    if (res.ok && data.success) {
      if (data.bookings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">No bookings found.</td></tr>';
        return;
      }

      tbody.innerHTML = data.bookings.map(b => {
        let badgeClass = 'status-pending';
        if (b.status === 'Approved') badgeClass = 'status-approved';
        if (b.status === 'Rejected') badgeClass = 'status-rejected';

        const actionButtons = b.status === 'Pending' ? `
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-success btn-sm" onclick="updateStatus(${b.id}, 'Approved')" title="Approve Request">
              <i class="fas fa-check"></i>
            </button>
            <button class="btn btn-danger btn-sm" onclick="updateStatus(${b.id}, 'Rejected')" title="Reject Request">
              <i class="fas fa-times"></i>
            </button>
          </div>
        ` : (b.status === 'Approved' ? `
          <button class="btn btn-outline-dark btn-sm" style="font-size: 0.76rem; padding: 3px 8px;" onclick="sendEmailReminder(${b.id})" title="Send Event Reminder Email to Faculty">
            <i class="fas fa-envelope"></i> Send Reminder
          </button>
        ` : `<span style="font-size: 0.8rem; color: var(--text-muted);">${b.status}</span>`);

        return `
          <tr>
            <td><code>${b.booking_ref}</code></td>
            <td><strong>${b.hall_name}</strong><br><small style="color: var(--text-muted);">${b.hall_location}</small></td>
            <td><strong>${b.faculty_name}</strong><br><small>${b.department}</small></td>
            <td>${b.event_title}<br><small style="color: var(--accent);">${b.event_type}</small></td>
            <td>${b.booking_date}<br><small><strong>${b.start_time} - ${b.end_time}</strong></small></td>
            <td>${b.expected_attendees || '—'}</td>
            <td><span class="status-badge ${badgeClass}">${b.status}</span></td>
            <td>${actionButtons}</td>
          </tr>
        `;
      }).join('');
    }
  } catch (e) {
    showDashboardAlert('System issue loading reservation requests.', 'danger');
  }
}

async function updateStatus(bookingId, status) {
  const remarks = status === 'Rejected' ? prompt('Enter reason for rejection (optional):') : 'Approved by Estate Administration';
  if (status === 'Rejected' && remarks === null) return;

  try {
    const res = await fetch(`/api/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status, admin_remarks: remarks || '' })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showDashboardAlert(`Reservation status set to ${status}.`, 'success');
      await loadAdminDashboard();
      await loadMyBookings();
    } else {
      showDashboardAlert(data.message || 'System issue updating status.', 'danger');
    }
  } catch (e) {
    showDashboardAlert('Network issue updating status.', 'danger');
  }
}

// Notice Modal Functions
function openNewNoticeModal() {
  document.getElementById('noticeModal').classList.add('active');
}

function closeNoticeModal() {
  document.getElementById('noticeModal').classList.remove('active');
}

async function submitNotice(e) {
  e.preventDefault();
  const title = document.getElementById('noticeTitle').value.trim();
  const category = document.getElementById('noticeCategory').value;
  const priority = document.getElementById('noticePriority').value;
  const content = document.getElementById('noticeContent').value.trim();

  try {
    const res = await fetch('/api/notices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title, category, priority, content })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      closeNoticeModal();
      showDashboardAlert('Official announcement published.', 'success');
      document.getElementById('noticeTitle').value = '';
      document.getElementById('noticeContent').value = '';
    } else {
      showDashboardAlert(data.message || 'System issue.', 'danger');
    }
  } catch (e) {
    showDashboardAlert('Network issue. Please try again.', 'danger');
  }
}

// -------------------------------------------------------------
// EMAIL NOTIFICATIONS & REMINDER FUNCTIONS
// -------------------------------------------------------------
async function sendEmailReminder(bookingId) {
  try {
    showDashboardAlert('Dispatching event reminder email...', 'warning');
    const res = await fetch(`/api/bookings/${bookingId}/remind`, {
      method: 'POST',
      credentials: 'include'
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showDashboardAlert(data.message, 'success');
    } else {
      showDashboardAlert(data.message || 'System issue sending reminder.', 'danger');
    }
  } catch (e) {
    showDashboardAlert('Network issue sending reminder.', 'danger');
  }
}

function openSmtpModal() {
  loadSmtpSettings();
  document.getElementById('smtpModal').classList.add('active');
}

function closeSmtpModal() {
  document.getElementById('smtpModal').classList.remove('active');
}

async function loadSmtpSettings() {
  try {
    const res = await fetch('/api/admin/smtp', { credentials: 'include' });
    const data = await res.json();
    if (res.ok && data.success && data.config) {
      document.getElementById('smtpHost').value = data.config.host || 'smtp.gmail.com';
      document.getElementById('smtpPort').value = data.config.port || 587;
      document.getElementById('smtpUser').value = data.config.user || '';
      document.getElementById('smtpSenderName').value = data.config.senderName || "MGM's College Of Engineering Nanded";
    }
  } catch (e) {
    // Suppress
  }
}

async function saveSmtpSettings(e) {
  e.preventDefault();
  const payload = {
    host: document.getElementById('smtpHost').value.trim(),
    port: parseInt(document.getElementById('smtpPort').value, 10),
    user: document.getElementById('smtpUser').value.trim(),
    pass: document.getElementById('smtpPass').value.trim(),
    senderName: document.getElementById('smtpSenderName').value.trim()
  };

  try {
    const res = await fetch('/api/admin/smtp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      closeSmtpModal();
      showDashboardAlert('SMTP Email credentials updated and active.', 'success');
    } else {
      showDashboardAlert(data.message || 'System issue saving SMTP settings.', 'danger');
    }
  } catch (e) {
    showDashboardAlert('Network issue saving SMTP settings.', 'danger');
  }
}
