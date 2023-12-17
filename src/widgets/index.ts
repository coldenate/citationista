import {
	declareIndexPlugin,
	PropertyType,
	RNPlugin,
	Rem,
	PropertyLocation,
	filterAsync,
} from '@remnote/plugin-sdk';
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

	await syncZoteroLibraryToRemNote(plugin);
}

// function: sync collections with zotero library rem
async function syncCollections(plugin: RNPlugin) {
	const zoteroCollections = await getAllZoteroCollections();

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

async function syncZoteroLibraryToRemNote(plugin: RNPlugin) {
	await birthZoteroRem(plugin);
	await syncCollections(plugin);
}
// function: get all collections from zotero
async function getAllZoteroCollections() {
	const zoteroCollections = [];
	const zoteroApiKey = await pluginPassthrough.settings.getSetting('zotero-api-key');
	const zoteroUserId: number = await pluginPassthrough.settings.getSetting('zotero-user-id');
	const zoteroAPIConnection = await api(zoteroApiKey).library('user', zoteroUserId);
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
		'Citation', // human-readable name
		'citation', // powerup code used to uniquely identify the powerup
		'A citation object holding certain citation metadata for export. Used only for individual papers.', // description
		{
			slots: [
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
			// command to search for and add invidual papers from Zotero with zotero-api-client
			// on selecting the paper, import the citation with a bunch of metadata to populate the powerup
			await callZoteroConnection(plugin);

			const itemsResponse = await zoteroConnection.items().get();
			const itemsData = itemsResponse.getData();
			const searchResults = itemsData.filter((item: { title: string | string[] }) =>
				item.title.includes('test')
			);

			console.log(searchResults);
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
						await getAllZoteroCollections().then((collections) => {
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
			}
		});
	});

	pluginPassthrough = plugin;

	await birthZoteroRem(plugin);
}

async function isDebugMode(reactivePlugin: RNPlugin): Promise<boolean> {
	return await reactivePlugin.settings.getSetting('debug-mode');
}

async function onDeactivate(_: RNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
