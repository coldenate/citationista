import { RNPlugin, Rem } from '@remnote/plugin-sdk';
import { Collection, Item } from '../types/types';
import { powerupCodes } from '../constants/constants';
import { birthZoteroRem } from './createLibraryRem';
import { findCollection, getAllRemNoteItems } from './fetchRN';
import { checkForForceStop } from './pluginIO';
import { getAllZoteroCollections, getAllZoteroItems } from './fetchAPI';

export type ChangedData<T extends Item | Collection> = Array<{
	subject: T;
	method: 'add' | 'modifyLocal' | 'modifyRemote' | 'deleteLocal' | 'deleteRemote';
	snapshotRemBeforeModification?: Rem;
}>;

async function identifyChangesInLibrary(
	plugin: RNPlugin,
	remoteData: Collection[] | Item[],
	localData: Collection[] | Item[]
): Promise<ChangedData<Item | Collection>> {
	// some notes:
	// - if the version of the remote data is greater than the local data, then we need to update the local data
	// - if the version of the local data is equal to the remote data, then we need to compare the content of the data
	const changedData: ChangedData<Item | Collection> = [];

	for (const remoteItem of remoteData) {
		const localItem = localData.find((item) => item.key === remoteItem.key);
		if (!localItem) {
			changedData.push({
				subject: remoteItem,
				method: 'add',
			});
		} else {
			if (remoteItem.version > localItem.version) {
				changedData.push({
					subject: remoteItem,
					method: 'modifyLocal',
					snapshotRemBeforeModification: localItem.rem,
				});
			} else {
				// TODO: compare the content of the data (I want to make a function for this - content comparison changes per type of data)
				// this is where we will have to push back the changes to the remote data
				new Error('Not implemented yet');
			}
		}
	}

	for (const localItem of localData) {
		const remoteItem = remoteData.find((item) => item.key === localItem.key);
		if (!remoteItem) {
			changedData.push({
				subject: localItem,
				method: 'deleteLocal',
			});
		}
	}

	return changedData;
}
async function mergeChangedItems(plugin: RNPlugin, changedData: ChangedData<Item>) {
	const poolPowerup = await plugin.powerup.getPowerupByCode(powerupCodes.COOL_POOL);
	if (!poolPowerup) {
		console.error('Pool not found!');
		return;
	}
	const zoteroLibraryPowerUpRem = await plugin.powerup.getPowerupByCode(
		powerupCodes.ZOTERO_SYNCED_LIBRARY
	);
	if (zoteroLibraryPowerUpRem === undefined) {
		console.error('Zotero Library not found!');
		return;
	}
	const zoteroLibraryRem = (await zoteroLibraryPowerUpRem?.taggedRem())[0]; // TODO: There has to be a cleaner way to get the ZoteroLibraryRem
	const addedItems: { rem: Rem; item: Item }[] = [];

	for (const changedItem of changedData) {
		if (await checkForForceStop(plugin)) return; // TODO: Check if this bottlenecks the performance
		switch (changedItem.method) {
			case 'add':
				const newItemRem = await plugin.rem.createRem();
				if (!newItemRem) {
					new Error('Failed to create new item rem');
					return;
				}
				addedItems.push({
					rem: newItemRem,
					item: changedItem.subject,
				});
				newItemRem.setParent(poolPowerup);
				await newItemRem.addPowerup(powerupCodes.ZITEM);
				await newItemRem.setText([changedItem.subject.data.title]);
				await newItemRem.setIsDocument(true);
				await newItemRem.setPowerupProperty(powerupCodes.ZITEM, 'citationKey', [
					changedItem.subject.data.key,
				]);
				await newItemRem.setPowerupProperty(powerupCodes.ZITEM, 'versionNumber', [
					String(changedItem.subject.version),
				]);
				try {
					await newItemRem?.addSource(changedItem.subject.data.url);
				} catch (error) {
					await newItemRem.setPowerupProperty(powerupCodes.ZITEM, 'url', [
						changedItem.subject.data.url,
					]);
					console.log('something done goofed');
					console.log(error);
				}

				break;
			case 'modifyLocal':
				if (!changedItem.snapshotRemBeforeModification) {
					new Error('No snapshotRemBeforeModification found'); //TODO: I feel like in TS there is a better way to avoid just manualy checking for null; seems so unclean and repetitive
					return;
				}
				addedItems.push({
					rem: changedItem.snapshotRemBeforeModification,
					item: changedItem.subject,
				}); // TODO: Why do I need to add the item to the addedItems array? I don't do this for collections
				const currentTitle =
					await changedItem.snapshotRemBeforeModification.getPowerupProperty(
						powerupCodes.ZITEM,
						'title'
					);
				const currentVersion =
					await changedItem.snapshotRemBeforeModification.getPowerupProperty(
						powerupCodes.ZITEM,
						'versionNumber'
					);
				break;
			case 'deleteLocal':
				await changedItem.subject.rem.remove();
				break;
			default:
				// Handle any other method
				break;
		}
	}

	return addedItems;
}
async function mergeChangedCollections(plugin: RNPlugin, changedData: ChangedData<Collection>) {
	const poolPowerup = await plugin.powerup.getPowerupByCode(powerupCodes.COOL_POOL);
	if (!poolPowerup) {
		console.error('Pool not found!');
		return;
	}
	const zoteroLibraryPowerUpRem = await plugin.powerup.getPowerupByCode(
		powerupCodes.ZOTERO_SYNCED_LIBRARY
	);
	if (zoteroLibraryPowerUpRem === undefined) {
		console.error('Zotero Library not found!');
		return;
	}
	const zoteroLibraryRem = (await zoteroLibraryPowerUpRem?.taggedRem())[0]; // TODO: There has to be a cleaner way to get the ZoteroLibraryRem
	const addedCollections: { rem: Rem; collection: Collection }[] = [];

	for (const changedCollection of changedData) {
		if (await checkForForceStop(plugin)) return; // TODO: Check if this bottlenecks the performance
		switch (changedCollection.method) {
			case 'add':
				const newCollectionRem = await plugin.rem.createRem();
				if (!newCollectionRem) {
					new Error('Failed to create new collection rem');
					return;
				}
				await newCollectionRem.setParent(poolPowerup);
				await newCollectionRem.addPowerup(powerupCodes.COLLECTION);
				await newCollectionRem.setText([changedCollection.subject.name]);
				await newCollectionRem.setFontSize('H2');
				await newCollectionRem.setIsDocument(true);
				await newCollectionRem.setPowerupProperty(powerupCodes.COLLECTION, 'key', [
					changedCollection.subject.key,
				]);
				await newCollectionRem.setPowerupProperty(powerupCodes.COLLECTION, 'version', [
					String(changedCollection.subject.version),
				]);

				await newCollectionRem.setPowerupProperty(powerupCodes.COLLECTION, 'name', [
					changedCollection.subject.name,
				]);

				addedCollections.push({
					rem: newCollectionRem,
					collection: changedCollection.subject,
				});
				break;
			case 'modifyLocal':
				if (!changedCollection.snapshotRemBeforeModification) {
					new Error('No snapshotRemBeforeModification found');
					return;
				}
				if (
					changedCollection.snapshotRemBeforeModification &&
					changedCollection.snapshotRemBeforeModification.text &&
					changedCollection.subject.name !==
						changedCollection.snapshotRemBeforeModification.text[0]
				) {
					await changedCollection.snapshotRemBeforeModification.setText([
						changedCollection.subject.name,
					]);
					await changedCollection.snapshotRemBeforeModification.setPowerupProperty(
						powerupCodes.COLLECTION,
						'name',
						[changedCollection.subject.name]
					);
				}

				const parentRem =
					await changedCollection.snapshotRemBeforeModification.getParentRem();
				if (!parentRem) {
					new Error('No parentRem found');
					return;
				}
				const currentParentCollectionID = await parentRem.getPowerupProperty(
					powerupCodes.COLLECTION,
					'key'
				);

				if (changedCollection.subject.parentCollectionID !== currentParentCollectionID) {
					if (changedCollection.subject.parentCollectionID) {
						const parentCollectionRem = await findCollection(
							plugin,
							changedCollection.subject.parentCollectionID,
							false
						);
						if (parentCollectionRem) {
							await changedCollection.snapshotRemBeforeModification.setParent(
								parentCollectionRem.rem
							);
						}
					} else {
						await changedCollection.snapshotRemBeforeModification.setParent(
							zoteroLibraryRem
						);
					}
				}

				const currentVersion =
					await changedCollection.snapshotRemBeforeModification.getPowerupProperty(
						powerupCodes.COLLECTION,
						'version'
					);
				if (changedCollection.subject.version !== Number(currentVersion)) {
					await changedCollection.snapshotRemBeforeModification.setPowerupProperty(
						powerupCodes.COLLECTION,
						'version',
						[String(changedCollection.subject.version)]
					);
				}

				break;
			case 'deleteLocal':
				await changedCollection.subject.rem.remove();
				break;
			default:
				// Handle any other method
				break;
		}
	}

	return addedCollections;
}
async function wireItems(plugin: RNPlugin, items: { rem: Rem; item: Item }[]) {
	const zoteroLibraryPowerUpRem = await plugin.powerup.getPowerupByCode(
		powerupCodes.ZOTERO_SYNCED_LIBRARY
	);
	if (zoteroLibraryPowerUpRem === undefined) {
		console.error('Zotero Library not found!');
		return;
	}
	const zoteroLibraryRem = (await zoteroLibraryPowerUpRem?.taggedRem())[0]; // TODO: There has to be a cleaner way to get the ZoteroLibraryRem
	const poolPowerup = await plugin.powerup.getPowerupByCode(powerupCodes.COOL_POOL);
	if (!poolPowerup) {
		console.error('Pool not found!');
		return;
	}
	const remnoteItems = await getAllRemNoteItems(plugin);
	if (!remnoteItems) {
		console.error('No items found in RemNote!');
		return;
	}
	for (const item of items) {
		if (item.item.data.parentItem) {
			const parentItemRem = remnoteItems.find(
				(remnoteItem) => remnoteItem.key === item.item.data.parentItem
			);
			if (parentItemRem) {
				await item.rem.setParent(parentItemRem.rem);
			}
			continue;
		}

		if (item.item.data.collections && item.item.data.collections.length > 0) {
			const collectionRem = await findCollection(
				plugin,
				item.item.data.collections[0],
				false
			);
			if (collectionRem) {
				await item.rem.setParent(collectionRem.rem);
			}
			if (item.item.data.collections.length > 1) {
				for (let i = 1; i < item.item.data.collections.length; i++) {
					const collectionRem = await findCollection(
						plugin,
						item.item.data.collections[i],
						false
					);
					if (collectionRem) {
						const createPortal = await plugin.rem.createPortal();
						if (createPortal) {
							await createPortal.setParent(poolPowerup);
							await item.rem.addToPortal(createPortal._id);
							await createPortal.setParent(collectionRem.rem);
						}
					}
				}
			}
		}

		if (item.item.data.parentCollection) {
			const parentCollectionRem = await findCollection(
				plugin,
				item.item.data.parentCollection,
				false
			);
			if (parentCollectionRem) {
				await item.rem.setParent(parentCollectionRem.rem);
			}
			return;
		}
		if (
			!item.item.data.parentItem &&
			!item.item.data.collections &&
			!item.item.data.parentCollection
		) {
			await item.rem.setParent(zoteroLibraryRem);
		}
	}
}
async function wireCollections(
	plugin: RNPlugin,
	collections: { rem: Rem; collection: Collection }[]
) {
	const zoteroLibraryPowerUpRem = await plugin.powerup.getPowerupByCode(
		powerupCodes.ZOTERO_SYNCED_LIBRARY
	);
	if (zoteroLibraryPowerUpRem === undefined) {
		console.error('Zotero Library not found!');
		return;
	}
	const zoteroLibraryRem = (await zoteroLibraryPowerUpRem?.taggedRem())[0]; // TODO: There has to be a cleaner way to get the ZoteroLibraryRem
	for (const collection of collections) {
		if (collection.collection.parentCollectionID) {
			const parentCollectionRem = await findCollection(
				plugin,
				collection.collection.parentCollectionID,
				false
			);
			if (parentCollectionRem) {
				await collection.rem.setParent(parentCollectionRem.rem);
			}
		} else {
			await collection.rem.setParent(zoteroLibraryRem);
		}
	}
}

export async function syncItems(plugin: RNPlugin) {
	const remoteItems = await getAllZoteroItems(plugin);
	const localItems = await getAllRemNoteItems(plugin);
	if (!localItems) {
		console.error('No items found in RemNote!');
		return;
	}
	const changedItems = (await identifyChangesInLibrary(
		plugin,
		remoteItems,
		localItems
	)) as ChangedData<Item>;
	const addedItems = await mergeChangedItems(plugin, changedItems);

	await wireItems(plugin, addedItems || []);

	return;
}

export async function syncCollections(plugin: RNPlugin) {
	const remoteCollections = await getAllZoteroCollections(plugin);
	const localCollections = await getAllRemNoteItems(plugin);
	if (!localCollections) {
		console.error('No collections found in RemNote!');
		return;
	}
	const changedCollections = (await identifyChangesInLibrary(
		plugin,
		remoteCollections,
		localCollections
	)) as ChangedData<Collection>;
	const addedCollections = await mergeChangedCollections(plugin, changedCollections);

	await wireCollections(plugin, addedCollections || []);

	return;
}

export async function syncLibrary(plugin: RNPlugin) {
	await birthZoteroRem(plugin);
	const zoteroLibraryPowerUpRem = await plugin.powerup.getPowerupByCode(
		powerupCodes.ZOTERO_SYNCED_LIBRARY
	);
	if (zoteroLibraryPowerUpRem === undefined) {
		console.error('Zotero Library not found!');
		return;
	}

	await syncItems(plugin);
	await syncCollections(plugin);

	return;
}
