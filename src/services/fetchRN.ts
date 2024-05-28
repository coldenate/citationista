import { RNPlugin } from '@remnote/plugin-sdk';
import { Collection, Item } from '../types/types';
import { LogType, logMessage } from '../utils/logging';

export async function getAllRemNoteItems(plugin: RNPlugin) {
	const zoteroItemPowerup = await plugin.powerup.getPowerupByCode('zitem');
	const zoteroItems = await zoteroItemPowerup?.taggedRem();
	if (zoteroItems?.length === 0 || zoteroItems === undefined) {
		return undefined;
	}

	const remnoteItems: Item[] = [];

	for (const zoteroItem of zoteroItems) {
		const version = await zoteroItem.getPowerupProperty('zitem', 'versionNumber');
		// TODO: convert all the string lookups to constants so that we can change them in one place
		const message = await zoteroItem.getPowerupProperty('zitem', 'extra');
		const key = await zoteroItem.getPowerupProperty('zitem', 'citationKey');

		const item: Item = {
			version: Number(version),
			message: message,
			key: key,
			rem: zoteroItem,
		};
		remnoteItems.push(item);
	}
	return remnoteItems;
}

export async function getAllRemNoteCollections(plugin: RNPlugin) {
	const remnoteCollections: Collection[] = [];
	const zoteroCollectionPowerupRem = await plugin.powerup.getPowerupByCode('collection');

	const collectionRems = await zoteroCollectionPowerupRem?.taggedRem();
	if (collectionRems?.length === 0 || collectionRems === undefined) {
		return undefined;
	}

	for (const collectionRem of collectionRems) {
		const key = await collectionRem.getPowerupProperty('collection', 'key');

		const version = Number(await collectionRem.getPowerupProperty('collection', 'version'));
		const name = await collectionRem.getPowerupProperty('collection', 'name');
		const parentCollection = Boolean(
			await collectionRem.getPowerupProperty('collection', 'parentCollection')
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
