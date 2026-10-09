# Official Deployment Guide: MGM's College Of Engineering Nanded
## Sir Vishveshwarya Conference Hall Booking System

This project is fully production-ready with:
- Standardized `npm start` script (`node server.js`)
- Cloud `Procfile` for Web Services
- Pre-configured `.gitignore` to prevent uploading `node_modules`
- Listening on `0.0.0.0` for LAN and Cloud compatibility
- Real-time Excel synchronization (`data/Approved_Bookings_MGMCEN.xlsx`)

---

## 🌐 Option 1: Free Cloud Deployment (Render.com / Railway) — Recommended
This gives you an official live **HTTPS** link that faculty members can open on mobile or desktop anywhere.

### Step 1: Initialize Git and Push to GitHub
Open PowerShell in `C:\Users\Asus\Desktop\mgm` and run:
```powershell
git init
git add .
git commit -m "MGM College of Engineering Nanded Hall Booking System"
git branch -M main
```
Create a new repository on your GitHub (e.g. `mgmcen-hall-booking`) and run:
```powershell
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/mgmcen-hall-booking.git
git push -u origin main
```

### Step 2: Deploy on Render (Free)
1. Go to [render.com](https://render.com) and sign in.
2. Click **New +** -> **Web Service**.
3. Select your GitHub repository (`mgmcen-hall-booking`).
4. Settings:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. **CRITICAL Environment Variables (Add under "Environment" tab):**
   - `NODE_VERSION` = `22` *(Mandatory for built-in SQLite engine)*
   - `NODE_ENV` = `production`
   - `SESSION_SECRET` = *(Any random string, e.g. `mgm_nanded_secret_2026`)*
   - `ADMIN_EMAIL` = `s25_suryawanshi_sanket@mgmcen.ac.in`
   - `ADMIN_PASSWORD` = `Sanket@123`
6. **Data Persistence (Disks tab - Recommended):**
   - Render's root file system is ephemeral on free tier. To keep the database (`mgm.sqlite`) and Excel files permanently safe across restarts:
   - Go to **Disks** tab -> **Add Disk** -> Mount Path: `/opt/render/project/src/data` (Size: 1 GB is plenty).
7. **Keep-Alive (Prevent Free-Tier Sleep):**
   - We added a lightweight `/api/health` endpoint.
   - You can enter `https://your-app.onrender.com/api/health` into a free monitor like [cron-job.org](https://cron-job.org) or [uptimerobot.com](https://uptimerobot.com) (every 10 minutes) so your website NEVER goes to sleep and opens instantly for all professors!
8. Click **Deploy Web Service**.
9. Within 2 minutes, you will receive an official live HTTPS URL:
   `https://mgmcen-hall-booking.onrender.com`

*(You can also map a custom domain like `booking.mgmcen.ac.in` under Render's Custom Domains tab).*

---

## 🏫 Option 2: College Campus Intranet / Local Server Deployment
If you want the website to be accessible only inside the MGM college campus (via College Wi-Fi / LAN):

1. Find the IP address of the host machine:
   ```powershell
   ipconfig
   ```
   *(Look for `IPv4 Address`, e.g., `192.168.1.45`)*
2. Start the server using start.bat.
3. Any faculty member connected to the college Wi-Fi can open:
   ```
   http://192.168.1.45:3000
   ```

---

## 🖥️ Option 3: College Linux / Ubuntu Server (Production with PM2 & Nginx)
For official hosting on the college's dedicated server:

1. Install PM2 process manager:
   ```bash
   npm install -g pm2
   pm2 start server.js --name "mgmcen-booking"
   pm2 startup
   pm2 save
   ```
2. Configure NGINX Reverse Proxy:
   ```nginx
   server {
       server_name booking.mgmcen.ac.in;
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
3. Issue free SSL with Certbot:
   ```bash
   sudo certbot --nginx -d booking.mgmcen.ac.in
   ```
