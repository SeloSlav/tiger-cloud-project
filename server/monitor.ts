import pg from 'pg';

let pool: pg.Pool | undefined;
export async function readMonitor() {
  if (!pool) {
    const connection = process.env.FROSTLINE_DATABASE_URL;
    if (!connection) throw new Error('Monitor database is not configured');
    const url = new URL(connection);
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'])
      url.searchParams.delete(key);
    const mode = process.env.FROSTLINE_TLS_MODE ?? 'verify-full';
    if (!['require', 'verify-full'].includes(mode))
      throw new Error('Invalid TLS mode');
    pool = new pg.Pool({
      connectionString: url.toString(),
      // Tiger free services use a self-signed certificate. `require` is an
      // explicit deployment choice matching Tiger CLI, never an error fallback.
      ssl: { rejectUnauthorized: mode === 'verify-full' },
      max: 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
      statement_timeout: 8000,
      allowExitOnIdle: true,
    });
    pool.on('error', () => console.error('Monitor database connection closed'));
  }
  const result = await pool.query(
    'SELECT frostline_live.monitor_snapshot() AS monitor',
  );
  return result.rows[0].monitor;
}
