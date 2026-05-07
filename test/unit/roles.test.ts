import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, ROLE_DESCRIPTIONS, isRole } from '../../src/roles.js';

test('ROLES contains exactly the four roles in canonical order', () => {
  assert.deepEqual(ROLES, ['boss', 'reviewer', 'researcher', 'consultant']);
});

test('isRole accepts every known role', () => {
  for (const role of ROLES) {
    assert.equal(isRole(role), true, `expected ${role} to be a role`);
  }
});

test('isRole rejects unknown / mis-cased / empty values', () => {
  assert.equal(isRole('writer'), false);
  assert.equal(isRole(''), false);
  assert.equal(isRole('BOSS'), false);
  assert.equal(isRole('Boss'), false);
});

test('ROLE_DESCRIPTIONS has a non-empty description for every role', () => {
  for (const role of ROLES) {
    assert.ok(
      ROLE_DESCRIPTIONS[role].length > 10,
      `${role} should have a meaningful description`,
    );
  }
});
