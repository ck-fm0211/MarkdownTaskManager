# Changelog

## Fork 2.0.0-ja.1 (unreleased)

Base: [ioniks/MarkdownTaskManager](https://github.com/ioniks/MarkdownTaskManager) master at tag **V2.0**
(commit `f173f0d09274a8ce107fdfefda49823e2992e88f`, version 2.0.0). See `FORK_INFO.json`.
No automatic sync with upstream. Upstream pull requests were **not** merged wholesale; the
relevant problems were re-implemented against the requirements of this fork.

日本語の概要は [docs/ja/README.md](docs/ja/README.md) を参照。

### Review fixes, round 3
- Config values never span lines: an empty `**Columns**:` (or other key) no longer swallows the next
  config line; the configuration part is also checked to read back identically after a save.
- Duplicate config values (`#bug #bug`) no longer make a board read-only; the title may follow blank
  lines / comments; `~~~` fences are code blocks and an unclosed fence no longer hides headings.
- Archived-task dialog: no subtask delete / edit, and no action can reach the board task with the
  same id.
- New tasks are refused only while archive.md is unreadable (a readable archive with format problems
  is fine: every `### TASK-<n>` line is counted); `tasks next-id` warns instead of failing.
- Links containing whitespace, control characters or a backslash are refused (`/\host` == `//host`).
- The task form keeps first-line indentation and trailing double spaces (only outer blank lines removed).
- `release` ignores untracked files when checking for uncommitted changes.
- Warning when `**Subtasks**:` is written after `**Notes**:` (kept as notes text).
- Tests: the B-10 and A-4 regression tests now fail on the pre-fix code for the right reason (slow
  backup write sampled; asynchronous isSameEntry stand-ins; slow comparison inside the transaction).

### Review fixes (external AI code reviews of the first version)
- Archive: no edits while an archive/restore/delete runs (the detail dialog closes); the task is
  re-checked against its snapshot before it is removed from the board.
- Restore/archive decide "identical copy already at the destination" from the file ON DISK, never from
  unsaved in-memory state (a restore could otherwise delete the only saved copy).
- Header/configuration part is verified by a parse → generate round-trip: unknown lines, a second
  `**Columns**`, unsupported keys are reported (read-only) instead of silently replaced; extra HTML
  comments are kept; `## ⚙ Configuration` without the variation selector, `**Key** :` and `#`-less
  config tags are read; a UTF-8 BOM no longer hides the title.
- Every task must read back identically after a save (fixed point); `**Subtasks**:` written after
  `**Notes**:` stays in the notes (it multiplied on every save); `## ` headings in the task area are
  reported; nested subtask indentation, trailing double spaces, full-width `：`/`＃` and `、`-separated
  tags are kept; empty optional fields no longer make a board read-only; column names may contain
  parentheses (the id is the last `( )`).
- XSS: the language label of a fenced code block was inserted unescaped (upstream code) — escaped;
  `//host` links refused, `rel="noopener noreferrer"` added.
- Delete / form edit / subtask actions work on the clicked task object (duplicate ids no longer hit the
  first task with that id); stale archive list actions are reported.
- New tasks are refused while archive.md cannot be read completely; new ids also consider every
  `### TASK-<n>` line of both files.
- Recent-projects list: the IndexedDB write no longer awaits isSameEntry() inside the transaction
  (TransactionInactiveError — renames and second projects were not saved); rename reports failures.
- V1→V2 migration: backup + rewrite in one queued job; an existing different backup is never trusted
  or overwritten.
- Ops: `_backup_info/` of a restored ZIP and a worktree `.git` file are not packed; duplicate ZIP
  entry names are refused; `.claude/settings.local.json` is never packed; `release` refuses
  uncommitted changes (`--allow-dirty`); deploy needs `backupDir` to replace an existing HTML (nothing
  else is created in the app folder); `restore:verify` runs Node without a shell (Windows paths with
  spaces); `.cmd` wrappers no longer print the failure line on success.
- Tests: `npm run test:e2e` fails instead of skipping without a browser; file:// falls back to a
  localhost server; real IndexedDB and real focus-event tests; regression tests for every item above.

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
