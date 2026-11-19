// Security Rules Assertion Suite for eChess (Dirty Dozen Verification)
export const DIRTY_DOZEN_ASSERTIONS = [
  { id: 1, name: 'Self-assign Owner role on create', path: '/users/attacker', expected: 'PERMISSION_DENIED' },
  { id: 2, name: 'Escalate role on update', path: '/users/attacker', expected: 'PERMISSION_DENIED' },
  { id: 3, name: 'Unsuspend self', path: '/users/suspendedUser', expected: 'PERMISSION_DENIED' },
  { id: 4, name: 'Free Diamond membership hijack', path: '/users/attacker', expected: 'PERMISSION_DENIED' },
  { id: 5, name: 'Cross-user PII read', path: '/users/victim/private/info', expected: 'PERMISSION_DENIED' },
  { id: 6, name: 'Blanket list of notifications without userId filter', path: '/notifications', expected: 'PERMISSION_DENIED' },
  { id: 7, name: 'Shadow ghost field injection', path: '/users/u1', expected: 'PERMISSION_DENIED' },
  { id: 8, name: 'Forged game record for third parties', path: '/games/forged1', expected: 'PERMISSION_DENIED' },
  { id: 9, name: 'Client-forged timestamp', path: '/users/u1', expected: 'PERMISSION_DENIED' },
  { id: 10, name: 'Read Owner Audit Logs as non-owner', path: '/ownerAuditLogs', expected: 'PERMISSION_DENIED' },
  { id: 11, name: 'Modify maintenanceMode as non-owner', path: '/platformConfig/settings', expected: 'PERMISSION_DENIED' },
  { id: 12, name: 'Poisoned Document ID (>128 chars)', path: '/users/' + 'a'.repeat(140), expected: 'PERMISSION_DENIED' },
];
