# LifeCity Attendance

A church attendance app for LifeCity Church of Christ. It keeps member records, service schedules, and attendance in one place, with personal QR codes for check-in.

[Open the app](https://lifecity-attendance.vercel.app/)

## Features

- Member directory with churches, ministries, private notes, and CSV import/export.
- Service schedules, public listings, QR scanning, manual check-in, and kiosk mode.
- Attendance reports with saved historical details, CSV exports, and removal with Undo.
- Personal member profiles, QR/ID downloads, attendance history, and profile requests.
- Owner controls for accounts, access, appearance, activity history, and feedback tickets.
- Responsive desktop and phone layouts with Google sign-in through Supabase.

Guests browse public services. Members see their own linked profile and history. Admins manage members, services, and attendance; the Owner also manages accounts and settings.

## Run locally

Use Node.js 24 and npm. Install dependencies with `npm ci`, then copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Use a public publishable/anon key, never a service-role key.

```sh
npm run dev
```

Enable Google sign-in in Supabase and allow the local URL printed by Vite as an authentication redirect. A new backend needs the deployed functions, policies, and triggers described in [the backend contract](docs/backend-contract.md); the tracked SQL contains only targeted Undo updates.

For the isolated portfolio demo, set `VITE_APP_MODE=demo`. It uses fictional data held in the browser tab and does not connect to Supabase.

## Checks

```sh
npm run format:check
npm test
npm run build
```

Use `npm run format` to apply formatting and `npm run preview` to preview a production build. Camera access, Google sign-in, and downloads also need testing on the intended devices.

## Stack

React, TypeScript, Vite, Supabase, and Vercel. QR scanning uses html5-qrcode; QR images use qrcode.react. Papa Parse handles CSV files, Lucide supplies icons, and Motion/GSAP handle animations.

The app needs an internet connection. Service times use Asia/Manila. See [contributing](CONTRIBUTING.md) for development conventions and [credits](docs/credits.md) for third-party sources. No project license has been selected.
