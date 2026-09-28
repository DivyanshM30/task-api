# Take-Home Assignment — The Untested API

**Candidate:** Divyansh Mishra  
**Stack:** Node.js · Express · Jest · Supertest

---

## Getting Started

**Prerequisites:** Node.js 18+

```bash
cd task-api
npm install
npm start        # API runs on http://localhost:3000
```

**Tests:**

```bash
npm test           # run full test suite
npm run coverage   # run tests + coverage report
```

---

## Project Structure

```
task-api/
  src/
    app.js                  # Express app setup & middleware
    routes/tasks.js         # Route handlers
    services/taskService.js # Business logic + in-memory data store
    utils/validators.js     # Input validation helpers
  tests/
    validators.test.js      # Unit tests for validators
    taskService.test.js     # Unit tests for service layer
    tasks.api.test.js       # Integration tests for all HTTP endpoints
  package.json
```

> The data store is in-memory — it resets every time the server restarts.

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | /tasks | List all tasks (with optional filters) |
| GET | /tasks?status=todo | Filter by status |
| GET | /tasks?page=1&limit=10 | Paginated list |
| GET | /tasks?search=query | **NEW** — full-text search across title & description |
| GET | /tasks/stats | Counts by status + overdue count |
| GET | /tasks/:id | Get a single task |
| POST | /tasks | Create a task |
| PUT | /tasks/:id | Update a task |
| DELETE | /tasks/:id | Delete a task |
| PATCH | /tasks/:id/complete | Mark as complete |

### Task shape

```json
{
  "id": "uuid",
  "title": "string",
  "description": "string",
  "status": "todo | in_progress | done",
  "priority": "low | medium | high",
  "dueDate": "ISO string | null",
  "completedAt": "ISO string | null",
  "createdAt": "ISO string"
}
```

---

## Bugs Found & Fixed

### Bug 1 — `getTaskStats`: overdue count was always 0

**Where:** `src/services/taskService.js` → `getTaskStats()`

**Why it happens:**  
The original code counted overdue tasks by filtering tasks *after* grouping by status, meaning done tasks with past due dates were excluded from iteration entirely — but so were all other statuses that might be overdue. The comparison between the ISO date string and the Date object was also fragile.

**Fix:**  
Rewrote the stats calculation to iterate all tasks in a single pass, counting status and overdue separately. A task is overdue when:
1. It has a `dueDate`
2. That date is in the past (`new Date(task.dueDate).getTime() < Date.now()`)
3. The task is **not** `done`

```js
// Before (fragile, potentially incorrect):
const overdue = tasks.filter(t => t.dueDate < now && t.status !== 'done').length;

// After (explicit timestamp comparison):
if (task.dueDate && new Date(task.dueDate).getTime() < nowMs && task.status !== 'done') {
  stats.overdue += 1;
}
```

---

### Bug 2 — `updateTask`: `completedAt` never set on status change to "done"

**Where:** `src/services/taskService.js` → `updateTask()`

**Why it happens:**  
The update function spread the incoming fields onto the task object, but never checked whether `status` was being set to `"done"`. The `PATCH /tasks/:id/complete` endpoint correctly stamped `completedAt`, but a direct `PUT` with `{ status: "done" }` left `completedAt: null`.

**Fix:**  
Added post-spread logic that:
- Sets `completedAt = now()` when `status` transitions **to** `"done"`
- Clears `completedAt = null` when `status` transitions **away from** `"done"`

```js
if (updates.status === 'done' && task.status !== 'done') {
  updated.completedAt = now();
} else if (updates.status !== undefined && updates.status !== 'done' && task.status === 'done') {
  updated.completedAt = null;
}
```

---

### Bug 3 — `getFilteredTasks`: pagination broken when params are absent

**Where:** `src/services/taskService.js` → `getFilteredTasks()`

**Why it happens:**  
The route handler passed `req.query.page` and `req.query.limit` directly to the service. When those query params are absent, Express passes `undefined`. `parseInt(undefined)` returns `NaN`, which makes `(page - 1) * limit` equal to `NaN`, causing `.slice(NaN, NaN)` to return an empty array — even when tasks exist.

**Fix:**  
Coerce parsed values to documented defaults when they're NaN or non-positive:

```js
const pageNum  = (Number.isNaN(Number(page))  || Number(page)  < 1) ? 1  : Number(page);
const limitNum = (Number.isNaN(Number(limit)) || Number(limit) < 1) ? 10 : Number(limit);
```

---

## New Feature — Full-Text Search (`?search=`)

**Endpoint:** `GET /tasks?search=<query>`

Search is case-insensitive and matches substrings in both `title` and `description`. It can be combined with `status` and pagination:

```
GET /tasks?search=budget&status=todo&page=1&limit=5
```

**Implementation:**
- Added `search` parameter to `getFilteredTasks()` in the service
- Applied after the status filter, before pagination (so counts reflect filtered results)
- Route handler passes `req.query.search` through automatically

**Design decisions:**
- Client-side (in-memory) substring matching keeps it simple — no query parser needed since the data is already in memory
- Applied *before* pagination so `total` in the response reflects matching tasks, not all tasks
- Whitespace-only search strings are ignored (no-op)

---

## Test Coverage

| File | Tests |
|------|-------|
| `validators.test.js` | 30 unit tests covering all validation functions and edge cases |
| `taskService.test.js` | 35 unit tests covering all service functions + bug fixes |
| `tasks.api.test.js` | 38 integration tests covering all HTTP endpoints + search feature |

Run `npm run coverage` to see the full coverage report.
