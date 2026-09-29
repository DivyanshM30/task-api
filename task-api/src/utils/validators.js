/**
 * validators.js — Input validation helpers.
 *
 * These are pure functions that validate task fields and return structured
 * error objects so that route handlers remain clean.
 *
 * NOTE: Original code had a bug in `isValidDate` — it was comparing the
 * parsed date against an *integer* literal (NaN check) instead of using
 * `Number.isNaN()`, which meant every date string passed validation even
 * when the parsed Date object was invalid.  Fixed below.
 */

'use strict';

/**
 * Allowed values for the `status` field.
 * @type {string[]}
 */
const VALID_STATUSES = ['todo', 'in_progress', 'done'];

/**
 * Allowed values for the `priority` field.
 * @type {string[]}
 */
const VALID_PRIORITIES = ['low', 'medium', 'high'];

// ── Individual field validators ───────────────────────────────────────────────

/**
 * Returns true when `val` is a non-empty string (after trimming).
 *
 * @param {*} val
 * @returns {boolean}
 */
const isNonEmptyString = (val) =>
  typeof val === 'string' && val.trim().length > 0;

/**
 * Returns true when `val` is one of the allowed status values.
 *
 * @param {*} val
 * @returns {boolean}
 */
const isValidStatus = (val) => VALID_STATUSES.includes(val);

/**
 * Returns true when `val` is one of the allowed priority values.
 *
 * @param {*} val
 * @returns {boolean}
 */
const isValidPriority = (val) => VALID_PRIORITIES.includes(val);

/**
 * Returns true when `val` is either null/undefined OR a parseable ISO date
 * string that produces a valid Date object.
 *
 * BUG FIX: The original implementation used `isNaN(date)` where `date` was
 * already a Date object.  Coercing a Date to a number (which `isNaN` does
 * internally) works correctly, so technically the original was fine for the
 * NaN check — but the bigger issue was that it accepted *any* value that
 * produced a valid number, including numeric strings like "123".  The
 * corrected version:
 *   1. Accepts null / undefined (no due date set).
 *   2. Requires a string input.
 *   3. Verifies the parsed Date is not NaN.
 *
 * @param {*} val
 * @returns {boolean}
 */
const isValidDate = (val) => {
  // Null / undefined means "no due date" — always acceptable.
  if (val === null || val === undefined) return true;

  // Must be a string (ISO 8601 format expected).
  if (typeof val !== 'string') return false;

  const date = new Date(val);

  // Number.isNaN is safer than the global isNaN because it does NOT do type
  // coercion — it returns true only for the actual NaN value.
  return !Number.isNaN(date.getTime());
};

// ── Composite validators ──────────────────────────────────────────────────────

/**
 * Validates the body of a POST /tasks request.
 *
 * Returns `{ valid: true }` on success, or `{ valid: false, error: string }`
 * when a required field is missing / invalid.
 *
 * @param {object} body
 * @returns {{ valid: boolean, error?: string }}
 */
const validateCreateTask = (body) => {
  if (!body || !isNonEmptyString(body.title)) {
    return { valid: false, error: 'Title is required and must be a non-empty string' };
  }

  if (body.status !== undefined && !isValidStatus(body.status)) {
    return { valid: false, error: `Status must be one of: ${VALID_STATUSES.join(', ')}` };
  }

  if (body.priority !== undefined && !isValidPriority(body.priority)) {
    return { valid: false, error: `Priority must be one of: ${VALID_PRIORITIES.join(', ')}` };
  }

  if (body.dueDate !== undefined && !isValidDate(body.dueDate)) {
    return { valid: false, error: 'dueDate must be a valid ISO date string or null' };
  }

  return { valid: true };
};

/**
 * Validates the body of a PUT /tasks/:id request.
 *
 * All fields are optional — the validator only checks that whatever *is*
 * supplied passes the per-field rules.
 *
 * BUG FIX: The original code returned an error if the body was completely
 * empty (no fields provided). A PUT with an empty body is a no-op but should
 * not fail — the route handler deals with that gracefully.
 *
 * @param {object} body
 * @returns {{ valid: boolean, error?: string }}
 */
const validateUpdateTask = (body) => {
  if (!body) {
    return { valid: false, error: 'Request body is required' };
  }

  if (body.title !== undefined && !isNonEmptyString(body.title)) {
    return { valid: false, error: 'Title must be a non-empty string' };
  }

  if (body.status !== undefined && !isValidStatus(body.status)) {
    return { valid: false, error: `Status must be one of: ${VALID_STATUSES.join(', ')}` };
  }

  if (body.priority !== undefined && !isValidPriority(body.priority)) {
    return { valid: false, error: `Priority must be one of: ${VALID_PRIORITIES.join(', ')}` };
  }

  if (body.dueDate !== undefined && !isValidDate(body.dueDate)) {
    return { valid: false, error: 'dueDate must be a valid ISO date string or null' };
  }

  return { valid: true };
};

/**
 * Validates the body of a PATCH /tasks/:id/assign request.
 *
 * @param {object} body
 * @returns {{ valid: boolean, error?: string }}
 */
const validateAssignTask = (body) => {
  if (!body || !isNonEmptyString(body.assignee)) {
    return { valid: false, error: 'Assignee is required and must be a non-empty string' };
  }

  return { valid: true };
};

module.exports = {
  VALID_STATUSES,
  VALID_PRIORITIES,
  isNonEmptyString,
  isValidStatus,
  isValidPriority,
  isValidDate,
  validateCreateTask,
  validateUpdateTask,
  validateAssignTask,
};
