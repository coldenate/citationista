import { PropertyType, RNPlugin, Rem, filterAsync } from '@remnote/plugin-sdk';
import { Collection, Item } from '../types/types';
import { powerupCodes } from '../constants/constants';
import { birthZoteroRem } from './createLibraryRem';
import { findCollection, getAllRemNoteCollections, getAllRemNoteItems } from './fetchRN';
import { checkForForceStop } from './pluginIO';
import { getAllZoteroCollections, getAllZoteroItems } from './fetchAPI';
import { deriveName, getCode } from '../utils/getCodeName';
import { checkStringForTitleWorthyNameAndStuffIAmTiredOfMakingVariableNames as hasTitleRelatedField } from './zoteroSchemaToRemNote';

export type ChangedData<T extends Item | Collection> = Array<{
	subject: T;
	method: 'add' | 'modifyLocal' | 'modifyRemote' | 'deleteLocal' | 'deleteRemote';
	snapshotRemBeforeModification?: Rem;
}>;

async function identifyChangesInLibrary(
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
		} else if (localItem) {
			if (remoteItem.version > localItem.version) {
				changedData.push({
					subject: remoteItem,
					method: 'modifyLocal',
					snapshotRemBeforeModification: localItem.rem,
				});
			} else if (remoteItem.version < localItem.version) {
				// TODO: compare the content of the data (I want to make a function for this - content comparison changes per type of data)
				// this is where we will have to push back the changes to the remote data
			} else if (remoteItem.version === localItem.version) {
			}
			// FIXME: If the item on local was moved, it's ignored and treated as a non-edited item
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
				// await newItemRem.setIsDocument(true);
				await newItemRem.setPowerupProperty(powerupCodes.ZITEM, 'key', [
					changedItem.subject.data.key,
				]);
				await newItemRem.setPowerupProperty(powerupCodes.ZITEM, 'version', [
					String(changedItem.subject.version),
				]);

				break;
			case 'modifyLocal':
				if (!changedItem.snapshotRemBeforeModification) {
					new Error('No snapshotRemBeforeModification found'); //TODO: I feel like in TS there is a better way to avoid just manualy checking for null; seems so unclean and repetitive
					return;
				}
				addedItems.push({
					rem: changedItem.snapshotRemBeforeModification,
					item: changedItem.subject,
				});
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
				/* Modification of Collections currently breaks the CODE STYLE (NOTHING SERIOUS) of saving the data hydration for the wiring phase. TODO: I look to fix this, but I digress as it's not a worry. */
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

				if (changedCollection.subject.parentCollection !== currentParentCollectionID) {
					if (changedCollection.subject.parentCollection) {
						const parentCollectionRem = await findCollection(
							plugin,
							changedCollection.subject.parentCollection,
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
		if (await checkForForceStop(plugin)) return; // TODO: Check if this bottlenecks the performance
		let setText = false;
		/* Property Hydrating */
		// first we need to identify the itemType (this is found in the API response)
		// then based on that, we apply the corresponding powerup to the item
		// then we hydrate the properties needed for that specific item type (we use the same keys for the properties as the API response, so it should be easy to hydrate)

		const itemType = item.item.data.itemType;

		// match the itemType to the powerup
		const powerupItemType = await plugin.powerup.getPowerupByCode(getCode(itemType));
		if (!powerupItemType) {
			console.error('Powerup not found!');
			return;
		}
		await item.rem.addPowerup(getCode(itemType));
		// get all possible properties for the item type
		const properties = await filterAsync(await powerupItemType.getChildrenRem(), (c) =>
			c.isProperty()
		);

		// add fullData
		await item.rem.setPowerupProperty(powerupCodes.ZITEM, 'fullData', [
			JSON.stringify(item.item.data),
		]);
		// test if the fullData is hydrated

		const fullData = await item.rem.getPowerupProperty(powerupCodes.ZITEM, 'fullData');
		if (!fullData) {
			console.error('Failed to hydrate fullData');
			return;
		}

		// hydrate the properties
		for (const property of properties) {
			if (property.text) {
				const propertyKey = deriveName(
					(Array.isArray(property.text) && property.text.length > 0
						? property.text[0]
						: '') as string
				);

				const formattedPropertyKey = propertyKey.toLowerCase().replace(/\s/g, '');

				const matchingKey = Object.keys(item.item.data).find(
					(key) => key.toLowerCase().replace(/\s/g, '') === formattedPropertyKey
				);

				if (!matchingKey) {
					console.log(formattedPropertyKey, matchingKey);
					continue;
				}
				const propertyValue = matchingKey ? item.item.data[matchingKey] : undefined;
				if (propertyValue) {
					const propertyTypeOfProperty = await property.getPropertyType();
					const slotCode = await plugin.powerup.getPowerupSlotByCode(
						getCode(itemType),
						getCode(matchingKey)
					);
					if (!slotCode) {
						return;
					}
					if (hasTitleRelatedField(matchingKey)) {
						setText = true;
						await item.rem.setText([propertyValue]);
						continue;
					}
					if (propertyTypeOfProperty == PropertyType.URL) {
						const linkID = await plugin.rem.createLinkRem(propertyValue, true);
						if (!linkID) {
							console.error('Failed to create link rem');
							return;
						}
						await item.rem.setTagPropertyValue(
							slotCode._id,
							// @ts-ignore
							plugin.richText.rem(linkID).richText
						);
						continue;
					}
					await item.rem.setTagPropertyValue(slotCode._id, [propertyValue]);
				}
			}
		}

		/* Hierarchical wiring */
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
		if (collection.collection.parentCollection) {
			const parentCollectionRem = await findCollection(
				plugin,
				collection.collection.parentCollection,
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
	await birthZoteroRem(plugin);
	const remoteItems = await getAllZoteroItems(plugin);
	const localItems = await getAllRemNoteItems(plugin);
	if (!localItems) {
		console.error('No items found in RemNote!');
		return;
	}
	const changedItems = (await identifyChangesInLibrary(
		remoteItems,
		localItems
	)) as ChangedData<Item>;
	const addedItems = await mergeChangedItems(plugin, changedItems);

	await wireItems(plugin, addedItems || []);

	return;
}

export async function syncCollections(plugin: RNPlugin) {
	await birthZoteroRem(plugin);
	const remoteCollections = await getAllZoteroCollections(plugin);
	const localCollections = await getAllRemNoteCollections(plugin);

	const changedCollections = (await identifyChangesInLibrary(
		remoteCollections,
		localCollections
	)) as ChangedData<Collection>;
	const addedCollections = await mergeChangedCollections(plugin, changedCollections);

	await wireCollections(plugin, addedCollections || []);

	return;
}

export async function syncLibrary(plugin: RNPlugin) {
	const zoteroLibraryPowerUpRem = await plugin.powerup.getPowerupByCode(
		powerupCodes.ZOTERO_SYNCED_LIBRARY
	);
	if (zoteroLibraryPowerUpRem === undefined) {
		console.error('Zotero Library not found!');
		return;
	}

	await syncCollections(plugin);
	await syncItems(plugin);

	return;
}
