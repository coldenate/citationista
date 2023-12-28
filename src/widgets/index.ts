import { declareIndexPlugin, PropertyType, RNPlugin, PropertyLocation } from '@remnote/plugin-sdk';
import { syncCollections } from './funcs/syncCollections';
import { syncZoteroLibraryToRemNote } from './funcs/syncCollections';
import { getAllRemNoteCollections, getAllRemNoteItems } from './funcs/fetchFromRemNote';
import { getAllZoteroCollections, getAllZoteroItems } from './funcs/fetchFromZotero';
import { birthZoteroRem } from './funcs/birthZoteroRem';
import { zoteroItemSlots } from './constants/zoteroItemSlots';

let pluginPassthrough: RNPlugin;

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
			slots: zoteroItemSlots,
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
				// trash all plugin footprint
				await plugin.app.registerCommand({
					id: 'trash-all-plugin-footprint',
					name: 'Trash All Plugin Footprint',
					description: 'Trash all plugin footprint',
					quickCode: 'debug trash all plugin footprint',
					action: async () => {
						// zotero-item powerup
						const zoteroItemPowerup = await plugin.powerup.getPowerupByCode(
							'zotero-item'
						);
						// zotero-collection powerup
						const zoteroCollectionPowerup = await plugin.powerup.getPowerupByCode(
							'zotero-collection'
						);
						// zotero-library powerup
						const zoteroLibraryPowerup = await plugin.powerup.getPowerupByCode(
							'zotero-synced-library'
						);
						const taggedRems = await Promise.all([
							zoteroItemPowerup?.taggedRem(),
							zoteroCollectionPowerup?.taggedRem(),
							zoteroLibraryPowerup?.taggedRem(),
						]).then((results) => results.flat());
						if (taggedRems) {
							taggedRems.forEach(async (rem) => {
								await rem!.remove();
							});
						}
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
