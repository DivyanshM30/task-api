/**
 * app.js — Express application entry point.
 *
 * Sets up middleware (JSON parsing, request logging) and mounts the
 * /tasks router. The server is started here when run directly.
 */

'use strict';

const express = require('express');
const taskRoutes = require('./routes/tasks');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────

// Parse incoming JSON bodies
app.use(express.json());

// Minimal request logger (useful for manual testing)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────

// All task-related endpoints live under /tasks
app.use('/tasks', taskRoutes);

// ── 404 catch-all ─────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────

// Catches errors thrown inside route handlers that were not handled locally.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start server (only when run directly, not when required by tests) ─────────

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Task API running on http://localhost:${PORT}`);
  });
}

module.exports = app;
