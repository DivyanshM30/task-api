/**
 * tests/tasks.api.test.js — Integration tests for the /tasks HTTP API.
 *
 * Uses Supertest to make real HTTP requests against the Express app without
 * binding to a port.  The in-memory store is cleared between each test.
 *
 * Coverage targets:
 *   GET    /tasks
 *   GET    /tasks?status=...
 *   GET    /tasks?page=...&limit=...
 *   GET    /tasks?search=...         (new search feature)
 *   GET    /tasks/stats
 *   GET    /tasks/:id
 *   POST   /tasks
 *   PUT    /tasks/:id
 *   DELETE /tasks/:id
 *   PATCH  /tasks/:id/complete
 */

'use strict';

const request = require('supertest');
const app     = require('../src/app');
const { tasks } = require('../src/services/taskService');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Clears the store before each test so tests don't pollute each other. */
beforeEach(() => tasks.clear());

/**
 * Creates a task via the API and returns the parsed response body.
 * Throws if the request fails so the calling test surfaces errors clearly.
 */
const apiCreateTask = async (body = {}) => {
  const res = await request(app)
    .post('/tasks')
    .send({ title: 'Default task', ...body });
  if (res.status !== 201) throw new Error(`createTask failed: ${JSON.stringify(res.body)}`);
  return res.body;
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /tasks
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /tasks', () => {
  it('creates a task and returns 201', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: 'Buy milk' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('Buy milk');
    expect(res.body.status).toBe('todo');
    expect(res.body.priority).toBe('medium');
    expect(res.body.completedAt).toBeNull();
  });

  it('accepts all optional fields', async () => {
    const body = {
      title: 'Full task',
      description: 'Detailed description',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2025-12-31T23:59:59.000Z',
    };
    const res = await request(app).post('/tasks').send(body);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('in_progress');
    expect(res.body.priority).toBe('high');
    expect(res.body.dueDate).toBe('2025-12-31T23:59:59.000Z');
  });

  it('returns 400 when title is missing', async () => {
    const res = await request(app).post('/tasks').send({ description: 'no title' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  it('returns 400 when title is empty', async () => {
    const res = await request(app).post('/tasks').send({ title: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when status is invalid', async () => {
    const res = await request(app).post('/tasks').send({ title: 'T', status: 'bad' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status/i);
  });

  it('returns 400 when priority is invalid', async () => {
    const res = await request(app).post('/tasks').send({ title: 'T', priority: 'extreme' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when dueDate is an invalid string', async () => {
    const res = await request(app).post('/tasks').send({ title: 'T', dueDate: 'last tuesday' });
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /tasks
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /tasks', () => {
  it('returns an empty list when no tasks exist', async () => {
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body.tasks).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('returns all tasks', async () => {
    await apiCreateTask({ title: 'Task A' });
    await apiCreateTask({ title: 'Task B' });
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.tasks).toHaveLength(2);
  });

  it('includes pagination metadata', async () => {
    const res = await request(app).get('/tasks');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('limit');
    expect(res.body).toHaveProperty('totalPages');
  });

  // ── Status filter ─────────────────────────────────────────────────────────

  it('filters by ?status=todo', async () => {
    await apiCreateTask({ title: 'A', status: 'todo' });
    await apiCreateTask({ title: 'B', status: 'done' });
    const res = await request(app).get('/tasks?status=todo');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.tasks[0].status).toBe('todo');
  });

  // ── Pagination ────────────────────────────────────────────────────────────

  it('paginates with ?page=1&limit=1', async () => {
    await apiCreateTask({ title: 'A' });
    await apiCreateTask({ title: 'B' });
    const res = await request(app).get('/tasks?page=1&limit=1');
    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.totalPages).toBe(2);
  });

  it('returns empty array for out-of-range page', async () => {
    await apiCreateTask();
    const res = await request(app).get('/tasks?page=99&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(0);
  });

  // ── Search feature ────────────────────────────────────────────────────────

  it('filters by ?search= matching title', async () => {
    await apiCreateTask({ title: 'Buy groceries', description: '' });
    await apiCreateTask({ title: 'Read a book', description: '' });
    const res = await request(app).get('/tasks?search=groceries');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.tasks[0].title).toBe('Buy groceries');
  });

  it('search is case-insensitive', async () => {
    await apiCreateTask({ title: 'Buy Groceries' });
    const res = await request(app).get('/tasks?search=GROCERIES');
    expect(res.body.total).toBe(1);
  });

  it('search matches description', async () => {
    await apiCreateTask({ title: 'Alpha', description: 'contains the word secret' });
    await apiCreateTask({ title: 'Beta',  description: 'nothing here' });
    const res = await request(app).get('/tasks?search=secret');
    expect(res.body.total).toBe(1);
    expect(res.body.tasks[0].title).toBe('Alpha');
  });

  it('returns empty when search does not match anything', async () => {
    await apiCreateTask({ title: 'Something' });
    const res = await request(app).get('/tasks?search=zzznotfound');
    expect(res.body.total).toBe(0);
  });

  it('search can be combined with status filter', async () => {
    await apiCreateTask({ title: 'Todo note',    status: 'todo' });
    await apiCreateTask({ title: 'Done note',    status: 'done' });
    await apiCreateTask({ title: 'Something else', status: 'todo' });
    const res = await request(app).get('/tasks?status=todo&search=note');
    expect(res.body.total).toBe(1);
    expect(res.body.tasks[0].title).toBe('Todo note');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /tasks/stats
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /tasks/stats', () => {
  it('returns zeroes when no tasks exist', async () => {
    const res = await request(app).get('/tasks/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  it('counts by status correctly', async () => {
    await apiCreateTask({ status: 'todo' });
    await apiCreateTask({ status: 'todo' });
    await apiCreateTask({ status: 'in_progress' });
    await apiCreateTask({ status: 'done' });
    const res = await request(app).get('/tasks/stats');
    expect(res.body.todo).toBe(2);
    expect(res.body.in_progress).toBe(1);
    expect(res.body.done).toBe(1);
  });

  it('counts overdue tasks (BUG 1 fix) — past due, not done', async () => {
    // Past due + todo → overdue
    await apiCreateTask({ status: 'todo', dueDate: '2000-01-01T00:00:00.000Z' });
    // Past due + done → NOT overdue
    await apiCreateTask({ status: 'done', dueDate: '2000-01-01T00:00:00.000Z' });
    // Future due + todo → NOT overdue
    await apiCreateTask({ status: 'todo', dueDate: '2099-01-01T00:00:00.000Z' });

    const res = await request(app).get('/tasks/stats');
    expect(res.body.overdue).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /tasks/:id
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /tasks/:id', () => {
  it('returns a task by id', async () => {
    const created = await apiCreateTask({ title: 'Specific task' });
    const res = await request(app).get(`/tasks/${created.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.id);
    expect(res.body.title).toBe('Specific task');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get('/tasks/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /tasks/:id
// ─────────────────────────────────────────────────────────────────────────────

describe('PUT /tasks/:id', () => {
  it('updates a task and returns it', async () => {
    const created = await apiCreateTask({ title: 'Original' });
    const res = await request(app)
      .put(`/tasks/${created.id}`)
      .send({ title: 'Updated', status: 'in_progress' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated');
    expect(res.body.status).toBe('in_progress');
  });

  it('sets completedAt when status updated to "done" (BUG 2 fix)', async () => {
    const created = await apiCreateTask();
    const res = await request(app)
      .put(`/tasks/${created.id}`)
      .send({ status: 'done' });

    expect(res.status).toBe(200);
    expect(res.body.completedAt).not.toBeNull();
  });

  it('clears completedAt when moving from "done" to another status', async () => {
    const created = await apiCreateTask();
    // First mark as done.
    await request(app).put(`/tasks/${created.id}`).send({ status: 'done' });
    // Then reopen.
    const res = await request(app)
      .put(`/tasks/${created.id}`)
      .send({ status: 'in_progress' });

    expect(res.status).toBe(200);
    expect(res.body.completedAt).toBeNull();
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app)
      .put('/tasks/no-such-id')
      .send({ title: 'X' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when status is invalid', async () => {
    const created = await apiCreateTask();
    const res = await request(app)
      .put(`/tasks/${created.id}`)
      .send({ status: 'archived' });
    expect(res.status).toBe(400);
  });

  it('accepts an empty update body (no-op)', async () => {
    const created = await apiCreateTask({ title: 'Stable' });
    const res = await request(app)
      .put(`/tasks/${created.id}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Stable');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /tasks/:id
// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /tasks/:id', () => {
  it('deletes a task and returns 204', async () => {
    const created = await apiCreateTask();
    const res = await request(app).delete(`/tasks/${created.id}`);
    expect(res.status).toBe(204);
  });

  it('task is no longer retrievable after deletion', async () => {
    const created = await apiCreateTask();
    await request(app).delete(`/tasks/${created.id}`);
    const res = await request(app).get(`/tasks/${created.id}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 when task does not exist', async () => {
    const res = await request(app).delete('/tasks/ghost');
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /tasks/:id/complete
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /tasks/:id/complete', () => {
  it('marks a task as complete', async () => {
    const created = await apiCreateTask({ status: 'in_progress' });
    const res = await request(app).patch(`/tasks/${created.id}/complete`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.completedAt).not.toBeNull();
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).patch('/tasks/unknown-id/complete');
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 404 catch-all
// ─────────────────────────────────────────────────────────────────────────────

describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/unknown-route');
    expect(res.status).toBe(404);
  });
});
