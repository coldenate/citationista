import { RNPlugin } from '@remnote/plugin-sdk';

export async function getAllRemNoteItems(plugin: RNPlugin) {
	// query the zotero-item powerup and get all the rems that way
	// return array of rems after formatting the array to the same schema as the zotero items
	const zoteroItemPowerup = await plugin.powerup.getPowerupByCode('zotero-item');
	const zoteroItems = await zoteroItemPowerup?.taggedRem();
	if (zoteroItems?.length === 0) {
		return undefined;
	}
	// repack into a new array of objects. this is so we can use the same schema as the zotero items
	// get the property values, and then repack them into an object. accompanied with the rem id
	const remnoteItems = [];

	for (const zoteroItem of zoteroItems) {
		const version = await zoteroItem.getTagPropertyValue(versionProperty?._id);
		const message = await zoteroItem.getTagPropertyValue(messageProperty?._id);
		const title = await zoteroItem.getTagPropertyValue(titleProperty?._id);
		const authors = await zoteroItem.getTagPropertyValue(authorsProperty?._id);
		const date = await zoteroItem.getTagPropertyValue(dateProperty?._id);
		const journal = await zoteroItem.getTagPropertyValue(journalProperty?._id);
		const volume = await zoteroItem.getTagPropertyValue(volumeProperty?._id);
		const issue = await zoteroItem.getTagPropertyValue(issueProperty?._id);
		const pages = await zoteroItem.getTagPropertyValue(pagesProperty?._id);
		const doi = await zoteroItem.getTagPropertyValue(doiProperty?._id);
		const abstract = await zoteroItem.getTagPropertyValue(abstractProperty?._id);
		const keywords = await zoteroItem.getTagPropertyValue(keywordsProperty?._id);
		const accessDate = await zoteroItem.getTagPropertyValue(accessDateProperty?._id);
		const citekey = await zoteroItem.getTagPropertyValue(citekeyProperty?._id);
		const containerTitle = await zoteroItem.getTagPropertyValue(containerTitleProperty?._id);
		const eprint = await zoteroItem.getTagPropertyValue(eprintProperty?._id);
		const eprinttype = await zoteroItem.getTagPropertyValue(eprinttypeProperty?._id);
		const eventPlace = await zoteroItem.getTagPropertyValue(eventPlaceProperty?._id);
		const page = await zoteroItem.getTagPropertyValue(pageProperty?._id);
		const publisher = await zoteroItem.getTagPropertyValue(publisherProperty?._id);
		const publisherPlace = await zoteroItem.getTagPropertyValue(publisherPlaceProperty?._id);
		const titleShort = await zoteroItem.getTagPropertyValue(titleShortProperty?._id);
		const URL = await zoteroItem.getTagPropertyValue(URLProperty?._id);
		const zoteroSelectURI = await zoteroItem.getTagPropertyValue(zoteroSelectURIProperty?._id);
		const key = await zoteroItem.getTagPropertyValue(keyProperty?._id);

		const item = {
			version: [version],
			message: [message],
			title: [title],
			authors: [authors],
			date: [date],
			journal: [journal],
			volume: [volume],
			issue: [issue],
			pages: [pages],
			doi: [doi],
			abstract: [abstract],
			keywords: [keywords],
			accessDate: [accessDate],
			citekey: [citekey],
			containerTitle: [containerTitle],
			eprint: [eprint],
			eprinttype: [eprinttype],
			eventPlace: [eventPlace],
			page: [page],
			publisher: [publisher],
			publisherPlace: [publisherPlace],
			titleShort: [titleShort],
			URL: [URL],
			zoteroSelectURI: [zoteroSelectURI],
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

	const zoteroCollectionPowerupRem = await plugin.powerup.getPowerupByCode('zotero-collection');

	const collectionRems = await zoteroCollectionPowerupRem?.taggedRem();

	for (const collectionRem of collectionRems) {
		const key = await collectionRem?.getTagPropertyValue(keyProperty?._id);
		const version = Number(await collectionRem?.getTagPropertyValue(versionProperty?._id));
		const name = await collectionRem?.getTagPropertyValue(nameProperty?._id);
		const parentCollection = Boolean(
			await collectionRem?.getTagPropertyValue(parentCollectionProperty?._id)
		);
		// const relations = await collectionRem?.getTagPropertyValue(
		// 	relationsProperty?._id
		// ); //FIXME: convert to object
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
