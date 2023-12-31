import { declareIndexPlugin, PropertyType, RNPlugin, PropertyLocation } from '@remnote/plugin-sdk';
import { syncCollections } from './funcs/syncing';
import { syncZoteroLibraryToRemNote } from './funcs/syncing';
import { getAllRemNoteCollections, getAllRemNoteItems } from './funcs/fetchFromRemNote';
import { getAllZoteroCollections, getAllZoteroItems } from './funcs/fetchFromZotero';
import { birthZoteroRem } from './funcs/birthZoteroRem';
import { zoteroItemSlots } from './constants/zoteroItemSlots';
import { setForceStop } from './funcs/forceStop';

let pluginPassthrough: RNPlugin;

async function onActivate(plugin: RNPlugin) {
	// settings

	// zotero user id

	await plugin.settings.registerNumberSetting({
		id: 'zotero-user-id',
		title: 'Zotero User ID',
		description: 'Find this at https://www.zotero.org/settings/keys',

		// defaultValue: 0,
	});

	// zotero api key

	await plugin.settings.registerStringSetting({
		id: 'zotero-api-key',
		title: 'Zotero API Key',
		description: 'The API key used to connect to Zotero.',

		// defaultValue: '',
	});

	await plugin.settings.registerBooleanSetting({
		// TODO: implement this feature
		id: 'simple-mode',
		title: 'Simple Syncing Mode',
		description:
			'Enables Simple importing of Zotero Items. Toggling this OFF will AVOID importing any metadata for a Zotero item. For ex, notes, date accessed, etc.',
		defaultValue: false,
	});

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

	// powerups

	await plugin.app.registerPowerup(
		'Zotero Item', // human-readable name
		'zitem', // powerup code used to uniquely identify the powerup
		'A citation object holding certain citation metadata for export. Used only for individual papers.', // description
		{
			// @ts-ignore
			slots: zoteroItemSlots,
		}
	);

	await plugin.app.registerPowerup('Zotero Collection', 'collection', 'A Zotero Collection.', {
		slots: [
			{
				code: 'key',
				name: 'Key',
				onlyProgrammaticModifying: false, //TODO: RemNote needs to fix this: RemNote doesn't know the plugin is modifying property slots and blocks it when this is true
				hidden: false,
				propertyType: PropertyType.TEXT,
				propertyLocation: PropertyLocation.ONLY_IN_TABLE,
			},
			{
				code: 'version',
				name: 'Version',
				onlyProgrammaticModifying: false,
				hidden: false,
				propertyType: PropertyType.NUMBER,
				propertyLocation: PropertyLocation.ONLY_IN_TABLE,
			},
			{
				code: 'name',
				name: 'Name',
				onlyProgrammaticModifying: false,
				hidden: false,
				propertyType: PropertyType.TEXT,
				propertyLocation: PropertyLocation.ONLY_IN_TABLE,
			},
			{
				code: 'parentCollection',
				name: 'Parent Collection',
				onlyProgrammaticModifying: false,
				hidden: false,
				propertyType: PropertyType.CHECKBOX,
				propertyLocation: PropertyLocation.ONLY_IN_TABLE,
			},
			{
				code: 'relations',
				name: 'Relations',
				onlyProgrammaticModifying: false,
				hidden: false,
				propertyType: PropertyType.TEXT,
				propertyLocation: PropertyLocation.ONLY_IN_TABLE,
			},
		],
	});

	await plugin.app.registerPowerup(
		'Citationista Pool',
		'coolPool',
		'A pool of citationista rems.',
		{
			properties: [],
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
		name: 'Force Library Rem Creation',
		description: 'Forces the creation of the Zotero Library Rem.',
		id: 'force-birth-zotero-rem',
		quickCode: 'birth',
		icon: '👶',
		keywords: 'zotero, force, birth',
		action: async () => {
			const rem = await birthZoteroRem(plugin);
			if (rem) {
				await plugin.window.openRem(rem);
			}
		},
	});

	// force zotero sync command
	await plugin.app.registerCommand({
		name: 'Force Syncing of Zotero Library',
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
		name: 'Import a Zotero Paper',
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

	// force stop syncing
	await plugin.app.registerCommand({
		name: 'Force Quit Syncing',
		description: 'Force stop syncing with Zotero.',
		id: 'force-stop-syncing',
		quickCode: 'stop',
		icon: '🛑',
		keywords: 'zotero, stop, sync',
		action: async () => {
			await setForceStop(plugin);
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
				plugin.app.toast('Debug Mode Enabled; Registering Debug Tools for Citationista...');
				await plugin.app.registerCommand({
					id: 'log-values',
					name: 'Log Values',
					description: 'Log the values of certain variables',
					quickCode: 'dlog',
					action: async () => {
						// log values
					},
				});
				await plugin.app.registerCommand({
					id: 'log-all-collections',
					name: 'Log All Zotero Collections',
					description: 'Log all Zotero collections',
					quickCode: 'dczlog',
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
					quickCode: 'dcrlog',
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
					quickCode: 'dtagcol',
					action: async () => {
						const remFocused = await plugin.focus.getFocusedRem();
						await remFocused?.addPowerup('collection');
					},
				});
				await plugin.app.registerCommand({
					id: 'sync-collections',
					name: 'Sync Collections',
					description: 'Sync collections with Zotero',
					quickCode: 'dsynccol',
					action: async () => {
						await syncCollections(reactivePlugin);
					},
				});
				await plugin.app.registerCommand({
					id: 'log-all-items-from-zotero',
					name: 'Log All Items from Zotero',
					description: 'Log all items from Zotero',
					quickCode: 'laifz',
					action: async () => {
						await getAllZoteroItems(plugin).then((items) => {
							console.log(items);
						});
					},
				});
				// log citationista pool tagged rem
				await plugin.app.registerCommand({
					id: 'show-pool',
					name: 'Display Citationista Pool Powerup Rem',
					description: `Let's you see the Citationista Pool Powerup Rem`,
					action: async () => {
						const poolPowerup = await plugin.powerup.getPowerupByCode('coolPool');
						await plugin.window.openRem(poolPowerup!);
					},
				});
				// log all items from remnote (use the powerup)
				await plugin.app.registerCommand({
					id: 'log-all-items-from-remnote-powerup-based',
					name: 'Log All Items from RemNote (Powerup Based)',
					description: 'Log all items from RemNote',
					quickCode: 'daifrp',
					action: async () => {
						const zoteroItemPowerup = await plugin.powerup.getPowerupByCode('zitem');
						await zoteroItemPowerup?.taggedRem().then((rem) => {
							console.log(rem);
						});
					},
				});

				await plugin.app.registerCommand({
					id: 'log-remnote-items',
					name: 'Log RemNote Items',
					description: 'Log all items from RemNote',
					quickCode: 'dlogremcon',
					action: async () => {
						await getAllRemNoteItems(reactivePlugin).then((items) => {
							console.log(items);
						});
					},
				});
				// trash all plugin footprint
				await plugin.app.registerCommand({
					id: 'trash-all-plugin-footprint',
					name: 'Delete all Citationista Generated Rem',
					description: `Trash all of the plugin's footprint`,
					quickCode: 'dtapf',
					action: async () => {
						// zitem powerup
						const zoteroItemPowerup = await plugin.powerup.getPowerupByCode('zitem');
						// collection powerup
						const zoteroCollectionPowerup = await plugin.powerup.getPowerupByCode(
							'collection'
						);
						// zotero-library powerup
						const zoteroLibraryPowerup = await plugin.powerup.getPowerupByCode(
							'zotero-synced-library'
						);
						const citationistaPowerup = await plugin.powerup.getPowerupByCode(
							'coolPool'
						);
						const taggedRems = await Promise.all([
							zoteroItemPowerup?.taggedRem(),
							zoteroCollectionPowerup?.taggedRem(),
							zoteroLibraryPowerup?.taggedRem(),
							citationistaPowerup?.taggedRem(),
						]).then((results) => results.flat());
						if (taggedRems) {
							taggedRems.forEach(async (rem) => {
								await rem!.remove();
							});
						}
					},
				});
				// delete all Rems tagged with zitem powerup
				await plugin.app.registerCommand({
					id: 'delete-all-remnote-items',
					name: 'Delete all RemNote Items',
					description: 'Delete all RemNote Items',
					quickCode: 'dari',
					action: async () => {
						const zoteroItemPowerup = await plugin.powerup.getPowerupByCode('zitem');
						const taggedRems = await zoteroItemPowerup?.taggedRem();
						if (taggedRems) {
							taggedRems.forEach(async (rem) => {
								await rem!.remove();
							});
						}
					},
				});
			}
			if (!(await isDebugMode(plugin))) await syncZoteroLibraryToRemNote(plugin);
		});
	});

	pluginPassthrough = plugin;
}

export async function isDebugMode(reactivePlugin: RNPlugin): Promise<boolean> {
	return await reactivePlugin.settings.getSetting('debug-mode');
}

async function onDeactivate(_: RNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
