import { describe, it, expect } from 'vitest';
import {
  ROLES,
  LEADER_ROLES,
  isDeveloperRole,
  isAdminRole,
  isLeaderRole,
  canAccessLeaderTools,
} from './roles';

describe('roles', () => {
  it('defines the developer role', () => {
    expect(ROLES.DEVELOPER).toBe('developer');
    expect(LEADER_ROLES).toContain(ROLES.DEVELOPER);
  });

  describe('isDeveloperRole', () => {
    it('is true only for developer', () => {
      expect(isDeveloperRole(ROLES.DEVELOPER)).toBe(true);
      expect(isDeveloperRole(ROLES.ADMIN)).toBe(false);
      expect(isDeveloperRole(ROLES.LEADER)).toBe(false);
      expect(isDeveloperRole(ROLES.STUDENT)).toBe(false);
      expect(isDeveloperRole(undefined)).toBe(false);
    });
  });

  describe('isAdminRole', () => {
    it('developer inherits admin', () => {
      expect(isAdminRole(ROLES.DEVELOPER)).toBe(true);
      expect(isAdminRole(ROLES.ADMIN)).toBe(true);
    });

    it('non-admin roles are excluded', () => {
      expect(isAdminRole(ROLES.LEADER)).toBe(false);
      expect(isAdminRole(ROLES.STUDENT_LEADER)).toBe(false);
      expect(isAdminRole(ROLES.PARENT_LEADER)).toBe(false);
      expect(isAdminRole(ROLES.STUDENT)).toBe(false);
      expect(isAdminRole(null)).toBe(false);
    });
  });

  describe('isLeaderRole', () => {
    it.each([
      [ROLES.DEVELOPER, true],
      [ROLES.ADMIN, true],
      [ROLES.LEADER, true],
      [ROLES.STUDENT_LEADER, true],
      [ROLES.PARENT_LEADER, true],
      [ROLES.STUDENT, false],
      [undefined, false],
    ])('%s → %s', (role, expected) => {
      expect(isLeaderRole(role)).toBe(expected);
      expect(canAccessLeaderTools(role)).toBe(expected);
    });
  });
});
