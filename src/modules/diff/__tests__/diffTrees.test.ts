import { diffTrees } from '../diffTrees';
import { buildSyncTree } from '../../tree/buildSyncTree';

test.skip('diffTrees returns empty list for identical trees', () => {
	// TODO implement
	const a = buildSyncTree({});
	const b = buildSyncTree({});
	expect(diffTrees(a, b)).toEqual([]);
});
