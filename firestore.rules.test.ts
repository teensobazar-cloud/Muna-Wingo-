/**
 * Phase 0 Dirty Dozen Security Rule Verification Spec
 * Validates that every adversarial payload violates at least one explicit Firestore rule gate.
 */

export interface AdversarialCase {
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  actor: { uid: string; email?: string; email_verified: boolean; isAdmin?: boolean };
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: AdversarialCase[] = [
  {
    name: '1. Identity Spoofing on Transaction Create',
    operation: 'create',
    path: '/transactions/TX-SPOOF-1',
    actor: { uid: 'alice', email: 'alice@example.com', email_verified: true },
    payload: { userId: 'bob', status: 'pending', amount: 500 },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '2. Self-Approval Status Bypass on Deposit Create',
    operation: 'create',
    path: '/transactions/TX-BYPASS-2',
    actor: { uid: 'alice', email: 'alice@example.com', email_verified: true },
    payload: { userId: 'alice', status: 'completed', amount: 50000 },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '3. Ghost Field Injection on User Create',
    operation: 'create',
    path: '/users/alice',
    actor: { uid: 'alice', email: 'alice@example.com', email_verified: true },
    payload: { uid: 'alice', fullName: 'Alice', balance: 10, referralEarnings: 0, role: 'player', isAdmin: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '4. Unverified Admin Email Spoof',
    operation: 'list',
    path: '/transactions',
    actor: { uid: 'spoof', email: 'teensobazar@gmail.com', email_verified: false },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '5. Oversized Document ID Poisoning',
    operation: 'create',
    path: `/transactions/${'X'.repeat(150)}`,
    actor: { uid: 'alice', email: 'alice@example.com', email_verified: true },
    payload: { userId: 'alice', status: 'pending', amount: 100 },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '6. Cross-User PII Read',
    operation: 'get',
    path: '/users/bob/private/info',
    actor: { uid: 'alice', email: 'alice@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '7. Immutable Role Field Tamper',
    operation: 'update',
    path: '/users/alice',
    actor: { uid: 'alice', email: 'alice@example.com', email_verified: true },
    payload: { role: 'admin' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '8. Non-Admin Transaction Approval Tampering',
    operation: 'update',
    path: '/transactions/TX-3',
    actor: { uid: 'alice', email: 'alice@example.com', email_verified: true },
    payload: { status: 'completed' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '9. Client Timestamp Forgery on Bet Create',
    operation: 'create',
    path: '/bets/BET-FORGE-9',
    actor: { uid: 'alice', email: 'alice@example.com', email_verified: true },
    payload: { userId: 'alice', status: 'pending', createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '10. Unscoped Collection List Scraping',
    operation: 'list',
    path: '/bets',
    actor: { uid: 'alice', email: 'alice@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '11. Non-Admin Forced Outcome Rigging',
    operation: 'update',
    path: '/game_modes/60',
    actor: { uid: 'alice', email: 'alice@example.com', email_verified: true },
    payload: { forcedKind: 'number', forcedNumber: 7 },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '12. Terminal Bet Outcome Tampering',
    operation: 'update',
    path: '/bets/BET-LOST-12',
    actor: { uid: 'alice', email: 'alice@example.com', email_verified: true },
    payload: { status: 'won', winAmount: 99999 },
    expected: 'PERMISSION_DENIED',
  },
];
