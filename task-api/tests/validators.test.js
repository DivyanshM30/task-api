/**
 * tests/validators.test.js — Unit tests for src/utils/validators.js
 *
 * Tests every exported validator function in isolation.  No HTTP layer is
 * involved; these run purely against the pure JS functions.
 */

'use strict';

const {
  isNonEmptyString,
  isValidStatus,
  isValidPriority,
  isValidDate,
  validateCreateTask,
  validateUpdateTask,
} = require('../src/utils/validators');

// ─────────────────────────────────────────────────────────────────────────────
// isNonEmptyString
// ─────────────────────────────────────────────────────────────────────────────

describe('isNonEmptyString', () => {
  it('returns true for a plain non-empty string', () => {
    expect(isNonEmptyString('hello')).toBe(true);
  });

  it('returns true for a string with only inner spaces', () => {
    expect(isNonEmptyString('hello world')).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(isNonEmptyString('')).toBe(false);
  });

  it('returns false for a whitespace-only string', () => {
    expect(isNonEmptyString('   ')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isNonEmptyString(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isNonEmptyString(undefined)).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isNonEmptyString(42)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isValidStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('isValidStatus', () => {
  it('accepts "todo"', () => {
    expect(isValidStatus('todo')).toBe(true);
  });

  it('accepts "in_progress"', () => {
    expect(isValidStatus('in_progress')).toBe(true);
  });

  it('accepts "done"', () => {
    expect(isValidStatus('done')).toBe(true);
  });

  it('rejects an unknown status', () => {
    expect(isValidStatus('pending')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidStatus('')).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidStatus(null)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isValidPriority
// ─────────────────────────────────────────────────────────────────────────────

describe('isValidPriority', () => {
  it('accepts "low"', () => {
    expect(isValidPriority('low')).toBe(true);
  });

  it('accepts "medium"', () => {
    expect(isValidPriority('medium')).toBe(true);
  });

  it('accepts "high"', () => {
    expect(isValidPriority('high')).toBe(true);
  });

  it('rejects an unknown priority', () => {
    expect(isValidPriority('critical')).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidPriority(null)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isValidDate
// ─────────────────────────────────────────────────────────────────────────────

describe('isValidDate', () => {
  it('accepts null (no due date)', () => {
    expect(isValidDate(null)).toBe(true);
  });

  it('accepts undefined (no due date)', () => {
    expect(isValidDate(undefined)).toBe(true);
  });

  it('accepts a valid ISO date string', () => {
    expect(isValidDate('2025-01-15T10:00:00.000Z')).toBe(true);
  });

  it('accepts a date-only string', () => {
    expect(isValidDate('2025-06-01')).toBe(true);
  });

  it('rejects a nonsense string', () => {
    expect(isValidDate('not-a-date')).toBe(false);
  });

  it('rejects a number', () => {
    // Numbers are not valid ISO strings even though they coerce to dates.
    expect(isValidDate(1234567890)).toBe(false);
  });

  it('rejects an empty string', () => {
    // new Date('') returns Invalid Date
    expect(isValidDate('')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateCreateTask
// ─────────────────────────────────────────────────────────────────────────────

describe('validateCreateTask', () => {
  it('returns valid for a minimal payload with only title', () => {
    expect(validateCreateTask({ title: 'Buy milk' })).toEqual({ valid: true });
  });

  it('returns valid for a full payload', () => {
    const result = validateCreateTask({
      title: 'Buy milk',
      description: 'From the corner shop',
      status: 'todo',
      priority: 'high',
      dueDate: '2025-12-31T23:59:59.000Z',
    });
    expect(result).toEqual({ valid: true });
  });

  it('fails when title is missing', () => {
    const result = validateCreateTask({ description: 'no title' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/title/i);
  });

  it('fails when title is an empty string', () => {
    const result = validateCreateTask({ title: '' });
    expect(result.valid).toBe(false);
  });

  it('fails when title is whitespace only', () => {
    const result = validateCreateTask({ title: '   ' });
    expect(result.valid).toBe(false);
  });

  it('fails when status is invalid', () => {
    const result = validateCreateTask({ title: 'Test', status: 'archived' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/status/i);
  });

  it('fails when priority is invalid', () => {
    const result = validateCreateTask({ title: 'Test', priority: 'urgent' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/priority/i);
  });

  it('fails when dueDate is an invalid date string', () => {
    const result = validateCreateTask({ title: 'Test', dueDate: 'tomorrow' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/dueDate/i);
  });

  it('accepts null dueDate', () => {
    const result = validateCreateTask({ title: 'Test', dueDate: null });
    expect(result.valid).toBe(true);
  });

  it('fails when body is null', () => {
    const result = validateCreateTask(null);
    expect(result.valid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateUpdateTask
// ─────────────────────────────────────────────────────────────────────────────

describe('validateUpdateTask', () => {
  it('returns valid for an empty body (no-op update)', () => {
    // An empty update body is allowed — the handler simply keeps existing values.
    expect(validateUpdateTask({})).toEqual({ valid: true });
  });

  it('returns valid when only title is updated', () => {
    expect(validateUpdateTask({ title: 'New title' })).toEqual({ valid: true });
  });

  it('fails when title is an empty string', () => {
    const result = validateUpdateTask({ title: '' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/title/i);
  });

  it('fails when status is invalid', () => {
    const result = validateUpdateTask({ status: 'cancelled' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/status/i);
  });

  it('fails when priority is invalid', () => {
    const result = validateUpdateTask({ priority: 'extreme' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/priority/i);
  });

  it('fails when dueDate is invalid', () => {
    const result = validateUpdateTask({ dueDate: 'yesterday' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/dueDate/i);
  });

  it('returns valid for all valid fields', () => {
    const result = validateUpdateTask({
      title: 'Updated',
      status: 'in_progress',
      priority: 'low',
      dueDate: '2026-03-01',
    });
    expect(result.valid).toBe(true);
  });

  it('fails when body is null', () => {
    const result = validateUpdateTask(null);
    expect(result.valid).toBe(false);
  });
});
