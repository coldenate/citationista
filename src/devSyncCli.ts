import { buildSyncTree } from './modules/tree/buildSyncTree';
import { diffTrees } from './modules/diff/diffTrees';
import { applyOps } from './modules/executor/applyOps';
import { loadSnapshot, saveSnapshot } from './modules/storage/snapshotRepository';
import { log } from './modules/logging';
import fs from 'fs';

async function main() {
	const [, , fixture, flag] = process.argv;
	if (!fixture) {
		console.error('Usage: devSync <fixture> [--dry-run]');
		process.exit(1);
	}
	const data = JSON.parse(fs.readFileSync(fixture, 'utf8'));
	const tree = buildSyncTree(data);
	const snapshot = await loadSnapshot();
  const ops = diffTrees(snapshot as any, tree);
  if (flag === '--dry-run') {
    log('info', 'Planned ops', ops);
  } else {
    await applyOps(ops);
    await saveSnapshot(tree as any);
  }
}

main().catch((err) => {
	console.error(err);
});
