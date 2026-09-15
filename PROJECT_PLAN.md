# First-version build plan

## Decisions already set

- One attendance record per member per event.
- Duplicate scans are blocked and show the earlier check-in time.
- QR code stores an opaque random token only.
- Members with history are made inactive instead of deleted.
- Store timestamps in UTC; show Asia/Manila time in the app.

## Build order

1. Supabase project, authentication, and role-based access.
2. Members: add, edit, search, deactivate, and QR generation.
3. Events: create/select a service or gathering.
4. Scanner: camera scan, manual fallback, success/error feedback, duplicate detection.
5. Attendance records: filters, corrections, and CSV export with UTF-8 BOM.
6. CSV member import with preview, validation, error report, and update-existing option.
7. PWA installation, printable QR cards, audit log, and backups.

## Required environment variables

See `.env.example`. Never commit `.env.local` or Supabase service-role keys.
