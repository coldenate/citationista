import * as apiModule from '../../../api/zotero';
import { buildIndex } from '../../tree/ZoteroIndex';

describe('ZoteroIndex.buildIndex', () => {
	it('maps items and collections into RemoteNodes', async () => {
		const plugin: any = {};
		jest.spyOn(apiModule, 'ZoteroAPI').mockImplementation((): any => ({
			fetchLibraryData: async () => ({
				collections: [
					{
						version: 1,
						name: 'C',
						parentCollection: false,
						relations: {},
						rem: null,
						key: 'C',
					} as any,
				],
				items: [
					{
						version: 1,
						library: { type: 'user', id: 1, name: '' },
						links: { self: { href: '', type: '' }, alternate: { href: '', type: '' } },
						meta: { numChildren: 0 },
						data: { key: 'I', itemType: 'journalArticle', collections: ['C'] },
					} as any,
				],
			}),
		}));

		const map = await buildIndex(plugin, 'user:1');
		expect(map.size).toBe(2);
		const item = map.get('user:1:I')!;
		expect(item.parentKeys).toEqual(['user:1:C']);
		const coll = map.get('user:1:C')!;
		expect(coll.kind).toBe('collection');
	});
});
