import {
	declareIndexPlugin,
	PropertyType,
	RNPlugin,
	PropertyLocation,
	Rem,
	BuiltInPowerupCodes,
} from '@remnote/plugin-sdk';
import { syncCollections } from './funcs/syncing';
import { syncZoteroLibraryToRemNote } from './funcs/syncing';
import { getAllRemNoteCollections, getAllRemNoteItems } from './funcs/fetchFromRemNote';
import { getAllZoteroCollections, getAllZoteroItems } from './funcs/fetchFromZotero';
import { birthZoteroRem } from './funcs/birthZoteroRem';
import { zoteroItemSlots } from './constants/zoteroItemSlots';
import { setForceStop } from './funcs/forceStop';
import { extractAllFollowingChildren } from './utils/childrenExtract';
// @ts-ignore
import Cite from 'citation-js';
import { fetchCitation } from './utils/fetchCitation';
import { LogType, logMessage } from './funcs/logging';

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
		defaultValue: 'BibTeX',
		options: [
			{
				key: 'BibTeX',
				value: 'BibTeX',
				label: 'BibTeX',
			},
			{ key: 'APA', value: 'apa', label: 'APA' },
			{
				key: 'MLA',
				value: 'mla',
				label: 'MLA',
			},
			{
				key: 'Chicago',
				value: 'chicago',
				label: 'Chicago',
			},
			{
				key: 'Harvard',
				value: 'harvard',
				label: 'Harvard',
			},
			{
				key: 'Vancouver',
				value: 'vancouver',
				label: 'Vancouver',
			},
			{
				key: 'IEEE',
				value: 'ieee',
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

	// export citations command (later on, (TODO:) we may want a export citations and add to zotero library command as an ext to this command)
	await plugin.app.registerCommand({
		name: 'export citations',
		description: 'Exports all citations of this Rem to clipboard...',
		id: 'export-citations',
		quickCode: 'cite',
		icon: '📑',
		keywords: 'citation, export',
		action: async () => {
			let remCursorAt = await plugin.focus.getFocusedRem();
			const exportCitationsFormat = await plugin.settings.getSetting(
				'export-citations-format'
			);

			if (!remCursorAt) {
				await logMessage({
					plugin,
					message:
						"You need to have your cursor in a Rem you'd like to export citations from.",
					type: LogType.Info,
					consoleEmitType: 'log',
					isToast: true,
				});
				return;
			}

			if (!remCursorAt.children) {
				await logMessage({
					plugin,
					message: 'Found no Rem to search... try broader Rem.',
					type: LogType.Info,
					consoleEmitType: 'log',
					isToast: true,
				});
				return;
			}

			await logMessage({
				plugin,
				message: '📝 Generating citations...',
				type: LogType.Info,
				consoleEmitType: 'log',
				isToast: true,
			});
			
			const citations: string[] = [];

			const children: Rem[] = await extractAllFollowingChildren({ remCursorAt });

			for (const child of children) {
				const sources = await child.getSources();

				if (sources && sources.length > 0) {
					for (const source of sources) {
						const urlPowerupSlot = await plugin.powerup.getPowerupSlotByCode(
							BuiltInPowerupCodes.Link,
							'URL'
						);
						const url = await source.getTagPropertyValue(urlPowerupSlot!._id);

						if (url && url.length > 0) {
							// @ts-expect-error
							citations.push(url[0]);
						}
					}
				}
			}

			const generatedCitations = await Promise.all(
				citations.map(async (citationURL) => {
					const result = await fetchCitation(citationURL, plugin);
					if (result) {
						if (exportCitationsFormat === 'BibTeX') {
							return result;
						}
						const cite = new Cite(result);
						return cite.format('bibliography', {
							format: 'rtf',
							template: exportCitationsFormat,
							lang: 'en-US',
						});
					}
				})
			);

			const citationsString = generatedCitations.filter(Boolean).join('\n');
			await navigator.clipboard.writeText(citationsString);
			await plugin.app.toast('📝 Copied citations to clipboard!');
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
}

export async function isDebugMode(reactivePlugin: RNPlugin): Promise<boolean> {
	return await reactivePlugin.settings.getSetting('debug-mode');
}

async function onDeactivate(_: RNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
