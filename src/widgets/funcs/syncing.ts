import { RNPlugin, Rem } from '@remnote/plugin-sdk';
import { birthZoteroRem } from './birthZoteroRem';
import { getAllRemNoteCollections, getAllRemNoteItems } from './fetchFromRemNote';
import { getAllZoteroCollections, getAllZoteroItems } from './fetchFromZotero';
import { isDebugMode } from '..';
import { checkForForceStop } from './forceStop';
import { findCollection } from './findCollectioninRemNote';
import { LogType, logMessage } from './logging';

// function: sync collections with zotero library rem
export async function syncCollections(plugin: RNPlugin) {
	const debugMode = await isDebugMode(plugin);
	const zoteroCollections = await getAllZoteroCollections(plugin);

	const remnoteCollections = await getAllRemNoteCollections(plugin);
	const poolPowerup = await plugin.powerup.getPowerupByCode('coolPool');

	const collectionsToUpdate = [];
	for (const zoteroCollection of zoteroCollections) {
		let foundCollection = false;

		if (remnoteCollections !== undefined) {
			for (const remnoteCollection of remnoteCollections) {
				if (zoteroCollection.key === remnoteCollection.key) {
					foundCollection = true;
					if (zoteroCollection.version !== remnoteCollection.version) {
						collectionsToUpdate.push({
							collection: zoteroCollection,
							method: 'modify',
							snapshotRemBeforeMod: remnoteCollection.rem,
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
	if (remnoteCollections) {
		for (const remnoteCollection of remnoteCollections!) {
			let foundCollection = false;
			for (const zoteroCollection of zoteroCollections) {
				if (zoteroCollection.key === remnoteCollection.key) {
					foundCollection = true;
				}
			}
			if (!foundCollection) {
				collectionsToUpdate.push({
					collection: remnoteCollection,
					method: 'delete',
					remToDelete: remnoteCollection.rem,
				});
			}
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
	const isDebugModeValue = await isDebugMode(plugin);

	// update the remnote collections that need to be changed
	for (const collectionToUpdate of collectionsToUpdate) {
		const { collection, method, remToDelete, snapshotRemBeforeMod } = collectionToUpdate;
		// console log all the collection fields
		switch (method) {
			case 'delete':
				if (remToDelete) {
					await remToDelete.remove();
					if (isDebugModeValue) {
						console.log(`Deleting collection:`, collection);
					}
				}
				break;
			case 'add':
				const newCollectionRem = await plugin.rem.createRem();
				newCollectionRem?.setParent(poolPowerup!); // FIXME: this is not type safe
				await newCollectionRem?.addPowerup('collection');
				await newCollectionRem?.setText([collection.name]);
				await newCollectionRem?.setFontSize('H1');
				await newCollectionRem?.setIsDocument(true);
				await newCollectionRem?.setPowerupProperty('collection', 'key', [collection.key]);
				await newCollectionRem?.setPowerupProperty('collection', 'version', [
					String(collection.version),
				]);

				await newCollectionRem?.setPowerupProperty('collection', 'name', [collection.name]);

				addedCollections.push({ rem: newCollectionRem, collection: collection });

				break;
			case 'modify':
				// here we need to confirm what has changed, and then update the remnote collection accordingly
				// first, check if the name has changed
				if (collection.name !== snapshotRemBeforeMod?.text![0]) {
					await snapshotRemBeforeMod?.setText([collection.name]);
					// await snapshotRemBeforeMod?.setTagPropertyValue(
					// 	await getCollectionPropertybyCode(plugin, 'name'),
					// 	[collection.name]
					// );
					await snapshotRemBeforeMod?.setPowerupProperty('collection', 'name', [
						collection.name,
					]);
				}

				// now check if the parent collection has changed
				const parentRem = await snapshotRemBeforeMod?.getParentRem();
				if (!parentRem) {
					return;
				}
				const currentParentCollectionID = await parentRem.getPowerupProperty(
					'collection',
					'key'
				);

				if (collection.parentCollection !== currentParentCollectionID) {
					if (collection.parentCollection === false) {
						await snapshotRemBeforeMod?.setParent(zoteroLibraryRem);
					} else if (collection.parentCollection !== false) {
						const parentCollectionRem = await findCollection(
							plugin,
							collection.parentCollection, //parent collection is a string of the key
							false
						);
						if (parentCollectionRem) {
							await snapshotRemBeforeMod?.setParent(parentCollectionRem.rem);
						}
					}
				}

				// now check if the version has changed

				const currentVersion = await snapshotRemBeforeMod?.getPowerupProperty(
					'collection',
					'version'
				);
				if (collection.version !== currentVersion) {
					// await snapshotRemBeforeMod?.setTagPropertyValue(versionKey, [
					// 	String(collection.version),
					// ]);
					await snapshotRemBeforeMod?.setPowerupProperty('collection', 'version', [
						String(collection.version),
					]);
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
			console.log(collectionData.parentCollection);
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
export async function syncItems(plugin: RNPlugin) {
	const debugMode = await isDebugMode(plugin);
	// Sync items with Zotero (same nature of function as syncCollections
	// we want to get all the items from Zotero, and then compare them to the items in RemNote,
	// and then update the items in RemNote accordingly determining action: modify or add(delete not supported yet))
	// if collectionKey is false, then we want to sync all items in the library
	const zoteroItems = await getAllZoteroItems(plugin);
	const remnoteItems = await getAllRemNoteItems(plugin);
	const poolPowerup = await plugin.powerup.getPowerupByCode('coolPool');

	const itemsToUpdate = [];
	// iterate through all the zotero items. try to find a matching remnote item by searching the keys. if there is no matching remnote item, then add it. if there is a matching remnote item, then check if the version numbers match. if they don't, then modify it.
	for (const zoteroItem of zoteroItems) {
		let foundItem = false;
		if (remnoteItems != undefined) {
			for (const remnoteItem of remnoteItems) {
				if (zoteroItem.key == remnoteItem.key) {
					foundItem = true;
					if (zoteroItem.version !== remnoteItem.version) {
						itemsToUpdate.push({
							item: zoteroItem,
							method: 'modify',
							snapshotRemBeforeMod: remnoteItem.rem,
						});
					}
					// else if (zoteroItem.version === remnoteItem.version) {}
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
	const orphans: { item: any; rem: Rem }[] = [];

	if (remnoteItems)
		for (const remnoteItem of remnoteItems) {
			let foundItem = false;
			for (const zoteroItem of zoteroItems) {
				if (zoteroItem.key == remnoteItem.key) {
					foundItem = true;
					if (debugMode) {
						orphans.push({ item: zoteroItem, rem: remnoteItem.rem });
					}
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
		await logMessage({
			plugin,
			message: 'Zotero Library not found!',
			type: LogType.Error,
			consoleEmitType: 'error',
			isToast: false,
		});
		return;
	}
	const zoteroLibraryRem = (await zoteroLibraryPowerUpRem?.taggedRem())[0];
	const isDebugModeValue = await isDebugMode(plugin);

	// update the remnote items that need to be changed
	for (const itemToUpdate of itemsToUpdate) {
		if (await checkForForceStop(plugin)) return;
		const { item, method, remToDelete, snapshotRemBeforeMod } = itemToUpdate;

		switch (method) {
			case 'delete':
				if (remToDelete) {
					if (isDebugModeValue) {
						console.log(`Deleting item:`, item);
					}
					await remToDelete.remove();
				}
				break;
			case 'add':
				const newItemRem = await plugin.rem.createRem();
				orphans.push({ item: item, rem: newItemRem! });
				const poolPowerup = await plugin.powerup.getPowerupByCode('coolPool');
				newItemRem?.setParent(poolPowerup!); // FIXME: this is not type safe
				// determine the itemType of the item: annotation, artwork, attachment, audioRecording, bill, blogPost, book, bookSection, case, computerProgram, conferencePaper, dictionaryEntry, document, email, encyclopediaArticle, film, forumPost, hearing, instantMessage, interview, journalArticle, letter, magazineArticle, manuscript, map, newspaperArticle, note, patent, podcast, presentation, radioBroadcast, report, statute, thesis, tvBroadcast, videoRecording, webpage
				// switch (item.data.itemType) {
				// 	default: // when its just a regular item
				// } // TODO: implement this, revamped powerup system. (powerups for each item type)
				await newItemRem?.addPowerup('zitem');
				await newItemRem?.setText([item.data.title]);
				await newItemRem?.setIsDocument(true);
				const promises = [];

				// Helper function to create a promise without invoking it
				const createPromise = async (property: string, value: unknown) => {
					return newItemRem?.setPowerupProperty('zitem', property, [String(value)]);
				};
				// handle key and version separately
				await newItemRem?.setPowerupProperty('zitem', 'citationKey', [item.data.key]);
				await newItemRem?.setPowerupProperty('zitem', 'versionNumber', [
					String(item.version),
				]);
				await newItemRem?.setPowerupProperty('zitem', 'url', [item.data.url]);

				console.log(item.data.url);
				try {
					await newItemRem?.addSource(item.data.url); // item.data.url is a string
				} catch (error) {
					console.log('something done goofed');
					console.log(error);
				}

				for (const [key, value] of Object.entries(item.data)) {
					if (key === 'key' || key === 'version' || key === 'URL') {
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
							results.forEach(async (result, index) => {
								if (result.status === 'rejected') {
									console.error(
										`Item:`,
										item,
										`Promise ${index} failed:`,
										result.reason
									);
								}
							});
						}
					})
					.finally(async () => {
						console.log(item.data.key);
						console.log(item.key);
					});

				break;
			case 'modify':
				// just like with collections, we need to check what has changed, and then update the remnote item accordingly, however we need to handle all the different fields automatically (not manually like with collections)
				// first, check if the title has changed
				// const currentTitle = await snapshotRemBeforeMod?.getTagPropertyValue(titleKey);
				orphans.push({ item: item, rem: snapshotRemBeforeMod! });
				const currentTitle = await snapshotRemBeforeMod?.getPowerupProperty(
					'zitem',
					'title'
				);
				if (item.data.title !== currentTitle) {
					await snapshotRemBeforeMod?.setText([item.data.title]);
					// await snapshotRemBeforeMod?.setTagPropertyValue(titleKey, [item.data.title]);
					await snapshotRemBeforeMod?.setPowerupProperty('zitem', 'title', [
						item.data.title,
					]);
				}
				// now check if the version has changed

				const currentVersion = await snapshotRemBeforeMod?.getPowerupProperty(
					'zitem',
					'versionNumber'
				);
				if (item.version !== currentVersion) {
					await snapshotRemBeforeMod?.setPowerupProperty('zitem', 'versionNumber', [
						String(item.version),
					]);
				}

				for (const [key, value] of Object.entries(item.data)) {
					if (key === 'key' || key === 'version') {
						continue;
					}
					const currentValue = await snapshotRemBeforeMod?.getPowerupProperty(
						'zitem',
						key
					);
					if (value !== currentValue) {
						// @ts-ignore //FIXME: solve this later
						await snapshotRemBeforeMod?.setPowerupProperty('zitem', key, [value]);
					}
				}

				break;
		}
	}

	for (const orphan of orphans) {
		const item = orphan.item;
		const rem = orphan.rem;
		// first, check if the item has a parent item
		if (item.data.parentItem) {
			// if it does, then we need to find the parent item, and then move the item to the parent item
			// query all items in zotero library for the parent item by citationKey

			const parentItemRem = remnoteItems?.find((rem) => rem.key === item.data.parentItem);

			if (parentItemRem) {
				await rem?.setParent(parentItemRem.rem);
			}
			continue; // we don't want to check for parentCollection if we have a parentItem
		}

		// handle multiple collections, or one collection (item belongs to multiple/single collections)

		if (item.data.collections && item.data.collections.length > 0) {
			const collectionRem = await findCollection(plugin, item.data.collections[0], false);
			if (collectionRem) {
				await rem?.setParent(collectionRem.rem);
			}
			if (item.data.collections.length > 1) {
				for (let i = 1; i < item.data.collections.length; i++) {
					const collectionRem = await findCollection(
						plugin,
						item.data.collections[i],
						false
					);
					if (collectionRem) {
						const createPortal = await plugin.rem.createPortal();

						await createPortal?.setParent(poolPowerup!);
						await rem?.addToPortal(createPortal?._id!);
						await createPortal?.setParent(collectionRem.rem);
					}
				}
			}
		}

		if (item.data.parentCollection) {
			// this only deals with collections
			// if it doesn't, then we need to check if the item has a parent collection
			// if it does, then we need to find the parent collection, and then move the item to the parent collection
			const parentCollectionRem = await findCollection(
				plugin,
				item.data.parentCollection,
				false
			);
			if (parentCollectionRem) {
				await rem?.setParent(parentCollectionRem.rem);
			}
			return;
		}
		if (!item.data.parentItem && !item.data.parentCollection && !item.data.collections) {
			// if it doesn't, then we need to check if the item has a parent collection
			// if it does, then we need to find the parent collection, and then move the item to the parent collection
			console.log('this is where we give up and fail');
			await rem?.setParent(zoteroLibraryRem);
		}
	}
}

export async function syncZoteroLibraryToRemNote(plugin: RNPlugin) {
	await birthZoteroRem(plugin);
	await syncCollections(plugin);
	await syncItems(plugin);
}
