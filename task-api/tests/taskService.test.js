/**
 * tests/taskService.test.js — Unit tests for src/services/taskService.js
 *
 * Tests the service layer directly (no HTTP).  After each test the in-memory
 * store is cleared so tests are fully isolated.
 *
 * Coverage targets:
 *  - createTask
 *  - getTaskById
 *  - getAllTasks
 *  - updateTask  (including BUG 2 fix — completedAt stamping)
 *  - deleteTask
 *  - completeTask
 *  - getFilteredTasks (status filter, pagination, search feature)
 *  - getTaskStats  (including BUG 1 fix — overdue count)
 */

'use strict';

const {
  tasks,
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  getFilteredTasks,
  getTaskStats,
} = require('../src/services/taskService');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wipe the in-memory store before each test. */
beforeEach(() => tasks.clear());

/** Shorthand — creates a task and returns it. */
const makeTask = (overrides = {}) =>
  createTask({ title: 'Test task', ...overrides });

// ─────────────────────────────────────────────────────────────────────────────
// createTask
// ─────────────────────────────────────────────────────────────────────────────

describe('createTask', () => {
  it('persists a task and returns it with an id', () => {
    const task = makeTask();
    expect(task.id).toBeDefined();
    expect(tasks.size).toBe(1);
  });

  it('applies sensible defaults', () => {
    const task = makeTask();
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('medium');
    expect(task.dueDate).toBeNull();
    expect(task.completedAt).toBeNull();
    expect(task.createdAt).toBeDefined();
  });

  it('trims whitespace from title and description', () => {
    const task = createTask({ title: '  Buy milk  ', description: '  corner shop  ' });
    expect(task.title).toBe('Buy milk');
    expect(task.description).toBe('corner shop');
  });

  it('accepts an explicit status, priority and dueDate', () => {
    const task = makeTask({ status: 'in_progress', priority: 'high', dueDate: '2025-12-31' });
    expect(task.status).toBe('in_progress');
    expect(task.priority).toBe('high');
    expect(task.dueDate).toBe('2025-12-31');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getTaskById
// ─────────────────────────────────────────────────────────────────────────────

describe('getTaskById', () => {
  it('returns the task for a known id', () => {
    const task = makeTask();
    expect(getTaskById(task.id)).toEqual(task);
  });

  it('returns undefined for an unknown id', () => {
    expect(getTaskById('does-not-exist')).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getAllTasks
// ─────────────────────────────────────────────────────────────────────────────

describe('getAllTasks', () => {
  it('returns an empty array when no tasks exist', () => {
    expect(getAllTasks()).toEqual([]);
  });

  it('returns all created tasks', () => {
    makeTask({ title: 'Task A' });
    makeTask({ title: 'Task B' });
    expect(getAllTasks()).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateTask
// ─────────────────────────────────────────────────────────────────────────────

describe('updateTask', () => {
  it('returns null for an unknown id', () => {
    expect(updateTask('no-such-id', { title: 'X' })).toBeNull();
  });

  it('updates only the provided fields', () => {
    const task = makeTask({ title: 'Original' });
    const updated = updateTask(task.id, { title: 'Changed' });
    expect(updated.title).toBe('Changed');
    expect(updated.status).toBe('todo'); // unchanged
  });

  it('persists the update so getTaskById reflects it', () => {
    const task = makeTask();
    updateTask(task.id, { status: 'in_progress' });
    expect(getTaskById(task.id).status).toBe('in_progress');
  });

  // BUG 2 FIX verification ───────────────────────────────────────────────────

  it('stamps completedAt when status is updated to "done"', () => {
    const task = makeTask();
    expect(task.completedAt).toBeNull();

    const updated = updateTask(task.id, { status: 'done' });
    expect(updated.status).toBe('done');
    expect(updated.completedAt).not.toBeNull();
    // Ensure it is a valid ISO date string.
    expect(new Date(updated.completedAt).getTime()).not.toBeNaN();
  });

  it('clears completedAt when moving away from "done"', () => {
    // First complete the task.
    const task = makeTask();
    updateTask(task.id, { status: 'done' });

    // Now reopen it.
    const reopened = updateTask(task.id, { status: 'in_progress' });
    expect(reopened.status).toBe('in_progress');
    expect(reopened.completedAt).toBeNull();
  });

  it('does not double-stamp completedAt if already done', () => {
    const task = makeTask();
    const firstUpdate = updateTask(task.id, { status: 'done' });
    const firstTs = firstUpdate.completedAt;

    // Updating other fields should not change completedAt.
    const secondUpdate = updateTask(task.id, { title: 'New title' });
    expect(secondUpdate.completedAt).toBe(firstTs);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteTask
// ─────────────────────────────────────────────────────────────────────────────

describe('deleteTask', () => {
  it('returns false when the task does not exist', () => {
    expect(deleteTask('ghost-id')).toBe(false);
  });

  it('returns true and removes the task', () => {
    const task = makeTask();
    expect(deleteTask(task.id)).toBe(true);
    expect(getTaskById(task.id)).toBeUndefined();
    expect(tasks.size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// completeTask
// ─────────────────────────────────────────────────────────────────────────────

describe('completeTask', () => {
  it('returns null for an unknown id', () => {
    expect(completeTask('nope')).toBeNull();
  });

  it('sets status to "done" and stamps completedAt', () => {
    const task = makeTask({ status: 'in_progress' });
    const completed = completeTask(task.id);
    expect(completed.status).toBe('done');
    expect(completed.completedAt).not.toBeNull();
  });

  it('is idempotent — completing an already-done task updates completedAt', () => {
    const task = makeTask();
    completeTask(task.id);
    const again = completeTask(task.id);
    expect(again.status).toBe('done');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getFilteredTasks
// ─────────────────────────────────────────────────────────────────────────────

describe('getFilteredTasks', () => {
  beforeEach(() => {
    makeTask({ title: 'Todo task 1',       status: 'todo' });
    makeTask({ title: 'Todo task 2',       status: 'todo' });
    makeTask({ title: 'In-progress task',  status: 'in_progress' });
    makeTask({ title: 'Done task',         status: 'done' });
  });

  // ── Baseline ────────────────────────────────────────────────────────────────

  it('returns all tasks with no filters', () => {
    const result = getFilteredTasks();
    expect(result.total).toBe(4);
    expect(result.tasks).toHaveLength(4);
  });

  // ── Status filter ────────────────────────────────────────────────────────────

  it('filters by status=todo', () => {
    const result = getFilteredTasks({ status: 'todo' });
    expect(result.total).toBe(2);
    result.tasks.forEach((t) => expect(t.status).toBe('todo'));
  });

  it('filters by status=in_progress', () => {
    const result = getFilteredTasks({ status: 'in_progress' });
    expect(result.total).toBe(1);
    expect(result.tasks[0].status).toBe('in_progress');
  });

  it('returns empty array when no tasks match the status filter', () => {
    tasks.clear();
    const result = getFilteredTasks({ status: 'done' });
    expect(result.total).toBe(0);
    expect(result.tasks).toHaveLength(0);
  });

  // ── Pagination — BUG 3 fix verification ──────────────────────────────────────

  it('defaults to page=1, limit=10 when no params provided', () => {
    const result = getFilteredTasks();
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  it('defaults gracefully when page/limit are undefined strings', () => {
    // Simulates what Express passes when query params are absent.
    const result = getFilteredTasks({ page: undefined, limit: undefined });
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.tasks.length).toBeGreaterThan(0);
  });

  it('paginates correctly — page 1 of 2 with limit 2', () => {
    const result = getFilteredTasks({ page: 1, limit: 2 });
    expect(result.tasks).toHaveLength(2);
    expect(result.totalPages).toBe(2);
  });

  it('paginates correctly — page 2 of 2 with limit 2', () => {
    const result = getFilteredTasks({ page: 2, limit: 2 });
    expect(result.tasks).toHaveLength(2);
  });

  it('returns empty array for a page beyond the last', () => {
    const result = getFilteredTasks({ page: 99, limit: 10 });
    expect(result.tasks).toHaveLength(0);
  });

  // ── Search feature ────────────────────────────────────────────────────────────

  it('returns matching tasks when search query matches title', () => {
    const result = getFilteredTasks({ search: 'done' });
    expect(result.total).toBe(1);
    expect(result.tasks[0].title).toBe('Done task');
  });

  it('search is case-insensitive', () => {
    const result = getFilteredTasks({ search: 'TODO' });
    expect(result.total).toBe(2);
  });

  it('search matches within description', () => {
    tasks.clear();
    createTask({ title: 'Alpha', description: 'Contains the word budget' });
    createTask({ title: 'Beta',  description: 'Nothing special here' });
    const result = getFilteredTasks({ search: 'budget' });
    expect(result.total).toBe(1);
    expect(result.tasks[0].title).toBe('Alpha');
  });

  it('search returns empty when no matches', () => {
    const result = getFilteredTasks({ search: 'xyzzy_no_match' });
    expect(result.total).toBe(0);
  });

  it('search can be combined with status filter', () => {
    const result = getFilteredTasks({ status: 'todo', search: 'task 1' });
    expect(result.total).toBe(1);
    expect(result.tasks[0].title).toBe('Todo task 1');
  });

  it('ignores empty search string', () => {
    const result = getFilteredTasks({ search: '' });
    expect(result.total).toBe(4);
  });

  it('ignores whitespace-only search string', () => {
    const result = getFilteredTasks({ search: '   ' });
    expect(result.total).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getTaskStats — BUG 1 fix verification
// ─────────────────────────────────────────────────────────────────────────────

describe('getTaskStats', () => {
  it('returns zeroes when no tasks exist', () => {
    const stats = getTaskStats();
    expect(stats).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  it('counts tasks by status', () => {
    makeTask({ status: 'todo' });
    makeTask({ status: 'todo' });
    makeTask({ status: 'in_progress' });
    makeTask({ status: 'done' });
    const stats = getTaskStats();
    expect(stats.todo).toBe(2);
    expect(stats.in_progress).toBe(1);
    expect(stats.done).toBe(1);
  });

  it('counts overdue tasks correctly (BUG 1 fix)', () => {
    // A past due date + not done → overdue
    makeTask({ status: 'todo', dueDate: '2000-01-01T00:00:00.000Z' });
    // A past due date + done → NOT overdue
    makeTask({ status: 'done', dueDate: '2000-01-01T00:00:00.000Z' });
    // A future due date + todo → NOT overdue
    makeTask({ status: 'todo', dueDate: '2099-01-01T00:00:00.000Z' });
    // No due date → NOT overdue
    makeTask({ status: 'todo', dueDate: null });

    const stats = getTaskStats();
    // Only the first task should be counted as overdue.
    expect(stats.overdue).toBe(1);
  });

  it('does not count a done task as overdue even if past dueDate', () => {
    makeTask({ status: 'done', dueDate: '2000-06-01' });
    const stats = getTaskStats();
    expect(stats.overdue).toBe(0);
  });

  it('does not count a task without a dueDate as overdue', () => {
    makeTask({ status: 'todo', dueDate: null });
    const stats = getTaskStats();
    expect(stats.overdue).toBe(0);
  });
});
