# LifeCity Attendance

I built LifeCity Attendance for LifeCity Church of Christ to manage member records, service schedules, and attendance in one place. Members have a personal QR code for check-in, while the church team can manage the directory and review attendance without keeping separate spreadsheets.

[Open the app](https://lifecity-attendance.vercel.app/)

## Features

- Member directory with churches, ministries, private notes, CSV import, and exports.
- Service scheduling, Sunday service labels, and public event listings.
- QR scanning, manual check-in, duplicate detection, and a kiosk view.
- Attendance filters, saved historical details, CSV reports, and removal with Undo.
- Member profiles, personal QR codes, attendance history, and profile change requests.
- Owner controls for accounts, permissions, appearance, activity history, and feedback.
- Responsive desktop and phone layouts, with browser installation through the web app manifest.

Guests can browse public services. Members see their own linked profile and history. Admins manage the directory, services, and check-ins; the Owner also manages accounts and settings. Google sign-in uses Supabase Auth, and connecting a login to an existing member record requires Owner approval.

## Stack

React, TypeScript, and Vite on the frontend; Supabase for PostgreSQL, authentication, and realtime updates. The app uses html5-qrcode for scanning, qrcode.react for QR codes, Papa Parse for CSV files, and Lucide for icons. Motion and GSAP handle interface animations. The site is deployed on Vercel.

## Run locally

Use Node.js 24, then install the locked dependencies:

```sh
npm ci
```

Copy `.env.example` to `.env.local` and fill in the public Supabase settings:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-key
```

Use a publishable or anon key, never a service-role key. Enable Google sign-in in Supabase and add the local app URL to the allowed redirect URLs.

```sh
npm run dev
```

Open the address printed by Vite. Restart the server after changing environment variables.

The database files in `supabase/` do **not** recreate the full current backend. They contain the initial schema and a few targeted updates. A fresh Supabase project also needs the deployed functions, policies, and triggers listed in [the backend contract](docs/backend-contract.md).

A browser-only demo uses fictional data and a separate local data client. It does not connect to the real database. For local development without Supabase, set `VITE_APP_MODE=demo` in `.env.local`.

## Build and checks

```sh
npm run format:check
npm test
npm run build
npm run preview
```

Use `npm run format` to apply the project's formatting before committing. `format:check` checks it without changing files, and `npm test` runs the self-contained test suites. The build checks TypeScript and creates `dist/`; preview serves that build locally.

Tests cover directory actions, services, scheduling, scanning, attendance, navigation, and demo isolation. Individual `test:*` commands are listed in `package.json`. Camera permissions, Google sign-in, and phone behavior still need testing in a browser or on a device. See [CONTRIBUTING.md](CONTRIBUTING.md) for project conventions.

For Vercel, use `npm run build` with `dist` as the output directory and configure the same public environment variables.

## Repository

```text
src/components/   Application screens and shared UI
src/lib/          Data operations, hooks, and utilities
src/demo/         Isolated sample-data client
public/           Icons, manifests, and static assets
supabase/         Initial schema and targeted database updates
scripts/          Tests and local data utilities
docs/             Backend dependencies and credits
```

The app needs an internet connection. Installing it through the browser does not add offline attendance syncing. Service schedules and attendance times are displayed in Asia/Manila time.

Local fixture tools are documented in [demo-data/README.md](demo-data/README.md). Generated datasets, SQL, and local environment files are excluded from Git.

## Credits

UI adaptations and logo sources are listed in [credits](docs/credits.md). This repository does not currently include a project license.
