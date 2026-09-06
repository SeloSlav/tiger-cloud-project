import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

const base = '/tiger-cloud-project/';
const source = resolve('dist/client', base.slice(1));
const output = resolve('out');
assert.equal(
  dirname(output),
  resolve('.'),
  'Output must remain inside the project',
);
assert.ok(existsSync(resolve(source, 'index.html')), 'Missing static export');
rmSync(output, { recursive: true, force: true });
cpSync(source, output, { recursive: true });
cpSync('dist/client/404.html', resolve(output, '404.html'));
writeFileSync(resolve(output, '.nojekyll'), '');

// GitHub supplies the repository prefix: the artifact root must be index.html,
// while generated links retain /tiger-cloud-project/. Fail on broken assets.
const html = readFileSync(resolve(output, 'index.html'), 'utf8');
assert.ok(html.includes('Nori Works'), 'Missing prerendered dashboard');
let assets = 0;
for (const [, url] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (!url.startsWith('/')) continue;
  assert.ok(
    url.startsWith(base),
    `Root-relative URL escaped the Pages prefix: ${url}`,
  );
  const file =
    decodeURIComponent(url.slice(base.length).split('?')[0]) || 'index.html';
  const target = resolve(output, file);
  assert.ok(
    target.startsWith(output + '/') || target.startsWith(output + '\\'),
    'Asset escaped output',
  );
  assert.ok(existsSync(target), `Missing static asset: ${file}`);
  assets++;
}
assert.ok(assets > 5, 'Missing client assets');
console.log(
  `GitHub Pages artifact ready in out/; checked ${assets} local asset references.`,
);
