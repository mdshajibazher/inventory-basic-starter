# Task 3 Report: Web Sensitive Access and General Settings cleanup

## Implementation

- Added a dedicated, super-user-only Sensitive Access dialog to both Roles and Users management.
- The dialogs fetch `GET /sensitive-permissions`, render the API-provided labels and both exact caution messages, and keep sensitive grants out of the ordinary permission dialog.
- Role assignments use direct sensitive grants. User assignments show direct grants as editable and inherited grants as locked, including every source role name and inactive-role status.
- Saving a change that adds any sensitive permission opens an in-app confirmation dialog which lists each added permission. Confirming submits `acknowledged: true`; revocation-only changes submit only `permissions`.
- Added typed client methods for the catalog and both sensitive assignment endpoints.
- Added defensive ordinary-picker filtering for `super-user`, `approvals-*`, and retired `general-settings-*` names, in addition to the backend-filtered catalogs.
- Removed the legacy sales/return/purchase/payment approver fields, form-data entries, payload fields, and approval section from General Settings. The remaining notification recipient picker is named `UserPicker`.
- Updated General Settings, Email Logs, SMS Logs, and dashboard transaction clearing to rely on `super-user`; navigation exposes those pages only to super-users. Users and Roles list navigation/page guards additionally allow super-users for their required read-only access, while ordinary actions still rely on their existing `users-*` permissions.

## Files changed

- `web/src/features/sensitive-access-panel.tsx` (new shared sensitive panel and confirmation content)
- `web/src/features/users-page.tsx`
- `web/src/features/roles-page.tsx`
- `web/src/lib/types.ts`
- `web/src/lib/api.ts`
- `web/src/features/general-settings-page.tsx`
- `web/src/components/dashboard-layout.tsx`
- `web/src/features/email-logs-page.tsx`
- `web/src/features/sms-logs-page.tsx`
- `web/app/(dashboard)/dashboard/page.tsx`

## API mapping

| Web use | API contract |
| --- | --- |
| Sensitive catalog | `GET /sensitive-permissions` -> `{ data: [{ name, label, category, warning }], warnings: { super_user, approval } }` |
| Role direct grants | `PUT /roles/{role}/sensitive-permissions` -> `{ permissions: string[], acknowledged?: true }` |
| User direct grants | `PUT /users/{user}/sensitive-permissions` -> `{ permissions: string[], acknowledged?: true }` |
| Role list value | `role.sensitive_permissions: string[]` |
| User list value | `user.sensitive_permissions: { direct, inherited: [{ name, roles: [{ id, name, is_active }] }], effective }` |

## Verification

- `npm run typecheck` (web): passed (`tsc --noEmit`, exit 0).
- `npm run build` (web): blocked by the existing worktree `web/node_modules` symlink pointing outside Turbopack's filesystem root.
- `npm run build -- --webpack` (web): passed; Next compiled, type-checked, collected page data, and generated all 43 static pages.
- `git diff --check`: passed.
- Focused UI/unit tests were not added or run: the existing web package has no `test` script or runnable UI test harness, and the task explicitly prohibits introducing one or manufacturing source-text tests.

## Self-review

- Confirmed the client types mirror the controller/resource payloads committed in `e45df7a`.
- Confirmed sensitive controls are rendered only for `super-user`; regular user/role create, edit, role assignment, ordinary-permission, and delete controls retain their established `users-*` checks.
- Confirmed the user panel distinguishes direct and inherited access and names all inherited role sources.
- Confirmed addition acknowledgement is sent only after confirmation and revocation-only updates omit it.
- Confirmed the exact warning copy comes directly from the sensitive catalog response, whose committed controller returns the authoritative wording.
- Confirmed no legacy General Settings approval field, payload field, or legacy general-settings permission guard remains in the web package.

## Concerns

- The default `npm run build` cannot complete in this linked worktree because of the pre-existing `web/node_modules` symlink. The webpack production-build fallback passes without changing or staging that symlink.
