/**
 * routes/tasks.js — Express route handlers for the /tasks resource.
 *
 * Route layout:
 *   GET    /tasks                — list all (with optional filters & pagination)
 *   GET    /tasks/stats          — counts by status + overdue count
 *   GET    /tasks/:id            — get one task
 *   POST   /tasks                — create a task
 *   PUT    /tasks/:id            — update a task (partial)
 *   DELETE /tasks/:id            — delete a task
 *   PATCH  /tasks/:id/complete   — mark a task as complete
 *
 * NOTE: The /stats route MUST be registered before /:id, otherwise Express
 * will try to look up a task with id "stats" and return 404.
 */

'use strict';

const express = require('express');
const {
  getFilteredTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  getTaskStats,
} = require('../services/taskService');
const { validateCreateTask, validateUpdateTask } = require('../utils/validators');

const router = express.Router();

// ── GET /tasks ────────────────────────────────────────────────────────────────

/**
 * Returns a (possibly filtered and paginated) list of tasks.
 *
 * Query parameters:
 *   status  — filter by status (todo | in_progress | done)
 *   page    — page number (default 1)
 *   limit   — items per page (default 10)
 *   search  — case-insensitive substring match against title and description
 */
router.get('/', (req, res) => {
  const { status, page, limit, search } = req.query;
  const result = getFilteredTasks({ status, page, limit, search });
  res.json(result);
});

// ── GET /tasks/stats ──────────────────────────────────────────────────────────

/**
 * Returns task counts grouped by status plus an overdue count.
 *
 * Must be registered BEFORE /:id so Express does not interpret "stats" as an
 * ID segment.
 */
router.get('/stats', (_req, res) => {
  const stats = getTaskStats();
  res.json(stats);
});

// ── GET /tasks/:id ────────────────────────────────────────────────────────────

/**
 * Returns a single task by ID.
 * Responds with 404 when the ID is not found.
 */
router.get('/:id', (req, res) => {
  const task = getTaskById(req.params.id);

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json(task);
});

// ── POST /tasks ───────────────────────────────────────────────────────────────

/**
 * Creates a new task.
 * Responds with 400 when validation fails, 201 with the created task otherwise.
 */
router.post('/', (req, res) => {
  const validation = validateCreateTask(req.body);

  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const task = createTask(req.body);
  res.status(201).json(task);
});

// ── PUT /tasks/:id ────────────────────────────────────────────────────────────

/**
 * Fully or partially updates a task.
 * Responds with 400 on validation failure, 404 when not found, 200 otherwise.
 */
router.put('/:id', (req, res) => {
  const validation = validateUpdateTask(req.body);

  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const task = updateTask(req.params.id, req.body);

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json(task);
});

// ── DELETE /tasks/:id ─────────────────────────────────────────────────────────

/**
 * Deletes a task by ID.
 * Responds with 204 (no body) on success, 404 when not found.
 */
router.delete('/:id', (req, res) => {
  const deleted = deleteTask(req.params.id);

  if (!deleted) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.status(204).send();
});

// ── PATCH /tasks/:id/complete ─────────────────────────────────────────────────

/**
 * Marks a task as complete (status → "done", completedAt → now).
 * Responds with 404 when not found, 200 with the updated task otherwise.
 */
router.patch('/:id/complete', (req, res) => {
  const task = completeTask(req.params.id);

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json(task);
});

module.exports = router;
