# Working on LifeCity

Keep changes focused and preserve the existing desktop and phone behavior unless a redesign is part of the task. The live app and portfolio demo share screens, so check both when changing data flows.

## File names and formatting

- React component files use PascalCase and match the exported component, such as `MemberEditor.tsx`.
- TypeScript helpers and hooks use camelCase, such as `serviceSchedule.ts`.
- Stylesheets, scripts, SQL files, and documentation use kebab-case. Standard entry points and tool configuration keep their expected names.
- Update imports, tests, and documentation when moving or renaming a file. Keep stylesheet import order intact.
- Run `npm run format` before committing. Use UTF-8, LF line endings, and the checked-in formatter settings.

## Source and documentation

Use descriptive names instead of source comments. Do not add pasted-code version labels, change IDs, replacement instructions, or tool-authorship notes. Keep required compiler directives and third-party license notices. Product release notes belong in the existing release history, not in file headers.

Keep the README brief and factual. Put necessary backend details and credits in `docs/`. Do not commit generated datasets, private schema exports, credentials, local walkthroughs, or build output.

## Verification

Run these before pushing:

```sh
npm run format:check
npm test
npm run build
```

`npm test` runs the self-contained suites. The optional `test:demo:sql` suite requires a private schema report and runs separately. Test camera access, sign-in, downloads, and responsive layouts in the browser when those areas change.

Keep demo data isolated from Supabase, retain authorization checks, and avoid changing backend protocol versions during cleanup. New data operations also need a local demo implementation. The original app should not advertise the demo URL.
