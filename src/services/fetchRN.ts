import { RNPlugin } from '@remnote/plugin-sdk';
import { Collection, Item } from '../types/types';
import { LogType, logMessage } from '../utils/logging';
import { powerupCodes } from '../constants/constants';

export async function getAllRemNoteItems(plugin: RNPlugin) {
	const zoteroItemPowerup = await plugin.powerup.getPowerupByCode(powerupCodes.ZITEM);
	const zoteroItems = await zoteroItemPowerup?.taggedRem();
	if (zoteroItems?.length === 0 || zoteroItems === undefined) {
		return undefined;
	}

	const remnoteItems: Item[] = [];

	for (const zoteroItem of zoteroItems) {
		const version = await zoteroItem.getPowerupProperty(powerupCodes.ZITEM, 'versionNumber');
		// TODO: convert all the string lookups to constants so that we can change them in one place
		const message = await zoteroItem.getPowerupProperty(powerupCodes.ZITEM, 'extra');
		const key = await zoteroItem.getPowerupProperty(powerupCodes.ZITEM, 'citationKey');

		const item: Item = {
			version: Number(version),
			message: message,
			key: key,
			rem: zoteroItem,
			data: {}, //TODO: GET THIS FROM THE POWERUP PROPERTY FULL_DATA
		};
		remnoteItems.push(item);
	}
	return remnoteItems;
}

export async function getAllRemNoteCollections(plugin: RNPlugin) {
	const remnoteCollections: Collection[] = [];
	const zoteroCollectionPowerupRem = await plugin.powerup.getPowerupByCode(
		powerupCodes.COLLECTION
	);

	const collectionRems = await zoteroCollectionPowerupRem?.taggedRem();
	if (collectionRems?.length === 0 || collectionRems === undefined) {
		return undefined;
	}

	for (const collectionRem of collectionRems) {
		const key = await collectionRem.getPowerupProperty(powerupCodes.COLLECTION, 'key');

		const version = Number(
			await collectionRem.getPowerupProperty(powerupCodes.COLLECTION, 'version')
		);
		const name = await collectionRem.getPowerupProperty(powerupCodes.COLLECTION, 'name');
		const parentCollection = await collectionRem.getPowerupProperty(
			powerupCodes.COLLECTION,
			'parentCollection'
		);
		const collection: Collection = {
			rem: collectionRem,
			key: key,
			version: version,
			name: name,
			parentCollectionID: parentCollection,
			relations: {},
		};
		remnoteCollections.push(collection);
	}
	return remnoteCollections;
}

export async function findCollection(
	plugin: RNPlugin,
	collectionKey: string | false,
	collectionName: string | false
) {
	if (!collectionKey && !collectionName) {
		await logMessage(plugin, 'Must have one of the two parameters', LogType.Error, false);
		return;
	}
	const collections = await getAllRemNoteCollections(plugin);

	if (collectionKey) {
		if (collections === undefined) {
			await logMessage(plugin, 'No collections found in RemNote', LogType.Error, false);
			return;
		}
		const foundCollection = collections.find((collection) => collection.key === collectionKey);
		if (foundCollection) {
			return foundCollection;
		}
		await logMessage(plugin, 'No collection found with that key', LogType.Error, false);
		await logMessage(plugin, collectionKey, LogType.Info, false);
		return;
	}

	if (collectionName) {
		if (collections === undefined) {
			await logMessage(plugin, 'No collections found in RemNote', LogType.Error, false);
			return;
		}
		for (const collection of collections) {
			if (collection.name[0] === collectionName) {
				return collection;
			}
		}
		await logMessage(plugin, 'No collection found with that name', LogType.Error, false);
		return;
	}
}
