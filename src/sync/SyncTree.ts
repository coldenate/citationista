/**
 * Immutable, in-memory snapshot of a single Zotero library.
 *
 * ───────────────────────────────────────────────────────────
 * •  Everything here is 100 % “pure” – no RemNote I/O.
 * •  The tree is built once, early in the sync cycle, from the
 *    raw Zotero JSON you just fetched.
 * •  Each node keeps typed Zotero data *plus* very light
 *    linkage pointers (`parent`, `children`).
 *
 * Use-cases inside the sync pipeline
 * ───────────────────────────────────
 *   – quick O(1) lookup by key               → _byKey map
 *   – iterate roots in display order         → rootCollections[]
 *   – find orphans (items/collections w/out  → orphans[]
 *     a resolvable parent)
 */

import { filterAsync, type RNPlugin } from '@remnote/plugin-sdk';
import { powerupCodes } from '../constants/constants';
import type { ZoteroCollection, ZoteroItem } from '../types/types';

/* ---------- shared linkage ---------- */

export interface TreeLinkage {
	key: string;
	parent?: SyncTreeNode | null;
	children?: SyncTreeNode[];
}

export type SyncTreeNode = (ZoteroItem | ZoteroCollection) & TreeLinkage;

/* ---------- main class ---------- */

export class SyncTree {
	/** Top-level collections in UI order  */
	public readonly rootCollections: SyncTreeNode[];

	/** Items/collections that couldn’t be linked to a valid parent */
	public readonly orphans: SyncTreeNode[];

	/** Fast lookup by Zotero key */
	readonly byKey: Map<string, SyncTreeNode>;

	private constructor(
		roots: SyncTreeNode[],
		orphans: SyncTreeNode[],
		map: Map<string, SyncTreeNode>
	) {
		this.rootCollections = roots;
		this.orphans = orphans;
		this.byKey = map;
	}

	/* ---------- factory ---------- */

	static build(raw: { items: ZoteroItem[]; collections: ZoteroCollection[] }): SyncTree {
		// 1-a)  create a mutable copy of every node with linkage fields
		const map = new Map<string, SyncTreeNode>();

		for (const col of raw.collections) {
			map.set(col.key, { ...col, children: [], parent: null });
		}
		for (const item of raw.items) {
			map.set(item.key, { ...item, children: [], parent: null });
		}

		// 1-b)  stitch parents & children
		for (const node of map.values()) {
			// ---- Collection parentage ----
			if ('parentCollection' in node) {
				const parentKey = node.parentCollection || null;
				if (parentKey) {
					const parent = map.get(parentKey as string);
					if (parent) {
						node.parent = parent;
						parent.children?.push(node);
					}
				}
			}

			// ---- Item parentage ----
			if ('data' in node) {
				const parentKey = node.data.parentItem ?? node.data.collections?.[0] ?? null;

				if (parentKey) {
					const parent = map.get(parentKey as string);
					if (parent) {
						node.parent = parent;
						parent.children?.push(node);
					}
				}
			}
		}

		// 2) collect roots & orphans
		const roots: SyncTreeNode[] = [];
		const orphans: SyncTreeNode[] = [];

		for (const node of map.values()) {
			if (!node.parent) {
				if ('name' in node) {
					// only collections are considered roots
					roots.push(node);
				} else {
					orphans.push(node);
				}
			}
		}

		return new SyncTree(roots, orphans, map);
	}

	/**
	 * Build a SyncTree from the current RemNote KB.
	 * – Reads only power-up props; NO writes.
	 * – Uses the `fullData` JSON blob if present (safer than scattered fields).
	 */
	static async buildTreeFromRems(plugin: RNPlugin, libraryID: string): Promise<SyncTree> {
		// 0) grab tagged Rems (same calls you already know)
		const colPU = await plugin.powerup.getPowerupByCode(powerupCodes.COLLECTION);
		const itemPU = await plugin.powerup.getPowerupByCode(powerupCodes.ZITEM);
		if (!colPU || !itemPU) throw new Error('Required power-ups missing');

		// NB: filter out the definition Rems
		const [rawCols, rawItems] = await Promise.all([
			colPU.taggedRem().then((rs) => rs.filter((r) => !r.isPowerup())),
			itemPU.taggedRem().then((rs) => rs.filter((r) => !r.isPowerup())),
		]);

		// filter out Rems that are not in the library
		const libraryRems = await filterAsync(rawItems, async (r) => {
			const libraryKey = await r.getPowerupProperty(
				powerupCodes.ZOTERO_SYNCED_LIBRARY,
				'key'
			);
			return libraryKey === libraryID;
		});

		const libraryCols = await filterAsync(rawCols, async (r) => {
			const libraryKey = await r.getPowerupProperty(
				powerupCodes.ZOTERO_SYNCED_LIBRARY,
				'key'
			);
			return libraryKey === libraryID;
		});

		// 1) de-serialise each Rem → plain Zotero* object
		const collections: ZoteroCollection[] = [];
		for (const rem of libraryCols) {
			const blob = await rem.getPowerupProperty(powerupCodes.COLLECTION, 'fullData');
			if (!blob) continue; // skip corrupted Rem
			const z: ZoteroCollection = JSON.parse(blob[0]);
			collections.push(z);
		}

		const items: ZoteroItem[] = [];
		for (const rem of libraryRems) {
			const blob = await rem.getPowerupProperty(powerupCodes.ZITEM, 'fullData');
			if (!blob) continue;
			const z: ZoteroItem = JSON.parse(blob[0]);
			items.push(z);
		}

		// 2) delegate to the existing pure builder
		return SyncTree.build({ collections, items });
	}

	/** Create a SyncTree from existing data (for applyChangeSet) */
	static fromData(
		roots: SyncTreeNode[],
		orphans: SyncTreeNode[],
		map: Map<string, SyncTreeNode>
	): SyncTree {
		return new SyncTree(roots, orphans, map);
	}

	/* ---------- helpers ---------- */

	get(key: string): SyncTreeNode | undefined {
		return this.byKey.get(key);
	}

	has(key: string): boolean {
		return this.byKey.has(key);
	}

	/** Get all entries from the internal map */
	_entries(): IterableIterator<[string, SyncTreeNode]> {
		return this.byKey.entries();
	}

	/** Get all entries from the internal map (for applyChangeSet) */
	_byKeyEntries(): IterableIterator<[string, SyncTreeNode]> {
		return this.byKey.entries();
	}

	/** Depth-first iteration over the whole tree (roots → leaves). */
	*dfs(): Generator<SyncTreeNode> {
		const visit = function* (n: SyncTreeNode): Generator<SyncTreeNode> {
			yield n;
			for (const c of n.children ?? []) yield* visit(c);
		};
		for (const r of this.rootCollections) yield* visit(r);
		for (const o of this.orphans) yield* visit(o);
	}

	/**  Return plain Zotero JSON – no parent / children pointers  */
	toSerializable(): { items: ZoteroItem[]; collections: ZoteroCollection[] } {
		const items: ZoteroItem[] = [];
		const collections: ZoteroCollection[] = [];

		for (const n of this.byKey.values()) {
			if ('data' in n) {
				// item – strip linkage fields
				const { parent: _p, children: _c, ...pure } = n;
				items.push(pure as ZoteroItem);
			} else {
				// collection
				const { parent: _p, children: _c, ...pure } = n;
				collections.push(pure as ZoteroCollection);
			}
		}
		return { items, collections };
	}

	/* Convenience helper – accepts the object we stored earlier   */
	static fromSerializable(raw: {
		items: ZoteroItem[];
		collections: ZoteroCollection[];
	}): SyncTree {
		return SyncTree.build(raw); // reuse the existing pure builder
	}
}
