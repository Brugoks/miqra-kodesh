export const ROLES = {
  ADMIN: 'admin',
  LEADER: 'leader',
  STUDENT_LEADER: 'student_leader',
  PARENT_LEADER: 'parent_leader',
  STUDENT: 'student',
};

export const LEADER_ROLES = [ROLES.ADMIN, ROLES.LEADER, ROLES.STUDENT_LEADER, ROLES.PARENT_LEADER];

export function isAdminRole(role) {
  return role === ROLES.ADMIN;
}

export function isLeaderRole(role) {
  return LEADER_ROLES.includes(role);
}

export function canAccessLeaderTools(role) {
  return isLeaderRole(role);
}

