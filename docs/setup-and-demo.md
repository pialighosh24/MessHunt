# Mess Hunt – Setup and Demo Guide

> **Current local demo mode:** See `docs/LOCAL_DEMO_SETUP.md` and root `README.md` for the complete **no-MongoDB, file-backed local demo** run instructions (`APP_MODE=local-demo`). This is the recommended demonstration path for this workspace state.

## Naming
- **Workspace folder (internal):** `Mess-Finder` (do not rename)
- **Official application name (user-facing):** **Mess Hunt**
- **Tagline:** **Find Your Perfect Mess**
- **Technical slug:** `mess-hunt`

## Project components (separate applications)
- `backend/` – Shared Node.js + Express + MongoDB (Mongoose) REST API
- `mobile/` – Student app (React Native + Expo, Expo Go compatible)
- `owner-dashboard/` – Separate React.js owner web application
- `admin-dashboard/` – Separate React.js admin web application

> `owner-dashboard/` and `admin-dashboard/` are intentionally separate apps. Complete frontend business functionality is planned for later phases.

## Prerequisites
- Node.js (LTS recommended) and npm
- A MongoDB Atlas account (cloud database)
- A Cloudinary account (for accommodation image upload/storage in Step 9)
- Android phone with **Expo Go** installed (for mobile testing)
- Phone and development computer on the same network (LAN) for Expo Go

## 1) MongoDB Atlas setup (step-by-step)
Do these steps in the MongoDB Atlas web console (https://www.mongodb.com/atlas). **Do not share your real database password or connection string in chat.**

1. **Create/sign in to Atlas account** and create an **Organization/Project** (if prompted).
2. **Create a cluster** (Build a Database / Create). A free/shared tier is fine for development/demo if available.
3. **Create a database user** (Security → Database Access): add a password-auth user with least-privilege access appropriate for development.
4. **Configure network access** (Security → Network Access): add your current IP for local development (update if IP changes). Avoid broad access unless you understand the risk.
5. **Get the connection string** (Database → Clusters → Connect → Drivers, Node.js): copy the URI and replace placeholders in your **local** `backend/.env` only. URL-encode special characters in the password if needed.

## 2) Cloudinary setup (Step 9 – image uploads)
Cloudinary is used for accommodation photo storage. **Uploads are handled by the backend only** (official Cloudinary Node.js SDK). Credentials must never be exposed to mobile/web apps, never hardcoded, and never committed.

### Create and configure your Cloudinary account (locally)
1. Create/sign in at https://cloudinary.com/.
2. Open your Cloudinary **Dashboard/Settings** and locate:
   - **Cloud name**
   - **API Key**
   - **API Secret** (keep private)
3. No public/admin frontend configuration is required for this backend integration. The backend uploads to a controlled folder (default: `mess-hunt/accommodations`).

### Configure Cloudinary locally (without sharing credentials)
1. Copy the backend env template:
   ```powershell
   cd .\backend
   Copy-Item .env.example .env
   ```
2. Open `backend/.env` in a local editor and set **only on your machine**:
   - `CLOUDINARY_CLOUD_NAME=...`
   - `CLOUDINARY_API_KEY=...`
   - `CLOUDINARY_API_SECRET=...`
   - Optional: `CLOUDINARY_ACCOMMODATION_FOLDER=mess-hunt/accommodations`
   - Optional limits: `MAX_UPLOAD_SIZE_MB=5`, `MAX_PHOTOS_PER_ACCOMMODATION=10`
3. Save the file locally. **Do not commit `.env`**, do not paste secrets into chat/issues/docs, and do not place real values in `.env.example`.

**Behavior when not configured:** if an image upload/delete is requested without valid Cloudinary env vars, the backend fails safely with a clear `503` error.

## 3) Backend setup (MongoDB Atlas + Express + Cloudinary config)
### Configure environment variables (PowerShell)
From the workspace root `Mess-Finder`:

```powershell
cd .\backend
Copy-Item .env.example .env
notepad .env
```

Set at least these values in `backend/.env` (placeholders only in docs):
- `NODE_ENV=development`
- `PORT=5000`
- `MONGODB_URI=<your Atlas connection string>`
- `JWT_SECRET=<a long random secret>`
- `JWT_EXPIRES_IN=7d`
- `CORS_ORIGINS=http://localhost:5173,http://localhost:5174`
- `CLOUDINARY_CLOUD_NAME=<local only>`
- `CLOUDINARY_API_KEY=<local only>`
- `CLOUDINARY_API_SECRET=<local only>`
- `CLOUDINARY_ACCOMMODATION_FOLDER=mess-hunt/accommodations` (optional)
- `MAX_UPLOAD_SIZE_MB=5` (optional)
- `MAX_PHOTOS_PER_ACCOMMODATION=10` (optional)

**Security notes:**
- Never commit `backend/.env`.
- Never put real credentials in `.env.example`.
- Never share Atlas/Cloudinary/JWT secrets in chat or screenshots.

### Install and run
```powershell
cd .\backend
npm install
npm run dev
```

### Verify health endpoint
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/health" -Method Get
```
- Server status is reported separately from database status.
- `database.connected` is `true` only when MongoDB is actually connected.

## 4) Step 9/9.1 – Image upload/delete (owner, Cloudinary-backed)

### Upload photos
- **Endpoint:** `POST /api/owners/accommodations/:id/photos`
- **Auth:** `Authorization: Bearer <owner_jwt>` (owner only, must own the accommodation)
- **Content-Type:** `multipart/form-data`
- **Field name:** `photos` (one or multiple files)

**Restrictions:**
- Allowed formats: **JPEG, PNG, WebP** (MIME + extension + actual content validated)
- Max file size: **5 MB per image** by default (`MAX_UPLOAD_SIZE_MB`)
- Max photos per accommodation: **10 total active photos** by default (`MAX_PHOTOS_PER_ACCOMMODATION`)
- Dedicated Cloudinary folder: `mess-hunt/accommodations` by default
- Safe backend-generated public IDs; backend-only Cloudinary SDK usage
- No local permanent file storage

**Upload cleanup behavior (Step 9.1):**
- If a later file fails after earlier files uploaded successfully, the backend attempts cleanup for every uploaded asset in that request.
- If MongoDB save fails after successful Cloudinary upload(s), cleanup is also attempted for all uploaded assets.
- Each cleanup attempt result is checked and recorded in safe structured server-side logs (no credentials). Cleanup is treated as confirmed only when Cloudinary reports `ok` or `not found`.
- Cleanup is **best-effort**: if Cloudinary is unavailable or cleanup calls fail, orphaned Cloudinary assets may remain. The API does not claim an asset was deleted unless Cloudinary confirms deletion.

**Example (PowerShell + curl):**
```powershell
curl.exe -X POST "http://localhost:5000/api/owners/accommodations/<ACCOMMODATION_ID>/photos" `
  -H "Authorization: Bearer <OWNER_JWT>" `
  -F "photos=@C:\path\to\room1.jpg" `
  -F "photos=@C:\path\to\room2.webp"
```

### Delete photo (Step 9.1 two-stage recoverable workflow)
- **Endpoint:** `DELETE /api/owners/accommodations/:id/photos/:photoId`
- **Auth:** owner only, must own the accommodation
- Photo must belong to the owned accommodation and be an active deletable photo; arbitrary public IDs/URLs cannot be supplied to delete other users' assets. Cloudinary public ID is always taken from the stored database record.

**Deletion workflow:**
1. Mark photo as `pending_deletion` in MongoDB and save.
2. Delete the corresponding Cloudinary asset (when `publicId` exists) and require confirmation (`ok`/`not found`).
3. If confirmed (or not applicable for legacy photos without `publicId`), remove photo metadata from MongoDB.
4. If Cloudinary deletion fails or is not confirmed, restore the photo to active state where possible and return a safe error.
5. If the final MongoDB save fails after Cloudinary deletion succeeds, the photo remains persisted as `pending_deletion` so it is **not** treated as a normal active/displayable photo; a safe error is returned with recovery guidance.

**Pending-deletion state and recovery implications:**
- Pending-deletion photos are excluded from normal displayable photo serialization (including public responses).
- Pending records can be identified in MongoDB at `accommodations.photos[]` where `deletionStatus = "pending_deletion"` (with `deletionRequestedAt`, optional `deletionError`, and stored identifiers like `_id`/`publicId`).
- If restore/final-save fails in edge cases, manual or retry recovery may be required (no automatic background job/queue in Step 9.1). Verify remote asset state before manual metadata cleanup.

### Photo storage structure
Accommodation `photos[]` records store safe metadata such as: secure URL (`url`/`secureUrl`), Cloudinary `publicId`, `format`, `width`, `height`, `filename`, `uploadedAt`, photo record id, and Step 9.1 recovery fields (`deletionStatus`, `deletionRequestedAt`, `deletionError`). Public/admin/owner serializers return safe **active** photo info without exposing secrets.

### Important behavior
- Ordinary accommodation create/edit requests **cannot inject arbitrary external photo URLs or Cloudinary public IDs**; photos are managed only via upload/delete endpoints.
- If Cloudinary is not configured (and required): `503` with a clear configuration error.
- Validation failures (type/size/count/ownership/IDs/empty upload): `400/401/403/404` as appropriate.
- Cloudinary upload/delete failures or unconfirmed deletions: safe `502` errors.
- Delete finalize DB-save failure after confirmed Cloudinary deletion: safe `500` with pending-deletion recovery state retained (hidden from normal display).

## 5) Phase 3/4 backend checks and utilities
```powershell
cd .\backend
npm run test:phase3
node tests/phase4-auth.test.js
node tests/phase4-student.test.js
node tests/phase4-owner-accommodations.test.js
node tests/phase4-public-accommodations.test.js
node tests/phase4-reviews.test.js
node tests/phase4-admin.test.js
node tests/phase4-image-upload.test.js
```

**Controlled admin setup (no public admin registration):**
```powershell
cd .\backend
$env:ADMIN_NAME="Mess Hunt Admin"
$env:ADMIN_EMAIL="admin@example.com"
$env:ADMIN_PASSWORD="StrongPasswordHere"
node .\src\seed\createAdmin.js
```

**Safe demo seed framework (prepared):**
```powershell
cd .\backend
npm run seed:demo
```

## 6) Owner dashboard setup (separate app)
```powershell
cd .\owner-dashboard
npm install
Copy-Item .env.example .env
# Set VITE_API_BASE_URL=http://localhost:5000/api
npm run dev
```

## 7) Admin dashboard setup (separate app)
```powershell
cd .\admin-dashboard
npm install
Copy-Item .env.example .env
# Set VITE_API_BASE_URL=http://localhost:5000/api
npm run dev
```

If both dashboards run at the same time, Vite may use different ports (e.g. 5173 and 5174). Add actual origins to `backend/.env` `CORS_ORIGINS`.

## 8) Mobile app setup – Expo Go (Android)
```powershell
cd .\mobile
npm install
Copy-Item .env.example .env
# Set EXPO_PUBLIC_API_BASE_URL=http://<YOUR_LAN_IP>:5000/api
npx expo start
```

- Use your development computer's **LAN IP**, not `localhost`/`127.0.0.1`.
- Phone and development computer must be on the same network.
- Align Expo SDK/dependencies with the installed Expo Go app if needed (`npx expo install <package>`).

### Find LAN IP (Windows PowerShell)
```powershell
ipconfig
```
Use the **IPv4 Address** of your active Wi-Fi/Ethernet adapter.

## 9) Demo mode vs real mode
- **Demo seed framework:** prepared in `backend/src/seed/` with safeguards (clearly identified `isDemo` records, no fake records in real production environments, no public demo admin with production privileges, idempotent/safe behavior, no overwriting real records).
- **Real mode:** uses actual MongoDB Atlas data via backend APIs (no hardcoded frontend data replacement).
- Demo reviews must never be presented as genuine student feedback.

## 10) Verification notes (current environment)
- Automated backend tests in this environment are primarily **mocked/stubbed** (no live isolated MongoDB; Cloudinary upload/delete tests use **mocked Cloudinary SDK calls** and **mocked/stubbed MongoDB/model operations**).
- Step 9.1 added mocked reliability tests for: 3-file partial upload cleanup, DB-save failure after successful upload cleanup, Cloudinary-delete-success/final-DB-save-failure pending-deletion recovery, Cloudinary-not-configured 503 paths, delete auth/role checks, empty upload rejection, legacy photo safety, and pending-deletion exclusion from public serialization.
- Real MongoDB/Cloudinary behavior must be verified locally with valid credentials and isolated test data; do not claim live connectivity without actual successful runs.
- `GET /api/health` must not report database connected unless a real connection is established.
