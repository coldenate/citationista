// Rename summary: abort sync handling and CITATION_POOL rename
import {
	declareIndexPlugin,
	PropertyLocation,
	PropertyType,
	type RNPlugin,
	SelectionType,
	WidgetLocation,
} from '@remnote/plugin-sdk';
import { fetchLibraries } from './api/zotero';
import {
    citationFormats,
    citationSourceOptions,
    POPUP_Y_OFFSET,
    powerupCodes,
} from './constants/constants';
import { itemTypes } from './constants/zoteroItemSchema';
import { autoSync } from './services/autoSync';
import {
	extractSourceUrls,
	fetchWikipediaBibliography,
	fetchWikipediaCitation,
	fetchZoteroBibliography,
	fetchZoteroCitation,
	sendUrlsToZotero,
} from './services/citationHelpers';
import { ensureZoteroLibraryRemExists } from './services/ensureUIPrettyZoteroRemExist';
import { registerIconCSS } from './services/iconCSS';
import { createRem, markAbortRequested } from './services/pluginIO';
import { registerItemPowerups } from './services/zoteroSchemaToRemNote';
import { release } from './sync/syncLock';
import { ZoteroSyncManager } from './sync/zoteroSyncManager';
import { LogType, logMessage } from './utils/logging';

let autoSyncInterval: NodeJS.Timeout | undefined;
let zoteroCitationRegistered = false;
let wikiCitationRegistered = false;
let citationWidgetId: string | undefined;

// Helper functions for organizing registration logic

async function registerSettings(plugin: RNPlugin) {
	// user sign-in

	await plugin.settings.registerStringSetting({
		id: 'zotero-user-id',
		title: 'Zotero userID',
		description: 'Find this at https://www.zotero.org/settings/keys',
	});
	await plugin.settings.registerStringSetting({
		id: 'zotero-api-key',
		title: 'Zotero API Key',
		description:
			'Find this at https://www.zotero.org/settings/keys. Make sure to enable all read/write for all features to work. But feel free to disable any you do not need.',
	});

	// selecting library

	const libraries = await fetchLibraries(plugin);
	const libraryOptions =
		libraries.length > 0
			? libraries.map((lib) => ({
					key: `${lib.type}:${lib.id}`,
					label: lib.type === 'group' ? `Group: ${lib.name}` : 'My Library',
					value: `${lib.type}:${lib.id}`,
				}))
			: [{ key: 'none', label: 'None', value: '' }];
	await plugin.settings.registerDropdownSetting({
		id: 'zotero-library-id',
		title: 'Primary Zotero Library',
		description:
			'Primary library to sync with. Any commands that require a library will use this one. This setting does not affect multiple libraries syncing.',
		options: libraryOptions,
		defaultValue: libraries.length > 0 ? `${libraries[0].type}:${libraries[0].id}` : undefined,
	});

	await plugin.settings.registerBooleanSetting({
		id: 'sync-multiple-libraries',
		title: 'Sync Multiple Libraries',
		description:
			'If enabled, Zotero Connector will sync all accessible Zotero libraries instead of only the selected one.',
		defaultValue: false,
	});

	// plugin logic configuration

	await plugin.settings.registerDropdownSetting({
		id: 'multiple-colections-behavior',
		title: 'Items in Multiple Collections Display Behavior',
		description:
			'Decide how items should behave when they appear in more than one collection. Portal: Links all instances of the item to a SINGLE shared version (changes apply everywhere). References: Creates SEPARATE versions of the item for each collection (changes apply only in that collection).',
		defaultValue: 'portal',
		options: [
			{ key: 'portal', label: 'Portal', value: 'portal' },
			{ key: 'reference', label: 'Reference', value: 'reference' },
		],
	});

	await plugin.settings.registerBooleanSetting({
		id: 'disable-auto-sync',
		title: 'Disable Auto Sync',
		description: 'Prevent Zotero Connector from syncing every 5 minutes.',
		defaultValue: true,
	});

	await plugin.settings.registerBooleanSetting({
		id: 'simple-mode',
		title: 'Simple Syncing Mode',
		description:
			'(not recommended) Enables Simple importing of Zotero Items. Toggling this ON will AVOID importing any metadata for a Zotero item. For ex, notes, date accessed, etc.',
		defaultValue: false,
	});

	await plugin.settings.registerDropdownSetting({
		id: 'citation-format',
		title: 'Citation Format',
		description: 'Formatting style for citations and bibliographies.',
		defaultValue: 'apa',
		options: citationFormats,
	});

	await plugin.settings.registerDropdownSetting({
		id: 'citation-source',
		title: 'Citation Source',
		description: 'Which service provides citation data for commands.',
		defaultValue: 'zotero',
		options: citationSourceOptions,
	});

	// await plugin.settings.registerDropdownSetting({
	// 	id: 'export-citations-format',
	// 	title: 'Export Citations Format',
	// 	description: 'The format used when exporting citations.',
	// 	defaultValue: 'BibTeX',
	// 	options: citationFormats,
	// });
	await plugin.settings.registerBooleanSetting({
		id: 'debug-mode',
		title: 'Debug Mode (Zotero Connector)',
		description: 'Enables certain testing commands. Non-destructive.',
		defaultValue: false,
	});
}

async function registerZoteroCitationCommands(plugin: RNPlugin) {
	if (zoteroCitationRegistered) return;
	await plugin.app.registerCommand({
		id: 'copy-citation-from-zotero',
		name: 'Copy Citation via Zotero',
		description: "Copy formatted citations for the focused Rem's sources.",
		quickCode: 'citez',
		action: async () => {
			const rem = await plugin.focus.getFocusedRem();
			if (!rem) return;
			const urls = await extractSourceUrls(plugin, rem);
			const keys = await sendUrlsToZotero(plugin, urls);
			const citations: string[] = [];
			for (const key of keys) {
				const cit = await fetchZoteroCitation(plugin, key);
				if (cit) citations.push(cit.trim());
			}
			if (citations.length) {
				await plugin.app.toast(
					`${citations[0]} ${citations.length > 1 ? `and ${citations.length - 1} more` : ''} copied to clipboard`
				);
				await navigator.clipboard.writeText(citations.join('\n'));
			}
		},
	});

	await plugin.app.registerCommand({
		id: 'copy-bib-from-zotero',
		name: 'Copy Bibliography via Zotero',
		description: "Copy bibliography entries for the focused Rem's sources.",
		quickCode: 'bibz',
		action: async () => {
			const rem = await plugin.focus.getFocusedRem();
			if (!rem) return;
			const urls = await extractSourceUrls(plugin, rem);
			const keys = await sendUrlsToZotero(plugin, urls);
			const bibs: string[] = [];
			for (const key of keys) {
				const bib = await fetchZoteroBibliography(plugin, key);
				if (bib) bibs.push(bib.trim());
			}
			if (bibs.length) {
				await navigator.clipboard.writeText(bibs.join('\n'));
				await plugin.app.toast(
					`${bibs[0]} ${bibs.length > 1 ? `and ${bibs.length - 1} more` : ''} copied to clipboard`
				);
			}
		},
	});

	zoteroCitationRegistered = true;
}

async function registerWikipediaCitationCommands(plugin: RNPlugin) {
	if (wikiCitationRegistered) return;
	await plugin.app.registerCommand({
		id: 'copy-citation-from-wiki',
		name: 'Copy Citation via Wikipedia',
		description: "Get citations for the focused Rem's sources without using Zotero.",
		quickCode: 'citew',
		action: async () => {
			const rem = await plugin.focus.getFocusedRem();
			if (!rem) return;
			const urls = await extractSourceUrls(plugin, rem);
			const cites: string[] = [];
			for (const url of urls) {
				const c = await fetchWikipediaCitation(plugin, url);
				if (c) cites.push(c.trim());
			}
			if (cites.length) {
				await navigator.clipboard.writeText(cites.join('\n'));
				await plugin.app.toast(
					`${cites[0]} ${cites.length > 1 ? `and ${cites.length - 1} more` : ''} copied to clipboard`
				);
			}
		},
	});

	await plugin.app.registerCommand({
		id: 'copy-bib-from-wiki',
		name: 'Copy Bibliography via Wikipedia',
		description: 'Get bibliography entries for sources without using Zotero.',
		quickCode: 'bibw',
		action: async () => {
			const rem = await plugin.focus.getFocusedRem();
			if (!rem) return;
			const urls = await extractSourceUrls(plugin, rem);
			const entries: string[] = [];
			for (const url of urls) {
				const b = await fetchWikipediaBibliography(plugin, url);
				if (b) entries.push(b.trim());
			}
			if (entries.length) {
				await navigator.clipboard.writeText(entries.join('\n'));
				await plugin.app.toast(
					`${entries[0]} ${entries.length > 1 ? `and ${entries.length - 1} more` : ''} copied to clipboard`
				);
			}
		},
	});

	wikiCitationRegistered = true;
}

async function registerPowerups(plugin: RNPlugin) {
	// await plugin.app.registerCommand({
	// 	name: 'Zotero Connector export citations',
	// 	description: 'Exports all citations of this Rem to clipboard...',
	// 	id: 'export-citations',
	// 	quickCode: 'cite',
	// 	icon: '📑',
	// 	keywords: 'citation, export',
	// 	action: async () => await exportCitations(plugin),
	// });
	await plugin.app.registerPowerup({
		name: 'Zotero Collection',
		code: powerupCodes.COLLECTION,
		description: 'A Zotero Collection.',
		options: {
			slots: [
				{
					code: 'key',
					name: 'Key',
					onlyProgrammaticModifying: false,
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
		},
	});
	await plugin.app.registerPowerup({
		name: 'Zotero Connector Pool',
		code: powerupCodes.CITATION_POOL,
		description: 'A pool of zotero rems.',
		options: {
			properties: [],
		},
	});
	await plugin.app.registerPowerup({
		name: 'Zotero Connector Home Page',
		code: powerupCodes.ZOTERO_CONNECTOR_HOME,
		description: 'Home page for the Zotero Connector.',
		options: {
			properties: [],
		},
	});
	await plugin.app.registerPowerup({
		name: 'Zotero Unfiled Items',
		code: powerupCodes.ZOTERO_UNFILED_ITEMS,
		description: 'Unfiled Items from Zotero.',
		options: {
			properties: [],
		},
	});

	await plugin.app.registerPowerup({
		name: 'Zotero Library Sync Powerup',
		code: powerupCodes.ZOTERO_SYNCED_LIBRARY,
		description: 'Your Zotero library, synced with RemNote. :D',
		options: {
			properties: [],
		},
	});

	await plugin.app.registerPowerup({
		name: 'Zotero Item',
		code: powerupCodes.ZITEM,
		description: 'A Zotero Item.',
		options: {
			slots: [
				{
					code: 'key',
					name: 'Key',
					onlyProgrammaticModifying: false,
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
					code: 'fullData',
					name: 'Full Data',
					onlyProgrammaticModifying: false,
					hidden: true,
					propertyType: PropertyType.TEXT,
					propertyLocation: PropertyLocation.ONLY_IN_TABLE,
				},
				{
					code: 'relations',
					name: 'Relations',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.MULTI_SELECT,
					propertyLocation: PropertyLocation.ONLY_IN_TABLE,
				},
				{
					code: 'notes',
					name: 'Notes',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.MULTI_SELECT,
					propertyLocation: PropertyLocation.ONLY_IN_TABLE,
				},
				{
					code: 'dateAdded',
					name: 'Date Added',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.DATE,
					propertyLocation: PropertyLocation.ONLY_IN_TABLE,
				},
				{
					code: 'dateModified',
					name: 'Date Modified',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.DATE,
					propertyLocation: PropertyLocation.ONLY_IN_TABLE,
				},
				{
					code: 'dateAccessed',
					name: 'Date Accessed',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.DATE,
					propertyLocation: PropertyLocation.ONLY_IN_TABLE,
				},
				{
					code: 'tags',
					name: 'Tags',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.MULTI_SELECT,
					propertyLocation: PropertyLocation.ONLY_IN_TABLE,
				},
				{
					code: 'collections',
					name: 'Collections',
					onlyProgrammaticModifying: false,
					hidden: false,
					propertyType: PropertyType.MULTI_SELECT,
					propertyLocation: PropertyLocation.ONLY_IN_TABLE,
				},
			],
		},
	});
	const freshZItemPowerups = registerItemPowerups(itemTypes);
	const zItem = await plugin.powerup.getPowerupByCode(powerupCodes.ZITEM);
	if (!zItem) {
		throw new Error('ZItem powerup not found');
	}
	const zItemID = zItem._id;
	if (!zItemID) {
		throw new Error('ZItem ID not found');
	}
	for (const powerup of freshZItemPowerups) {
		try {
			await plugin.app.registerPowerup(powerup);
		} catch (error) {
			await logMessage(
				plugin,
				`Error registering powerup: ${powerup.name}`,
				LogType.Error,
				false,
				String(error)
			);
			await plugin.app.toast(`Error registering powerup: ${powerup.name}`);
			return;
		}
		const powerUpRem = await plugin.powerup.getPowerupByCode(powerup.code);
		if (powerUpRem) {
			await powerUpRem.addTag(zItemID);
		}
	}
}

async function _deleteTaggedRems(plugin: RNPlugin, powerupCodes: string[]): Promise<void> {
	for (const code of powerupCodes) {
		const powerup = await plugin.powerup.getPowerupByCode(code);
		const taggedRems = await powerup?.taggedRem();
		if (taggedRems) {
			const removalPromises = taggedRems.map((rem) => rem?.remove());
			await Promise.all(removalPromises);
		}
	}
}

async function handleLibrarySwitch(plugin: RNPlugin) {
	const multi = (await plugin.settings.getSetting('sync-multiple-libraries')) as
		| boolean
		| undefined;
	if (multi) {
		return;
	}
	const selected = (await plugin.settings.getSetting('zotero-library-id')) as string | undefined;
	if (!selected) return;
	const stored = (await plugin.storage.getSynced('syncedLibraryId')) as string | undefined;
	if (stored && stored !== selected) {
		await _deleteTaggedRems(plugin, [
			powerupCodes.ZITEM,
			powerupCodes.COLLECTION,
			powerupCodes.ZOTERO_SYNCED_LIBRARY,
			powerupCodes.CITATION_POOL,
			powerupCodes.ZOTERO_UNFILED_ITEMS,
			powerupCodes.ZOTERO_CONNECTOR_HOME,
		]);
		await plugin.storage.setSynced('libraryRemMap', undefined);
		await plugin.storage.setSynced('unfiledRemMap', undefined);
		await plugin.storage.setSynced('zoteroLibraryRemId', undefined);
	}
	await plugin.storage.setSynced('syncedLibraryId', selected);
}

async function markOutOfSyncLibraries(plugin: RNPlugin, selected?: string) {
	const map = (await plugin.storage.getSynced('libraryRemMap')) as
		| Record<string, string>
		| undefined;
	if (!map) return;
	for (const [key, id] of Object.entries(map)) {
		const rem = await plugin.rem.findOne(id);
		if (!rem) continue;
		const textArr = await rem.text;
		const name = Array.isArray(textArr) ? textArr.join('') : String(textArr);
		if (key === selected) {
			const updated = name.replace(/\s*\(Out of Sync\)$/i, '');
			if (updated !== name) {
				await rem.setText([updated]);
			}
		} else {
			if (!/(Out of Sync)$/i.test(name)) {
				await rem.setText([`${name} (Out of Sync)`]);
			}
		}
	}
}

async function restoreLibraryNames(plugin: RNPlugin) {
	const map = (await plugin.storage.getSynced('libraryRemMap')) as
		| Record<string, string>
		| undefined;
	if (!map) return;
	for (const id of Object.values(map)) {
		const rem = await plugin.rem.findOne(id);
		if (!rem) continue;
		const textArr = await rem.text;
		const name = Array.isArray(textArr) ? textArr.join('') : String(textArr);
		const updated = name.replace(/\s*\(Out of Sync\)$/i, '');
		if (updated !== name) {
			await rem.setText([updated]);
		}
	}
}

async function registerDebugCommands(plugin: RNPlugin) {
	await plugin.app.registerCommand({
		name: 'Zotero Connector Force Syncing of Zotero Library',
		description: 'Forces synchronization with Zotero.',
		id: 'force-zotero-sync',
		quickCode: 'sync',
		icon: '🔁',
		keywords: 'zotero, sync',
		action: async () => {
			const zoteroSyncManager = new ZoteroSyncManager(plugin);
			await zoteroSyncManager.sync();
		},
	});
	await plugin.app.registerCommand({
		name: 'Abort Zotero Connector Sync',
		description: 'Abort the current Zotero sync job.',
		id: 'abort-sync-job',
		icon: '🛑',
		keywords: 'zotero, stop, sync',
		action: async () => {
			await markAbortRequested(plugin);
		},
	});
	await plugin.app.registerCommand({
		id: 'log-values',
		name: 'zotero log values',
		description:
			'Logs remote (Zotero Cloud) and Local (This RemNote KB) Collections, Items, and other values.',
		action: async () => {
			await logMessage(
				plugin,
				'Zotero API Key: ' +
					((await plugin.settings.getSetting('zotero-api-key')) ||
						'key not detected oops not good :('),
				LogType.Info
			);
		},
	});
	await plugin.app.registerCommand({
		id: 'test-make-rem-tag-with-zitem-powerup',
		name: 'Test Make Rem and Tag with Zitem Powerup',
		description: 'Test Make Rem and Tag with Zitem Powerup',
		quickCode: 'tmrtwzp',
		action: async () => {
			const currentRem = await plugin.focus.getFocusedRem();
			const rem = await createRem(plugin);
			if (currentRem) {
				rem?.setParent(currentRem);
			}
			await rem?.addPowerup(powerupCodes.ZITEM);
			await rem?.setPowerupProperty(powerupCodes.ZITEM, 'fullData', ["I'm a test!"]);
			await rem?.getPowerupProperty(powerupCodes.ZITEM, 'fullData').then((result) => {
				plugin.app.toast(result);
			});
		},
	});
	await plugin.app.registerCommand({
		id: 'go-to-rem-id',
		name: 'Go to Rem ID',
		description: 'Go to a Rem ID',
		quickCode: 'gtri',
		action: async () => {
			const activeRem = await plugin.focus.getFocusedRem();
			const remId = activeRem?.text?.[0];
			if (remId && typeof remId === 'string') {
				const newRemId = remId.replace(/['"]+/g, '');
				const gfind = await plugin.rem.findOne(newRemId);
				if (gfind) {
					await plugin.window.openRem(gfind);
				}
			} else {
				plugin.app.toast('Invalid Rem ID');
			}
		},
	});
	await plugin.app.registerCommand({
		id: 'reset-synced-zotero-data',
		name: 'Reset Synced Zotero Data',
		description: 'Reset Synced Zotero Data and delete all Zotero Connector generated Rems',
		quickCode: 'rszd',

		action: async () => {
			if (
				window.confirm(
					'This will delete EVERYTHING generated by Zotero Connector. Are you sure you want to proceed?'
				)
			) {
				await plugin.storage.setSynced('zoteroDataMap', undefined);
				await _deleteTaggedRems(plugin, [
					powerupCodes.ZITEM,
					powerupCodes.COLLECTION,
					powerupCodes.ZOTERO_SYNCED_LIBRARY,
					powerupCodes.CITATION_POOL,
					powerupCodes.ZOTERO_UNFILED_ITEMS,
					powerupCodes.ZOTERO_CONNECTOR_HOME,
				]);
				await plugin.storage.setSynced('libraryRemMap', undefined);
				await plugin.storage.setSynced('unfiledRemMap', undefined);
				await plugin.storage.setSynced('zoteroLibraryRemId', undefined);
				await plugin.storage.setSynced('syncedLibraryId', undefined);
				await plugin.storage.setSynced('lastSyncTime', undefined);

				await plugin.storage.setSession('abortRequested', false);
				await plugin.storage.setSession('syncing', false);
				await plugin.storage.setSession('syncProgress', undefined);
				await plugin.storage.setSession('syncStartTime', undefined);
				await plugin.storage.setSession('multiLibraryProgress', undefined);

				release();
			}
		},
	});

	await plugin.app.registerCommand({
		id: 'log-rem-contents',
		name: 'Log Rem Contents',
		description: 'Log Rem Contents',
		quickCode: 'lrc',
		action: async () => {
			const focusedRem = await plugin.focus.getFocusedRem();
			if (focusedRem) {
				await logMessage(plugin, focusedRem.text ?? '', LogType.Debug, false);
			}
		},
	});
	// command to reregister icon CSS
	await plugin.app.registerCommand({
		id: 'register-icon-css',
		name: 'Register Icon CSS',
		description: 'Registers the icon CSS for Zotero Connector.',
		quickCode: 'ric',
		action: async () => {
			await registerIconCSS(plugin);
			plugin.app.toast('Icon CSS registered successfully!');
		},
	});
}

async function registerCommands(plugin: RNPlugin) {
	await plugin.app.registerCommand({
		id: 'zotero-send-sources',
		name: 'Send Sources to Zotero',
		description: "Create Zotero items from the focused Rem's sources.",
		quickCode: 'zs2z',
		action: async () => {
			const rem = await plugin.focus.getFocusedRem();
			if (!rem) return;
			const urls = await extractSourceUrls(plugin, rem);
			if (urls.length === 0) {
				await plugin.app.toast('No sources found');
				return;
			}
			await sendUrlsToZotero(plugin, urls);
			await plugin.app.toast('Sources sent to Zotero');
		},
	});

        const source = (await plugin.settings.getSetting('citation-source')) as string | undefined;
        if (source === 'zotero') {
                await registerZoteroCitationCommands(plugin);
        } else if (source === 'wikipedia') {
                await registerWikipediaCitationCommands(plugin);
        } else {
                await registerZoteroCitationCommands(plugin);
                await registerWikipediaCitationCommands(plugin);
        }

        const openFinder = async (mode: 'citation' | 'bib') => {
                // 1 ▸ remember where the caret is **before** focus shifts
                const caret = await plugin.editor.getCaretPosition();
                if (caret) {
                        await plugin.storage.setSession('citationFinderInitialPos', {
                                x: caret.x,
                                y: caret.y,
                        });
                } else {
                        await plugin.storage.setSession('citationFinderInitialPos', null);
                }

                // 2 ▸ open the widget (use the same coords if we have them)
                citationWidgetId = await plugin.window.openFloatingWidget('citationFinder', {
                        top: caret ? caret.y + POPUP_Y_OFFSET : undefined,
                        left: caret?.x,
                });
                await plugin.storage.setSession('citationFinderMode', mode);
        };

        await plugin.app.registerCommand({
                id: 'insert-citation-at-cursor',
                name: 'Add/Edit Citation',
                description: 'Insert a citation from your Zotero library.',
                quickCode: 'icite',
                action: async () => {
                        await openFinder('citation');
                },
        });

        await plugin.app.registerCommand({
                id: 'insert-bibliography-at-cursor',
                name: 'Add/Edit Bibliography',
                description: 'Insert a bibliography entry from your Zotero library.',
                quickCode: 'ibib',
                action: async () => {
                        await openFinder('bib');
                },
        });

	// await plugin.app.registerCommand({
	// 	id: 'insert-citation-at-cursor',
	// 	name: 'Add/Edit Citation',
	// 	description: "Insert a citation for the focused Rem's first source.",
	// 	quickCode: 'icite',
	// 	action: async () => {
	// 		const rem = await plugin.focus.getFocusedRem();
	// 		if (!rem) return;
	// 		const urls = await extractSourceUrls(plugin, rem);
	// 		if (!urls.length) return;
	// 		const keys = await sendUrlsToZotero(plugin, [urls[0]]);
	// 		if (!keys.length) return;
	// 		const cit = await fetchZoteroCitation(plugin, keys[0]);
	// 		if (cit) {
	// 			await plugin.editor.insertPlainText(cit);
	// 		}
	// 	},
	// });

	// 	await plugin.app.registerCommand({
	// 		id: 'insert-bibliography-at-cursor',
	// 		name: 'Add/Edit Bibliography',
	// 		description: "Insert bibliography entries for the focused Rem's sources.",
	// 		quickCode: 'ibib',
	// 		action: async () => {
	// 			const rem = await plugin.focus.getFocusedRem();
	// 			if (!rem) return;
	// 			const urls = await extractSourceUrls(plugin, rem);
	// 			const keys = await sendUrlsToZotero(plugin, urls);
	// 			const bibs: string[] = [];
	// 			for (const key of keys) {
	// 				const b = await fetchZoteroBibliography(plugin, key);
	// 				if (b) bibs.push(b.trim());
	// 			}
	// 			if (bibs.length) {
	// 				await plugin.editor.insertPlainText(bibs.join('\n'));
	// 			}
	// 		},
	// 	});
}

async function registerWidgets(plugin: RNPlugin) {
    await plugin.app.registerWidget('syncStatusWidget', WidgetLocation.DocumentBelowTitle, {
        dimensions: { height: 200, width: 500 },
        powerupFilter: powerupCodes.ZOTERO_CONNECTOR_HOME,
    });
    await plugin.app.registerWidget('citationFinder', WidgetLocation.FloatingWidget, {
        dimensions: { height: 'auto', width: '320px' },
    });
}

async function onActivate(plugin: RNPlugin) {
	await registerSettings(plugin);
	await registerPowerups(plugin);
	const homePage = await ensureZoteroLibraryRemExists(plugin);
	if (homePage) {
		try {
			await plugin.window.openRem(homePage);
		} catch (err) {
			await logMessage(
				plugin,
				'Failed to open Zotero home page',
				LogType.Error,
				false,
				String(err)
			);
		}
	}
	await registerWidgets(plugin);
	await handleLibrarySwitch(plugin);
	await registerCommands(plugin);

	const multiInit = (await plugin.settings.getSetting('sync-multiple-libraries')) as
		| boolean
		| undefined;
	if (multiInit) {
		await restoreLibraryNames(plugin);
	} else {
		const libraryIdInit = (await plugin.settings.getSetting('zotero-library-id')) as
			| string
			| undefined;
		await markOutOfSyncLibraries(plugin, libraryIdInit);
	}

	const isNewDebugMode = await isDebugMode(plugin);

	let lastApiKey: string | undefined;
	let lastUserId: string | undefined;
	let lastLibrary: string | undefined;
	let lastDisable: boolean | undefined;
	let lastMulti: boolean | undefined;
	let lastCitationSource: string | undefined;
	let debugRegistered = false;
	let syncTimeout: NodeJS.Timeout | undefined;

	function scheduleSync(p: RNPlugin) {
		if (syncTimeout) {
			clearTimeout(syncTimeout);
		}
		syncTimeout = setTimeout(async () => {
			const manager = new ZoteroSyncManager(p);
			await manager.sync();
		}, 500);
	}

	plugin.track(async (reactivePlugin) => {
		await registerIconCSS(plugin);
		const debugMode = await isDebugMode(reactivePlugin);
		if (debugMode && !debugRegistered) {
			plugin.app.toast('Debug Mode Enabled; Registering Debug Tools for Zotero Connector...');
			await registerDebugCommands(plugin);
			debugRegistered = true;
		}
		if (debugMode) {
			if (autoSyncInterval) {
				clearInterval(autoSyncInterval);
				autoSyncInterval = undefined;
			}
			return;
		}

		const apiKey = (await reactivePlugin.settings.getSetting('zotero-api-key')) as
			| string
			| undefined;
		const userId = (await reactivePlugin.settings.getSetting('zotero-user-id')) as
			| string
			| undefined;
		const libraryId = (await reactivePlugin.settings.getSetting('zotero-library-id')) as
			| string
			| undefined;
		const disable = (await reactivePlugin.settings.getSetting('disable-auto-sync')) as
			| boolean
			| undefined;
		const multi = (await reactivePlugin.settings.getSetting('sync-multiple-libraries')) as
			| boolean
			| undefined;
		const multiChanged = multi !== lastMulti;
		if (multiChanged) {
			if (multi) {
				await restoreLibraryNames(reactivePlugin);
			} else {
				await markOutOfSyncLibraries(reactivePlugin, libraryId);
			}
		}

		if (libraryId && libraryId !== lastLibrary) {
			await handleLibrarySwitch(reactivePlugin);
			lastLibrary = libraryId;
		}

		const hasLibrary = multi ? true : Boolean(libraryId);
		if (
			apiKey &&
			userId &&
			hasLibrary &&
			(apiKey !== lastApiKey || userId !== lastUserId || multiChanged)
		) {
			scheduleSync(reactivePlugin);
			lastApiKey = apiKey;
			lastUserId = userId;
			lastMulti = multi;
		}

		if (disable !== lastDisable) {
			lastDisable = disable;
			if (disable) {
				if (autoSyncInterval) {
					clearInterval(autoSyncInterval);
					autoSyncInterval = undefined;
				}
			} else {
				if (!autoSyncInterval) {
					autoSyncInterval = setInterval(async () => {
						await reactivePlugin.app.waitForInitialSync();
						await autoSync(reactivePlugin);
					}, 300000);
				}
			}
		}

		const citationSource = (await reactivePlugin.settings.getSetting('citation-source')) as
			| string
			| undefined;
		if (citationSource !== lastCitationSource) {
			if (citationSource === 'zotero') {
				await registerZoteroCitationCommands(plugin);
			} else if (citationSource === 'wikipedia') {
				await registerWikipediaCitationCommands(plugin);
			} else {
				await registerZoteroCitationCommands(plugin);
				await registerWikipediaCitationCommands(plugin);
			}
			lastCitationSource = citationSource;
			await plugin.app.toast(
				'Citation source changed. Reload the app to unregister old commands.'
			);
		}
	});

	await plugin.app.waitForInitialSync();
	if (!isNewDebugMode) {
		const disable = await plugin.settings.getSetting('disable-auto-sync');
		if (!disable) {
			setTimeout(() => {
				autoSyncInterval = setInterval(async () => {
					await plugin.app.waitForInitialSync();
					await autoSync(plugin);
				}, 300000);
			}, 25);
		}
	}
}

export async function isDebugMode(reactivePlugin: RNPlugin): Promise<boolean> {
	return await reactivePlugin.settings.getSetting('debug-mode');
}

async function onDeactivate(_: RNPlugin) {
	if (autoSyncInterval) {
		clearInterval(autoSyncInterval);
	}
}

declareIndexPlugin(onActivate, onDeactivate);
