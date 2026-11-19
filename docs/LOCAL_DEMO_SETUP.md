# Mess Hunt — Local Demo Setup & Run Guide

This guide runs the complete Mess Hunt project in **LOCAL DEMO MODE** (no MongoDB, no Cloudinary).  
All three frontends use the same local Express API and the same persistent file-backed data store.

## 1. Prerequisites

- Node.js + npm installed
- Windows/macOS/Linux terminal
- For mobile testing on a physical device: Expo Go app and the phone on the same Wi-Fi/LAN as the backend computer
- **Not required:** MongoDB/MongoDB Atlas, Cloudinary account

## 2. Backend setup

```bash
cd backend
npm install
```

### Environment

- A local-demo `.env` is included for convenience (gitignored). Review it before running.
- Key settings:
  - `APP_MODE=local-demo` (required for no-MongoDB mode)
  - `PORT=5000`
  - `JWT_SECRET=...` (required)
  - `CORS_ORIGINS=http://localhost:5173,http://localhost:5174`
  - `LOCAL_DEMO_ADMIN_*` for first admin initialization
  - `LOCAL_DEMO_SEED_SAMPLE_DATA=true` (seed only when store is empty)

You can also copy `.env.example` to `.env` and adjust values.

### Initialize admin and demo data (safe/idempotent)

```bash
# Create first admin from env-provided credentials (no public admin registration)
npm run admin:init:local

# Seed clearly labeled demo/sample data only when store is empty
npm run seed:local-demo
```

### Start backend

```bash
npm start
# or: npm run dev
```

Verify:
- `http://localhost:5000/api/health` returns `"mode":"local-demo"` and `database.state:"not_used"` (MongoDB not connected)

### Persistence

- Store: `backend/local-data/store/store.json`
- Uploaded photos (local demo): `backend/local-data/uploads/`
- Backups: `backend/local-data/backups/`
- Data survives backend/computer restarts. No automatic reset on startup.
- Explicit reset (requires confirmation): `npm run reset:local-demo -- --confirm` (backs up first)

## 3. Owner dashboard

```bash
cd owner-dashboard
npm install
# Optional: copy .env.example to .env
npm run dev
```

- URL: `http://localhost:5173`
- API base: `VITE_API_BASE_URL` (default `http://localhost:5000/api`)

## 4. Admin dashboard

```bash
cd admin-dashboard
npm install
# Optional: copy .env.example to .env
npm run dev
```

- URL: `http://localhost:5174`
- API base: `VITE_API_BASE_URL` (default `http://localhost:5000/api`)

## 5. Mobile app (Expo Go)

```bash
cd mobile
npm install
```

Create `mobile/.env` from `mobile/.env.example` and set:

```env
EXPO_PUBLIC_API_BASE_URL=http://<YOUR_COMPUTER_LAN_IPV4>:5000/api
```

- Replace `<YOUR_COMPUTER_LAN_IPV4>` with your development computer's current LAN IP (e.g. `192.168.1.10`).
- Do **not** hardcode changing LAN IPs in source code; configure via `.env`.
- Do **not** use `localhost`/`127.0.0.1` on a physical phone.

Start Expo:

```bash
npx expo start -c
```

Scan/open in Expo Go on a device on the same network. If config is missing/placeholder, the app shows a helpful configuration screen.

## 6. Demo accounts

| Role | Email | Password | Notes |
|---|---|---|---|
| Admin | `admin@messhunt.local` | `Admin@12345` | Env-initialized admin (no public registration) |
| Student (demo) | `student.demo@messhunt.local` | `DemoPass123!` | Seeded sample/demo data |
| Owner (demo) | `owner.demo@messhunt.local` | `DemoPass123!` | Seeded sample/demo data |

## 7. Suggested end-to-end demo flow

1. Start backend (`APP_MODE=local-demo`), owner dashboard, admin dashboard, and mobile Expo.
2. (Optional) Register a new student in the mobile app and/or a new owner in the owner dashboard.
3. Login as owner → create a new accommodation listing (fills required fields) → upload photos (local storage) → listing becomes **pending**.
4. Login as admin → open Accommodations → **approve** the listing (or reject with reason).
5. Open student mobile app → Home → search/filter/sort → find the approved listing → open details.
6. In details: view info/photos, use Call/Maps actions (if available), add to **favourites**, submit a **review**.
7. Verify rating/review count updates; open **Favourites** and **Profile** screens.
8. Restart backend and verify accounts, listings, reviews, and favourites persist.
9. Verify permissions: student cannot access admin/owner operations; owner cannot modify others' listings (enforced by backend).

## 8. Testing commands

### Backend
- Start in local-demo mode: `cd backend && APP_MODE=local-demo npm start` (or use `.env`)
- Health check: `GET /api/health` should show local-demo mode and no MongoDB connection

### Mobile
```bash
cd mobile
npx expo install --check
npx expo-doctor
npx expo export -p android --output-dir .expo-export-final
```

### Dashboards
```bash
cd owner-dashboard && npm run build
cd admin-dashboard && npm run build
```

## 9. Troubleshooting

- **Mobile cannot connect:** ensure `EXPO_PUBLIC_API_BASE_URL` uses correct LAN IP and port, backend is running, firewall allows connections, device is on same network.
- **401/403:** token expired/invalid or insufficient role; re-login. Admin has no public registration.
- **Store issues:** data is in `backend/local-data/`; use explicit reset script only when needed.
- **MongoDB errors:** ensure `APP_MODE=local-demo` (backend must not connect to MongoDB in demo mode).

## 10. Notes

- Local demo data and uploads are gitignored (`backend/local-data/`).
- Passwords are hashed; no plaintext passwords, tokens, or secrets should be committed.
- For future MongoDB/Cloudinary mode, switch `APP_MODE` and configure credentials (existing implementations preserved).
