import { RNPlugin } from '@remnote/plugin-sdk';
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
							collection.parentCollection,
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

	const itemsToUpdate = [];
	// iterate through all the zotero items. try to find a matching remnote item by searching the keys. if there is no matching remnote item, then add it. if there is a matching remnote item, then check if the version numbers match. if they don't, then modify it.
	for (const zoteroItem of zoteroItems) {
		let foundItem = false;
		if (remnoteItems != undefined) {
			// TODO: examine logic results vs ===
			for (const remnoteItem of remnoteItems) {
				if (zoteroItem.key == remnoteItem.key) {
					foundItem = true;
					//TODO: this is not exactly when the version may update, but it will do for now.
					if (zoteroItem.version !== remnoteItem.version) {
						itemsToUpdate.push({
							item: zoteroItem,
							method: 'modify',
							snapshotRemBeforeMod: remnoteItem.rem,
						});
					} else if (zoteroItem.version === remnoteItem.version) {
						console.log('checking!');
						// TODO: handle hierarchy
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
				if (zoteroItem.key == remnoteItem.key) {
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
								// if its rejected and its a promise dealing with the key, then log it
								// if (result.status === 'rejected' && index === 0) { (THIS WAS WHEN THE KEY USED TO BE IN THE ARRAY)
								// 	await logMessage({
								// 		plugin,
								// 		message: [
								// 			`Couldn't save key to rem. This is a fatal error and your ZKB is corrupted.`,
								// 			item,
								// 			result.reason,
								// 		],
								// 		type: LogType.Error,
								// 		consoleEmitType: 'error',
								// 		isToast: true,
								// 	});
								// }

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
				// now attempt to assign it to its parent collection
				// if collection data has more than one collection id, for the first collection, move rem, but for the remaining collections, make a portal in each collection to the rem
				// // collections are sometimes in item.data.collections, and sometimes in item.data.collection, and even others.
				// const extractedCollections = [];
				// // first examine item in search of collections
				// try {
				// 	if (item.data.collections) {
				// 		extractedCollections.push(...item.data.collections);
				// 	}
				// 	if (item.data.collection) {
				// 		extractedCollections.push(item.data.collection);
				// 	}
				// } catch (error) {
				// 	await logMessage({
				// 		plugin,
				// 		message: [`couldn't extract collections! Item:`, error],
				// 		type: LogType.Error,
				// 		consoleEmitType: 'error',
				// 		isToast: false,
				// 	});
				// }
				// for (const collection of extractedCollections) {
				// 	console.log('attempt');
				// 	try {
				// 		const collectionRem = (await findCollection(plugin, collection, false))
				// 			?.rem;
				// 		if (collectionRem) {
				// 			if (collection === extractedCollections[0]) {
				// 				await newItemRem?.setParent(collectionRem);
				// 			} else if (collection !== extractedCollections[0]) {
				// 				const createPortal = await plugin.rem.createPortal();
				// 				await createPortal?.setParent(poolPowerup!);
				// 				await newItemRem?.addToPortal(createPortal?._id!);
				// 				await createPortal?.setParent(collectionRem);
				// 			}
				// 		}
				// 	} catch (error) {
				// 		await logMessage({
				// 			plugin,
				// 			message: [`Couldn't save to collection rem`, item, error],
				// 			type: LogType.Error,
				// 			consoleEmitType: 'error',
				// 			isToast: false,
				// 		});
				// 	}
				// }
				// TODO: handle hierarchy new logic. (some items may have a parent item, and some may have a parent collection) we are agnostic to this, and we will just set the parent to the right thing. the only time we are strict is in syncCollections, where we check if the parent collection has changed, and if it has, then we will move the item to the new parent collection.

				break;
			case 'modify':
				// just like with collections, we need to check what has changed, and then update the remnote item accordingly, however we need to handle all the different fields automatically (not manually like with collections)
				// first, check if the title has changed
				// const currentTitle = await snapshotRemBeforeMod?.getTagPropertyValue(titleKey);
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

				// now check if the parent collection has changed
				// TODO: handle hierarchy new logic. (some items may have a parent item, and some may have a parent collection) we are agnostic to this, and we will just set the parent to the right thing. the only time we are strict is in syncCollections, where we check if the parent collection has changed, and if it has, then we will move the item to the new parent collection.
				// const parentRem = await snapshotRemBeforeMod?.getParentRem();
				// if (!parentRem) {
				// 	return;
				// }
				// const currentParentCollectionID = await parentRem.getPowerupProperty(
				// 	'collection',
				// 	'key'
				// );

				// if (item.data.collections !== currentParentCollectionID) {
				// 	if (item.data.collection === false) {
				// 		await snapshotRemBeforeMod?.setParent(zoteroLibraryRem);
				// 	} else if (item.data.collection !== false) {
				// 		const parentCollectionRem = await findCollection(
				// 			plugin,
				// 			item.data.collection,
				// 			false
				// 		);
				// 		if (parentCollectionRem) {
				// 			await snapshotRemBeforeMod?.setParent(parentCollectionRem.rem);
				// 		}
				// 	}
				// }

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
}

export async function syncZoteroLibraryToRemNote(plugin: RNPlugin) {
	await birthZoteroRem(plugin);
	await syncCollections(plugin);
	await syncItems(plugin);
}
