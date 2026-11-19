# Mess Hunt — Admin Dashboard (React + Vite)

Admin web dashboard for platform management and moderation.

## Local Demo Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. (Optional) Create `.env` from `.env.example`:
   ```env
   VITE_API_BASE_URL=http://localhost:5000/api
   ```
3. Ensure backend is running in local-demo mode and admin is initialized:
   ```bash
   cd ../backend
   npm run admin:init:local
   ```
4. Run dev server:
   ```bash
   npm run dev
   ```
   Default: `http://localhost:5174`

## Features

- Secure admin login (no public admin registration)
- Protected routes and session persistence
- Dashboard statistics (students, owners, accommodations, reviews/reports)
- Student management: list/search, activate/deactivate
- Owner management: list, verify/unverify, activate/deactivate
- Accommodation moderation: list/filter, approve, reject with meaningful reason
- Review moderation: view/filter reviews, approve/retain or remove with note, handle report statuses

## Demo Admin (local)

- Email: `admin@messhunt.local`
- Password: `Admin@12345` (configured via backend env/init script; change for non-demo use)

## Build

```bash
npm run build
```

## Notes

- Admin actions are authorized by the backend; UI does not bypass security.
- Uses the same local-demo backend API and persistent file-backed store (no MongoDB).
