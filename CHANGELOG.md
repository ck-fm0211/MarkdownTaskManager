# Changelog

## Fork 2.0.0-ja.1 (unreleased)

Base: [ioniks/MarkdownTaskManager](https://github.com/ioniks/MarkdownTaskManager) master at tag **V2.0**
(commit `f173f0d09274a8ce107fdfefda49823e2992e88f`, version 2.0.0). See `FORK_INFO.json`.
No automatic sync with upstream. Upstream pull requests were **not** merged wholesale; the
relevant problems were re-implemented against the requirements of this fork.

日本語の概要は [docs/ja/README.md](docs/ja/README.md) を参照。

### Data safety (safe save with external editors / AI)
- New save layer (`src/scripts/14-sync.js`): each file keeps the exact text last read/written; before
  every write the file is re-read and compared by **content**. A difference stops saving (conflict) —
  no overwrite option, no auto-merge. Unsaved board can be downloaded / copied; "reload from disk".
  Read errors, permission errors and missing files are never treated as "unchanged". Every write is
  read back before it counts as success; success notifications only after a confirmed save.
  (Upstream issue #25. Upstream PR #31 was reviewed but not used: it compares mtime+size and lets the
  user overwrite the external change.)
- All writes go through one queue (no reordering); queued kanban saves are coalesced.
- External-change check on focus / tab switch and a 🔄 button; a clean page reloads automatically,
  a page with unsaved edits or an open editor goes to conflict instead.
- `beforeunload` warning while something is unsaved.
- Loss guard: a file containing anything the generator would not write back (malformed task header,
  text outside tasks, unknown config lines, non-checkbox lines in Subtasks, …) is opened read-only
  instead of being saved over — including files that are not a board at all.
- A folder without kanban.md is initialised only after confirmation.

### Project switching
- Per-project session with a generation number: file handles, baselines and pending saves are never
  shared between projects. Fixes writing into the previous project's `archive.md` after switching to a
  project without one. In-flight saves finish against the old project before the switch; unsaved
  edits ask for confirmation; stale async loads are ignored; switching is refused during an archive
  operation. Projects are identified with `isSameEntry()` (two folders with the same name no longer
  collide).

### Archive / restore
- Write destination first, verify, then remove from the source; in-memory state changes only after
  the matching write. Partial success (task in both files) is reported and a re-run completes without
  duplicating. Same id with different content at the destination → refused. Both files are checked for
  external changes. One operation at a time. Previously the task was removed from the board before the
  archive write had completed, and an unreadable archive.md was treated as empty (next save could wipe it).
- archive.md header text is preserved instead of being regenerated in the current UI language.

### Markdown read/write
- Pure format module (`src/scripts/04-format.js`) shared by the app, the Node unit tests and the CLI.
- Priority is read without a Category (upstream issue #19; PR #34 reviewed); metadata fields are
  order-independent and optional; Category/Assigned without Priority no longer produce a broken line.
- Unicode: Japanese tags (`#経理`) were dropped by `#[\w-]+` — fixed; Japanese priorities kept;
  `clean()` is Unicode-aware (backward-compatible matching for old values).
- Description keeps blank lines and indentation; `**Notes**: text` on the same line is kept;
  `- [X]` subtasks parsed; CRLF files supported and their line ending preserved.
- Unknown `**Status**` values are kept as written (shown in the first column with a warning) instead
  of being silently changed to the first column; column names resolve to ids.
- New ids skip every id used in kanban.md **and** archive.md; duplicate ids are reported.
- "Created" default uses the local date (was UTC → wrong day in Japan before 9:00).
- Unknown priority values are kept when a task is edited in the form.
- Column id rename moves its tasks; non-empty / last column cannot be deleted.

### Search
- Task id search on the board and in the archive (`TASK-042`, `task-42`, `#42`, full-width input),
  case- and width-insensitive (upstream issue #20; PR #26 reviewed). The board search now also covers
  tags, category, assignees and subtasks, like the archive search.

### Japanese
- `ja` locale for every UI string (buttons, menus, forms, placeholders, notifications, errors,
  confirmations, help, tooltips, accessible labels); date locale per language; `<html lang>`
  follows the UI language; first start picks Japanese from `navigator.languages`.
- Language switching only changes display: tasks, column names and Markdown keys are never rewritten.
- Accessible names for icon-only buttons; notifications use `role="status"`, conflicts `role="alert"`.
- Japanese guides in `docs/ja/`.

### Build, deploy, backup (Node scripts, no new runtime dependency)
- `build.mjs`: syntax check before minify, output validation (single inline script, no external
  resources), atomic write, embedded `BUILD_INFO` / source hash, `--out`, `--check`.
- `npm run deploy` / `deploy:dry` / `build-deploy`: copies only task-manager.html to the app folder,
  refuses stale HTML, backs up the previous HTML (verified) first, never touches task data.
- `npm run backup` / `backup:dry` / `release`: dependency-free ZIP writer, verified read-back,
  manifest + restore instructions, secrets / node_modules / old backups excluded, Git history optional.
- `npm run restore:verify`, `npm run config:check`, `npm run tasks -- where|check|next-id|show`.
- `local.config.json` (git-ignored) with `%OneDriveCommercial%`-style variables; Windows `.cmd` wrappers.
- Tests: `npm test` (Node unit + script tests + browser tests with a mock File System Access API);
  devDependency `playwright-core` (uses installed Edge/Chrome, no browser download).

### AI instructions
- `AGENTS.md` (folder roles, build/deploy/backup, co-editing rules, task ids, archive order).
- `AI_WORKFLOW.md`, the Claude skill and the `*.md.exemple` files updated accordingly
  (V2 examples now include `**Status**`).
