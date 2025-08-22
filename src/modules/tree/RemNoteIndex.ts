import type { Rem, RNPlugin } from '@remnote/plugin-sdk';
import { powerupCodes } from '../../constants/constants';
import type {
	GlobalKey,
	IndexResult,
	LocalNode,
	LocalSidecar,
	SyncNode,
	ZoteroCollectionCore,
	ZoteroItemCore,
} from '../../types/syncContracts';
import { makeGlobalKey } from '../../types/syncContracts';
import type { ZoteroItemData } from '../../types/zotero.api';

// Keep minimal helpers; avoid unused type alias warnings

async function getTaggedRems(plugin: RNPlugin, powerupCode: string): Promise<Rem[]> {
	const power = await plugin.powerup.getPowerupByCode(powerupCode);
	if (!power) return [];
	const rems = await power.taggedRem();
	// Filter out the power‑up definition Rems
	const filtered = [] as Rem[];
	for (const rem of rems) {
		if (!(await rem.isPowerup())) filtered.push(rem);
	}
	return filtered;
}

async function readItemNode(rem: Rem, libraryKey: string): Promise<LocalNode | null> {
	const itemKey = (await rem.getPowerupProperty(powerupCodes.ZITEM, 'key')) as string | undefined;
	if (!itemKey) return null;

	// Try to read the stored full data (JSON) if present, to infer type and parents
	let data: Record<string, unknown> | undefined;
	try {
		const raw = (await rem.getPowerupProperty(powerupCodes.ZITEM, 'fullData')) as
			| string
			| undefined;
		if (raw) {
			data = JSON.parse(raw);
		}
	} catch {
		// ignore malformed JSON
	}

	const parentKeys: GlobalKey[] = [];
	if (data) {
		const parentItem = data.parentItem as string | undefined;
		const collections = (data.collections as string[] | undefined) || [];
		if (parentItem) parentKeys.push(makeGlobalKey(libraryKey, parentItem));
		for (const c of collections) parentKeys.push(makeGlobalKey(libraryKey, c));
	}

	const itemType = (data as { itemType?: string } | undefined)?.itemType;
	const kind: SyncNode['kind'] =
		itemType === 'note' ? 'note' : itemType === 'attachment' ? 'attachment' : 'item';

	const sidecar: LocalSidecar = {
		remId: rem._id,
		rem,
	};

	const maybeVersion = (data as { version?: number } | undefined)?.version; // FIXME: could cause issues down the line !!! OMG 😮‍💨😮‍💨😮‍💨😮‍💨😮‍💨😮‍💨 MY FACORITE EMOJI!!! OMFG!!!!!

	const dataObject: ZoteroItemData = {
		key: itemKey,
		version: typeof maybeVersion === 'number' ? maybeVersion : 0,
		itemType: ((data as { itemType?: string } | undefined)?.itemType ||
			'journalArticle') as unknown as ZoteroItemData['itemType'],
		collections: Array.isArray((data as { collections?: string[] } | undefined)?.collections)
			? (data as { collections?: string[] }).collections
			: undefined,
		parentItem:
			typeof (data as { parentItem?: string } | undefined)?.parentItem === 'string'
				? (data as { parentItem?: string }).parentItem
				: undefined,
		title:
			typeof (data as { title?: string } | undefined)?.title === 'string'
				? (data as { title?: string }).title
				: undefined,
	} as ZoteroItemData;

	const contentsItem: ZoteroItemCore = {
		version: 0,
		library: {
			type: (libraryKey.startsWith('group:') ? 'group' : 'user') as 'user' | 'group',
			id: Number(libraryKey.split(':')[1] || 0),
			name: '',
		},
		links: { self: { href: '', type: '' }, alternate: { href: '', type: '' } },
		meta: { numChildren: 0 },
		data: dataObject,
	} as ZoteroItemCore;

	const node: LocalNode = {
		key: makeGlobalKey(libraryKey, itemKey),
		libraryKey,
		itemKey,
		parentKeys,
		kind,
		contents: contentsItem,
		sidecar,
	};

	return node;
}

async function readCollectionNode(rem: Rem, libraryKey: string): Promise<LocalNode | null> {
	const collectionKey = (await rem.getPowerupProperty(powerupCodes.COLLECTION, 'key')) as
		| string
		| undefined;
	if (!collectionKey) return null;

	const parentCollection = (await rem.getPowerupProperty(
		powerupCodes.COLLECTION,
		'parentCollection'
	)) as string | boolean | undefined;

	const parentKeys: GlobalKey[] = [];
	if (typeof parentCollection === 'string' && parentCollection) {
		parentKeys.push(makeGlobalKey(libraryKey, parentCollection));
	}

	const sidecar: LocalSidecar = {
		remId: rem._id,
		rem,
	};

	const contentsCollection: ZoteroCollectionCore = {
		version: 0,
		name: '',
		parentCollection: parentCollection ?? false,
		relations: {},
	} as ZoteroCollectionCore;

	const node: LocalNode = {
		key: makeGlobalKey(libraryKey, collectionKey),
		libraryKey,
		itemKey: collectionKey,
		parentKeys,
		kind: 'collection',
		contents: contentsCollection,
		sidecar,
	};

	return node;
}

export async function buildIndex(plugin: RNPlugin, libraryKey: string): Promise<IndexResult> {
	const [collectionRems, itemRems] = await Promise.all([
		getTaggedRems(plugin, powerupCodes.COLLECTION),
		getTaggedRems(plugin, powerupCodes.ZITEM),
	]);

	// Parallelize per-Rem reads
	const [collectionNodesRaw, itemNodesRaw] = await Promise.all([
		Promise.all(collectionRems.map((rem) => readCollectionNode(rem, libraryKey))),
		Promise.all(itemRems.map((rem) => readItemNode(rem, libraryKey))),
	]);
	const localNodes: LocalNode[] = [...collectionNodesRaw, ...itemNodesRaw].filter(
		Boolean as unknown as (v: unknown) => v is LocalNode
	);

	const nodeByKey: Map<GlobalKey, LocalNode> = new Map();
	const childrenSets: Map<GlobalKey, Set<GlobalKey>> = new Map();

	for (const node of localNodes) {
		nodeByKey.set(node.key, node);
		for (const parentKey of node.parentKeys) {
			let set = childrenSets.get(parentKey);
			if (!set) {
				set = new Set<GlobalKey>();
				childrenSets.set(parentKey, set);
			}
			set.add(node.key);
		}
	}

	const childrenByParentKey: Map<GlobalKey, GlobalKey[]> = new Map();
	for (const [parentKey, set] of childrenSets) {
		childrenByParentKey.set(parentKey, Array.from(set));
	}

	// Resolve roots only in browser-like env to avoid pulling SDK into Jest's Node process
	async function resolveRoots(): Promise<{ libraryRem: Rem | null; unfiledRem: Rem | null }> {
		const hasSelf = typeof (globalThis as unknown as { self?: unknown }).self !== 'undefined';
		if (!hasSelf) return { libraryRem: null, unfiledRem: null };
		try {
			const mod = await import('../../services/ensureUIPrettyZoteroRemExist');
			const [libraryRem, unfiledRem] = await Promise.all([
				mod.getZoteroLibraryRem(plugin, libraryKey),
				mod.getUnfiledItemsRem(plugin, libraryKey),
			]);
			return { libraryRem, unfiledRem };
		} catch {
			return { libraryRem: null, unfiledRem: null };
		}
	}
	const { libraryRem, unfiledRem } = await resolveRoots();

	return {
		nodeByKey,
		childrenByParentKey,
		libraryRem: libraryRem || null,
		unfiledRem: unfiledRem || null,
		libraryKey,
	};
}

export type RemNoteIndex = IndexResult;
