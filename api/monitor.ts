import type { IncomingMessage, ServerResponse } from 'node:http';
import { readMonitor } from '../server/monitor.js';

// Public, bounded, read-only operational view. No client SQL or database secrets.
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    res.statusCode = 405;
    res.end();
    return;
  }
  if (new URL(req.url ?? '/', 'http://localhost').search) {
    res.statusCode = 400;
    res.end('This endpoint does not accept query parameters.');
    return;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const data = await readMonitor();
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=15');
    res.end(JSON.stringify(data));
  } catch {
    console.error('Monitor query unavailable');
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 503;
    res.end(
      JSON.stringify({ error: 'Live monitoring is temporarily unavailable.' }),
    );
  }
}
