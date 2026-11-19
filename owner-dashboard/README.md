# Mess Hunt — Owner Dashboard (React + Vite)

Owner web dashboard for managing accommodation listings.

## Local Demo Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. (Optional) Create `.env` from `.env.example`:
   ```env
   VITE_API_BASE_URL=http://localhost:5000/api
   ```
3. Start backend in local-demo mode (shared API/store).
4. Run dev server:
   ```bash
   npm run dev
   ```
   Default: `http://localhost:5173`

## Features

- Owner registration and login
- Session persistence and protected routes
- Dashboard overview: total/approved/pending/rejected/available listings
- Create, view, edit, delete listings (with confirmation)
- Comprehensive listing form aligned to accommodation schema (location, pricing, room/food, facilities, rules, availability, contact)
- Listing status and rejection reason visibility; resubmission/re-review workflow preserved per backend rules
- Local photo upload and removal (local-demo storage)

## Build

```bash
npm run build
```

## Notes

- No public admin registration; owner registration is available.
- Uses the same local-demo backend API as mobile and admin dashboard (no MongoDB).
