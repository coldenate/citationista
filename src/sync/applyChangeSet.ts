import type { ChangeSet, Collection, Item } from '../types/types';
import { SyncTree, type SyncTreeNode } from './SyncTree';

/**
 * Return a brand-new SyncTree that represents
 *    prevTree ⊕ changeSet
 * It never mutates the inputs (functional style).
 */
export function applyChangeSet(prev: SyncTree, changes: ChangeSet): SyncTree {
	// 1 shallow-clone every node so we never mutate prev
	const byKey = new Map<string, SyncTreeNode>(
		[...prev._byKeyEntries()].map(([k, n]) => [k, { ...n } as SyncTreeNode])
	);

	// 2 helpers --------------------------------------------------
	const detach = (node: SyncTreeNode) => {
		if (!node.parent) return;
		node.parent.children = (node.parent.children ?? []).filter((c) => c.key !== node.key);
		node.parent = null;
	};

	const attach = (parent: SyncTreeNode | null, child: SyncTreeNode) => {
		child.parent = parent ?? null;
		if (parent) {
			if (!parent.children) parent.children = [];
			parent.children.push(child);
		}
	};

	// 3 deletions -----------------------------------------------
	for (const n of [...changes.deletedCollections, ...changes.deletedItems]) {
		const node = byKey.get(n.key);
		if (!node) continue;
		detach(node);
		byKey.delete(n.key);
	}

	// 4 updates --------------------------------------------------
	for (const upd of [...changes.updatedCollections, ...changes.updatedItems]) {
		const node = byKey.get(upd.key);
		if (!node) continue;
		Object.assign(node, upd); // copy new fields (title, metadata …)
	}

	// 5 creations -----------------------------------------------
	const create = (raw: Item | Collection) => {
		const clone: SyncTreeNode = { ...raw, children: [] };
		byKey.set(raw.key, clone);
		return clone;
	};

	[...changes.newCollections, ...changes.newItems].forEach(create);

	// 6 moves ----------------------------------------------------
	const movers = [
		...changes.movedCollections,
		...changes.movedItems,
		...changes.newCollections,
		...changes.newItems,
	];
	movers.forEach((m) => {
		const node = byKey.get(m.key);
		if (!node) return;
		detach(node);
		const parent = m.parent ? byKey.get(m.parent.key) : null;
		if (parent) {
			attach(parent, node);
		} else {
			attach(null, node);
		}
	});

	// 7 build root + orphan arrays for snapshot ------------------
	const roots: SyncTreeNode[] = [];
	const orphans: SyncTreeNode[] = [];

	byKey.forEach((n) => {
		if (!n.parent) {
			(n.parent === null ? roots : orphans).push(n);
		}
	});

	return SyncTree.fromData(roots, orphans, byKey);
}
