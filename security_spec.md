# Muna WinGo Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. A `/users/{userId}` document cannot self-assign admin privileges (`role` is strictly `'player'`, and `balance` cannot be arbitrarily inflated by non-admin updates beyond verified game/bet logic or admin action; specifically, non-admin balance updates cannot bypass `isValidUserAccount`).
2. PII (`phone`, `email`) is isolated under `/users/{userId}/private/info` and readable ONLY by the owner (`request.auth.uid == userId`) or `isAdmin()`.
3. A `/transactions/{txId}` document must have `userId == request.auth.uid` on creation, initial `status == 'pending'`, positive `amount`, and `createdAt == request.time`. Only `isAdmin()` may transition a transaction to `'completed'` or `'rejected'`.
4. Once a transaction reaches a terminal status (`'completed'` or `'rejected'`), non-admin users can never modify or delete it.
5. A `/bets/{betId}` document must have `userId == request.auth.uid` on creation, initial `status == 'pending'`, `winAmount == 0`, `totalAmount >= 1`, and immutable `userId` / `createdAt`.
6. Only `isAdmin()` (including bootstrapped verified admin `teensobazar@gmail.com`) can write to `/game_modes/{modeId}`, `/admins/{userId}`, or read/list all users' transactions and bets.
7. Every `allow list` query enforces `resource.data.userId == request.auth.uid || isAdmin()` (never blanket `isSignedIn()`), preventing cross-player data scraping.

## 2. The "Dirty Dozen" Adversarial Payloads (Expected: PERMISSION_DENIED)
1. **Identity Spoofing on Transaction Create**: Signed-in player `alice` creates `/transactions/TX-1` with `userId: 'bob'`.
2. **Self-Approval Status Bypass**: Signed-in player `alice` creates `/transactions/TX-2` with `userId: 'alice'` and `status: 'completed'`.
3. **Ghost Field Injection (Shadow Update)**: Signed-in player `alice` creates `/users/alice` with `{ ..., isAdmin: true }`.
4. **Unverified Email Spoof**: Signed-in user with `email: 'teensobazar@gmail.com'` and `email_verified: false` tries to list `/transactions` or write `/game_modes/60`.
5. **Oversized ID Poisoning**: Signed-in player tries to create `/transactions/${'A'.repeat(200)}`.
6. **PII Cross-Read**: Signed-in player `alice` tries to `get` `/users/bob/private/info`.
7. **Unauthorized Balance Inflation**: Signed-in player `alice` updates `/users/alice` changing `role` or injecting `extraField: 1`.
8. **Post-Completion Transaction Tampering**: Signed-in player `alice` updates `/transactions/TX-3` (currently `status: 'completed'`) back to `'pending'` or raises `amount`.
9. **Client Timestamp Forgery**: Signed-in player `alice` creates `/bets/BET-1` with `createdAt: Timestamp(2020-01-01)`.
10. **Blanket List Scraping**: Signed-in player `alice` runs unfiltered `getDocs(collection(db, 'transactions'))` without `where('userId', '==', 'alice')`.
11. **Non-Admin Outcome Rigging**: Signed-in player `alice` updates `/game_modes/60` with `forcedNumber: 7`.
12. **Terminal Bet Tampering**: Signed-in player `alice` modifies `/bets/BET-2` after `status: 'lost'` to `status: 'won', winAmount: 99999`.
