# Local sample data

These utilities generate fictional directory, service, and attendance records for an existing LifeCity backend. They are separate from the browser-only demo in `src/demo/`.

```sh
npm run demo:generate -- --help
npm run demo:sql -- --help
```

Generation writes to `demo-data/generated/`, which is excluded from Git. It creates a dataset, member-import CSV, service schedule, summary, and example scenarios. Choose the schedule date and time explicitly when preparing a new batch. Regeneration changes QR tokens, so use the IDs from the batch that was actually imported.

The SQL builder reads that dataset and writes `02-reset-and-seed.sql`. It requires `--owner-email` for the existing active Owner account to preserve. Both commands work locally and do not contact Supabase.

## Database reset

The generated SQL is destructive: it clears the audited application tables and removes all other Auth users. It is intended for the existing schema, not for provisioning a new project. Back up the database and review the full file before running it. Applying it again also removes changes made since the previous import.

The reset preserves the nominated Owner login, links it to a fictional member, and imports the sample records in one guarded statement. It checks schema dependencies before making changes; a failing guard rolls the reset back. Keep generated SQL private because it contains the retained account email.

`member-import.csv` is a separate member-only option for the app's import workflow. It does not preserve the generated IDs, QR tokens, flags, or attendance. Do not combine it with the full SQL import.

## Checks

```sh
npm run test:demo
npm run test:demo:sql -- path/to/private-schema-report.csv
```

The SQL tests use an isolated PostgreSQL engine and a schema report. They do not run against hosted Supabase. The read-only report query is in `supabase/inspect-schema.sql`; keep the resulting report out of public commits.
