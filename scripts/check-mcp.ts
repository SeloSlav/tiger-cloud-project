import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { tigerBinary } from './database';

// Smoke-test the actual stdio protocol, not just the config file.
const child = spawn(tigerBinary(), ['mcp', 'start', '--skip-update-check'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
});
const lines = createInterface({ input: child.stdout });
let next = 1;
type Result = {
  serverInfo?: { version: string };
  tools?: { name: string; inputSchema?: object }[];
};
const pending = new Map<
  number,
  { resolve: (r: Result) => void; reject: (e: Error) => void }
>();
lines.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.error) request.reject(new Error(response.error.message));
    else request.resolve(response.result);
  } catch {
    /* Non-protocol logging is ignored. */
  }
});
child.stderr.resume();
child.on('error', (error) => {
  for (const request of pending.values()) request.reject(error);
});
child.on('exit', () => {
  for (const request of pending.values())
    request.reject(new Error('Tiger MCP exited before replying.'));
});
const timeout = setTimeout(() => {
  for (const request of pending.values())
    request.reject(new Error('Tiger MCP response timed out.'));
  child.kill();
}, 25000);
function request(method: string, params: object) {
  return new Promise<Result>((resolve, reject) => {
    const id = next++;
    pending.set(id, { resolve, reject });
    child.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n',
    );
  });
}
try {
  const initialized = await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'frostline-smoke-check', version: '1.0.0' },
  });
  child.stdin.write(
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) +
      '\n',
  );
  const listed = await request('tools/list', {});
  const names = (listed.tools ?? []).map((tool) => tool.name);
  if (process.argv.includes('--schema'))
    console.log(
      JSON.stringify(listed.tools?.find((t) => t.name === 'db_execute_query')),
    );
  if (!names.includes('db_execute_query') || !names.includes('service_list'))
    throw new Error('Expected Tiger tools are missing.');
  console.log(
    `Tiger MCP ${initialized.serverInfo?.version ?? 'unknown version'}: initialized successfully; ${names.length} tools registered, including db_execute_query and service_list.`,
  );
} finally {
  clearTimeout(timeout);
  lines.close();
  child.kill();
}
