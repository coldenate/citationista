import type { RNPlugin } from '@remnote/plugin-sdk';
import { ZoteroAPI } from '../../api/zotero';
import {
	type GlobalKey,
	makeGlobalKey,
	type RemoteNode,
	type SyncNode,
	type ZoteroCollectionCore,
	type ZoteroItemCore,
} from '../../types/syncContracts';
import type { ZoteroCollection, ZoteroItem } from '../../types/zotero.api';

function collectionToRemoteNode(libraryKey: string, c: ZoteroCollection): RemoteNode {
	const itemKey = (c as unknown as { key?: string }).key || '';
	const parentKeys: GlobalKey[] = [];
	if (typeof c.parentCollection === 'string' && c.parentCollection) {
		parentKeys.push(makeGlobalKey(libraryKey, c.parentCollection));
	}
	const contents: ZoteroCollectionCore = {
		version: c.version,
		name: c.name,
		parentCollection: c.parentCollection,
		relations: c.relations,
	};
	return {
		key: makeGlobalKey(libraryKey, itemKey),
		libraryKey,
		itemKey,
		parentKeys,
		kind: 'collection',
		contents,
		sidecar: {},
	};
}

function itemToRemoteNode(libraryKey: string, i: ZoteroItem): RemoteNode {
	const itemKey = i.data.key;
	const parentKeys: GlobalKey[] = [];
	if (i.data.parentItem) parentKeys.push(makeGlobalKey(libraryKey, i.data.parentItem));
	for (const c of i.data.collections || []) {
		parentKeys.push(makeGlobalKey(libraryKey, c));
	}

	const kind: SyncNode['kind'] =
		i.data.itemType === 'note'
			? 'note'
			: i.data.itemType === 'attachment'
				? 'attachment'
				: 'item';

	const contents: ZoteroItemCore = {
		version: i.version,
		library: i.library,
		links: i.links,
		meta: i.meta,
		data: i.data,
	};
	return {
		key: makeGlobalKey(libraryKey, itemKey),
		libraryKey,
		itemKey,
		parentKeys,
		kind,
		contents,
		sidecar: {},
	};
}

export async function buildIndex(
	plugin: RNPlugin,
	libraryKey: string
): Promise<Map<GlobalKey, RemoteNode>> {
	const api = new ZoteroAPI(plugin);
	const [type, id] = libraryKey.split(':') as ['user' | 'group', string];
	const { items, collections } = await api.fetchLibraryData(type, id);

	const map = new Map<GlobalKey, RemoteNode>();
	for (const c of collections) {
		const node = collectionToRemoteNode(libraryKey, c);
		map.set(node.key, node);
	}
	for (const i of items) {
		const node = itemToRemoteNode(libraryKey, i);
		map.set(node.key, node);
	}
	return map;
}

export type ZoteroIndex = Map<GlobalKey, RemoteNode>;
