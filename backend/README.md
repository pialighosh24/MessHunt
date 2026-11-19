# Mess Hunt — Backend API (Local Demo Mode)

Node.js + Express backend for Mess Hunt.

## Modes

- **`APP_MODE=local-demo` (current demo):** Uses a persistent file-backed JSON store. **No MongoDB connection.** No `MONGODB_URI` required. Local photo storage used for uploads.
- **`APP_MODE=mongo` (future):** Uses existing MongoDB/Mongoose implementation and Cloudinary photo flow (preserved in codebase).

## Local Demo Quick Start

```bash
cd backend
npm install
# Ensure .env has APP_MODE=local-demo and JWT_SECRET set

npm run admin:init:local      # create first admin (idempotent, env-provided)
npm run seed:local-demo       # seed demo/sample data only if store empty (idempotent)
npm start                     # or: npm run dev
```

- Server: `http://localhost:5000`
- Health: `GET /api/health` → `mode: local-demo`, `database.state: not_used`

## Scripts

- `npm start` / `npm run dev` — start server (respects `APP_MODE`)
- `npm run admin:init:local` — initialize first admin from `LOCAL_DEMO_ADMIN_*` env vars (local-demo only)
- `npm run seed:local-demo` — seed clearly labeled demo data when store is empty (local-demo only)
- `npm run reset:local-demo -- --confirm` — explicit reset with backup and confirmation prompt (local-demo only)
- `npm run start:local` / `npm run dev:local` — convenience aliases (set `APP_MODE=local-demo` in env)
- Mongo mode scripts preserved: `npm run seed:demo`, `npm run admin:create` (require MongoDB)

## Local Data Storage

- `backend/local-data/store/store.json` — persistent records (students, owners, admins, accommodations, reviews/reports, favourites)
- `backend/local-data/uploads/` — locally uploaded accommodation photos (served at `/api/local-uploads/...`)
- `backend/local-data/backups/` — automatic/manual backups
- Atomic temp-write + rename, serialized write queue, validation, no auto-reset on startup
- **Gitignored:** `backend/local-data/`

## Authentication & Security

- JWT auth (`Authorization: Bearer <token>`), role-based access control (student/owner/admin)
- Passwords hashed with bcryptjs; never stored/returned as plaintext
- No public admin registration; admin created via controlled init script
- Server-side validation and ownership/authorization checks
- No MongoDB/Atlas connection attempted in local-demo mode

## Key API Areas

- `POST /api/auth/student/register|login`, `POST /api/auth/owner/register|login`, `POST /api/auth/admin/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- Student: `/api/students/profile`, `/api/students/favourites`, `/api/students/favourites/:accommodationId`
- Owner: `/api/owners/accommodations`, `/api/owners/accommodations/:id`, photo upload/delete endpoints
- Public: `/api/accommodations`, `/api/accommodations/:id` (approved + available only)
- Reviews: `/api/accommodations/:id/reviews`, `/api/reviews/:reviewId`, `/api/reviews/:reviewId/report`
- Admin: `/api/admin/dashboard/stats`, student/owner/accommodation/review management and moderation endpoints

See `docs/api.md` for detailed contracts.

## Testing

- Local-demo smoke/integration verification performed during implementation (API flows, auth/RBAC, persistence, no MongoDB).
- Existing MongoDB-oriented test suites remain in `tests/` for mongo mode; live MongoDB/Cloudinary tests are blocked in this environment for mongo mode and not applicable to local-demo mode.

## Notes

- Do not commit `.env` or `local-data/`.
- For future migration to MongoDB/Cloudinary, set `APP_MODE=mongo` and configure `MONGODB_URI` and Cloudinary env vars.
