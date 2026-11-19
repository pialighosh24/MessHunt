# Mess Hunt — Local Demo Mode Architecture Plan (Milestone 1)

**Mode:** `APP_MODE=local-demo` (explicit, environment-controlled)  
**Date:** 2026-11-19  
**Status:** Inspection complete; implementation in progress (Milestone 2+)

## 1. Inspection summary

### Applications
- **`backend/` (Express, CommonJS):** MongoDB/Mongoose API (auth, student profile/favourites, owner accommodation CRUD, public search/details, reviews/reports/ratings aggregation, admin dashboard/stats/moderation, Cloudinary photo upload/delete), centralized errors, JWT auth, RBAC, seeds. Baseline tests: 137 PASS / 0 FAIL / 17 BLOCKED (live MongoDB/Cloudinary blocked).
- **`mobile/` (Expo SDK 58):** auth foundation + approved Welcome/Login/Register; Home placeholder; no discovery/details/reviews/favourites/profile integration yet.
- **`owner-dashboard/` / `admin-dashboard/` (React+Vite):** scaffolds only.

### Key backend coupling
- `server.js` requires MongoDB connection (`connectDB`/`MONGODB_URI`) before start; `health` reports Mongoose status.
- Controllers/middleware/utils/models are tightly coupled to Mongoose queries, documents, ObjectIds, aggregation, populate, and Cloudinary photo flows.
- Existing endpoint paths, auth/RBAC, validation, visibility rules, and response envelopes must be preserved for frontend reuse.

## 2. Selected strategy (safest, non-destructive)

1. **Explicit mode:** `APP_MODE=local-demo` gates all local-demo behavior. Default/mongo mode remains unchanged.
2. **Isolated local-demo backend implementation:** add `backend/src/local-demo/` containing file-backed store, local runtime/status, repositories/services, controllers, routes, upload handling, and scripts. In **local-demo mode** `app.js` mounts local-demo routes and `server.js` initializes local store **without any MongoDB connection**; in mongo mode existing routes/controllers/models behavior is preserved.
3. **Persistent file-backed store:** `backend/local-data/` (gitignored) with JSON collections for students, owners, admins, accommodations, reviews/reports, favourites-related state, verification/approval/status metadata, and audit timestamps. Atomic temp-write+rename, serialized writes (mutex/queue), input/reference/uniqueness validation, Mongo-compatible IDs, backups before migrations/explicit resets, no auto-reset on startup.
4. **Local photos:** secure local filesystem uploads/serving under gitignored local-data/uploads in local-demo mode (type/size/count/ownership/path-traversal checks, safe filenames, controlled static/API access, safe deletion). Keep Cloudinary code for future mongo mode.
5. **Auth/security parity:** bcrypt/bcryptjs hashes only, env-provided JWT secret/expiry, token/account-status validation, RBAC and ownership checks server-side, global email uniqueness, no public admin registration, controlled env-driven first-admin init (idempotent), no secrets/passwords/hashes in logs or responses.
6. **Demo data:** seed only when store empty with clearly labeled demo/sample records; idempotent init scripts.
7. **Frontend integration:** same local API/store for mobile, owner dashboard, admin dashboard. Fix mobile `EXPO_PUBLIC_API_BASE_URL` config/messaging, complete student flows, and implement owner/admin dashboards against preserved API contracts.
8. **Docs/tests:** honest local-demo documentation, env examples, run/test/demo instructions, BCA materials; run feasible tests and mark unavailable live/device tests BLOCKED.

## 3. Milestones
1. M1 Inspection + plan (done)
2. M2 Local data layer + mode-aware backend startup/health/routes scaffolding
3. M3 Local auth/sessions/admin-init/seed
4. M4 Mobile Home/search/filters/sort/cards
5. M5 Mobile details/photos/reviews/ratings
6. M6 Mobile favourites/profile
7. M7 Owner dashboard
8. M8 Admin dashboard
9. M9 Integration/end-to-end tests
10. M10 Polish, security/regression, docs, final report
