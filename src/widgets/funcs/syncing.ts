import { RNPlugin } from '@remnote/plugin-sdk';
import { birthZoteroRem } from './birthZoteroRem';
import { getAllRemNoteCollections, getAllRemNoteItems } from './fetchFromRemNote';
import { getAllZoteroCollections, getAllZoteroItems } from './fetchFromZotero';
import { getCollectionPropertybyCode, getItemPropertyByCode } from '../utils/setPropertyValueOfRem';
import { isDebugMode } from '..';
import { checkForForceStop } from './forceStop';
import { findCollection } from './findCollectioninRemNote';

// function: sync collections with zotero library rem
export async function syncCollections(plugin: RNPlugin) {
	const zoteroCollections = await getAllZoteroCollections(plugin);

	const remnoteCollections = await getAllRemNoteCollections(plugin);
	const poolPowerup = await plugin.powerup.getPowerupByCode('coolPool');

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
	}
	// check for collections that need to be deleted
	for (const remnoteCollection of remnoteCollections!) {
		let foundCollection = false;
		for (const zoteroCollection of zoteroCollections) {
			if (zoteroCollection.key === remnoteCollection.key[0]) {
				foundCollection = true;
			}
		}
		if (!foundCollection) {
			console.log(remnoteCollection.rem);
			collectionsToUpdate.push({
				collection: remnoteCollection,
				method: 'delete',
				remToDelete: remnoteCollection.rem,
			});
		}
	}
	const zoteroLibraryPowerUpRem = await plugin.powerup.getPowerupByCode('zotero-synced-library');
	if (zoteroLibraryPowerUpRem === undefined) {
		console.error('Zotero Library not found!');
		return;
	}
	await birthZoteroRem(plugin).then(async () => {
		if (await isDebugMode(plugin)) {
			console.info('Zotero Library Rem ensured!');
		}
	});
	const zoteroLibraryRem = (await zoteroLibraryPowerUpRem?.taggedRem())[0];

	const zoteroCollectionPowerupRem = await plugin.powerup.getPowerupByCode('collection');
	const addedCollections = [];

	// update the remnote collections that need to be changed
	for (const collectionToUpdate of collectionsToUpdate) {
		const { collection, method, remToDelete } = collectionToUpdate;
		// console log all the collection fields
		switch (method) {
			case 'delete':
				if (remToDelete) {
					await remToDelete.remove();
				}
				break;
			case 'add':
				const newCollectionRem = await plugin.rem.createRem();
				newCollectionRem?.setParent(poolPowerup!); // FIXME: this is not type safe
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

				addedCollections.push({ rem: newCollectionRem, collection: collection });

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
	// now attempt to wire up the parent-child relationships
	for (const collection of addedCollections) {
		const collectionRem = collection.rem;
		const collectionData = collection.collection;
		if (collectionData.parentCollection === false) {
			await collectionRem?.setParent(zoteroLibraryRem);
		} else if (collectionData.parentCollection !== false) {
			const parentCollectionRem = await findCollection(
				plugin,
				collectionData.parentCollection,
				false
			);
			if (parentCollectionRem) {
				await collectionRem?.setParent(parentCollectionRem.rem);
			}
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

	const itemsToUpdate = [];
	// iterate through all the zotero items. try to find a matching remnote item by searching the keys. if there is no matching remnote item, then add it. if there is a matching remnote item, then check if the version numbers match. if they don't, then modify it.
	for (const zoteroItem of zoteroItems) {
		let foundItem = false;
		if (remnoteItems !== undefined) {
			for (const remnoteItem of remnoteItems) {
				if (zoteroItem.key == remnoteItem.key[0]) {
					foundItem = true;
					if (zoteroItem.version !== remnoteItem.version) {
						itemsToUpdate.push({
							item: zoteroItem,
							method: 'modify',
						});
					}
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
	// check for items that need to be deleted

	if (remnoteItems)
		for (const remnoteItem of remnoteItems) {
			let foundItem = false;
			for (const zoteroItem of zoteroItems) {
				if (zoteroItem.key == remnoteItem.key[0]) {
					foundItem = true;
				}
			}
			if (!foundItem) {
				itemsToUpdate.push({
					item: remnoteItem,
					method: 'delete',
					remToDelete: remnoteItem.rem,
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
		if (await checkForForceStop(plugin)) return;
		const { item, method, remToDelete } = itemToUpdate;

		switch (method) {
			case 'delete':
				if (remToDelete) {
					await remToDelete.remove();
				}
				break;
			case 'add':
				const newItemRem = await plugin.rem.createRem();
				const poolPowerup = await plugin.powerup.getPowerupByCode('coolPool');
				newItemRem?.setParent(poolPowerup!); // FIXME: this is not type safe
				await newItemRem?.addPowerup('zitem');
				await newItemRem?.setText([item.data.title]);
				await newItemRem?.setIsDocument(true);
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
						if (await isDebugMode(plugin)) {
							results.forEach((result, index) => {
								if (result.status === 'rejected') {
									console.log(`Item:`, item);
									console.error(`Promise ${index} failed:`, result.reason);
								}
							});
						}
					})
					.finally(() => {
						// You can add additional code here if needed
					});
				// now attempt to assign it to its parent collection
				// if collection data has more than one collection id, for the first collection, move rem, but for the remaining collections, make a portal in each collection to the rem
				// collections are sometimes in item.data.collections, and sometimes in item.data.collection, and even others.
				const extractedCollections = [];
				// first examine item in search of collections
				try {
					if (item.data.collections) {
						extractedCollections.push(...item.data.collections);
					}
					if (item.data.collection) {
						extractedCollections.push(item.data.collection);
					}
				} catch (error) {
					console.error(`couldn't extract collections! Item:`, item);
					console.error(error);
				}
				for (const collection of extractedCollections) {
					try {
						const collectionRem = (await findCollection(plugin, collection, false))
							?.rem;
						if (collectionRem) {
							if (collection === extractedCollections[0]) {
								await newItemRem?.setParent(collectionRem);
							} else if (collection !== extractedCollections[0]) {
								const createPortal = await plugin.rem.createPortal();
								await createPortal?.setParent(poolPowerup!);
								await newItemRem?.addToPortal(createPortal?._id!);
								await createPortal?.setParent(collectionRem);
							}
						}
					} catch (error) {
						console.error(`Couldn't save to collection rem`, item);
						console.error(error);
					}
				}

				break;
			case 'modify':
				console.error("i'm supposed to modify :)");
		}
	}
}

export async function syncZoteroLibraryToRemNote(plugin: RNPlugin) {
	await birthZoteroRem(plugin);
	await syncCollections(plugin);
	await syncItems(plugin, false);
}
