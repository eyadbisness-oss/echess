# eChess Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Identity Integrity**: A user document `/users/{userId}` can only be created when `uid == request.auth.uid == userId`, `email_verified == true`, and `role == 'user'` (unless `request.auth.token.email == 'eyadbisness@gmail.com'`).
2. **Privilege Escalation Lock**: Ordinary users can NEVER set or modify `role`, `status`, `membership`, or `isTestAccount` on their own or another user's `/users/{userId}` document. Only the verified Owner (`eyadbisness@gmail.com` with `email_verified == true` or `/admins/{uid}`) may modify RBAC/account status fields.
3. **PII Isolation**: User email addresses are strictly isolated inside `/users/{userId}/private/info`, accessible only by `request.auth.uid == userId` or the verified Owner.
4. **Immutable Ownership & Timestamps**: `createdAt`, `uid`, `reporterId`, `challengerId`, and `requesterId` are immutable once created. `createdAt` and `updatedAt` must match `request.time`.
5. **Terminal State Locking**: Once a `Challenge` reaches `accepted | declined | cancelled | expired`, or a `Report` reaches `resolved | dismissed`, non-owner users cannot mutate it.
6. **Owner-Only Collections**: `/ownerAuditLogs`, `/ownerTestAccounts`, `/admins`, and `/platformConfig` writes are strictly restricted to the verified Owner. `ownerAuditLogs` cannot be modified or deleted once created.

## 2. Dirty Dozen Payloads (Must Return PERMISSION_DENIED)
1. **Self-assign Owner role on create**: `{ uid: "attacker", role: "owner", status: "active", ... }` -> Denied.
2. **Escalate role on update**: `updateDoc(doc(db, "users/attacker"), { role: "owner" })` -> Denied.
3. **Unsuspend self**: `updateDoc(doc(db, "users/suspendedUser"), { status: "active" })` -> Denied.
4. **Free Diamond membership hijack**: `updateDoc(doc(db, "users/attacker"), { membership: "diamond" })` -> Denied.
5. **Cross-user PII read**: `getDoc(doc(db, "users/victim/private/info"))` by non-owner -> Denied.
6. **Blanket list of private/notification docs**: `getDocs(collection(db, "notifications"))` without `where("userId", "==", auth.uid)` -> Denied.
7. **Shadow ghost field injection**: `updateDoc(doc(db, "users/u1"), { boardTheme: "marble", shadowAdmin: true })` -> Denied by `hasOnly`.
8. **Forged game record for third parties**: `addDoc(collection(db, "games"), { whiteId: "alice", blackId: "bob", ... })` by `"eve"` -> Denied.
9. **Client-forged timestamp**: `create` with `createdAt: Timestamp.fromMillis(0)` -> Denied (`!= request.time`).
10. **Read/Write Owner Audit Logs as regular user**: `getDocs(collection(db, "ownerAuditLogs"))` -> Denied.
11. **Modify Maintenance Mode as regular user**: `setDoc(doc(db, "platformConfig/settings"), { maintenanceMode: true })` -> Denied.
12. **Poisoned Document ID**: `setDoc(doc(db, "users", "a".repeat(200)), ...)` -> Denied by `isValidId()`.
