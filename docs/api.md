# Mess Hunt – API Documentation

Base URL (local development): `http://<HOST>:<PORT>/api`  
Content type: `application/json` for JSON endpoints; `multipart/form-data` for image upload  
Auth: JWT via `Authorization: Bearer <token>` for protected endpoints

> **Local Demo Mode (`APP_MODE=local-demo`, current):** Backend runs without MongoDB using a persistent file-backed store (`backend/local-data/`). Endpoint paths, auth/RBAC, and core request/response contracts are preserved. Photo uploads/deletes use secure **local filesystem storage** (served via `/api/local-uploads/...`) instead of Cloudinary. No MongoDB or Cloudinary connection is used in local-demo mode.  
> **MongoDB/Cloudinary mode (preserved):** Existing implementations remain for future `APP_MODE=mongo` use with valid credentials. Historical notes below about mocked/live MongoDB/Cloudinary verification refer to prior mongo-mode testing context.

## Response and error conventions
- Success responses generally use: `{ "success": true, "message": "...", "data": { ... } }`
- Error responses generally use: `{ "success": false, "message": "...", "errors": [...]? }`
- `400`: validation/invalid input, unsupported/protected fields, invalid IDs, file/type/size/count violations
- `401`: missing/invalid/expired token
- `403`: authenticated but not permitted / inactive account / role mismatch / policy restriction
- `404`: resource not found (including ownership-masked accommodation/photo access)
- `409`: duplicate/conflict
- `502`: upstream storage (Cloudinary) upload/delete failure (safe error, no credential leakage)
- `503`: image upload requested but Cloudinary is not configured on the server
- Centralized error handling is used; endpoints do not return fake success responses.

## Implemented endpoints (through Step 9)

### System
- `GET /api/health`

### Authentication (`/api/auth`)
- `POST /api/auth/student/register`
- `POST /api/auth/student/login`
- `POST /api/auth/owner/register`
- `POST /api/auth/owner/login`
- `POST /api/auth/admin/login` (no public admin registration)
- `GET /api/auth/me`
- `POST /api/auth/logout` (stateless; client discards JWT)

### Student APIs (`/api/students`, student only)
- `GET /api/students/profile`
- `PATCH /api/students/profile`
- `GET /api/students/favourites`
- `POST /api/students/favourites/:accommodationId`
- `DELETE /api/students/favourites/:accommodationId`

### Owner accommodation APIs (`/api/owners`, owner only)
- `POST /api/owners/accommodations`
- `GET /api/owners/accommodations`
- `GET /api/owners/accommodations/:id`
- `PATCH /api/owners/accommodations/:id`
- `DELETE /api/owners/accommodations/:id`
- `POST /api/owners/accommodations/:id/photos` (**Cloudinary upload, Step 9**)
- `DELETE /api/owners/accommodations/:id/photos/:photoId` (**Cloudinary delete, Step 9**)

**Owner resubmission workflow (preserved):** approved + substantive owner edit => `pending` with `rejectionReason` cleared (re-review); rejected owner edit/resubmission => `pending` with `rejectionReason` cleared on resubmission (not auto-approved); pending remains pending.

### Public accommodation APIs (`/api/accommodations`)
- `GET /api/accommodations` (public; approved + available only)
- `GET /api/accommodations/:id` (public; approved + available only)

Public responses include safe photo metadata/URLs and eligible-review rating summaries (`averageRating`, `reviewCount`, `ratingSummary`).

### Review APIs
- `POST /api/accommodations/:id/reviews` (student)
- `GET /api/accommodations/:id/reviews` (public, eligible only)
- `PATCH /api/reviews/:reviewId` (review owner student)
- `DELETE /api/reviews/:reviewId` (review owner student)
- `POST /api/reviews/:reviewId/report` (authenticated student)

### Admin APIs (`/api/admin`, admin only, active admin account required)
- `GET /api/admin/dashboard/stats`
- `GET /api/admin/students`
- `GET /api/admin/students/:id`
- `PATCH /api/admin/students/:id/status`
- `GET /api/admin/owners`
- `GET /api/admin/owners/:id`
- `PATCH /api/admin/owners/:id/verification`
- `PATCH /api/admin/owners/:id/status`
- `GET /api/admin/accommodations`
- `GET /api/admin/accommodations/:id`
- `PATCH /api/admin/accommodations/:id/decision`
- `GET /api/admin/reviews`
- `GET /api/admin/reviews/:id`
- `PATCH /api/admin/reviews/:id/moderation`
- `PATCH /api/admin/reviews/:reviewId/reports/:reportIndex`

(See Step 8 notes in previous revisions and implementation for detailed admin rules; this document focuses Step 9 additions below while preserving prior API behavior.)

---

## Image upload & storage APIs (Phase 4 Step 9 / 9.1, Cloudinary)

Cloudinary is used for accommodation photo storage. Uploads/deletions are performed **server-side** through the backend using the official Cloudinary Node.js SDK. **No Cloudinary credentials are exposed to mobile/web clients. No public unauthenticated upload endpoint exists. Image files are not stored permanently on the local backend server.**

### Environment/configuration (backend only)
Set in local `backend/.env` (never commit real values):
- `CLOUDINARY_CLOUD_NAME` (required for uploads/deletes of Cloudinary-managed photos)
- `CLOUDINARY_API_KEY` (required)
- `CLOUDINARY_API_SECRET` (required)
- `CLOUDINARY_ACCOMMODATION_FOLDER` (optional, default: `mess-hunt/accommodations`)
- `MAX_UPLOAD_SIZE_MB` (optional, default: `5`)
- `MAX_PHOTOS_PER_ACCOMMODATION` (optional, default: `10`)

If upload/delete is requested without valid Cloudinary configuration (and the operation requires Cloudinary), the API fails safely with **503** and a clear message.

### Upload photos
**POST** `/api/owners/accommodations/:id/photos`  
**Access:** authenticated **owner** only (must own the accommodation)  
**Content-Type:** `multipart/form-data`

**Form field:** `photos` (one or more image files)

**Request/validation rules**
- Owner must be authenticated and own the target accommodation (ownership enforced; non-owned/non-existent returns `404` to avoid leaking other listings).
- `:id` must be a valid accommodation ObjectId.
- Accepts multiple genuine image files in a single request.
- **Allowed types:** JPEG, PNG, WebP only (MIME type, extension, and **actual file content/signature** validated).
- **Max file size:** configurable (`MAX_UPLOAD_SIZE_MB`, default 5 MB per image).
- **Max photos per accommodation:** configurable total limit (`MAX_PHOTOS_PER_ACCOMMODATION`, default 10). Upload is rejected if existing **active** photos + new files exceeds the limit.
- At least one file required (empty upload requests rejected safely).
- Uploads are sent to Cloudinary in a dedicated controlled folder (default `mess-hunt/accommodations`) with safe backend-generated public IDs.
- **Upload cleanup behavior (Step 9.1):** if a later file upload fails, or if MongoDB save fails after Cloudinary upload(s) succeed, the backend attempts **best-effort cleanup** for every Cloudinary asset uploaded in that request. Each cleanup attempt result is checked and recorded in safe structured server-side logs (no credentials). A cleanup is treated as confirmed only when Cloudinary reports `ok` or `not found`. If Cloudinary is unavailable, cleanup cannot be guaranteed and orphaned assets may remain.

**Success response (201, example)**
```json
{
  "success": true,
  "message": "Photos uploaded successfully",
  "data": {
    "photos": [
      {
        "id": "<photoSubdocumentId>",
        "url": "https://res.cloudinary.com/<cloud>/image/upload/.../photo.webp",
        "secureUrl": "https://res.cloudinary.com/<cloud>/image/upload/.../photo.webp",
        "publicId": "mess-hunt/accommodations/<safe-id>",
        "format": "webp",
        "width": 1280,
        "height": 720,
        "filename": "room.webp",
        "uploadedAt": "2026-01-01T00:00:00.000Z"
      }
    ],
    "totalPhotos": 1,
    "accommodationId": "<accommodationId>"
  }
}
```

**Common errors:** `400` (invalid ID, missing/empty files, unsupported type/content, oversized, too many files/limit exceeded), `401/403` (auth/role), `404` (accommodation not found/not owned), `502` (Cloudinary upload/cleanup-context failure; no fake success), `503` (Cloudinary not configured).

### Delete photo (Step 9.1 two-stage recoverable workflow)
**DELETE** `/api/owners/accommodations/:id/photos/:photoId`  
**Access:** authenticated **owner** only (must own the accommodation)

**Rules**
- Owner must be authenticated and own the accommodation.
- `:id` must be a valid accommodation ObjectId; `:photoId` must reference an **active** photo belonging to that accommodation (stored photo record/subdocument/reference). Arbitrary Cloudinary public IDs/URLs are **not** accepted as deletion targets outside owned stored records.
- Cloudinary public ID (when present) is always obtained from the stored database record, never from client input.
- Legacy photo records without Cloudinary `publicId` are handled as DB-metadata-only removals (no unintended Cloudinary deletion). Legacy records without a stable matching identifier may not be targetable by this endpoint (safe 404, no unintended deletion).

**Two-stage deletion behavior (recoverable)**
1. **Mark pending:** photo is marked `deletionStatus = "pending_deletion"` and saved in MongoDB.
2. **Delete remote asset:** if the stored photo has a Cloudinary `publicId`, backend deletes that Cloudinary asset (Cloudinary deletion must be confirmed as `ok` or `not found`; unconfirmed results are treated as failure).
3. **Finalize:** if Cloudinary deletion is confirmed (or not applicable), photo metadata is removed from MongoDB.
4. **Cloudinary failure:** if Cloudinary deletion fails or is not confirmed, backend attempts to restore the photo to active state where possible and returns a safe error.
5. **Final DB-save failure after Cloudinary success:** if Cloudinary deletion is confirmed but the final MongoDB save fails, the photo remains persisted as `pending_deletion` so it is **not** treated as a normal active/displayable photo. A safe error is returned with recovery guidance.

**Visibility rule:** photos in `pending_deletion` state are excluded from normal displayable photo serialization (including public responses). This prevents broken/deleted images from appearing as active photos.

**Recovery implications (operational):**
- Pending-deletion records can be identified in MongoDB under `accommodations.photos[]` where `deletionStatus: "pending_deletion"` (with fields such as `deletionRequestedAt`, `deletionError`, `publicId`, `_id`).
- If a record remains pending after a Cloudinary failure and restore-save failure, or after final DB-save failure post-Cloudinary-delete, manual/retry recovery may be required (e.g. retry deletion flow for the record or clean up metadata after verifying remote asset state). No automatic background job/queue is introduced in Step 9.1.

**Success response (200, example)**
```json
{
  "success": true,
  "message": "Photo deleted successfully",
  "data": {
    "accommodationId": "<accommodationId>",
    "photoId": "<photoId>",
    "remainingPhotos": 2
  }
}
```

**Common errors:** `400` (invalid IDs), `401/403`, `404` (accommodation/photo not found, not owned, or not an active deletable photo), `502` (Cloudinary deletion failed/not confirmed; photo restored to active where possible), `503` (Cloudinary not configured when required for Cloudinary-managed photo), `500` (DB save failure; may retain `pending_deletion` recovery state per workflow).

### Photo storage structure (Accommodation `photos[]`)
Stored photo fields include: `secureUrl`/`url`, `publicId`, `format`, `width`, `height`, `filename`, `uploadedAt`, plus recovery/state metadata used by Step 9.1: `deletionStatus` (`active`/`pending_deletion`, legacy missing treated as active), `deletionRequestedAt`, `deletionError` (safe diagnostic text). Serializers normalize active displayable photos and exclude pending-deletion photos from normal responses.

### Photo security & integrity rules
- Ordinary accommodation **create/edit** requests cannot inject arbitrary external photo URLs or Cloudinary public IDs. Photos are managed only via the dedicated upload/delete endpoints (`photos` rejected in create/update payloads).
- Owner/admin/public serializers return appropriate safe photo information (URLs/metadata) without exposing Cloudinary credentials or internal secrets.
- Upload safety: file-size limits, file-count/total limits (active photos), MIME + actual-content validation, safe generated public IDs, controlled folder paths, backend-only Cloudinary access, no local permanent file storage.
- Cleanup is **best-effort** and logged safely; deletion/cleanup is not claimed successful unless Cloudinary confirms it. Orphaned Cloudinary assets may remain if cleanup cannot be completed.

## Review & moderation highlights (unchanged from Step 7/8)
- Public review eligibility and rating aggregation use moderation statuses `['none','approved']`; `pending`/`removed` excluded. Reports do not auto-prove misconduct or auto-remove. Admin moderation/report-handling endpoints enforce policy and audit fields.

## Admin highlights (unchanged from Step 8)
- All admin APIs require authenticated, active admin account and backend `requireAdmin` authorization. No public admin registration. Admin endpoints cover dashboard stats, student/owner management, accommodation approve/reject (with meaningful rejection reason and audit), review moderation, and individual report handling.

## Not yet implemented
- Frontend dashboard/mobile integration
- Any later phase beyond Step 9
- Live MongoDB and live Cloudinary verification in this environment
