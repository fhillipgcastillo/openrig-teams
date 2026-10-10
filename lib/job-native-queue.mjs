import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { findOpenRigPackage } from './runtime-config.mjs';

try {
  const { DaemonClient } = await import(pathToFileURL(path.join(findOpenRigPackage(), 'dist/client.js')));
  const [operation, serialized] = process.argv.slice(2);
  const input = JSON.parse(serialized);
  const client = new DaemonClient(undefined, { timeoutMs: 30000 });
  const response = operation === 'create'
    ? await client.post('/api/queue/create', { ...input, sourceSession: 'openrig-teams-shell' })
    : await client.post(`/api/queue/${encodeURIComponent(input.qitemId)}/update`, { transitionNote: input.note, actorSession: 'openrig-teams-shell' });
  if (response.status >= 400) throw new Error(`Native queue HTTP ${response.status}: ${JSON.stringify(response.data)}`);
  console.log(JSON.stringify(response.data));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
