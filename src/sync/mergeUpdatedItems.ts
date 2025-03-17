// src/sync/mergeUpdatedItems.ts
import { RNPlugin } from '@remnote/plugin-sdk';
import { ChangeSet, Item } from '../types/types';
import { threeWayMerge } from './threeWayMerge';
import { powerupCodes } from '../constants/constants';

/**
 * For each updated item in the ChangeSet, merge the local data, remote data, and the previous shadow copy.
 * @param plugin - The RNPlugin instance.
 * @param changes - The ChangeSet produced by the ChangeDetector.
 * @param prevItems - The list of items from the previous sync (shadow copies).
 */
export async function mergeUpdatedItems(
	plugin: RNPlugin,
	changes: ChangeSet,
	prevItems: Item[]
): Promise<void> {
	for (const updatedItem of changes.updatedItems) {
		// Locate the corresponding shadow copy from the previous sync.
		const shadowItem = prevItems.find((i) => i.key === updatedItem.key);
		if (!shadowItem) continue;

		// Retrieve the current local data stored on the Rem (assumed to be JSON in "fullData").
		const localDataStr = await updatedItem.rem.getPowerupProperty(
			powerupCodes.ZITEM,
			'fullData'
		);
		let localData = {};
		if (localDataStr && localDataStr[0]) {
			try {
				localData = JSON.parse(localDataStr[0]);
			} catch (e) {
				console.error(`Failed to parse local data for item ${updatedItem.key}`, e);
				localData = {};
			}
		}
		// Merge the three data versions.
		const mergedData = threeWayMerge(localData, updatedItem.data, shadowItem.data);
		// Update the item’s data in the ChangeSet.
		updatedItem.data = mergedData;
	}
}
