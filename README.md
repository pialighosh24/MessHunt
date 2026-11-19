# Mess Hunt — Find Your Perfect Mess

Mess Hunt is a BCA final-year accommodation discovery and management project with four applications:

- **`mobile/`** — Student app (Expo React Native, SDK 58)
- **`owner-dashboard/`** — Owner dashboard (React + Vite)
- **`admin-dashboard/`** — Admin dashboard (React + Vite)
- **`backend/`** — API server (Node.js + Express)

> **Local demo mode (current):** This workspace is configured for a **file-backed local demonstration** using `APP_MODE=local-demo`.  
> **MongoDB/MongoDB Atlas is NOT connected** in this mode. Data is persisted locally in `backend/local-data/` (JSON store + uploaded photos).  
> The existing MongoDB/Mongoose implementation remains in the codebase for future use but is not used while `APP_MODE=local-demo`.

## Architecture (Local Demo Mode)

- **Shared local API:** All three frontends communicate with the same Express backend (`http://<host>:5000/api`).
- **Persistent local data store:** File-backed JSON store at `backend/local-data/store/store.json` with atomic writes and serialized write locking. Survives backend/computer restarts.
- **Local photo storage:** Accommodation photos uploaded in local-demo mode are stored under `backend/local-data/uploads/` and served via controlled API static path (`/api/local-uploads/...`). Cloudinary implementation is preserved for future MongoDB mode.
- **Authentication:** JWT-based auth with role-based access control (student/owner/admin). Passwords are hashed with bcryptjs (never plaintext). No public admin registration.
- **No MongoDB connection:** In `APP_MODE=local-demo`, the server does **not** call MongoDB connection code and does **not** require `MONGODB_URI`.

## Prerequisites

- Node.js (LTS recommended) and npm
- For mobile: Expo Go on a physical Android device (same Wi-Fi network as the backend computer) or emulator
- No MongoDB/Atlas account required for local demo mode
- No Cloudinary account required for local demo mode

## Quick Start (Local Demo)

### 1) Backend (local API + persistent store)

```bash
cd backend
npm install
# Configure environment (a local-demo .env is provided; review before use)
# Ensure APP_MODE=local-demo and JWT_SECRET is set

# Initialize first admin (idempotent, uses LOCAL_DEMO_ADMIN_* from .env)
npm run admin:init:local

# Seed clearly labeled demo/sample data only when store is empty (idempotent)
npm run seed:local-demo

# Start server
npm start
# or: npm run dev
```

- API: `http://localhost:5000/api`
- Health: `http://localhost:5000/api/health` (reports `mode: local-demo`, `database.state: not_used`)

### 2) Owner Dashboard

```bash
cd owner-dashboard
npm install
# copy .env.example to .env if needed (default: http://localhost:5000/api)
npm run dev
```

- Default: `http://localhost:5173`

### 3) Admin Dashboard

```bash
cd admin-dashboard
npm install
# copy .env.example to .env if needed (default: http://localhost:5000/api)
npm run dev
```

- Default: `http://localhost:5174`

### 4) Student Mobile App (Expo)

```bash
cd mobile
npm install
# Create mobile/.env from mobile/.env.example and set:
# EXPO_PUBLIC_API_BASE_URL=http://<YOUR_COMPUTER_LAN_IP>:5000/api
npx expo start -c
```

- Open in **Expo Go** on a physical Android device connected to the same network.
- Do **not** use `localhost` on a physical device; use the computer's LAN IPv4 address.
- The app shows a helpful configuration screen if `EXPO_PUBLIC_API_BASE_URL` is missing or still a placeholder.

## Demo Accounts (Local Demo)

> Demo credentials below are for local demonstration only. Change/remove for any non-demo use.

| Role | Email | Password | Notes |
|---|---|---|---|
| Admin | `admin@messhunt.local` | `Admin@12345` | Created by `npm run admin:init:local` (env-configured). No public admin registration. |
| Student (demo/sample) | `student.demo@messhunt.local` | `DemoPass123!` | Seeded when store empty; clearly labeled demo data. |
| Owner (demo/sample) | `owner.demo@messhunt.local` | `DemoPass123!` | Seeded when store empty; clearly labeled demo data. |

You can also register new student/owner accounts via the mobile app or owner dashboard; they persist in the local store.

## Key Features (Implemented)

### Student Mobile App
- Welcome, Login, Registration (approved UI preserved)
- Home/discovery: search (city/locality), filters (type/gender/room/food/rent), sort (newest/rent/rating), clear/reset, recently added, accommodation cards, real API data, loading/empty/error/retry/refresh, pagination/load-more
- Accommodation details: photos/gallery (or placeholder), full listing info, call action, Google Maps action (when valid link), ratings/review count, reviews list
- Reviews: submit (one per accommodation per policy), edit/delete own review (session-tracked), report review
- Favourites: add/remove, favourites screen, navigation to details
- Profile: view/edit name & phone, logout, session restore
- Bottom tab navigation (Home/Favourites/Profile) + detail screen

### Owner Dashboard
- Owner registration/login, session persistence, protected routes, logout
- Overview: total/approved/pending/rejected/available listing counts
- Accommodation management: create/view/edit/delete (with confirmation), status and rejection reason visibility, availability updates, local photo upload/remove
- Comprehensive listing form aligned with accommodation schema and validation

### Admin Dashboard
- Secure admin login (no public registration), protected routes, session persistence
- Dashboard stats (students, owners, accommodations, reviews, pending reports, etc.)
- Student management: list/search, activate/deactivate
- Owner management: list, verification approve/reject (toggle), activate/deactivate
- Accommodation moderation: list/filter, approve, reject with meaningful reason
- Review moderation: view reported/all reviews, approve/retain or remove with note, handle report statuses

### Backend (Local Demo API)
- Shared endpoints for auth, student profile/favourites, public accommodations (search/filter/sort/pagination, approved+available only), reviews/reports/ratings aggregation, owner accommodation CRUD + local photo upload/delete, admin management/moderation/stats
- Role-based authorization and ownership checks enforced server-side
- Input validation and consistent error responses
- File-backed persistence with atomic writes and serialized write queue

## Testing Performed (this environment)

- **Backend local-demo smoke test (custom):** 17 PASS, 0 FAIL — health (no MongoDB), auth, RBAC, owner create/approve flow, public visibility, reviews/aggregation, favourites, stats, persistence file check.
- **Mobile:** `npx expo install --check` (pass), `npx expo-doctor` (20/20 pass), `npx expo export -p android --output-dir .expo-export-final` (pass).
- **Owner dashboard:** `npm run build` (pass).
- **Admin dashboard:** `npm run build` (pass).
- **Restart persistence:** verified student record persisted in `backend/local-data/store/store.json` after server stop/restart (file-backed).

**Blocked/Not performed in this environment:** physical-device Expo Go end-to-end runtime with live LAN connectivity (depends on user device/network), live MongoDB/Cloudinary tests (not applicable/intentionally not used in local-demo mode), automated RN UI/integration test harness not added.

## Known Limitations

- **Local demo only:** uses file-backed JSON storage, not MongoDB. Not production-ready.
- **Single-process/local use:** serialized write queue protects in-process concurrency; not designed for distributed/multi-instance deployment.
- **Photo storage:** local filesystem in demo mode (not Cloudinary).
- **Public review ownership:** public review responses do not expose student IDs; mobile "edit/delete my review" is tracked in-session after submission (API design constraint).
- **No excluded features:** payments, booking, chat, AI/ML, live GPS/geospatial distance not implemented.

## Future Migration to MongoDB + Cloudinary

1. Set `APP_MODE=mongo` in `backend/.env`.
2. Provide `MONGODB_URI`, JWT secrets, and Cloudinary credentials.
3. Use existing MongoDB/Mongoose routes/controllers/models and Cloudinary upload implementation (preserved in codebase).
4. Run/verify MongoDB-backed tests and live Cloudinary flows.
5. Migrate/seed data from local store to MongoDB if needed (separate migration script/tooling required).

## Documentation

- `docs/LOCAL_DEMO_ARCHITECTURE_PLAN.md` — local-demo architecture/strategy
- `docs/LOCAL_DEMO_SETUP.md` — step-by-step local demo setup and run guide
- `docs/api.md` — API reference (endpoints/behaviors; applies to local-demo-compatible contracts)
- `docs/setup-and-demo.md` — additional setup/demo notes
- `PROJECT_COMPLETION_AUDIT.md` — earlier baseline audit

## Safety Notes

- No MongoDB connection in local-demo mode.
- No plaintext passwords stored or exposed; secrets/tokens not logged.
- Local runtime data: `backend/local-data/` (gitignored). Reset only via explicit script with confirmation.
- Demo/seed data is clearly labeled where applicable.
