'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/context/auth-context';
import { errorMessage } from '@/lib/utils';
import { Button } from '@/components/ui';

export function ImpersonationBanner() {
  const { impersonation, stopImpersonation, sessionBusy } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const bannerRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const banner = bannerRef.current;
    if (!banner) return;
    const root = document.documentElement;
    const updateHeight = () => root.style.setProperty('--impersonation-banner-height', `${banner.getBoundingClientRect().height}px`);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(banner);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--impersonation-banner-height');
    };
  }, [impersonation?.id]);

  if (!impersonation) return null;

  async function stop() {
    if (inFlight.current || sessionBusy) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await stopImpersonation();
    } catch (cause) {
      const message = errorMessage(cause);
      setError(message);
      toast.error('Could not stop impersonating', { description: message });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <aside ref={bannerRef} aria-label="Impersonation session" className="sticky top-0 z-[60] border-b border-amber-300 bg-amber-100 px-4 py-3 text-amber-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 break-words text-sm" role="status">
          Impersonating <strong>{impersonation.target.name}</strong> ({impersonation.target.email})
          <span className="block text-xs">Original account: {impersonation.actor.name} ({impersonation.actor.email})</span>
        </p>
        <Button variant="secondary" disabled={busy || sessionBusy} onClick={() => void stop()}>
          {busy ? 'Stopping…' : 'Stop impersonating'}
        </Button>
      </div>
      {error ? <p role="alert" className="mt-2 text-sm text-red-800">{error}</p> : null}
    </aside>
  );
}
