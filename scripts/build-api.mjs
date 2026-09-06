import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('api-public', { recursive: true });
writeFileSync(
  'api-public/index.json',
  JSON.stringify({ service: 'Frostline monitoring', endpoint: '/api/monitor' }),
);
