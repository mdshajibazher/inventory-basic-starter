'use client';

import { PageHeader } from '@/components/resource-shell';
import { useAuth } from '@/context/auth-context';

export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <div>
      <PageHeader title="Profile" subtitle="Signed-in API user." />
      <section className="max-w-2xl rounded-lg border border-neutral-200 bg-white p-5">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-neutral-500">Name</dt>
            <dd className="mt-1 font-medium">{user?.name}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Email</dt>
            <dd className="mt-1 font-medium">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Phone</dt>
            <dd className="mt-1 font-medium">{user?.phone ?? '-'}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Permissions</dt>
            <dd className="mt-1 font-medium">{user?.permissions?.length ?? 0}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
