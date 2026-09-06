'use client';
import { useEffect, useState } from 'react';
import { parseMonitor, type LiveMonitor } from '@/lib/live-monitor';

// The endpoint is public and contains no credentials. Set after backend deployment.
export const MONITOR_URL = 'https://frostline-monitor.vercel.app/api/monitor';
export function useLiveMonitor(enabled: boolean) {
  const [monitor, setMonitor] = useState<LiveMonitor | null>(null);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let running = false;
    async function refresh() {
      setNow(Date.now());
      if (running || document.hidden) return;
      running = true;
      try {
        const response = await fetch(MONITOR_URL, {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(12000),
          ]),
        });
        if (!response.ok) throw new Error('Monitor unavailable');
        const next = parseMonitor(await response.json());
        if (!controller.signal.aborted) {
          setMonitor(next);
          setError(false);
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        running = false;
      }
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30000);
    const visible = () => void refresh();
    document.addEventListener('visibilitychange', visible);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [enabled]);
  return { monitor, error, now };
}
