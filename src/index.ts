// Rename summary: abort sync handling and CITATION_POOL rename
import {
	declareIndexPlugin,
	PropertyLocation,
	PropertyType,
	type RNPlugin,
	WidgetLocation,
} from '@remnote/plugin-sdk';
import { fetchLibraries } from './api/zotero';
import { citationFormats, powerupCodes } from './constants/constants';
import { itemTypes } from './constants/zoteroItemSchema';
import { autoSync } from './services/autoSync';
import { ensureZoteroLibraryRemExists } from './services/ensureUIPrettyZoteroRemExist';
import { registerIconCSS } from './services/iconCSS';
import { createRem, markAbortRequested } from './services/pluginIO';
import { registerItemPowerups } from './services/zoteroSchemaToRemNote';
import { release } from './sync/syncLock';
import { ZoteroSyncManager } from './sync/zoteroSyncManager';
import { LogType, logMessage } from './utils/logging';

let autoSyncInterval: NodeJS.Timeout | undefined;

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
		title: 'Zotero Library',
		description: 'Select which Zotero library to sync with.',
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
  
}

async function registerWidgets(plugin: RNPlugin) {
	await plugin.app.registerWidget('syncStatusWidget', WidgetLocation.DocumentBelowTitle, {
		dimensions: { height: 200, width: 500 },
		powerupFilter: powerupCodes.ZOTERO_CONNECTOR_HOME,
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
