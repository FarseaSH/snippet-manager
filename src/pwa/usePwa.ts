import { useEffect, useState } from 'react';
import { Workbox } from 'workbox-window';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePwa() {
  const [online, setOnline] = useState(navigator.onLine);
  const [cache, setCache] = useState<'dev' | 'preparing' | 'ready' | 'error'>(import.meta.env.DEV ? 'dev' : 'preparing');
  const [waiting, setWaiting] = useState<Workbox>();
  const [install, setInstall] = useState<InstallPrompt>();
  const [worker, setWorker] = useState<Workbox>();
  useEffect(() => {
    const onOnline = () => { setOnline(true); void worker?.update().catch(() => {}); };
    const onOffline = () => setOnline(false);
    const onInstall = (event: Event) => { event.preventDefault(); setInstall(event as InstallPrompt); };
    const installed = () => setInstall(undefined);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onInstall);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onInstall); window.removeEventListener('appinstalled', installed);
    };
  }, [worker]);
  useEffect(() => {
    if (import.meta.env.DEV || !('serviceWorker' in navigator)) { if (!import.meta.env.DEV) setCache('error'); return; }
    const wb = new Workbox(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
    let controlled = Boolean(navigator.serviceWorker.controller);
    let timer: ReturnType<typeof setInterval>;
    let registration: ServiceWorkerRegistration | undefined;
    let watchUpdates: (() => void) | undefined;
    const listeners = new Map<ServiceWorker, () => void>();
    const controlChanged = () => { if (controlled) window.location.reload(); else controlled = true; };
    navigator.serviceWorker.addEventListener('controllerchange', controlChanged);
    wb.addEventListener('waiting', () => setWaiting(wb));
    wb.addEventListener('activated', () => setCache('ready'));
    wb.register().then(value => {
      registration = value;
      setWorker(wb);
      if (registration?.active) setCache('ready');
      if (registration?.waiting) setWaiting(wb);
      // Listen to every installation, including repeated failed-update retries.
      // Workbox-window's external-update heuristic can stop tracking later workers.
      const track = (candidate: ServiceWorker | null | undefined) => {
        if (!candidate || listeners.has(candidate)) return;
        const changed = () => {
          if (candidate.state === 'installed' && registration?.active && registration.waiting === candidate) setWaiting(wb);
          if (candidate.state === 'activated') { setCache('ready'); setWaiting(undefined); }
          if (candidate.state === 'redundant' && !registration?.active) setCache('error');
          if (candidate.state === 'activated' || candidate.state === 'redundant') { candidate.removeEventListener('statechange', changed); listeners.delete(candidate); }
        };
        listeners.set(candidate, changed); candidate.addEventListener('statechange', changed); changed();
      };
      watchUpdates = () => track(registration?.installing);
      registration?.addEventListener('updatefound', watchUpdates);
      track(registration?.installing);
      timer = setInterval(() => { if (navigator.onLine) void wb.update().catch(() => {}); }, 60_000);
    }).catch(() => setCache('error'));
    return () => {
      clearInterval(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', controlChanged);
      if (watchUpdates) registration?.removeEventListener('updatefound', watchUpdates);
      for (const [candidate, listener] of listeners) candidate.removeEventListener('statechange', listener);
    };
  }, []);
  return {
    online, cache, updateReady: Boolean(waiting), canInstall: Boolean(install),
    update: () => waiting?.messageSkipWaiting(),
    retry: () => { if (worker) { setCache('preparing'); void worker.update().catch(() => setCache('error')); } else window.location.reload(); },
    install: async () => { await install?.prompt(); await install?.userChoice; setInstall(undefined); },
  };
}
