import { buildIndex } from '../../tree/RemNoteIndex';

// Minimal RNPlugin mock shape we need
const makeRem = (id: string, props: Record<string, Record<string, any>>, isPowerup = false) => ({
	_id: id,
	isPowerup: async () => isPowerup,
	getPowerupProperty: async (code: string, slot: string) => props[code]?.[slot],
});

const makePower = (rems: any[]) => ({
	taggedRem: async () => rems,
});

const plugin: any = {
	powerup: {
		getPowerupByCode: async (code: string) => {
			if (code === 'collection')
				return makePower([
					makeRem('c1', { collection: { key: 'C', parentCollection: '' } }),
				]);
			if (code === 'zitem')
				return makePower([
					makeRem('i1', {
						zitem: {
							key: 'I',
							fullData: JSON.stringify({
								key: 'I',
								itemType: 'journalArticle',
								collections: ['C'],
							}),
						},
					}),
				]);
			return null;
		},
	},
	rem: {},
};

describe('RemNoteIndex.buildIndex', () => {
	it('builds local index with parent relationships', async () => {
		const result = await buildIndex(plugin, 'user:1');
		expect(result.libraryKey).toBe('user:1');
		expect(result.nodeByKey.size).toBe(2);
		// item should list collection parent
		const item = result.nodeByKey.get('user:1:I')!;
		expect(item.parentKeys).toEqual(['user:1:C']);
		// children mapping populated
		const children = result.childrenByParentKey.get('user:1:C');
		expect(children).toEqual(['user:1:I']);
	});
});
