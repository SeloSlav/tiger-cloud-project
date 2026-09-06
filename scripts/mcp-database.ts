import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { tigerBinary } from './database';

type QueryResult = {
  result_sets: {
    columns?: { name: string }[];
    rows?: unknown[][];
    rows_affected: number;
    truncated?: boolean;
  }[];
  truncated?: boolean;
};
type Reply = {
  isError?: boolean;
  content?: { type: string; text?: string }[];
  structuredContent?: QueryResult;
};
export async function openTiger() {
  if (existsSync('.env.database')) process.loadEnvFile('.env.database');
  const service = process.env.TIGER_SERVICE_ID;
  if (!service || !/^[a-z0-9]{10}$/.test(service))
    throw new Error(
      'Set TIGER_SERVICE_ID in .env.database before using the MCP database scripts.',
    );
  const child = spawn(tigerBinary(), ['mcp', 'start', '--skip-update-check'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const lines = createInterface({ input: child.stdout });
  let next = 1;
  const pending = new Map<
    number,
    {
      resolve: (value: Reply) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  lines.on('line', (line) => {
    try {
      const r = JSON.parse(line);
      const p = pending.get(r.id);
      if (!p) return;
      pending.delete(r.id);
      clearTimeout(p.timer);
      if (r.error) p.reject(new Error(r.error.message));
      else p.resolve(r.result);
    } catch {
      /* Ignore non-JSON logging. */
    }
  });
  child.stderr.resume();
  const fail = (error: Error) => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    pending.clear();
  };
  child.on('error', fail);
  child.on('exit', () => fail(new Error('Tiger MCP stopped.')));
  const request = (method: string, params: object) =>
    new Promise<Reply>((resolve, reject) => {
      const id = next++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Tiger MCP query timed out.'));
      }, 90000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(
        JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n',
      );
    });
  const close = () => {
    lines.close();
    child.kill();
  };
  try {
    await request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'frostline-data-pipeline', version: '1.0.0' },
    });
  } catch (error) {
    close();
    throw error;
  }
  child.stdin.write(
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) +
      '\n',
  );
  return {
    close,
    async query(query: string, parameters?: string[]) {
      const result = await request('tools/call', {
        name: 'db_execute_query',
        arguments: {
          service_id: service,
          query,
          ...(parameters ? { parameters } : {}),
          timeout_seconds: 60,
        },
      });
      if (result.isError)
        throw new Error(
          result.content
            ?.filter((c) => c.type === 'text')
            .map((c) => c.text)
            .join('\n') || 'Tiger query failed.',
        );
      const parsed =
        result.structuredContent ??
        (JSON.parse(
          result.content?.find((c) => c.type === 'text')?.text ?? '{}',
        ) as QueryResult);
      if (parsed.truncated || parsed.result_sets?.some((s) => s.truncated))
        throw new Error('Tiger truncated the result; export aborted.');
      if (!parsed.result_sets)
        throw new Error('Tiger returned no SQL result sets.');
      return parsed;
    },
  };
}
