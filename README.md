# Attendance Monitoring

A free, mobile-friendly QR attendance web app for a church or organization.

## Stack

- React + Vite + TypeScript
- Supabase (database and authentication)
- `html5-qrcode` (camera scanning)
- `qrcode.react` (QR display and download)
- Papa Parse (CSV import/export)

## Start locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app runs at the local address shown in the terminal, usually `http://localhost:5173`.

## Before building features

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL Editor.
3. Put the project URL and anon key in `.env.local`.
4. Build the Members screen first, then QR scanning and attendance records.

## Privacy rule

QR codes must contain only the opaque token (for example `att:<uuid>`), never a member name, email, or mobile number.
