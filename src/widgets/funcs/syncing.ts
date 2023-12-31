import { RNPlugin } from '@remnote/plugin-sdk';
import { birthZoteroRem } from './birthZoteroRem';
import { getAllRemNoteCollections, getAllRemNoteItems } from './fetchFromRemNote';
import { getAllZoteroCollections, getAllZoteroItems } from './fetchFromZotero';
import { getCollectionPropertybyCode, getItemPropertyByCode } from '../utils/setPropertyValueOfRem';
import { isDebugMode } from '..';

// function: sync collections with zotero library rem
export async function syncCollections(plugin: RNPlugin) {
	const zoteroCollections = await getAllZoteroCollections(plugin);

	const remnoteCollections = await getAllRemNoteCollections(plugin);

	const collectionsToUpdate = [];
	for (const zoteroCollection of zoteroCollections) {
		let foundCollection = false;

		if (remnoteCollections !== undefined) {
			for (const remnoteCollection of remnoteCollections) {
				if (zoteroCollection.key === remnoteCollection.key[0]) {
					foundCollection = true;
					if (zoteroCollection.version !== remnoteCollection.version) {
						collectionsToUpdate.push({
							collection: zoteroCollection,
							method: 'modify',
						});
					}
				}
			}
		}
		if (!foundCollection) {
			collectionsToUpdate.push({
				collection: zoteroCollection,
				method: 'add',
			});
		}
	} // TODO: Add support for deleting collections without touching RemNote (i.e. if the user deletes a collection in Zotero, it will be deleted in RemNote)
	const zoteroLibraryPowerUpRem = await plugin.powerup.getPowerupByCode('zotero-synced-library');
	if (zoteroLibraryPowerUpRem === undefined) {
		console.error('Zotero Library not found!');
		return;
	}
	const zoteroLibraryRem = (await zoteroLibraryPowerUpRem?.taggedRem())[0];

	const zoteroCollectionPowerupRem = await plugin.powerup.getPowerupByCode('collection');

	// update the remnote collections that need to be changed
	for (const collectionToUpdate of collectionsToUpdate) {
		const { collection, method } = collectionToUpdate;
		// console log all the collection fields
		switch (method) {
			case 'delete':
				console.error('Deleting collections is not yet supported.');
				break;
			case 'add':
				const newCollectionRem = await plugin.rem.createRem();
				await newCollectionRem?.setParent(zoteroLibraryRem); //TODO: make this dynamic
				await newCollectionRem?.addPowerup('collection');
				await newCollectionRem?.setText([collection.name]);
				await newCollectionRem?.setFontSize('H1');
				await newCollectionRem?.setIsDocument(true);
				await newCollectionRem?.setTagPropertyValue(
					await getCollectionPropertybyCode(plugin, 'key'),
					[collection.key]
				);

				await newCollectionRem?.setTagPropertyValue(
					await getCollectionPropertybyCode(plugin, 'version'),
					[String(collection.version)]
				);

				await newCollectionRem?.setTagPropertyValue(
					await getCollectionPropertybyCode(plugin, 'name'),
					[collection.name]
				);

				// await newCollectionRem?.setTagPropertyValue(
				// 	await getCollectionPropertybyCode(plugin, 'parentCollection'),
				// WHAT DO I PUT HERE?? NOTHING WORKS??? I THINK: collection.parentCollection
				// ); //FIXME: BROKEN IDKEK WHY

				break;
			case 'modify':
				const collectionPowerupRem = await plugin.powerup.getPowerupByCode('collection');
				const collectionRems = await collectionPowerupRem?.taggedRem();
				const collectionRemToUpdate = collectionRems?.find(async (collectionRem) => {
					const key = await collectionPowerupRem?.getTagPropertyValue('key');
					return key === collection.key;
				});

				if (collectionRemToUpdate) {
					await collectionRemToUpdate.setTagPropertyValue(
						await getCollectionPropertybyCode(plugin, 'version'),
						[String(collection.version)]
					);
					await collectionRemToUpdate.setTagPropertyValue(
						await getCollectionPropertybyCode(plugin, 'name'),
						[collection.name]
					);
					await collectionRemToUpdate.setTagPropertyValue(
						await getCollectionPropertybyCode(plugin, 'parentCollection'),
						[String(collection.parentCollection)]
					);
				}
				break;
		}
	}
}
export async function syncItems(plugin: RNPlugin, collectionKey: string | false) {
	// Sync items with Zotero (same nature of function as syncCollections
	// we want to get all the items from Zotero, and then compare them to the items in RemNote,
	// and then update the items in RemNote accordingly determining action: modify or add(delete not supported yet))
	// if collectionKey is false, then we want to sync all items in the library
	const zoteroItems = await getAllZoteroItems(plugin);
	const remnoteItems = await getAllRemNoteItems(plugin);
	console.log(remnoteItems);

	const itemsToUpdate = [];
	for (const zoteroItem of zoteroItems) {
		let foundItem = false;
		if (remnoteItems === undefined) {
			itemsToUpdate.push({
				item: zoteroItem,
				method: 'add',
			});
			continue;
		}
		for (const remnoteItem of remnoteItems) {
			if (zoteroItem.key === remnoteItem.key[0]) {
				foundItem = true;
				if (zoteroItem.version !== remnoteItem.version[0]) {
					itemsToUpdate.push({
						item: zoteroItem,
						method: 'modify',
					});
				}
			}
		}
		if (!foundItem) {
			itemsToUpdate.push({
				item: zoteroItem,
				method: 'add',
			});
		}
	}

	const zoteroItemPowerup = await plugin.powerup.getPowerupByCode('zitem');
	const zoteroLibraryPowerUpRem = await plugin.powerup.getPowerupByCode('zotero-synced-library');
	if (zoteroLibraryPowerUpRem === undefined) {
		console.error('Zotero Library not found!');
		return;
	}
	const zoteroLibraryRem = (await zoteroLibraryPowerUpRem?.taggedRem())[0];
	const zoteroCollectionPowerupRem = await plugin.powerup.getPowerupByCode('collection');

	// update the remnote items that need to be changed
	for (const itemToUpdate of itemsToUpdate) {
		const { item, method } = itemToUpdate;

		switch (method) {
			case 'delete':
				console.error('deleting collections is not yet supported 😡');
				break;
			case 'add':
				const newItemRem = await plugin.rem.createRem();
				const poolPowerup = await plugin.powerup.getPowerupByCode('coolPool');
				newItemRem?.setParent(poolPowerup!); // FIXME: this is not type safe
				await newItemRem?.addPowerup('zitem');
				await newItemRem?.setText([item.data.title]);
				await newItemRem?.setIsDocument(true);
				// if (item.data.collections === '' || item.data.collections === undefined) {
				// 	await newItemRem?.setParent(zoteroLibraryRem); //TODO: make this dynamic
				// } else if (item.data.collections.length > 0) {
				// 	const collectionID = item.data.collections[0];
				// 	const matchingRem = await plugin.search.search(
				// 		[collectionID],
				// 		zoteroLibraryRem,
				// 		{ numResults: 1 }
				// 	);

				// 	if (matchingRem[0]) {
				// 		await newItemRem?.setParent(matchingRem[0].parent);
				// 	}
				// }
				const promises = [];

				// Helper function to create a promise without invoking it
				const createPromise = async (property: string, value: unknown) => {
					return newItemRem?.setTagPropertyValue(
						await getItemPropertyByCode(plugin, property),
						[String(value)]
					);
				};

				promises.push(
					createPromise('citationKey', item.key),
					createPromise('versionNumber', item.version)
				);

				for (const [key, value] of Object.entries(item.data)) {
					if (key === 'key' || key === 'version') {
						continue;
					}

					promises.push(createPromise(key, value));
				}

				// Now you have an array of promises, and you can evaluate them later if needed
				// Now you have an array of promises
				Promise.allSettled(promises)
					.then(async (results) => {
						// Log errors for rejected promises
						if (!(await isDebugMode(plugin))) {
							results.forEach((result, index) => {
								if (result.status === 'rejected') {
									console.error(`Promise ${index} failed:`, result.reason);
								}
							});
						}
					})
					.finally(() => {
						// You can add additional code here if needed
					});
				break;
			case 'modify':
				console.error("i'm supposed to modify :)");
				return;
		}
		return;
	}
}
export async function syncZoteroLibraryToRemNote(plugin: RNPlugin) {
	await birthZoteroRem(plugin);
	await syncCollections(plugin);
	await syncItems(plugin, false);
}
