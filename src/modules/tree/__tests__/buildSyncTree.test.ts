import { buildSyncTree } from '../buildSyncTree';

test.skip('buildSyncTree returns empty tree for empty data', () => {
	// TODO implement
	const tree = buildSyncTree({});
	expect(tree.rootCollections).toEqual([]);
});
