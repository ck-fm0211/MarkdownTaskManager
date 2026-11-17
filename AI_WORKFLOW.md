# 🤖 Guidelines for AI Assistants

This file contains general guidelines for all AI assistants (Claude, ChatGPT, Copilot, Gemini, etc.) using this Markdown task management system.

---

## 📋 Strict Task Format

### Mandatory Template

```markdown
### TASK-XXX | Task title

**Status**: <column-id>
**Priority**: [Value] | **Category**: [Value] | **Assigned**: @user1, @user2
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

### Fields

**REQUIRED**: `### TASK-XXX |`, `**Status**:` (the column id — this is what places the task in a column), `**Priority**:`, `**Category**:`, `**Created**:`

**OPTIONAL**: `**Assigned**:`, `**Started**:`, `**Due**:`, `**Finished**:`, `**Tags**:`, Description, `**Subtasks**:`, `**Notes**:`

### ❌ FORBIDDEN

- `## Title` or `### Title` inside a task
- `**Subtasks**` or `**Notes**` without `:`

**Why?** All tasks live in a single `## Tasks` section, so a stray `##`/`###`
heading inside a task can break parsing. Keep notes/description heading-free.

---

## 🔄 Workflow

> **V2 — status is a field, not a position.** A task's column is its `**Status**:`
> value, not the section it sits in. All tasks live in a single `## Tasks` section,
> and a task's position within the file = its order within its column.
> **To move a task between columns, edit its one `**Status**:` line — never cut and
> re-paste the whole block.** (Cheap: ~1 line instead of moving 20+.)

### 1. New request
1. Add the task to the `## Tasks` section of `kanban.md`
2. Set `**Status**:` to the first column id (e.g. `todo`)
3. Unique ID (TASK-XXX) auto-incremented; break into subtasks if needed

### 2. Start work
1. Edit one line: `**Status**: todo` → `**Status**: in-progress`
2. Add `**Started**: YYYY-MM-DD`
3. Check off subtasks progressively

### 3. Finish work
1. Edit one line: `**Status**: in-progress` → `**Status**: done`
2. Add `**Finished**: YYYY-MM-DD`
3. Document in `**Notes**:`:
   - `**Result**:` - What was done
   - `**Modified files**:` - List with lines
   - `**Technical decisions**:` - Choices made
   - `**Tests performed**:` - Validated tests

### 4. Archiving

**⚠️ Tasks are NOT archived immediately!**

- Completed tasks remain in "✅ Done"
- **Only on user request** → move to `archive.md` section `## ✅ Archives`
- **Never archive directly at the end of work**
- Order (no task may be lost if something fails half-way): **first append the block to
  `archive.md`, then delete it from `kanban.md`**. Keep its `**Status**:` (the original column id —
  it is used when the task is restored). If the same id already exists in `archive.md`, compare the
  two blocks and ask the user; never merge or overwrite silently.

---

## ⚡ Token-economical operations (for AI)

The board is **one `## Tasks` section**; each task carries its own `**Status**:`.
There is **no stored index** — rebuild it on the fly with `grep`, and read/edit a
**single task** instead of loading the whole file.

```bash
# Board overview (id + status) — rebuilds the "index" on demand, very cheap
grep -nE "^### TASK-|^\*\*Status\*\*:" kanban.md

# Select one task by id → its line number
grep -n "^### TASK-042 " kanban.md

# Read just that task (its header up to the next header)
sed -n '/^### TASK-042 /,/^### TASK-/p' kanban.md

# MOVE a task between columns = edit ONE line (the block never moves):
#   **Status**: todo   →   **Status**: in-progress

# Next task in a column = first block with that status (file order = column order)
grep -n "^\*\*Status\*\*: in-progress" kanban.md | head -1

# List a column, already in order
grep -n "^\*\*Status\*\*: todo" kanban.md

# Search
grep -n "\*\*Priority\*\*: High" kanban.md     # by priority
grep -n "\*\*Tags\*\*:.*#bug" kanban.md          # by tag
```

**Rule of thumb:** a targeted `grep` + a one-line `Edit` beats reading/rewriting the
whole file. Moving a task is a single `**Status**:` edit — do **not** move the block.

---

## 📝 Examples

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

### Complete Task

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

---

## 🤝 Co-editing with the browser app (this fork)

The browser app (`task-manager.html`) and AI assistants edit the same files.

- The app keeps the exact text it last read. Before every save it reads the file again; if the
  content differs it does **not** write, shows a conflict and lets the user export their unsaved
  changes and reload. So an AI edit is never silently overwritten — but two writes in the same
  instant cannot be prevented. **Ask the user to stop editing in the browser while you edit**,
  and to reload (🔄) afterwards.
- If a file contains something the app would lose on save (malformed `### TASK-` header, text
  outside any task, non-checkbox lines inside `**Subtasks**:`, unknown lines in the configuration
  part…), the app opens it **read-only**. Run `npm run tasks -- check` after editing.
- Task ids are unique across `kanban.md` **and** `archive.md`. Get a new one with
  `npm run tasks -- next-id` (max id of both files + 1) and never reuse or renumber ids. While a file is
  not UTF-8, `next-id` prints no id and exits with code 1 (its ids cannot be read): save it as UTF-8 first.
  Updating `<!-- Config: Last Task ID: N -->` is recommended but the app also skips used ids.
- Keep the block order: header line, `**Status**`/metadata lines, description, `**Subtasks**:`,
  `**Links**`/`**Review**`/`**Dependencies**`, and `**Notes**:` LAST — everything after `**Notes**:` is
  notes (a `**Subtasks**:` written after it is not a subtask list). No `## ` headings after `## Tasks`.
  Close every ```` ``` ```` / `~~~` code block inside the task where it starts (an unclosed block makes
  the board read-only; a `### TASK-` line inside a code block would otherwise become a separate task).
- Keep the header / configuration part to the known lines (title, `<!-- … -->` comments, `**Columns**`,
  `**Categories**`, `**Users**`, `**Priorities**`, `**Tags**`); anything else makes the board read-only.
- `**Status**:` must be a column **id** from `**Columns**` (the part in parentheses). An unknown
  value is kept as written and shown in the first column with a warning.
- Japanese (or any language) is fine for titles, descriptions, notes, tags (`#経理`), categories,
  users and column display names. The Markdown keys (`**Status**`, `**Priority**`, `## Tasks`, …)
  are a fixed format: never translate them.
- Where the real data lives: see `AGENTS.md` (`npm run tasks -- where`). The `kanban.md` /
  `archive.md` at the repository root are dummy samples.
- **Encoding: UTF-8 without BOM.** A file in another encoding is opened read-only by the app (it would
  otherwise be saved back garbled). On Windows, do **not** write the files with Windows PowerShell 5.1
  `Set-Content`, `Add-Content`, `Out-File` or `>` / `>>` (they write Shift_JIS / UTF-16 by default). Use
  your editing tool, or PowerShell 7 (`pwsh`, UTF-8 by default). `npm run tasks -- check` reports a
  file that is not UTF-8.
- Dates are `YYYY-MM-DD` only (`2026-11-30`, not `2026/11/30` — that makes the board read-only until it
  is fixed; `2026-1-5` / `20261231` are kept but reported by `npm run tasks -- check` as `⚠ non-iso-date`,
  and the browser's date fields cannot show them).
- Upstream's leading-`|` metadata line (` | **Category**: …`) is only read directly under the task header,
  together with the other metadata lines; in the description a `| **Due**: … |` table row is plain text.
- An example of the format (a `**Due**:` line, a checklist, a `### …` heading) belongs in a closed
  ```` ``` ```` code block: lines in a code block are text, never task fields. A `### TASK-` line is a new
  task even inside a code block — never write one there.

---

## 🎯 Golden Rules

### ✅ ALWAYS
1. Create task BEFORE coding
2. Strict format (no `##` in tasks)
3. Break down if complex
4. Real-time progress
5. Document result in `**Notes**:`
6. Reference tasks in commits (`TASK-XXX`)
7. Leave in "Done" (archive only on user request)

### ❌ NEVER
1. `## Title` in a task
2. Code without creating task
3. Forget to check off subtasks
4. Archive immediately (stay in "Done")
5. Forget to document the result

---

## 📦 File Structure

### kanban.md

**⚠️ ID comment format**: `<!-- Config: Last Task ID: XXX -->` (auto-incremented by application)

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

> **Columns** require the `(id)` suffix — the `id` is what each task's `**Status**:`
> points to. All tasks live in the single `## Tasks` section; the column is read from
> `**Status**:`, and order within the file = order within the column.

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

---

## 🔧 User Commands

```bash
# Planning
"Plan [feature]"
"Create roadmap for 3 months"

# Execution
"Do TASK-XXX"
"Continue TASK-XXX"

# Tracking
"Where are we?"
"Weekly status"

# Modifications
"Break down TASK-XXX"
"Add subtask to TASK-XXX"

# Search
"Search in archives: [keyword]"

# Maintenance
"Archive completed tasks"
```

---

## 📘 Git Integration

```bash
# Commits with reference
git commit -m "feat: Add feature (TASK-042 - 3/5)"
git commit -m "fix: Bug fix (TASK-001)"

# Branches
git checkout -b feature/TASK-042-notifications
```

---

## 📁 AI-Specific Configuration

Each AI has its own configuration file:

| AI Assistant | Configuration File | Location |
|--------------|-------------------|----------|
| **Claude** | `CLAUDE.md` | Project root |
| **GitHub Copilot** | `copilot-instructions.md` | `.github/` |
| **OpenAI CLI** | `OPENAI_CLI.md` | Project root |
| **ChatGPT** | `CHATGPT.md` or Custom GPT | Root or Web |
| **Gemini** | `GEMINI.md` or `instructions.md` | Root or `.gemini/` |
| **Qwen** | `QWEN.md` or `.qwenrc` | Project root |
| **Codeium / Windsurf** | `instructions.md` | `.windsurf/` or `.codeium/` |

**These files must:**
1. Reference this file `AI_WORKFLOW.md`
2. Be adapted to each AI's specifics
3. Remain minimalist (only a few lines)

### Minimal Template for AI Configuration File

```markdown
# 🤖 Instructions for [AI NAME]

## 📋 Task Management System

**Every action = One documented task in kanban.md**

## 📚 Complete Documentation

**⚠️ READ IMMEDIATELY**: `AI_WORKFLOW.md`

This file contains everything: format, workflow, commands, examples.

## ⚙️ Critical Rule #1

**NO `##` or `###` headings inside a task**
- Use `**Subtasks**:` and `**Notes**:` with colons
- Subsections: `**Result**:`, `**Modified files**:`

**Why?** The HTML parser does not recognize `##` inside tasks.

---

**Read `AI_WORKFLOW.md` now.**
```

---

## 🎓 First Use

### Initialization

On your first interaction with the AI:

```
"Read AI_WORKFLOW.md and use the task system"
```

The AI will automatically:
1. Read `AI_WORKFLOW.md`
2. Understand the complete format and workflow
3. Be ready to manage tasks according to defined rules

### Usage Examples

**Create a task:**
```
"Plan adding a real-time notification system"
```

**Work on a task:**
```
"Do TASK-007"
```

**Status update:**
```
"Where are we?"
```

**Archive:**
```
"Archive completed tasks"
```

---

**This guide ensures complete transparency and traceability of AI work.**
