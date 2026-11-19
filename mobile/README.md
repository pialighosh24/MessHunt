# Mess Hunt — Student Mobile App (Expo)

Expo React Native student application for **Mess Hunt** (Find Your Perfect Mess).

- **Expo SDK:** 58 (do not upgrade/downgrade)
- **React / React Native:** per `package.json`
- **Auth storage:** `expo-secure-store`
- **Navigation:** React Navigation (native stack + bottom tabs)

## Local Demo Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env` from `.env.example` and set the backend API base URL (must include `/api`):
   ```env
   EXPO_PUBLIC_API_BASE_URL=http://<YOUR_COMPUTER_LAN_IPV4>:5000/api
   ```
   - Use your development computer's **current LAN IPv4 address** (same Wi-Fi as phone).
   - Do **not** use `localhost`/`127.0.0.1` on a physical device.
   - Do **not** hardcode LAN IPs in source code.
3. Start backend in local-demo mode (see root `README.md` / `docs/LOCAL_DEMO_SETUP.md`).
4. Start Expo (clear cache after env changes):
   ```bash
   npx expo start -c
   ```
5. Open in **Expo Go** (Android/iOS device on same network).

If the API URL is missing or a placeholder, the app shows a helpful configuration screen.

## Features (Student)

- Welcome, Login, Registration
- Session restore, secure token storage, logout
- Home/discovery: search (city/locality), filters (type/gender/room/food/rent), sort, clear/reset, recently added, real API listings, loading/empty/error/retry/refresh, pagination/load-more
- Accommodation details: photos, full info, call and Google Maps actions (when available), ratings/reviews
- Reviews: submit, edit/delete own review (session-tracked), report
- Favourites: add/remove/list, navigate to details
- Profile: view/edit name & phone, logout
- Bottom tabs: Home, Favourites, Profile

## Validation Commands

```bash
npx expo install --check
npx expo-doctor
npx expo export -p android --output-dir .expo-export-final
```

## Notes

- Works with the shared local-demo backend (`APP_MODE=local-demo`, no MongoDB).
- No secrets should be placed in `EXPO_PUBLIC_*` variables.
- `.env` is gitignored; use `.env.example` as template.
