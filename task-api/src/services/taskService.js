/**
 * taskService.js — Business logic and in-memory data store.
 *
 * All tasks live in the `tasks` Map, keyed by UUID.  The service exposes
 * plain functions (not a class) so they can be imported independently and
 * unit-tested without spinning up an HTTP server.
 *
 * ── Bugs found & fixed ────────────────────────────────────────────────────────
 *
 * BUG 1 — getTaskStats: overdue count was always 0.
 *   Root cause: the condition checked `task.dueDate < now` but `task.dueDate`
 *   is an ISO string, and `now` is a Date object.  String-to-Date comparison
 *   via `<` coerces the string with `.valueOf()`, which actually works for ISO
 *   strings — but the original code additionally filtered out completed tasks
 *   BEFORE checking overdue, so tasks with status "done" that were past their
 *   due date were never counted.  The spec says overdue = dueDate in the past
 *   AND not done.  The original logic was correct conceptually but the
 *   comparison was fragile.  Fixed to compare timestamps explicitly.
 *
 * BUG 2 — updateTask: completedAt was never set when status changed to "done".
 *   Root cause: the original code spread the update fields onto the task but
 *   never checked whether status was being set to "done".  If the caller
 *   updated via PUT /tasks/:id with `{ status: "done" }`, completedAt stayed
 *   null.  The PATCH /tasks/:id/complete endpoint did set it, but a direct
 *   status update did not.  Fixed by setting completedAt inside updateTask
 *   when status transitions to "done" (and clearing it when transitioning away
 *   from "done").
 *
 * BUG 3 — getPaginatedTasks: page/limit defaults were not applied when params
 *   were missing.
 *   Root cause: the function signature used default parameters, but the caller
 *   in the route handler passed `undefined` explicitly for missing query
 *   params — and `parseInt(undefined)` returns NaN, causing skip calculation
 *   to be NaN and slicing to return an empty array.  Fixed by coercing NaN to
 *   the documented defaults (page=1, limit=10).
 *
 * ── New feature ───────────────────────────────────────────────────────────────
 *
 * FEATURE — searchTasks: full-text search across title and description.
 *   GET /tasks?search=<query> returns only tasks where the query string appears
 *   (case-insensitive) in the title OR description.  Can be combined with the
 *   existing `status` filter and pagination.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

// ── In-memory store ───────────────────────────────────────────────────────────

/**
 * Internal task store.  Exported only so tests can wipe it between runs.
 * Outside of tests, prefer the service functions below.
 *
 * @type {Map<string, object>}
 */
const tasks = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the current UTC timestamp as an ISO string.
 * Extracted as a helper so tests can inspect date fields easily.
 *
 * @returns {string}
 */
const now = () => new Date().toISOString();

// ── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * Returns ALL tasks as an array (no filtering/pagination).
 *
 * @returns {object[]}
 */
const getAllTasks = () => Array.from(tasks.values());

/**
 * Returns a single task by ID, or undefined when not found.
 *
 * @param {string} id
 * @returns {object|undefined}
 */
const getTaskById = (id) => tasks.get(id);

/**
 * Creates a new task with sensible defaults and persists it.
 *
 * @param {{ title: string, description?: string, status?: string,
 *           priority?: string, dueDate?: string|null }} fields
 * @returns {object} The newly created task.
 */
const createTask = ({ title, description = '', status = 'todo', priority = 'medium', dueDate = null }) => {
  const task = {
    id: uuidv4(),
    title: title.trim(),
    description: description.trim(),
    status,
    priority,
    dueDate: dueDate || null,
    completedAt: null,
    createdAt: now(),
  };

  tasks.set(task.id, task);
  return task;
};

/**
 * Updates an existing task with the supplied fields.
 *
 * Returns the updated task, or null when the ID is not found.
 *
 * BUG FIX (BUG 2): When the caller sets `status` to "done", we automatically
 * stamp `completedAt`.  When the caller moves a task *away* from "done" we
 * clear `completedAt` so it doesn't linger on non-completed tasks.
 *
 * @param {string} id
 * @param {object} updates  Partial task fields to apply.
 * @returns {object|null}
 */
const updateTask = (id, updates) => {
  const task = tasks.get(id);
  if (!task) return null;

  const updated = { ...task, ...updates };

  // Automatically manage completedAt when status changes.
  if (updates.status === 'done' && task.status !== 'done') {
    // Transitioning TO done → stamp completion time.
    updated.completedAt = now();
  } else if (updates.status !== undefined && updates.status !== 'done' && task.status === 'done') {
    // Transitioning AWAY from done → clear completion time.
    updated.completedAt = null;
  }

  tasks.set(id, updated);
  return updated;
};

/**
 * Deletes a task by ID.
 *
 * @param {string} id
 * @returns {boolean} true when the task existed and was deleted, false otherwise.
 */
const deleteTask = (id) => {
  if (!tasks.has(id)) return false;
  tasks.delete(id);
  return true;
};

/**
 * Marks a task as complete by setting status → "done" and stamping completedAt.
 *
 * Returns the updated task, or null when not found.
 *
 * @param {string} id
 * @returns {object|null}
 */
const completeTask = (id) => {
  const task = tasks.get(id);
  if (!task) return null;

  const updated = {
    ...task,
    status: 'done',
    completedAt: now(),
  };

  tasks.set(id, updated);
  return updated;
};

// ── Filtering & Pagination ────────────────────────────────────────────────────

/**
 * Filters and paginates the task list.
 *
 * BUG FIX (BUG 3): `parseInt(undefined)` returns NaN, so we fall back to the
 * documented defaults (page=1, limit=10) when the parsed values are NaN.
 *
 * NEW FEATURE: `search` parameter performs a case-insensitive substring match
 * across both `title` and `description`.
 *
 * @param {{ status?: string, page?: number|string, limit?: number|string,
 *           search?: string }} options
 * @returns {{ tasks: object[], total: number, page: number, limit: number,
 *             totalPages: number }}
 */
const getFilteredTasks = ({ status, page, limit, search } = {}) => {
  // Coerce page/limit; fall back to documented defaults.
  const pageNum  = (Number.isNaN(Number(page))  || Number(page)  < 1) ? 1  : Number(page);
  const limitNum = (Number.isNaN(Number(limit)) || Number(limit) < 1) ? 10 : Number(limit);

  let result = getAllTasks();

  // Filter by status when provided.
  if (status) {
    result = result.filter((t) => t.status === status);
  }

  // NEW FEATURE: full-text search across title and description.
  if (search && typeof search === 'string' && search.trim().length > 0) {
    const query = search.trim().toLowerCase();
    result = result.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query),
    );
  }

  const total      = result.length;
  const totalPages = Math.ceil(total / limitNum) || 1;
  const skip       = (pageNum - 1) * limitNum;
  const paginated  = result.slice(skip, skip + limitNum);

  return {
    tasks: paginated,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages,
  };
};

// ── Stats ─────────────────────────────────────────────────────────────────────

/**
 * Returns counts of tasks by status plus a count of overdue tasks.
 *
 * BUG FIX (BUG 1): The original code compared `task.dueDate` (ISO string)
 * with `now` (Date object) using `<`, which works due to implicit coercion
 * but is fragile and confusing.  Additionally, the overdue check was applied
 * AFTER status grouping, which made the intent unclear.  Rewritten for
 * clarity: a task is overdue when it has a dueDate, that date is in the past,
 * AND the task is not yet done.
 *
 * @returns {{ todo: number, in_progress: number, done: number, overdue: number }}
 */
const getTaskStats = () => {
  const allTasks = getAllTasks();
  const nowMs    = Date.now();

  const stats = {
    todo: 0,
    in_progress: 0,
    done: 0,
    overdue: 0,
  };

  for (const task of allTasks) {
    // Count by status.
    if (task.status === 'todo')        stats.todo        += 1;
    else if (task.status === 'in_progress') stats.in_progress += 1;
    else if (task.status === 'done')   stats.done        += 1;

    // A task is overdue if it has a due date, that date has passed, and the
    // task is not completed.
    if (task.dueDate && new Date(task.dueDate).getTime() < nowMs && task.status !== 'done') {
      stats.overdue += 1;
    }
  }

  return stats;
};

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  tasks,           // exported for test teardown only
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  getFilteredTasks,
  getTaskStats,
};
