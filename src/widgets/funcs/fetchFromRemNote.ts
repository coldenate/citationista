import { RNPlugin } from '@remnote/plugin-sdk';
import { getCollectionPropertybyCode, getItemPropertyByCode } from '../utils/setPropertyValueOfRem';

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
		const version = await zoteroItem.getTagPropertyValue(
			await getItemPropertyByCode(plugin, 'versionNumber')
		);
		const message = await zoteroItem.getTagPropertyValue(
			await getItemPropertyByCode(plugin, 'extra')
		);
		// const title = await zoteroItem.getTagPropertyValue(
		// 	await getItemPropertyByCode(plugin, 'title')
		// );
		// const authors = await zoteroItem.getTagPropertyValue(
		// 	await getItemPropertyByCode(plugin, 'authors')
		// );
		// const date = await zoteroItem.getTagPropertyValue(
		// 	await getItemPropertyByCode(plugin, 'date')
		// );
		// const journal = await zoteroItem.getTagPropertyValue(
		// 	await getItemPropertyByCode(plugin, 'journal')
		// );
		// const volume = await zoteroItem.getTagPropertyValue(
		// 	await getItemPropertyByCode(plugin, 'volume')
		// );
		// const issue = await zoteroItem.getTagPropertyValue(
		// 	await getItemPropertyByCode(plugin, 'issue')
		// );
		// const pages = await zoteroItem.getTagPropertyValue(
		// 	await getItemPropertyByCode(plugin, 'pages')
		// );
		// const doi = await zoteroItem.getTagPropertyValue(
		// 	await getItemPropertyByCode(plugin, 'doi')
		// );
		// const abstract = await zoteroItem.getTagPropertyValue(
		// 	await getItemPropertyByCode(plugin, 'abstract')
		// );
		// const keywords = await zoteroItem.getTagPropertyValue(
		// 	await getItemPropertyByCode(plugin, 'keywords')
		// );
		// const accessDate = await zoteroItem.getTagPropertyValue(
		// 	await getItemPropertyByCode(plugin, 'accessDate')
		// );
		// const citekey = await zoteroItem.getTagPropertyValue(
		// 	await getItemPropertyByCode(plugin, 'citekey')
		// );
		// const containerTitle = await zoteroItem.getTagPropertyValue(
		// 	await getItemPropertyByCode(plugin, 'containerTitle')
		// );
		// const eprint = await zoteroItem.getTagPropertyValue(
		// 	await getItemPropertyByCode(plugin, 'eprint')
		// );
		// const eprinttype = await zoteroItem.getTagPropertyValue(
		// 	await getItemPropertyByCode(plugin, 'eprinttype')
		// );
		// const eventPlace = await zoteroItem.getTagPropertyValue(
		// 	await getItemPropertyByCode(plugin, 'eventPlace')
		// );
		// const page = await zoteroItem.getTagPropertyValue(
		// 	await getItemPropertyByCode(plugin, 'page')
		// );
		// const publisher = await zoteroItem.getTagPropertyValue(
		// 	await getItemPropertyByCode(plugin, 'publisher')
		// );
		// const publisherPlace = await zoteroItem.getTagPropertyValue(
		// 	await getItemPropertyByCode(plugin, 'publisherPlace')
		// );
		// const titleShort = await zoteroItem.getTagPropertyValue(
		// 	await getItemPropertyByCode(plugin, 'titleShort')
		// );
		// const URL = await zoteroItem.getTagPropertyValue(
		// 	await getItemPropertyByCode(plugin, 'URL')
		// );
		// const zoteroSelectURI = await zoteroItem.getTagPropertyValue(
		// 	await getItemPropertyByCode(plugin, 'zoteroSelectURI')
		// );
		const key = await zoteroItem.getTagPropertyValue(
			await getItemPropertyByCode(plugin, 'citationKey')
		);

		const item = {
			version: [version],
			message: [message],
			// title: [title],
			// authors: [authors],
			// date: [date],
			// journal: [journal],
			// volume: [volume],
			// issue: [issue],
			// pages: [pages],
			// doi: [doi],
			// abstract: [abstract],
			// keywords: [keywords],
			// accessDate: [accessDate],
			// citekey: [citekey],
			// containerTitle: [containerTitle],
			// eprint: [eprint],
			// eprinttype: [eprinttype],
			// eventPlace: [eventPlace],
			// page: [page],
			// publisher: [publisher],
			// publisherPlace: [publisherPlace],
			// titleShort: [titleShort],
			// URL: [URL],
			// zoteroSelectURI: [zoteroSelectURI],
			key: [key],
			remID: zoteroItem._id,
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
		const key = await collectionRem?.getTagPropertyValue(
			await getCollectionPropertybyCode(plugin, 'key')
		);
		const version = Number(
			await collectionRem?.getTagPropertyValue(
				await getCollectionPropertybyCode(plugin, 'version')
			)
		);
		const name = await collectionRem?.getTagPropertyValue(
			await getCollectionPropertybyCode(plugin, 'name')
		);
		const parentCollection = Boolean(
			await collectionRem?.getTagPropertyValue(
				await getCollectionPropertybyCode(plugin, 'parentCollection')
			)
		);

		const collection = {
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
