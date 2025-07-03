// src/sync/mergeUpdatedItems.ts
import type { RNPlugin } from '@remnote/plugin-sdk';
import { powerupCodes } from '../constants/constants';
import { checkAbortSignal } from '../services/pluginIO';
import type { ChangeSet, Item, RemNode, ZoteroItemData } from '../types/types';
import { threeWayMerge } from './threeWayMerge';

/**
 * For each updated item in the ChangeSet, merge the local data, remote data, and the previous shadow copy.
 * @param _plugin - The RNPlugin instance.
 * @param changes - The ChangeSet produced by the ChangeDetector.
 * @param prevItems - The list of items from the previous sync (shadow copies).
 */
export async function mergeUpdatedItems(
	_plugin: RNPlugin,
	changes: ChangeSet,
	prevItems: Item[],
	nodeCache: Map<string, RemNode>,
	signal?: AbortSignal
): Promise<void> {
	await checkAbortSignal(_plugin, signal || new AbortController().signal);

	for (const updatedItem of changes.updatedItems) {
		// Check for force stop on each item (for long lists)
		await checkAbortSignal(_plugin, signal || new AbortController().signal);
		
		// Locate the corresponding shadow copy from the previous sync.
		const shadowItem = prevItems.find((i) => i.key === updatedItem.key);
		if (!shadowItem) continue;

		// Retrieve the current local data stored on the existing Rem (if any)
		const remNode = nodeCache.get(updatedItem.key);
		let localData = {};
		if (remNode) {
			const localDataStr = await remNode.rem.getPowerupProperty(
				powerupCodes.ZITEM,
				'fullData'
			);
			if (localDataStr?.[0]) {
				try {
					localData = JSON.parse(localDataStr[0]);
				} catch (e) {
					console.error(`Failed to parse local data for item ${updatedItem.key}`, e);
					localData = {};
				}
			}
			// attach rem to updatedItem for downstream steps
			updatedItem.rem = remNode.rem;
		}
		// Merge the three data versions.
		const mergedData = threeWayMerge(localData, updatedItem.data, shadowItem.data);
		// Update the item’s data in the ChangeSet.
		updatedItem.data = mergedData as ZoteroItemData;
	}
}
