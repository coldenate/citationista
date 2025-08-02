import type { ChangeSet, Collection, Item } from '../types/types';
import { SyncTree } from './SyncTree';

export class ChangeDetector {
	detectChanges(
		prevData: { items: Item[]; collections: Collection[] },
		currentData: { items: Item[]; collections: Collection[] }
	): ChangeSet {
		const prevItemsMap = new Map(prevData.items.map((item) => [item.key, item]));
		const currentItemsMap = new Map(currentData.items.map((item) => [item.key, item]));

		const prevCollectionsMap = new Map(prevData.collections.map((col) => [col.key, col]));
		const currentCollectionsMap = new Map(currentData.collections.map((col) => [col.key, col]));

		const changes: ChangeSet = {
			newItems: [],
			updatedItems: [],
			deletedItems: [],
			movedItems: [],
			newCollections: [],
			updatedCollections: [],
			deletedCollections: [],
			movedCollections: [],
		};

		// Detect new and updated items
		for (const [key, currentItem] of currentItemsMap) {
			const prevItem = prevItemsMap.get(key);
			if (!prevItem) {
				changes.newItems.push(currentItem);
			} else {
				const prevCollections = prevItem.data.collections || [];
				const currentCollections = currentItem.data.collections || [];

				if (JSON.stringify(prevItem.data) !== JSON.stringify(currentItem.data)) {
					changes.updatedItems.push(currentItem);
				}
				// Detect moved items based on all associated collections
				if (!arraysEqual(prevCollections, currentCollections)) {
					changes.movedItems.push(currentItem);
				}
			}
		}

		// Detect deleted items
		for (const [key, prevItem] of prevItemsMap) {
			if (!currentItemsMap.has(key)) {
				changes.deletedItems.push(prevItem);
			}
		}

		// Detect new and updated collections
		for (const [key, currentCollection] of currentCollectionsMap) {
			const prevCollection = prevCollectionsMap.get(key);
			if (!prevCollection) {
				changes.newCollections.push(currentCollection);
			} else {
				// Compare collection contents instead of references
				if (JSON.stringify(prevCollection) !== JSON.stringify(currentCollection)) {
					changes.updatedCollections.push(currentCollection);
				}
				// Check for moved collections
				if (prevCollection.parentCollection !== currentCollection.parentCollection) {
					changes.movedCollections.push(currentCollection);
				}
			}
		}

		// Detect deleted collections
		for (const [key, prevCollection] of prevCollectionsMap) {
			if (!currentCollectionsMap.has(key)) {
				changes.deletedCollections.push(prevCollection);
			}
		}

		if (prevData.items.length === 0 && prevData.collections.length === 0) {
			changes.newItems = currentData.items;
			changes.newCollections = currentData.collections;
		}
		return changes;
	}

	diffTrees(prev: SyncTree, curr: SyncTree): ChangeSet {
		// super-simple 1st pass: key-based comparison
		const changes: ChangeSet = {
			newItems: [],
			updatedItems: [],
			deletedItems: [],
			movedItems: [],
			newCollections: [],
			updatedCollections: [],
			deletedCollections: [],
			movedCollections: [],
		};

		// ------- items -------
		for (const node of curr.dfs()) {
			if (!('data' in node)) continue; // skip collections
			const prevNode = prev.get(node.key);

			if (!prevNode) {
				changes.newItems.push(node);
				continue;
			}

			// version bump?
			if ((prevNode as any).version !== node.version) {
				changes.updatedItems.push(node);
			}

			// parent change?
			if ((prevNode.parent?.key ?? null) !== (node.parent?.key ?? null)) {
				changes.movedItems.push(node);
			}
		}

		for (const node of prev.dfs()) {
			if (!('data' in node)) continue;
			if (!curr.has(node.key)) changes.deletedItems.push(node);
		}

		// ------- collections (same idea) -------
		for (const node of curr.dfs()) {
			if (!('name' in node)) continue; // item => skip
			const prevNode = prev.get(node.key);
			if (!prevNode) {
				changes.newCollections.push(node);
				continue;
			}
			if ((prevNode as any).version !== node.version) {
				changes.updatedCollections.push(node);
			}
			if ((prevNode.parent?.key ?? null) !== (node.parent?.key ?? null)) {
				changes.movedCollections.push(node);
			}
		}
		for (const node of prev.dfs()) {
			if (!('name' in node)) continue;
			if (!curr.has(node.key)) changes.deletedCollections.push(node);
		}

		return changes;
	}
}

// Helper function to compare arrays irrespective of order
function arraysEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	const sortedA = [...a].sort();
	const sortedB = [...b].sort();
	return sortedA.every((value, index) => value === sortedB[index]);
}
