'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Checkbox } from '@/components/ui';
import type { Role, SensitivePermissionCatalog, UserSensitivePermissions } from '@/lib/types';

export function SensitiveAccessPanel({
  catalog,
  selected,
  setSelected,
  inherited,
}: {
  catalog: SensitivePermissionCatalog;
  selected: string[];
  setSelected: Dispatch<SetStateAction<string[]>>;
  inherited?: UserSensitivePermissions['inherited'];
}) {
  return (
    <section className="grid gap-4 rounded-md border border-amber-200 bg-amber-50/40 p-4">
      <div>
        <h3 className="text-base font-semibold text-neutral-950">Sensitive Access</h3>
        <p className="mt-1 text-sm text-neutral-600">Manage direct sensitive grants separately from ordinary permissions.</p>
      </div>

      <div className="grid gap-2 rounded-md border border-amber-200 bg-white p-3 text-sm text-amber-950">
        <p>{catalog.warnings.super_user}</p>
        <p>{catalog.warnings.approval}</p>
      </div>

      <div className="grid gap-2">
        {catalog.data.map((permission) => {
          const inheritedGrant = inherited?.find((grant) => grant.name === permission.name);
          return (
            <div key={permission.name} className="rounded-md border border-neutral-200 bg-white p-3">
              <label className="flex items-start gap-3 text-sm">
                <Checkbox
                  checked={selected.includes(permission.name)}
                  onCheckedChange={() => setSelected((current) => current.includes(permission.name)
                    ? current.filter((name) => name !== permission.name)
                    : [...current, permission.name])}
                />
                <span className="grid gap-1">
                  <span className="font-medium text-neutral-950">{permission.label}</span>
                  <span className="text-xs text-neutral-500">Direct grant</span>
                </span>
              </label>
              {inheritedGrant ? (
                <div className="mt-3 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                  <span className="font-medium text-neutral-800">Inherited and locked:</span>{' '}
                  {inheritedGrant.roles.map((role) => `${role.name}${role.is_active ? '' : ' (inactive)'}`).join(', ')}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function SensitiveAccessConfirmation({
  catalog,
  additions,
}: {
  catalog: SensitivePermissionCatalog;
  additions: string[];
}) {
  return (
    <div className="grid gap-3 text-sm text-neutral-700">
      <p>You are about to grant the following sensitive access:</p>
      <ul className="list-disc space-y-1 pl-5">
        {additions.map((name) => <li key={name}>{catalog.data.find((permission) => permission.name === name)?.label ?? name}</li>)}
      </ul>
      <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950">This confirmation records that you acknowledge each added permission.</p>
    </div>
  );
}

export function sensitiveRoleAdditionMessage(roles: Array<Pick<Role, 'name'>>) {
  return `You are about to assign the following sensitive-bearing roles:\n\n${roles.map((role) => `• ${role.name}`).join('\n')}\n\nThis confirmation records that you acknowledge each added role and its sensitive access.`;
}
