import { RNPlugin } from '@remnote/plugin-sdk';

export async function getAllRemNoteItems(plugin: RNPlugin) {
	// query the zitem powerup and get all the rems that way
	// return array of rems after formatting the array to the same schema as the zotero items
	const zoteroItemPowerup = await plugin.powerup.getPowerupByCode('zitem');
	const zoteroItems = await zoteroItemPowerup?.taggedRem();
	if (zoteroItems?.length === 0 || zoteroItems === undefined) {
		return undefined;
	}
	// repack into a new array of objects. this is so we can use the same schema as the zotero items
	// get the property values, and then repack them into an object. accompanied with the rem id
	const remnoteItems = [];

	for (const zoteroItem of zoteroItems) {
		const version = await zoteroItem.getPowerupProperty('zitem', 'versionNumber');
		const message = await zoteroItem.getPowerupProperty('zitem', 'extra');
		const key = await zoteroItem.getPowerupProperty('zitem', 'citationKey');

		const item = {
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
	// what this function will do is get all the collections from the zotero library by querying the collection powerup, and it will build an array to the same schema as the zotero collections
	const remnoteCollections = [];

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

		const collection = {
			rem: collectionRem,
			key: key,
			version: version,
			name: name,
			parentCollection: parentCollection,
			relations: {},
		}; // TODO: Implement
		remnoteCollections.push(collection);
	}
	return remnoteCollections;
}
