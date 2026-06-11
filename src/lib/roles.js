export const ROLES = {
  DEVELOPER: 'developer',
  ADMIN: 'admin',
  LEADER: 'leader',
  STUDENT_LEADER: 'student_leader',
  PARENT_LEADER: 'parent_leader',
  STUDENT: 'student',
};

export const LEADER_ROLES = [
  ROLES.DEVELOPER,
  ROLES.ADMIN,
  ROLES.LEADER,
  ROLES.STUDENT_LEADER,
  ROLES.PARENT_LEADER,
];

export function isDeveloperRole(role) {
  return role === ROLES.DEVELOPER;
}

export function isAdminRole(role) {
  return role === ROLES.ADMIN || role === ROLES.DEVELOPER;
}

export function isLeaderRole(role) {
  return LEADER_ROLES.includes(role);
}

export function canAccessLeaderTools(role) {
  return isLeaderRole(role);
}
