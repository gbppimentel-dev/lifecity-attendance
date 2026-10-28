# LifeCity Attendance: parallel page work

## Project and commands

- React + TypeScript + Vite frontend, with Supabase for auth and data.
- Install each new checkout with `npm ci`; validate code with `npm run build`.
- Read `docs/parallel-work.md` before working across chats or integrating changes.
- The user describes work by page. Do not require tickets, GitHub issues, or pull requests for local work.

## Workspace ownership

- The original Windows project folder is the integration checkout. Keep its current branch and preserve other chats' unfinished changes.
- Each concurrent page chat uses its own worktree. Confirm the working directory, branch, and `git status` before edits.
- If asked to work concurrently but running in the integration folder, establish an isolated worktree before feature edits. Report the actual worktree path.
- Use `codex/` for new page branch names, such as `codex/dashboard-layout`. Managed worktrees may initially have a detached HEAD; create a named branch before handing back finished work.
- Page agents edit and run commands inside their own worktree. Never edit the original checkout from a page worktree.
- Do not stash, discard, stage, or commit another chat's unfinished work. Commit only paths belonging to the current task.
- Page chats may implement necessary shared-file changes in their own worktrees; identify those changes in the handoff for integration review.
- A shared project does not synchronize conversation history. Use explicit handoffs; do not assume another chat received a plan or completion notice.

## CSS and shared code

- Stylesheets are global. Separate CSS filenames alone do not isolate a page.
- Prefer selectors under an existing page root or add a specific page root class. Avoid changing global element selectors, generic button/card classes, or theme variables for a page-only request.
- Preserve stylesheet import order unless changing it is necessary to the requested behavior.
- Review overlap in `src/styles.css`, `src/mobile-*.css`, `src/appearance-kiosk.css`, `src/App.tsx`, `src/main.tsx`, shared components, theme/motion helpers, package files, and release notes.
- Do not reformat whole shared files or perform unrelated cleanup.

## Local previews

- Use `npm run dev -- --port <assigned-port> --strictPort` from the correct checkout.
- Suggested ports: integration 5173, Dashboard 5174, Members 5175, Services 5176, Scanner 5177, Records 5178, Settings 5179. Confirm availability and report any alternative.
- Do not stop another chat's server to claim a port. Report the URL actually printed by Vite.
- `.worktreeinclude` allows managed local worktrees to copy the ignored `.env.local`. Verify that it exists without printing its contents; never commit credentials.
- Worktrees isolate source files, not Supabase data. Previews using the same Supabase settings share backend data. Do not reset or seed the backend to prepare a worktree.

## Completing page work

- Run `npm run build` for code changes and relevant existing checks. Inspect desktop/mobile behavior where applicable; report any checks that could not run.
- Commit the completed page work locally. Do not push or deploy unless requested.
- Report: page/change summary, worktree path, branch, base commit, completed commit(s) in order, files changed, shared CSS/code changes, validation, and preview URL if running.
- Leave integration to the integration chat. Do not switch or merge branches in the original checkout from a page chat.

## Integration chat

- Inspect the finished branch, its commits, and the current integration status before applying changes.
- Integrate one completed page at a time, using the exact completed commits. Handle merge conflicts while preserving both intended behaviors.
- Use a clean integration checkout for cherry-picking. If another chat still has unfinished work there, finish independent review and defer applying commits until that work is ready. Never silently stash or commit it.
- A conflict-free Git operation does not prove CSS compatibility. Check the affected page and neighboring screens that share modified styles/components, then run the build.
- Keep the original checkout as the combined site. Identify precisely which completed pages are included and any remaining review limitations.
