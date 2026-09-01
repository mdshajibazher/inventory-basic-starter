# Sensitive Approval Permissions and Super-User Access

## Objective

Replace General Settings approver lists with explicit, auditable permissions for financial approvals, and make `super-user` the sole authority for General Settings and sensitive-permission administration.

## Sensitive permissions

- `super-user`
- `approvals-sales-invoice`
- `approvals-sales-return-invoice`
- `approvals-purchase-invoice`
- `approvals-purchase-return-invoice`
- `approvals-payments`

An approval requires both the relevant ordinary module permission and its exact `approvals-*` permission. `approvals-payments` applies to every payment type and linkage. `super-user` does not imply approval authority.

## Super-user behavior

`super-user` is the only permission that can view or change General Settings and grant or revoke sensitive permissions. It also permits read-only access to Roles and Users lists/details needed to manage those assignments, even without `users-index`. It does not grant ordinary user or role create, edit, or delete authority.

The application must reject every mutation that would leave no active user with effective `super-user` access. Effective access includes direct and role-derived permissions. This invariant applies to sensitive assignments and to user/role deactivation, deletion, and role reassignment.

## Migration and seeding

Keep the legacy General Settings permission records, approver JSON fields, and approver ID data for rollback, but remove them from the runtime API/UI contract.

Create the six sensitive permissions and backfill current selections as direct user grants:

- sales invoice approvers -> `approvals-sales-invoice`
- sales return approvers -> `approvals-sales-return-invoice`
- purchase approvers -> both purchase approval permissions
- payment approvers -> `approvals-payments`

Grant `super-user` to the Admin role. Fresh database seeding grants the Admin role `super-user` plus all five approval permissions. The migration must be reversible and reset Spatie's permission cache.

## API and authorization

Expose:

- `GET /sensitive-permissions`
- `PUT /roles/{role}/sensitive-permissions`
- `PUT /users/{user}/sensitive-permissions`

Update bodies use `{ "permissions": string[], "acknowledged"?: boolean }`. Adding one or more sensitive permissions requires `acknowledged: true`; revocation alone does not. Only a `super-user` may use these endpoints.

Ordinary permission catalogs exclude sensitive permissions and retired General Settings permissions. Ordinary role/user permission writes must preserve current sensitive grants and return HTTP 403 if a forged sensitive permission name is submitted.

Approval routes use route middleware plus `ApprovalService` defense-in-depth and return HTTP 403 for denial. Type mapping is:

- sales -> `approvals-sales-invoice`
- returns -> `approvals-sales-return-invoice`
- purchases -> `approvals-purchase-invoice`
- purchase_returns -> `approvals-purchase-return-invoice`
- payments -> `approvals-payments`

General Settings endpoints, including its operational email/SMS logs, require `super-user`. Retired `general-settings-*` permissions have no runtime authority.

Sensitive assignment changes are audited with actor, target type/id, added permissions, and removed permissions.

## User interfaces

Web and mobile Roles and Users dialogs contain a distinct Sensitive Access panel. Inherited role permissions are shown locked with their source; direct assignments remain editable. Newly added sensitive permissions require a confirmation that names every addition and sends `acknowledged: true`.

The panel displays these warnings verbatim:

> Super User can view and change all General Settings and grant or revoke financial approval permissions. It does not automatically approve transactions. Keep at least one active Super User.

> Approving these records posts stock and financial effects. Grant only to trusted staff with the required module access.

Remove the legacy approver-picker section from General Settings. General Settings navigation and pages are visible only to `super-user`.

## Acceptance criteria

- Direct, role, and inherited grants behave correctly.
- Module permission alone, approval permission alone, and the wrong approval permission are denied; the matching pair is allowed.
- All payment types/linkages use `approvals-payments`.
- Sensitive endpoints enforce authorization, acknowledgment, audit data, ordinary/sensitive isolation, and the last-active-super-user invariant.
- General Settings is exclusively accessible through `super-user`.
- Web and mobile expose the dedicated cautionary flow without leaking sensitive permissions into ordinary forms.
- Backend tests, Pint, web typecheck/build, and mobile typecheck pass.

## Rollout

Deploy migration, API, web, then mobile. Verify the Admin role and migrated approvers before retiring the picker UI. After deployment, separately enable customer sales-invoice email and resend only sale 9 revision 2, verifying `sent_at`, the submitted email log, and the PDF attachment in Mailtrap.
