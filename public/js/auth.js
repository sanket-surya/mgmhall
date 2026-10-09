// Authentication Logic with Session Cookie & Generic Error Handling

function showAlert(message, type = 'danger') {
  const alertBox = document.getElementById('alertBox');
  if (!alertBox) return;

  alertBox.className = `alert alert-${type}`;
  alertBox.textContent = message;
  alertBox.style.display = 'flex';
}

function clearAlert() {
  const alertBox = document.getElementById('alertBox');
  if (alertBox) {
    alertBox.style.display = 'none';
    alertBox.textContent = '';
  }
}

function switchAuthTab(tab) {
  clearAlert();
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  if (tab === 'login') {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
  } else {
    tabLogin.classList.remove('active');
    tabRegister.classList.add('active');
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
  }
}

// Session check to prevent back-button loops
async function verifyActiveSession() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated) {
        window.location.replace('/dashboard.html');
      }
    }
  } catch (err) {
    // Suppressed: Generic handling
  }
}

// Check session on initial load and on history back/forward navigation
document.addEventListener('DOMContentLoaded', verifyActiveSession);
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    verifyActiveSession();
  }
});

// Handle Login
async function handleLogin(e) {
  e.preventDefault();
  clearAlert();

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('btnLoginSubmit');

  btn.disabled = true;
  btn.innerText = 'Verifying...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success) {
      showAlert('Login successful. Redirecting to dashboard...', 'success');
      setTimeout(() => {
        window.location.replace('/dashboard.html');
      }, 500);
    } else {
      const alertType = data.status_pending ? 'warning' : 'danger';
      showAlert(data.message || 'System issue. Please verify your credentials.', alertType);
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In to Portal';
    }
  } catch (err) {
    showAlert('Network issue. Please verify your connection and try again.', 'danger');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In to Portal';
  }
}

// Handle Faculty Registration
async function handleRegister(e) {
  e.preventDefault();
  clearAlert();

  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const department = document.getElementById('regDept').value;
  const faculty_id = document.getElementById('regFacultyId').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const password = document.getElementById('regPassword').value;
  const faculty_key = document.getElementById('regFacultyKey').value.trim();
  const btn = document.getElementById('btnRegisterSubmit');

  if (!department) {
    showAlert('System issue: Please select your department from the dropdown list.', 'warning');
    return;
  }

  if (!faculty_key) {
    showAlert('System issue: Faculty Authorization Key is mandatory for registration.', 'warning');
    return;
  }

  btn.disabled = true;
  btn.innerText = 'Submitting Registration...';

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name,
        email,
        password,
        department,
        faculty_id,
        phone,
        faculty_key
      })
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success) {
      if (data.pending_approval) {
        document.getElementById('registerForm').reset();
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-user-check"></i> Register Faculty Account';
        showAlert('✅ नोंदणी अर्ज सादर झाला आहे! तुमचे खाते Admin मंजुरीच्या प्रतीक्षेत आहे (Pending Admin Approval). Admin ने मंजूर केल्यानंतर तुम्ही लॉगिन करू शकाल.', 'warning');
        setTimeout(() => {
          switchAuthTab('login');
        }, 3200);
      } else {
        showAlert('Faculty account registered successfully! Redirecting...', 'success');
        setTimeout(() => {
          window.location.replace('/dashboard.html');
        }, 700);
      }
    } else {
      showAlert(data.message || 'System issue. Registration could not be completed.', 'danger');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-user-check"></i> Register Faculty Account';
    }
  } catch (err) {
    showAlert('Network issue. Please check your network connection and retry.', 'danger');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-check"></i> Register Faculty Account';
  }
}
