# Official Deployment Guide: MGM's College Of Engineering Nanded
## Sir Vishveshwarya Conference Hall Booking System

This project is fully production-ready with:
- Standardized `npm start` script (`node server.js`)
- Cloud `Procfile` for Web Services
- Pre-configured `.gitignore` to prevent uploading `node_modules`
- Listening on `0.0.0.0` for LAN and Cloud compatibility
- Real-time Excel synchronization (`data/Approved_Bookings_MGMCEN.xlsx`)

---

## 🌐 Option 1: Vercel Deployment (Super Fast & Free) — Recommended
Vercel वरून थेट एका क्लिकमध्ये लाईव्ह लिंक मिळते जी सीनियर किंवा प्राध्यापकांना लगेच शेअर करता येते.

### Vercel वर Deploy कसे करावे:
1. कोड GitHub वर पुश करा:
   ```bash
   git add .
   git commit -m "Update: Better-sqlite3 and Vercel serverless support"
   git push origin main
   ```
2. [vercel.com](https://vercel.com) वर जा आणि तुमच्या GitHub ने Login करा.
3. **"Add New..."** ➡️ **"Project"** वर क्लिक करा.
4. तुमची GitHub रिपॉझिटरी (`sanket-surya/mgmhall`) शोधा आणि **"Import"** वर क्लिक करा.
5. `vercel.json` आधीच कॉन्फिगर केलेला आहे, त्यामुळे कोणतीही अतिरिक्त सेटिंग न बदलता फक्त **"Deploy"** बटण दाबा.
6. अवघ्या १ मिनिटात तुम्हाला लाईव्ह लिंक मिळेल:
   `https://mgmhall.vercel.app` (किंवा तत्सम)

---

## 🌐 Option 2: Render.com Deployment (Fixed & Production Ready)
पूर्वी Render वर आलेली त्रुटी (`Error [ERR_UNKNOWN_BUILTIN_MODULE]: node:sqlite`) पूर्णपणे सोडवण्यात आली आहे. आता प्रोजेक्टमध्ये `better-sqlite3` वापरण्यात आला आहे, जो Render वर सुरळीत चालतो.

### Render वर Deploy कसे करावे:
1. कोड GitHub वर पुश करा (`git push origin main`).
2. Render Dashboard मध्ये तुमच्या `mgmcen-hall-booking` सेवेवर जा.
3. **"Manual Deploy"** ➡️ **"Deploy latest commit"** वर क्लिक करा (किंवा Git push मुळे आपोआप डिप्लॉय सुरू होईल).
4. आता कोणताही एरर न येता बिल्ड व रन पूर्ण यशस्वी होईल:
   `https://mgmcen-hall-booking.onrender.com`

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
