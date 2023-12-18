import {
	declareIndexPlugin,
	PropertyType,
	RNPlugin,
	Rem,
	PropertyLocation,
	filterAsync,
} from '@remnote/plugin-sdk';
import { error } from 'console';
import api from 'zotero-api-client'; // ignore this error, it's fine (i think)

let pluginPassthrough: RNPlugin;

async function callZoteroConnection(plugin: RNPlugin) {
	const zoteroApiKey = await plugin.settings.getSetting('zotero-api-key');
	if (zoteroApiKey === undefined || zoteroApiKey === '') {
		await plugin.app.toast(`📝 You need to set your Zotero API key in the settings.`);
		return;
	}
	const zoteroUserId: number = await plugin.settings.getSetting('zotero-user-id');
	if (zoteroUserId === undefined || zoteroUserId === 0 || zoteroUserId === null) {
		await plugin.app.toast(
			`📝 You need to set your Zotero User ID in the settings. You can find this at zotero.org/settings/keys`
		);
		return;
	}

	const zoteroAPIConnection = await api(zoteroApiKey).library('user', zoteroUserId);
	return zoteroAPIConnection;
}

async function birthZoteroRem(plugin: RNPlugin) {
	const lookForRemAlready = await plugin.rem.findByName(['Zotero Library'], null);
	if (lookForRemAlready !== undefined) {
		return;
	}
	const rem = await plugin.rem.createRem();
	await rem?.setText(['Zotero Library']);
	await rem?.addPowerup('zotero-synced-library');
	await rem?.setIsDocument(true); // we want this to be a folder rem!

	const helpInfoRem = await plugin.rem.createRem();
	await helpInfoRem?.setText([
		'Help Info: ',
		'This is your Zotero Library. It syncs every 5 minutes, and you can force sync it with the command: `force zotero sync.` ',
		'You can import papers from Zotero with the command: `zotero`. ',
		'You can export citations from your RemNote Library with the command: `export citations`. ',
		'You can set your Zotero API key and User ID in the settings. ',
		'These are all your collections. ',
	]);
	await helpInfoRem?.setIsQuote(true);
	await helpInfoRem?.setHighlightColor('Blue');
	await helpInfoRem?.setParent(rem);
}

// function: sync collections with zotero library rem
async function syncCollections(plugin: RNPlugin) {
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

	const children: Rem[] = await zoteroCollectionPowerupRem?.getChildrenRem();
	const properties = await filterAsync(children, (c) => c.isProperty());

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

async function syncItems(plugin: RNPlugin, collectionKey: string | false) {
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

	const childrenItem: Rem[] = await zoteroItemPowerup?.getChildrenRem();
	const itemProperties = await filterAsync(childrenItem, (c) => c.isProperty());

	const collectionChildren: Rem[] = await zoteroCollectionPowerupRem?.getChildrenRem();
	const collectionProperties = await filterAsync(collectionChildren, (c) => c.isProperty());

	const keyPropertyCollection = getPropertyByText(itemProperties, 'Key');
	const versionProperty = getPropertyByText(itemProperties, 'Version');
	const nameProperty = getPropertyByText(itemProperties, 'Name');
	const parentCollectionProperty = getPropertyByText(itemProperties, 'Parent Collection');
	// const relationsProperty = getPropertyByText(itemProperties, 'Relations');

	const messageProperty = getPropertyByText(itemProperties, 'Message');
	const titleProperty = getPropertyByText(itemProperties, 'Title');
	const authorsProperty = getPropertyByText(itemProperties, 'Authors');
	const dateProperty = getPropertyByText(itemProperties, 'Date');
	const journalProperty = getPropertyByText(itemProperties, 'Journal');
	const volumeProperty = getPropertyByText(itemProperties, 'Volume');
	const issueProperty = getPropertyByText(itemProperties, 'Issue');
	const pagesProperty = getPropertyByText(itemProperties, 'Pages');
	const doiProperty = getPropertyByText(itemProperties, 'DOI');
	const abstractProperty = getPropertyByText(itemProperties, 'Abstract');
	const keywordsProperty = getPropertyByText(itemProperties, 'Keywords');
	const accessDateProperty = getPropertyByText(itemProperties, 'Access Date');
	const citekeyProperty = getPropertyByText(itemProperties, 'Citekey');
	const containerTitleProperty = getPropertyByText(itemProperties, 'Container Title');
	const eprintProperty = getPropertyByText(itemProperties, 'Eprint');
	const eprinttypeProperty = getPropertyByText(itemProperties, 'Eprinttype');
	const eventPlaceProperty = getPropertyByText(itemProperties, 'Event Place');
	const pageProperty = getPropertyByText(itemProperties, 'Page');
	const publisherProperty = getPropertyByText(itemProperties, 'Publisher');
	const publisherPlaceProperty = getPropertyByText(itemProperties, 'Publisher Place');
	const titleShortProperty = getPropertyByText(itemProperties, 'Title Short');
	const URLProperty = getPropertyByText(itemProperties, 'URL');
	const zoteroSelectURIProperty = getPropertyByText(itemProperties, 'Zotero Select URI');
	const keyProperty = getPropertyByText(itemProperties, 'Key');

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

function getPropertyByText(properties: Rem[], propertyText: string): Rem | undefined {
	return properties.find((property) => property.text[0] === propertyText);
}

async function getAllRemNoteItems(plugin: RNPlugin) {
	// query the zotero-item powerup and get all the rems that way
	// return array of rems after formatting the array to the same schema as the zotero items
	const zoteroItemPowerup = await plugin.powerup.getPowerupByCode('zotero-item');
	const zoteroItems = await zoteroItemPowerup?.taggedRem();
	if (zoteroItems?.length === 0) {
		return undefined;
	}
	// repack into a new array of objects. this is so we can use the same schema as the zotero items
	// get the property values, and then repack them into an object. accompanied with the rem id

	const children: Rem[] = await zoteroItemPowerup?.getChildrenRem();
	const properties = await filterAsync(children, (c) => c.isProperty());

	console.log(properties);

	const messageProperty = getPropertyByText(properties, 'Message');
	const titleProperty = getPropertyByText(properties, 'Title');
	const authorsProperty = getPropertyByText(properties, 'Author(s)');
	const dateProperty = getPropertyByText(properties, 'Date');
	const journalProperty = getPropertyByText(properties, 'Journal/Source');
	const volumeProperty = getPropertyByText(properties, 'Volume');
	const issueProperty = getPropertyByText(properties, 'Issue');
	const pagesProperty = getPropertyByText(properties, 'Page Numbers');
	const doiProperty = getPropertyByText(properties, 'DOI (Digital Object Identifier)');
	const abstractProperty = getPropertyByText(properties, 'Abstract');
	const keywordsProperty = getPropertyByText(properties, 'Keywords');
	const accessDateProperty = getPropertyByText(properties, 'Access Date');
	const citekeyProperty = getPropertyByText(properties, 'Cite Key');
	const containerTitleProperty = getPropertyByText(properties, 'Container Title');
	const eprintProperty = getPropertyByText(properties, 'Eprint');
	const eprinttypeProperty = getPropertyByText(properties, 'Eprint Type');
	const eventPlaceProperty = getPropertyByText(properties, 'Event Place');
	const pageProperty = getPropertyByText(properties, 'Page');
	const publisherProperty = getPropertyByText(properties, 'Publisher');
	const publisherPlaceProperty = getPropertyByText(properties, 'Publisher Place');
	const titleShortProperty = getPropertyByText(properties, 'Title Short');
	const URLProperty = getPropertyByText(properties, 'URL');
	const zoteroSelectURIProperty = getPropertyByText(properties, 'Zotero Select URI');
	const keyProperty = getPropertyByText(properties, 'Key');
	const versionProperty = getPropertyByText(properties, 'Version');

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

async function getAllZoteroItems(plugin: RNPlugin) {
	// get all items from Zotero

	const zoteroItems = [];
	const zoteroAPIConnection = await callZoteroConnection(plugin);
	const zoteroItemsResponse = await zoteroAPIConnection.items().get();

	for (const item of zoteroItemsResponse.raw) {
		// example of item
		// 		 {
		//     key: 'C72HFD6U',
		//     version: 17,
		//     library: {
		//       type: 'user',
		//       id: 11699886,
		//       name: 'Nathan Solis',
		//       links: { alternate: { href: 'https://www.zotero.org/coldenate', type: 'text/html' } }
		//     },
		//     links: {
		//       self: { href: 'https://api.zotero.org/users/11699886/items/C72HFD6U', type: 'application/json' },
		//       alternate: { href: 'https://www.zotero.org/coldenate/items/C72HFD6U', type: 'text/html' },
		//       attachment: {
		//         href: 'https://api.zotero.org/users/11699886/items/FS69FCIW',
		//         type: 'application/json',
		//         attachmentType: 'application/pdf',
		//         attachmentSize: 733670
		//       }
		//     },
		//     meta: { creatorSummary: 'Marzullo', parsedDate: '2017-06-15', numChildren: 2 },
		//     data: {
		//       key: 'C72HFD6U',
		//       version: 17,
		//       itemType: 'journalArticle',
		//       title: 'The Missing Manuscript of Dr. Jose Delgado’s Radio Controlled Bulls',
		//       creators: [ { creatorType: 'author', firstName: 'Timothy C.', lastName: 'Marzullo' } ],
		//       abstractNote:
		//         'Neuroscience systems level courses teach: 1) the role of neuroanatomical structures of the brain for perception, movement, and cognition; 2) methods to manipulate and study the brain including lesions, electrophysiological recordings, microstimulation, optogenetics, and pharmacology; 3) proper interpretation of behavioral data to deduce brain circuit operation; and 4) the similarities, differences, and ethics of animal models and their relation to human physiology. These four topics come together quite dramatically in Dr. Jose Delgado’s 1960s famous experiments on the neural correlates of aggression in which he stopped bulls in mid-charge by electrically stimulating basal ganglia and thalamic structures. Technical documentation on these experiments is famously difficult to find. Here I translate and discuss a Spanish language article written by Dr. Delgado in 1981 for an encyclopedia on bull fighting published in Madrid. Here Dr. Delgado appears to give the most complete explanation of his experiments on microstimulation of bovine brains. Dr. Delgado’s motivations, methods, and his interpretation of the bull experiments are summarized, as well as some accompanying information from his 1970 English language book: “Physical Control of the Mind.” This review of Dr. Delgado’s written work on the bull experiments can provide a resource to educators and students who desire to learn more about and interpret the attention-calling experiments that Dr. Delgado did on a ranch in Andalucía over 50 years ago.',
		//       publicationTitle: 'Journal of Undergraduate Neuroscience Education',
		//       volume: '15',
		//       issue: '2',
		//       pages: 'R29-R35',
		//       date: '2017-6-15',
		//       series: '',
		//       seriesTitle: '',
		//       seriesText: '',
		//       journalAbbreviation: 'J Undergrad Neurosci Educ',
		//       language: '',
		//       DOI: '',
		//       ISSN: '1544-2896',
		//       shortTitle: '',
		//       url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5480854/',
		//       accessDate: '2023-12-01T01:44:00Z',
		//       archive: '',
		//       archiveLocation: '',
		//       libraryCatalog: 'PubMed Central',
		//       callNumber: '',
		//       rights: '',
		//       extra: 'PMID: 28690447\nPMCID: PMC5480854',
		//       tags: [],
		//       collections: [ 'K4YCBJ26' ],
		//       relations: {},
		//       dateAdded: '2023-12-01T01:44:00Z',
		//       dateModified: '2023-12-01T01:44:00Z'
		//     }
		//   }
		zoteroItems.push(item);
	}
	return zoteroItems;
}

async function getItemFromZotero(plugin: RNPlugin, itemKey: string) {
	// get individual item from Zotero via key (I don't even think this is possible)
}

async function syncZoteroLibraryToRemNote(plugin: RNPlugin) {
	await birthZoteroRem(plugin);
	await syncCollections(plugin);
	await syncItems(plugin, false);
}
// function: get all collections from zotero
async function getAllZoteroCollections(plugin: RNPlugin) {
	const zoteroCollections = [];
	const zoteroAPIConnection = await callZoteroConnection(plugin);
	const zoteroCollectionsResponse = await zoteroAPIConnection.collections().get();
	const zoteroCollectionsData = zoteroCollectionsResponse.getData();
	for (const collection of zoteroCollectionsData) {
		zoteroCollections.push(collection);
	}
	return zoteroCollections;
}

async function getAllRemNoteCollections(plugin: RNPlugin) {
	// what this function will do is get all the collections from the zotero library by querying the collection powerup, and it will build an array to the same schema as the zotero collections
	const remnoteCollections = [];

	const zoteroCollectionPowerupRem = await plugin.powerup.getPowerupByCode('zotero-collection');
	const children: Rem[] = await zoteroCollectionPowerupRem?.getChildrenRem();
	const properties = await filterAsync(children, (c) => c.isProperty());

	const keyProperty = properties.find((property) => property.text[0] === 'Key');
	const versionProperty = properties.find((property) => property.text[0] === 'Version');
	const nameProperty = properties.find((property) => property.text[0] === 'Name');
	const parentCollectionProperty = properties.find(
		(property) => property.text[0] === 'Parent Collection'
	);
	const relationsProperty = properties.find((property) => property.text[0] === 'Relations');
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

async function onActivate(plugin: RNPlugin) {
	// create Zotero Library Rem

	// zotero connection

	// settings

	await plugin.settings.registerDropdownSetting({
		id: 'export-citations-format',
		title: 'Export Citations Format',
		description: 'The format used when exporting citations.',
		defaultValue: 'APA',
		options: [
			{ key: 'APA', value: 'APA', label: 'APA' },
			{
				key: 'MLA',
				value: 'MLA',
				label: 'MLA',
			},
			{
				key: 'Chicago',
				value: 'Chicago',
				label: 'Chicago',
			},
			{
				key: 'Harvard',
				value: 'Harvard',
				label: 'Harvard',
			},
			{
				key: 'Vancouver',
				value: 'Vancouver',
				label: 'Vancouver',
			},
			{
				key: 'IEEE',
				value: 'IEEE',
				label: 'IEEE',
			},
		],
	});

	await plugin.settings.registerBooleanSetting({
		id: 'debug-mode',
		title: 'Debug Mode',
		description: 'Enables certain testing commands. Non-destructive.',
		defaultValue: false,
	});

	// zotero api key

	await plugin.settings.registerStringSetting({
		id: 'zotero-api-key',
		title: 'Zotero API Key',
		description: 'The API key used to connect to Zotero.',

		// defaultValue: '',
	});

	// zotero user id

	await plugin.settings.registerNumberSetting({
		id: 'zotero-user-id',
		title: 'Zotero User ID',
		description: 'Find this at https://www.zotero.org/settings/keys',

		// defaultValue: 0,
	});

	// powerups

	await plugin.app.registerPowerup(
		'Zotero Item', // human-readable name
		'zotero-item', // powerup code used to uniquely identify the powerup
		'A citation object holding certain citation metadata for export. Used only for individual papers.', // description
		{
			slots: [
				{
					code: 'key',
					name: 'Key',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
					propertyLocation: PropertyLocation.ONLY_DOCUMENT,
				},
				{
					code: 'version',
					name: 'Version',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.NUMBER,
					propertyLocation: PropertyLocation.ONLY_DOCUMENT,
				},
				{
					code: 'message',
					name: 'Message',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'title',
					name: 'Title',
					onlyProgrammaticModifying: false,
					hidden: false,
				},
				{
					code: 'authors',
					name: 'Author(s)',
					onlyProgrammaticModifying: false,
					hidden: false,
				},
				{
					code: 'date',
					name: 'Date',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.DATE,
				},
				{
					code: 'journal',
					name: 'Journal/Source',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'volume',
					name: 'Volume',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.NUMBER,
				},
				{
					code: 'issue',
					name: 'Issue',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.NUMBER,
				},
				{
					code: 'pages',
					name: 'Page Numbers',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'doi',
					name: 'DOI (Digital Object Identifier)',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'abstract',
					name: 'Abstract',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'keywords',
					name: 'Keywords',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'accessDate',
					name: 'Access Date',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.DATE,
				},
				{
					code: 'citekey',
					name: 'Cite Key',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'containerTitle',
					name: 'Container Title',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'eprint',
					name: 'Eprint',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.CHECKBOX,
				},
				{
					code: 'eprinttype',
					name: 'Eprint Type',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.SINGLE_SELECT,
				},
				{
					code: 'eventPlace',
					name: 'Event Place',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'page',
					name: 'Page',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'publisher',
					name: 'Publisher',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'publisherPlace',
					name: 'Publisher Place',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'titleShort',
					name: 'Title Short',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
				},
				{
					code: 'URL',
					name: 'URL',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.URL,
				},
				{
					code: 'zoteroSelectURI',
					name: 'Zotero Select URI',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.URL,
				},
			],
		}
	);

	await plugin.app.registerPowerup(
		'Zotero Collection',
		'zotero-collection',
		'A Zotero Collection.',
		{
			slots: [
				{
					code: 'key',
					name: 'Key',
					onlyProgrammaticModifying: false, //TODO: RemNote needs to fix this: RemNote doesn't know the plugin is modifying property slots and blocks it when this is true
					hidden: false,
					propertyType: PropertyType.TEXT,
					propertyLocation: PropertyLocation.ONLY_DOCUMENT,
				},
				{
					code: 'version',
					name: 'Version',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.NUMBER,
					propertyLocation: PropertyLocation.ONLY_DOCUMENT,
				},
				{
					code: 'name',
					name: 'Name',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
					propertyLocation: PropertyLocation.ONLY_DOCUMENT,
				},
				{
					code: 'parentCollection',
					name: 'Parent Collection',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.CHECKBOX,
					propertyLocation: PropertyLocation.ONLY_DOCUMENT,
				},
				{
					code: 'relations',
					name: 'Relations',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.TEXT,
					propertyLocation: PropertyLocation.ONLY_DOCUMENT,
				},
			],
		}
	);

	await plugin.app.registerPowerup(
		'Zotero Library Sync Powerup',
		'zotero-synced-library',
		'Your Zotero library, synced with RemNote. :D',
		{
			properties: [
				{
					code: 'syncing',
					name: 'Syncing',
					onlyProgrammaticModifying: true,
					hidden: false,
					propertyType: PropertyType.CHECKBOX,
					propertyLocation: PropertyLocation.ONLY_DOCUMENT,
				},
			],
		}
	);

	// commands

	// force birth zotero rem command

	await plugin.app.registerCommand({
		name: 'force birth zotero rem',
		description: 'Forces the creation of the Zotero Library Rem.',
		id: 'force-birth-zotero-rem',
		quickCode: 'birth',
		icon: '👶',
		keywords: 'zotero, force, birth',
		action: async () => {
			await birthZoteroRem(plugin);
		},
	});

	// force zotero sync command
	await plugin.app.registerCommand({
		name: 'force zotero sync',
		description: 'Forces synchronization with Zotero.',
		id: 'force-zotero-sync',
		quickCode: 'sync',
		icon: '🔁',
		keywords: 'zotero, sync',
		action: async () => {
			await syncZoteroLibraryToRemNote(plugin);
			await plugin.app.toast('🔁 Synced with Zotero!');
		},
	});

	// import zotero paper command
	await plugin.app.registerCommand({
		name: 'zotero',
		description: 'Search and Import a paper from Zotero',
		id: 'import-zotero-paper',
		quickCode: 'import',
		icon: '📄',
		keywords: 'zotero, import, paper',
		action: async () => {
			return console.error('Not yet implemented.');
			// command to search for and add invidual papers from Zotero with zotero-api-client
			// on selecting the paper, import the citation with a bunch of metadata to populate the powerup ONLY IF ITS NOT ALREADY IN REMNOTE
			// IF ITS IN REMNOTE, then just add the reference to the rem, and individually sync that item with zotero
		},
	});

	// magic search zotero command (basically, the plugin will have created an upopulated list of papers from Zotero, and the user can search through them. then when they select one, it will populate the paper with the metadata from Zotero)

	// export citations command
	await plugin.app.registerCommand({
		name: 'export citations',
		description:
			'Exports all citations of this Rem to clipboard. Searches through all children of this Rem. Uses defined format in settings.',
		id: 'export-citations',
		quickCode: 'cite',
		icon: '📑',
		keywords: 'citation, export',
		action: async () => {
			// // start at the rem the user ran the command at
			// let remCursorAt = await plugin.focus.getFocusedRem();
			// if (remCursorAt === undefined) {
			// 	let extraString = `We'll then convert that Rem to a document, as per settings. (You can turn this off)`; // only shows if the setting: convertToDocument is true
			// 	await plugin.app.toast(
			// 		`📝 You need to have your cursor in a Rem you'd like to make the document.`
			// 	);
			// 	console.info("Couldn't find a Rem to make a document from.");
			// 	return;
			// }
			// // then make a children iterator (max depth 10)
			// // so we will get the child (remCursorAt.children[0]) and then we will go on 10 times deep into that child
			// // then we'll resume the iterator and get the next child (remCursorAt.children[1]) and then we will go on 10 times deep into that child
			// // and so on
			// if (remCursorAt.children === undefined) {
			// 	await plugin.app.toast('📝 Found no Rem found to search... try broader Rem.');
			// 	return;
			// }
			// let citations: string[] = [];
			// await plugin.app.toast('📝 Searching for sources...');
			// await processRem(plugin, remCursorAt, 0, 10);
			// const children = await remCursorAt.getChildrenRem();
			// console.log(children);
			// // await plugin.app.toast(`Copied ${citations.length} citations to clipboard.`);
		},
	});

	// commands

	plugin.track(async (reactivePlugin) => {
		// debug mode
		await isDebugMode(reactivePlugin).then(async (debugMode) => {
			if (debugMode) {
				plugin.app.toast('Debug Mode Enabled; Registering Debug Tools');
				await plugin.app.registerCommand({
					id: 'log-values',
					name: 'Log Values',
					description: 'Log the values of certain variables',
					quickCode: 'debug log',
					action: async () => {
						// log values
					},
				});
				await plugin.app.registerCommand({
					id: 'log-all-zotero-collections',
					name: 'Log All Zotero Collections',
					description: 'Log all Zotero collections',
					quickCode: 'debug log zotero collections',
					action: async () => {
						await getAllZoteroCollections(plugin).then((collections) => {
							console.log(collections);
						});
					},
				});
				await plugin.app.registerCommand({
					id: 'log-all-remnote-collections',
					name: 'Log All RemNote Collections',
					description: 'Log all RemNote collections',
					quickCode: 'debug log remnote collections',
					action: async () => {
						await getAllRemNoteCollections(reactivePlugin).then((collections) => {
							console.log(collections);
						});
					},
				});
				await plugin.app.registerCommand({
					id: 'tag-as-collection',
					name: 'Tag as Collection',
					description: 'Tag a Rem as a collection',
					quickCode: 'debug tag as collection',
					action: async () => {
						const remFocused = await plugin.focus.getFocusedRem();
						await remFocused?.addPowerup('zotero-collection');
					},
				});
				await plugin.app.registerCommand({
					id: 'sync-collections',
					name: 'Sync Collections',
					description: 'Sync collections with Zotero',
					quickCode: 'debug sync collections',
					action: async () => {
						await syncCollections(reactivePlugin);
					},
				});
				await plugin.app.registerCommand({
					id: 'log-all-items-from-zotero',
					name: 'Log All Items from Zotero',
					description: 'Log all items from Zotero',
					quickCode: 'debug log zotero items',
					action: async () => {
						await getAllZoteroItems(plugin).then((items) => {
							console.log(items);
						});
					},
				});
				await plugin.app.registerCommand({
					id: 'log-remnote-items',
					name: 'Log RemNote Items',
					description: 'Log all items from RemNote',
					quickCode: 'debug log remnote items',
					action: async () => {
						await getAllRemNoteItems(reactivePlugin).then((items) => {
							console.log(items);
						});
					},
				});
			}
		});
	});

	pluginPassthrough = plugin;

	await birthZoteroRem(plugin);
	await syncCollections(plugin);
}

async function isDebugMode(reactivePlugin: RNPlugin): Promise<boolean> {
	return await reactivePlugin.settings.getSetting('debug-mode');
}

async function onDeactivate(_: RNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
