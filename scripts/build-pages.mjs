import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(
  readFileSync('node_modules/vinext/package.json', 'utf8'),
);
const build = spawnSync(
  process.execPath,
  [
    ...(process.platform === 'win32'
      ? ['--import', new URL('./windows-build-exit.mjs', import.meta.url).href]
      : []),
    resolve('node_modules/vinext', pkg.bin.vinext),
    'build',
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, FROSTLINE_TARGET: 'pages' },
    windowsHide: true,
  },
);
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);
await import('./package-pages.mjs');
