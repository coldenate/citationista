import { RNPlugin } from '@remnote/plugin-sdk';
import {
	getAllZoteroCollections,
	getAllRemNoteCollections,
	getAllZoteroItems,
	getAllRemNoteItems,
} from './syncCollections';
import { birthZoteroRem } from './birthZoteroRem';
import { syncCollections, syncItems } from './syncCollections';

// function: sync collections with zotero library rem
export async function syncCollections(plugin: RNPlugin) {
	const zoteroCollections = await getAllZoteroCollections(plugin);

	const remnoteCollections = await getAllRemNoteCollections(plugin);

	const collectionsToUpdate = [];
	for (const zoteroCollection of zoteroCollections) {
		let foundCollection = false;
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
		if (!foundCollection) {
			collectionsToUpdate.push({
				collection: zoteroCollection,
				method: 'add',
			});
		}
	} // TODO: Add support for deleting collections without touching RemNote (i.e. if the user deletes a collection in Zotero, it will be deleted in RemNote)
	const zoteroLibraryPowerUpRem = await plugin.powerup.getPowerupByCode('zotero-synced-library');
	const zoteroLibraryRem = (await zoteroLibraryPowerUpRem?.taggedRem())[0];

	const zoteroCollectionPowerupRem = await plugin.powerup.getPowerupByCode('zotero-collection');

	const keyProperty = properties.find((property) => property.text[0] === 'Key');
	const versionProperty = properties.find((property) => property.text[0] === 'Version');
	const nameProperty = properties.find((property) => property.text[0] === 'Name');
	const parentCollectionProperty = properties.find(
		(property) => property.text[0] === 'Parent Collection'
	);
	const relationsProperty = properties.find((property) => property.text[0] === 'Relations');

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
				await newCollectionRem?.addPowerup('zotero-collection');
				await newCollectionRem?.setText([collection.name]);
				await newCollectionRem?.setTagPropertyValue(keyProperty?._id, [collection.key]);
				await newCollectionRem?.setTagPropertyValue(versionProperty?._id, [
					String(collection.version),
				]);
				await newCollectionRem?.setTagPropertyValue(nameProperty?._id, [collection.name]);
				await newCollectionRem?.setTagPropertyValue(parentCollectionProperty?._id, [
					String(collection.parentCollection),
				]);
				await newCollectionRem?.setIsDocument(true);
				await newCollectionRem?.setFontSize('H1');
				await newCollectionRem?.setParent(zoteroLibraryRem); //TODO: make this dynamic

				// await newCollectionRem.setTagPropertyValue('relations', [collection.relations]);
				break;
			case 'modify':
				const collectionPowerupRem = await plugin.powerup.getPowerupByCode(
					'zotero-collection'
				);
				const collectionRems = await collectionPowerupRem?.taggedRem();
				const collectionRemToUpdate = collectionRems?.find(async (collectionRem) => {
					const key = await collectionPowerupRem?.getTagPropertyValue('key');
					return key === collection.key;
				});

				if (collectionRemToUpdate) {
					await collectionRemToUpdate.setTagPropertyValue(versionProperty?._id, [
						String(collection.version),
					]);
					await collectionRemToUpdate.setTagPropertyValue(nameProperty?._id, [
						collection.name,
					]);
					await collectionRemToUpdate.setTagPropertyValue(parentCollectionProperty?._id, [
						String(collection.parentCollection),
					]);
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

	const zoteroItemPowerup = await plugin.powerup.getPowerupByCode('zotero-item');
	const zoteroLibraryPowerUpRem = await plugin.powerup.getPowerupByCode('zotero-synced-library');
	const zoteroLibraryRem = (await zoteroLibraryPowerUpRem?.taggedRem())[0];
	const zoteroCollectionPowerupRem = await plugin.powerup.getPowerupByCode('zotero-collection');

	// update the remnote items that need to be changed
	for (const itemToUpdate of itemsToUpdate) {
		const { item, method } = itemToUpdate;

		switch (method) {
			case 'delete':
				console.error('deleting collections is not yet supported 😡');
				break;
			case 'add':
				console.log(item);
				const newItemRem = await plugin.rem.createRem();
				await newItemRem?.addPowerup('zotero-item');
				await newItemRem?.setText([item.data.title]);
				await newItemRem?.setIsDocument(true);
				if (item.data.collections === '' || item.data.collections === undefined) {
					console.log('No parent collection!');
					await newItemRem?.setParent(zoteroLibraryRem); //TODO: make this dynamic
				} else if (item.data.collections.length > 0) {
					const collectionID = item.data.collections[0];
					const matchingRem = await plugin.search.search(
						[collectionID],
						zoteroLibraryRem,
						{ numResults: 1 }
					);
					console.log(matchingRem);

					if (matchingRem[0]) {
						await newItemRem?.setParent(matchingRem[0].parent);
					}
				}
				const promises = [
					newItemRem?.setTagPropertyValue(keyProperty?._id, [item.key]),
					newItemRem?.setTagPropertyValue(versionProperty?._id, [String(item.version)]),
					newItemRem?.setTagPropertyValue(messageProperty?._id, [item.data.extra]),
					newItemRem?.setTagPropertyValue(titleProperty?._id, [item.data.title]),
					newItemRem?.setTagPropertyValue(authorsProperty?._id, [item.data.creators]),
					newItemRem?.setTagPropertyValue(dateProperty?._id, [item.data.date]), //TODO: format as rem date
					newItemRem?.setTagPropertyValue(journalProperty?._id, [item.journal]),
					newItemRem?.setTagPropertyValue(volumeProperty?._id, [item.volume]),
					newItemRem?.setTagPropertyValue(issueProperty?._id, [item.issue]),
					newItemRem?.setTagPropertyValue(pagesProperty?._id, [item.pages]),
					newItemRem?.setTagPropertyValue(doiProperty?._id, [item.doi]),
					newItemRem?.setTagPropertyValue(abstractProperty?._id, [
						item.data.abstractNote,
					]),
					newItemRem?.setTagPropertyValue(keywordsProperty?._id, [item.keywords]),
					newItemRem?.setTagPropertyValue(accessDateProperty?._id, [item.accessDate]),
					newItemRem?.setTagPropertyValue(citekeyProperty?._id, [item.citekey]),
					newItemRem?.setTagPropertyValue(containerTitleProperty?._id, [
						item.containerTitle,
					]),
					newItemRem?.setTagPropertyValue(eprintProperty?._id, [item.eprint]),
					newItemRem?.setTagPropertyValue(eprinttypeProperty?._id, [item.eprinttype]),
					newItemRem?.setTagPropertyValue(eventPlaceProperty?._id, [item.eventPlace]),
					newItemRem?.setTagPropertyValue(pageProperty?._id, [item.page]),
					newItemRem?.setTagPropertyValue(publisherProperty?._id, [item.publisher]),
					newItemRem?.setTagPropertyValue(publisherPlaceProperty?._id, [
						item.publisherPlace,
					]),
					newItemRem?.setTagPropertyValue(titleShortProperty?._id, [item.titleShort]),
					newItemRem?.setTagPropertyValue(URLProperty?._id, [item.URL]),
					newItemRem?.setTagPropertyValue(zoteroSelectURIProperty?._id, [
						item.zoteroSelectURI,
					]),
				];
				const results = await Promise.allSettled(promises);
				// results.forEach((result, index) => {
				// 	if (result.status === 'fulfilled') {
				// 		console.info(`Set ${getPropertyLabel(index)}!`);
				// 	} else {
				// 		// Log the error for the specific function call
				// 		console.error(
				// 			`Error setting ${getPropertyLabel(index)}:`,
				// 			result.reason.message
				// 		);
				// 	}
				// });
				break;
			case 'modify':
				console.log("i'm supposed to modify :)");
				return;
		}
	}
}
export async function syncZoteroLibraryToRemNote(plugin: RNPlugin) {
	await birthZoteroRem(plugin);
	await syncCollections(plugin);
	await syncItems(plugin, false);
}
