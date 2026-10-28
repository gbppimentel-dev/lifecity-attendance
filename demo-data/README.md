# LifeCity Attendance presentation data

Version: **LC-DEMO-v1.2** · October 28, 2026

The current SQL preserves the full batch and its QR codes, stays under a 900 KB safety budget, and runs the reset/import/verification in one anonymous command using local variables. It does not create temporary helper tables or depend on their session lifetime. Replace all older SQL text already pasted in the editor with the complete current file.

Presentation: Sunday, November 1, 2026, around 1:00–2:00 PM, Asia/Manila.

The tools and prepared files are saved directly in the local project. No ZIP replacement is needed. **Hosted Supabase has not been reset.** Editing local files does not change the hosted database.

## Apply the prepared dataset

1. Confirm a recoverable backup before resetting. See Supabase's [Database Backups](https://supabase.com/docs/guides/platform/backups) for supported backup options.
2. Open **demo-data/generated/02-reset-and-seed.sql** and copy its **entire** contents.
3. In the correct Supabase project, open **SQL Editor → New query**, paste the SQL, and click **Run**. This performs the requested destructive reset/import: it clears the 19 audited application tables and deletes every other Auth user. It retains only the nominated existing active Owner. The exact retained email is embedded in this private generated SQL, rather than committed to source control.
4. Wait for the final result row: **LC-DEMO-v1.2 reset complete**, one Auth user, one application account, 600 members, 8 churches, 14 ministries, 82 services, and 11,727 historical check-ins for the currently prepared batch.
5. Refresh the app served by npm run dev. Sign in again if its account/member information is cached. Check that Owner access still works.

The script checks the exact table inventory, required columns, active Owner, enabled snapshot trigger, external foreign keys, and managed-service conditions before clearing data. It stops if Storage objects or SCIM-managed identities exist; resolve the reported condition before retrying. The reset/import and its checks are one atomic DO statement, followed by a read-only counts query. A failure rolls back all changes made by the DO statement. It does not issue transaction commits internally. If a client leaves a pre-existing transaction in a failed state, run **ROLLBACK;** before retrying the complete script.

Database structure, policies, views, functions, triggers, provider configuration, and the retained Owner's authentication row remain intact. Old application requests, feedback, import runs, copied identity/activity records, and custom appearance are cleared. Appearance returns to the app's defaults. Enabled insert triggers create fresh fictional-data activity entries as **System or Database**, using the real import time. Platform audit logs, service configuration, and provider credentials are outside this application-data reset.

The Owner's application account is linked to fictional member **DEMO-0001** so My Member Space has a profile, QR, and attendance history. The Google identity and credentials are retained. Dummy members are directory profiles; no fabricated Google login accounts are created. Role changes, member-link requests, and sender-specific feedback require real authenticated accounts.

## Prepared data

| Data | Current batch |
| --- | ---: |
| Unique fictional members | 600 |
| Active / inactive members | 540 / 60 |
| Starred members | 57 |
| Churches / ministries | 8 / 14 |
| Church / ministry assignments | 667 / 682 |
| Services and events | 82 |
| Historical / corrected check-ins | 11,727 / 223 |

Churches include LifeCity - Main, North, South, East, West, Riverside, Hillside, and Lakeside. Ministries include Worship, Media, Youth, Kids, Hospitality, Outreach, Prayer, Discipleship, Young Adults, Women, Men, Care and Counseling, Production, and Missions. Members have varied affiliations, including multiple churches/ministries and some without a ministry.

Schedules cover Sunday celebrations, prayer gatherings, youth nights, outreach, private volunteer workshops, archived services, and upcoming public gatherings. On presentation Sunday, the morning celebration runs **9:00 AM–12:00 PM**, live demo check-in runs **12:30–3:30 PM**, and another celebration begins at **4:00 PM**. The app treats services as in progress for three hours after their start. All times here are Manila time.

Attendance is generated only through the batch's as_of time. Today's batch has no invented November 1 attendance; earlier services already contain history. Regenerating on Sunday after noon would also populate the completed morning service, while the reserved live event always starts empty. **Regeneration rotates QR tokens**, so keep one generated batch for its final import and QR codes.

Emails use the reserved example.com domain, and mobile numbers are blank. Fictional names may coincide with real people by chance. The deployed snapshot trigger saves member/service/affiliation details during import. Snapshot capture time reflects the import; simulated check-in dates reflect historical services.

## Presentation walkthrough

1. Show dashboard totals and change the period.
2. Filter Members by church, ministry, status, and starred profiles. Open a member with several affiliations.
3. Open My Member Space as the retained Owner to show a QR, downloadable ID, and historical attendance.
4. Browse completed, archived, ongoing, upcoming, public, and private services. Open guest view for public schedules.
5. From 12:30 to 3:30 PM on November 1, select **Live Presentation Check-In**. Open **DEMO-0001** on another device or print its ID; scan once for success and again for duplicate handling. Use **DEMO-0002** for another success and **DEMO-0600** for the inactive-member response. Also show manual lookup.
6. Open Records, filter a completed service by church/ministry, inspect saved details, and export Quick and Detailed CSV.
7. Consult generated/scenarios.json for exact names and IDs. Create any authenticated feedback/account requests needed during rehearsal.

## Local files and regeneration

- **generated/02-reset-and-seed.sql**: complete destructive reset/import to run in Supabase after backup.
- **generated/dataset.json**: full fictional rows and relationships.
- **generated/summary.json**: exact counts, batch time, and limitations.
- **generated/scenarios.json**: selected presenter examples.
- **generated/schedule.csv**: UTF-8 BOM schedule for review; the app does not import event CSVs.
- **generated/member-import.csv**: an alternative member-only import using the current app workflow. It cannot preserve demo IDs, numbers, QR tokens, inactive/starred flags, or attendance. **Do not combine it with the full SQL seed.**
- **../supabase/demo/01-inspect-schema.sql**: the read-only inspection query. The private uploaded report is not committed.

The current batch is already generated. Only regenerate deliberately: applying the reset again removes rehearsal check-ins and other changes since the last run.

From the project root in PowerShell:

    npm run demo:generate -- --presentation-date 2026-11-01 --presentation-time 12:30
    npm run demo:sql -- --owner-email YOUR_OWNER_EMAIL

The owner email must match exactly one existing active Owner; case and surrounding spaces are normalized. Both commands write under demo-data/generated, which is ignored by Git. Neither connects to Supabase. Run npm run demo:generate -- --help for optional member-count and batch-timestamp flags.

## Validation

    npm run test:demo
    npm run test:demo:sql -- "C:\path\to\private-schema-report.csv"
    npm run build

Eight fixture checks passed for uniqueness, references, assignments, times, Sunday service variety, CSV compatibility, and invalid inputs. Thirteen integration checks passed using an isolated in-memory PostgreSQL engine. The integration suite reconstructs audited public tables, constraints, view, triggers, and selected RPCs from the private report, with synthetic Auth/Storage stand-ins. It checks the editor's UTF-8 byte limit, lossless transport, separate single-statement autocommit requests, restricted search paths, caller transaction rollback, Owner/session retention, snapshots and immutability, directory/dashboard/report/portal calls, preflight failures, and rollback after an injected seed failure.

This verifies the audited application schema; it is not execution against hosted Supabase or a complete simulation of managed Auth/Storage services. The PostgreSQL engine is a development-only dependency and does not run in the production app.
