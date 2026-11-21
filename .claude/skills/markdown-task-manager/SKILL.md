---
name: markdown-task-manager
description: Use when managing tasks, the system is a Kanban task manager based on local Markdown files (`kanban.md` and `archive.md`). It follows a strict format compatible with the task-manager.html web application.
---

# 📋 Markdown Task Manager Skill

## When to Use This Skill

- Create tasks to document work to be done
- Plan complex features
- Track project progress
- Archive completed tasks
- Generate status reports

## 📋 STRICT Task Format

### Mandatory Template

```markdown
### TASK-XXX | Task title

**Status**: <column-id>
**Priority**: [Critical|High|Medium|Low] | **Category**: [Value] | **Assigned**: @user1, @user2
**Created**: YYYY-MM-DD | **Started**: YYYY-MM-DD | **Due**: YYYY-MM-DD | **Finished**: YYYY-MM-DD
**Tags**: #tag1 #tag2 #tag3

Free text description. **NO `##` or `###` headings allowed**.

**Subtasks**:
- [ ] First subtask
- [x] Completed subtask

**Notes**:
Additional notes with subsections `**Title**:`.

**Result**:
What was done.

**Modified files**:
- file.js (lines 42-58)
```

### ❌ FORBIDDEN

- `## Title` or `### Title` inside a task
- `**Subtasks**` or `**Notes**` without `:`
- Automatic archiving (only on user request)

**Why?** All tasks share one `## Tasks` section, so a stray `##`/`###` heading inside a task can break parsing.

## 🤝 Co-editing rules (this fork)

- Real data lives in the data folder (`npm run tasks -- where`), not in the repository samples.
- Ask the user to stop editing in the browser before you edit; the app refuses to overwrite
  external changes (it shows a conflict) but simultaneous writes cannot be prevented.
- New id: `npm run tasks -- next-id` (unique across kanban.md AND archive.md). Never reuse ids.
  If it prints no id and exits 1, a file is not UTF-8 (Shift_JIS, UTF-16 without a BOM …): save it as
  UTF-8 and run it again.
- After editing: `npm run tasks -- check` must print `[OK]` (otherwise the app opens the file read-only).
- Archive = append to `archive.md` first, then remove from `kanban.md`; keep `**Status**:`.
- Japanese text is fine everywhere except the Markdown keys (`**Status**`, `## Tasks`, …).
- Save the files as **UTF-8 without BOM**. On Windows do NOT write them with PowerShell 5.1
  `Set-Content` / `Add-Content` / `Out-File` / `>` (they write Shift_JIS or UTF-16): the app then opens
  the file read-only. Use your editing tool, or PowerShell 7 (`pwsh`, UTF-8 by default).
- Never write a NUL character (U+0000): the app opens such a file read-only. If `check` reports
  `NUL 文字 … N 行目`, delete that character (saving as UTF-8 does not remove it).
- Dates are `YYYY-MM-DD` only (`2026-11-30`, not `2026/11/30` or `2026-1-5`).

## 🔄 Workflow

> **V2 — status is a field, not a position.** A task's column is its `**Status**:`
> value; all tasks live in one `## Tasks` section. **Move a task by editing its one
> `**Status**:` line — never cut/paste the whole block** (~1 line vs 20+).

### 1. New Request
1. Get the id: `npm run tasks -- next-id` (max of kanban.md AND archive.md + 1; never reuse an id)
2. Append the task at the end of the `## Tasks` section with `**Status**: <first column id>` (e.g. `todo`)
3. Break down into subtasks if needed
4. Optionally set `<!-- Config: Last Task ID: XXX -->` to the new number (the app and `next-id`
   also count every id written in both files, so a stale counter is harmless)
5. Run `npm run tasks -- check` → `[OK]`

### 2. Start Work
1. Edit one line: `**Status**: todo` → `**Status**: in-progress`
2. Add `**Started**: YYYY-MM-DD`
3. Check off subtasks progressively

### 3. Finish Work
1. Edit one line: `**Status**: in-progress` → `**Status**: done`
2. Add `**Finished**: YYYY-MM-DD`
3. Document in `**Notes**:`:
   - `**Result**:` - What was done
   - `**Modified files**:` - List with line numbers
   - `**Technical decisions**:` - Choices made
   - `**Tests performed**:` - Validated tests

### 4. Archiving

**⚠️ Tasks are NOT archived immediately!**

- Completed tasks stay at `**Status**: done`
- **Only on user request** → move to `archive.md`
- **Never archive directly at end of work**

## 📁 File Structure

### kanban.md

```markdown
# Kanban Board

<!-- Config: Last Task ID: 42 -->
<!-- Format: v2 -->

## ⚙️ Configuration

**Columns**: 📝 To Do (todo) | 🚀 In Progress (in-progress) | 👀 Review (in-review) | ✅ Done (done)
**Categories**: Frontend, Backend, DevOps
**Users**: @alice, @bob
**Priorities**: 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low
**Tags**: #bug, #feature, #docs

---

## Tasks

### TASK-001 | Title
**Status**: todo
[...]

### TASK-003 | Completed task
**Status**: done
[...]
```

All tasks share the single `## Tasks` section; the column comes from `**Status**:`
(which must equal a column `id` from the Config), and file order = order within a column.

### ⚡ Token-economical operations (for AI)

No stored index — rebuild it on demand with `grep`, and read/edit **one task**:

```bash
grep -nE "^### TASK-|^\*\*Status\*\*:" kanban.md    # board overview (index on demand)
grep -n "^### TASK-042 " kanban.md                   # locate a task by id
sed -n '/^### TASK-042 /,/^### TASK-/p' kanban.md     # read just that task
# MOVE = edit one line:   **Status**: todo  ->  **Status**: in-progress
grep -n "^\*\*Status\*\*: in-progress" kanban.md | head -1   # next task in a column
```

### archive.md

```markdown
# Task Archive

> Archived tasks

## ✅ Archives

### TASK-001 | Archived task
[... full content ...]

---

### TASK-002 | Another archived task
[... full content ...]
```

## 🎯 Golden Rules

### ✅ ALWAYS

1. Create task BEFORE coding
2. Strict format (no `##` inside tasks)
3. Break down if complex (3+ steps)
4. Update in real-time
5. Document result in `**Notes**:`
6. Reference tasks in commits (`TASK-XXX`)
7. Leave in "Done" (archive only on user request)

### ❌ NEVER

1. `## Title` inside a task
2. Code without creating task
3. Forget to check off subtasks
4. Archive immediately (stay in "Done")
5. Forget to document the result

## 🔧 User Commands

### Planning
- "Plan [feature]"
- "Create roadmap for 3 months"

### Execution
- "Do TASK-XXX"
- "Continue TASK-XXX"

### Tracking
- "Where are we?"
- "Weekly status"

### Modifications
- "Break down TASK-XXX"
- "Add subtask to TASK-XXX"

### Search
- "Search in archives: [keyword]"

### Maintenance
- "Archive completed tasks"

## 📝 Complete Examples

### Simple Task

```markdown
### TASK-001 | Fix login bug
**Status**: todo
**Priority**: Critical | **Category**: Backend | **Assigned**: @bob
**Created**: 2025-01-20 | **Due**: 2025-01-21
**Tags**: #bug #urgent

Users cannot log in. Error 500 in logs.

**Notes**:
Check Redis, related to yesterday's deployment.
```

### Complete Task with Result

```markdown
### TASK-042 | Notification system
**Status**: done
**Priority**: High | **Category**: Backend | **Assigned**: @alice
**Created**: 2025-01-15 | **Started**: 2025-01-18 | **Finished**: 2025-01-22
**Tags**: #feature

Real-time notifications with WebSockets.

**Subtasks**:
- [x] Setup WebSocket server
- [x] REST API
- [x] Email sending
- [x] Notifications UI
- [x] E2E tests

**Notes**:

**Result**:
✅ Functional system with WebSocket, REST API and emails.

**Modified files**:
- src/websocket/server.js (lines 1-150)
- src/api/notifications.js (lines 20-85)

**Technical decisions**:
- Socket.io for WebSockets
- SendGrid for emails
- 30-day history in MongoDB

**Tests performed**:
- ✅ 100 simultaneous connections
- ✅ Auto-reconnection
- ✅ Emails < 2s
```

## 🛠️ Skill Functions

When using this skill, you must:

1. **Read kanban.md** to understand the current state (columns = `**Columns**` of the Configuration)
2. **Create tasks** following the strict format, with an id from `npm run tasks -- next-id`
3. **Update tasks** by editing their one `**Status**:` line (never move blocks between sections)
4. **Check off subtasks** progressively
5. **Document result** in Notes before marking Done
6. **Check** with `npm run tasks -- check` after every edit (`[OK]`)
7. **Never archive** unless explicitly requested

## 📘 Git Integration

```bash
# Commits with reference
git commit -m "feat: Add feature (TASK-042 - 3/5)"
git commit -m "fix: Bug fix (TASK-001)"

# Branches
git checkout -b feature/TASK-042-notifications
```

## ⚠️ Critical Points of Attention

1. **Markdown Format**: Strictly respect format (no `##` inside tasks), UTF-8 without BOM
2. **IDs**: Always take the id from `npm run tasks -- next-id` (never `Last Task ID + 1` by hand)
3. **Columns**: `**Status**` holds a column **id** (the part in parentheses in `**Columns**`)
4. **Archiving**: NEVER archive automatically, only on request
5. **Documentation**: Always fill `**Notes**:` with Result, Modified files, etc.

## 🎓 Usage

### Initialization

Before using the skill, verify the project contains:
- `kanban.md` (required)
- `archive.md` (required)
- `AI_WORKFLOW.md` (optional but recommended)

### First Use

```
"Use the markdown-task-manager skill to create a task for [feature]"
```

### Invocation Examples

```
"Skill markdown-task-manager: create a task to implement authentication"
"Skill markdown-task-manager: update TASK-007 with results"
"Skill markdown-task-manager: list all tasks in progress"
"Skill markdown-task-manager: archive completed tasks"
```

## 🔍 Implementation Details

### Reading kanban.md

Always start by reading `kanban.md` (or the grep overview above) to:
- Know the columns: `**Columns**: 📝 To Do (todo) | …` → the ids are `todo`, …
- See the current tasks and their `**Status**:`

### Creating a New Task

1. Get the id: `npm run tasks -- next-id` (e.g. `TASK-043`; 3+ digits)
2. Append the block at the END of the `## Tasks` section (never create a `## <column>` heading:
   such a heading makes the file read-only in the app)
3. First lines: `### TASK-043 | Title`, then `**Status**: <column id>`, then the other fields
4. Use today's date for `**Created**:` (YYYY-MM-DD)
5. `npm run tasks -- check` → `[OK]`

### Moving Tasks Between Columns

Edit ONE line, never the block's position:
1. `**Status**: todo` → `**Status**: in-progress`
2. Update dates accordingly (`**Started**:` or `**Finished**:`)

### Completing Tasks

Before setting `**Status**: done`:
1. Ensure all subtasks are checked `[x]`
2. Add `**Finished**: YYYY-MM-DD`
3. Fill in `**Notes**:` section with:
   - `**Result**:` describing what was accomplished
   - `**Modified files**:` listing changed files with line ranges
   - `**Technical decisions**:` if any choices were made
   - `**Tests performed**:` if tests were run

### Archiving Tasks

Only when user explicitly requests archiving:
1. Copy the whole task block from `kanban.md` and APPEND it to `archive.md` first (keep its
   `**Status**:` line as it is). If `archive.md` already has that id, compare and ask the user.
2. Then remove the block from `kanban.md`
3. `npm run tasks -- check` → `[OK]` (no duplicate id between the two files)

---

**This skill ensures complete traceability and total transparency of work done by AI.**
