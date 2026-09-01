# Sensitive Approval Permissions Implementation Plan

**Spec:** `docs/superpowers/specs/2026-09-01-sensitive-approval-permissions-design.md`

## Global Constraints

- Use strict TDD: add a focused failing behavioral test, verify the expected failure, implement minimally, and verify green before refactoring.
- Sensitive permissions are exactly: `super-user`, `approvals-sales-invoice`, `approvals-sales-return-invoice`, `approvals-purchase-invoice`, `approvals-purchase-return-invoice`, and `approvals-payments`.
- Approval requires the matching ordinary module access and the exact approval permission; `super-user` never bypasses approval permissions.
- Only effective `super-user` access authorizes General Settings and sensitive assignment management.
- Never permit zero active effective super-users.
- Ordinary permission APIs exclude and preserve sensitive grants; forged sensitive names return 403.
- Adding sensitive permissions requires `acknowledged: true`; revocation alone does not.
- All authorization denials use HTTP 403.
- Do not mutate the live database, send mail, merge, push, or deploy while implementing in the worktree.

## Task 1: Add the sensitive permission domain, migration, and seed behavior

Create a central catalog/service for the six sensitive permission names, approval type mappings, retired General Settings names, and ordinary-permission filtering. Add a reversible migration that creates all six permissions, grants `super-user` to the Admin role, and maps every legacy approver ID to direct approval grants exactly as specified. Do not remove legacy rows or approver columns. Reset Spatie's permission cache. Update fresh seeding so Admin receives all six sensitive permissions.

Tests must cover exact legacy mapping (including purchase's two grants), preservation of legacy values, idempotent/cache-safe behavior where applicable, rollback, filtered ordinary catalogs, exact type mapping, and fresh Admin seeding. Follow repository migration/model conventions.

## Task 2: Enforce backend authorization and expose sensitive assignment APIs

Replace JSON approver-list checks in `ApprovalService` with matching permission checks plus ordinary module access. Add exact approval middleware to all five approval route families, including every payment linkage. Gate General Settings and its email/SMS operational logs only by `super-user`.

Add `GET /sensitive-permissions`, `PUT /roles/{role}/sensitive-permissions`, and `PUT /users/{user}/sensitive-permissions`. Return catalog metadata sufficient for both clients to distinguish super-user and approval warnings and to show direct versus inherited user permissions. Require `acknowledged: true` when additions are present. Audit actor, target type/id, additions, and removals using the repository's established activity-log mechanism.

Allow a super-user read-only Roles/Users access needed for assignment management without granting ordinary create/edit/delete. Update ordinary permission endpoints to exclude sensitive/retired names, preserve existing sensitive grants during sync, and reject forged sensitive names with 403.

Centralize and enforce the invariant that at least one active effective super-user remains across direct/role sensitive sync, user deactivation/deletion, role deactivation/deletion, and user role reassignment. Use transactions where a multi-step mutation could transiently or finally violate the invariant.

Tests must exercise direct/role/inherited grants; module-only, approval-only, wrong-approval, and matching-pair authorization; every payment linkage; General Settings exclusivity; endpoint authentication/acknowledgment/audit/payloads; ordinary sync isolation; super-user read-only access; and every last-active-super-user mutation path.

## Task 3: Add the dedicated web Sensitive Access experience

Update web Roles and Users management to fetch the dedicated catalog and display a separate Sensitive Access panel. Show inherited user permissions locked with their role source and direct permissions editable. On additions, show an explicit confirmation listing every newly granted permission and send `acknowledged: true`; revocations need no acknowledgment.

Display these warnings verbatim:

`Super User can view and change all General Settings and grant or revoke financial approval permissions. It does not automatically approve transactions. Keep at least one active Super User.`

`Approving these records posts stock and financial effects. Grant only to trusted staff with the required module access.`

Remove the legacy approver picker from General Settings. Hide General Settings navigation/pages unless the current user has `super-user`. Do not expose sensitive or retired General Settings permissions in ordinary permission groups.

Add focused UI/unit tests where the existing test harness supports them, then run web typecheck and production build.

## Task 4: Add the dedicated mobile Sensitive Access experience

Implement the same dedicated Roles and Users Sensitive Access behavior in mobile: catalog loading, locked inherited permissions with source, editable direct permissions, exact warnings, addition confirmation naming additions, and acknowledgment payload. Remove the legacy approver picker and restrict General Settings navigation/pages to `super-user`. Keep sensitive and retired names out of ordinary permission groups.

Add focused tests where the existing test harness supports them, then run the mobile TypeScript check.

## Task 5: Integrate and verify the complete branch

Run targeted cross-feature authorization tests followed by the complete backend suite with a test-only application key, Pint, web TypeScript check and production build, and mobile TypeScript check. Inspect routes and changed payload contracts against the spec. Do not run the migration against the live database and do not enable or resend customer invoice mail from the worktree; those remain explicit post-integration rollout steps.
