// Rename summary: setForceStop -> markForceStopRequested; COOL_POOL -> CITATION_POOL
import {
	declareIndexPlugin,
	PropertyLocation,
	PropertyType,
	type RNPlugin,
} from '@remnote/plugin-sdk';
import { citationFormats, powerupCodes } from './constants/constants';
import { itemTypes } from './constants/zoteroItemSchema';
import { autoSync } from './services/autoSync';
import { registerIconCSS } from './services/iconCSS';
import { markForceStopRequested } from './services/pluginIO';
import { registerItemPowerups } from './services/zoteroSchemaToRemNote';
import { ZoteroSyncManager } from './sync/zoteroSyncManager';
import { LogType, logMessage } from './utils/logging';
import { fetchLibraries } from './api/zotero';

let autoSyncInterval: NodeJS.Timeout | undefined;

// Helper functions for organizing registration logic

async function registerSettings(plugin: RNPlugin) {
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

        const libraries = await fetchLibraries(plugin);
        await plugin.settings.registerDropdownSetting({
                id: 'zotero-library-id',
                title: 'Zotero Library',
                description: 'Select which Zotero library to sync with.',
                options:
                        libraries.length > 0
                                ? libraries.map((lib) => ({
                                          key: `${lib.type}:${lib.id}`,
                                          label: lib.type === 'group' ? `Group: ${lib.name}` : 'My Library',
                                          value: `${lib.type}:${lib.id}`,
                                  }))
                                : [{ key: 'none', label: 'None', value: 'none' }],
                defaultValue:
                        libraries.length > 0 ? `${libraries[0].type}:${libraries[0].id}` : 'none',
        });
	await plugin.settings.registerBooleanSetting({
		id: 'simple-mode',
		title: 'Simple Syncing Mode',
		description:
			'(not recommended) Enables Simple importing of Zotero Items. Toggling this ON will AVOID importing any metadata for a Zotero item. For ex, notes, date accessed, etc.',
		defaultValue: false,
	});
        await plugin.settings.registerDropdownSetting({
                id: 'export-citations-format',
                title: 'Export Citations Format',
                description: 'The format used when exporting citations.',
                defaultValue: 'BibTeX',
                options: citationFormats,
        });
        await plugin.settings.registerBooleanSetting({
                id: 'sync-multiple-libraries',
                title: 'Sync All Libraries',
                description: 'Sync user library and all group libraries.',
                defaultValue: false,
        });
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
		id: 'debug-mode',
		title: 'Debug Mode (Citationista)',
		description: 'Enables certain testing commands. Non-destructive.',
		defaultValue: false,
	});
        await plugin.settings.registerBooleanSetting({
                id: 'disable-auto-sync',
                title: 'Disable Auto Sync',
                description: 'Prevent Citationista from syncing every 5 minutes.',
                defaultValue: true,
        });
}

async function registerPowerups(plugin: RNPlugin) {
	// await plugin.app.registerCommand({
	// 	name: 'Citationista export citations',
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
		name: 'Citationista Pool',
		code: powerupCodes.CITATION_POOL,
		description: 'A pool of citationista rems.',
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
			properties: [
                                {
                                        code: 'syncing',
                                        name: 'Syncing',
                                        onlyProgrammaticModifying: true,
                                        hidden: false,
                                        propertyType: PropertyType.CHECKBOX,
                                        propertyLocation: PropertyLocation.ONLY_DOCUMENT,
                                },
                                {
                                        code: 'progress',
                                        name: 'Progress',
                                        onlyProgrammaticModifying: true,
                                        hidden: false,
                                        propertyType: PropertyType.TEXT,
                                        propertyLocation: PropertyLocation.ONLY_DOCUMENT,
                                },
			],
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
			console.error(error, powerup);
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
       const selected = (await plugin.settings.getSetting('zotero-library-id')) as string | undefined;
       if (!selected) return;
       const stored = (await plugin.storage.getSynced('syncedLibraryId')) as string | undefined;
       if (stored && stored !== selected) {
               const currentData = await plugin.storage.getSynced('zoteroData');
               if (currentData) {
                       await plugin.storage.setSynced(`zoteroData_${stored}`, currentData);
               }
               await _deleteTaggedRems(plugin, [
                       powerupCodes.ZITEM,
                       powerupCodes.COLLECTION,
                       powerupCodes.ZOTERO_SYNCED_LIBRARY,
                       powerupCodes.CITATION_POOL,
                       powerupCodes.ZOTERO_UNFILED_ITEMS,
               ]);
               const newData = await plugin.storage.getSynced(`zoteroData_${selected}`);
               if (newData) {
                       await plugin.storage.setSynced('zoteroData', newData);
               } else {
                       await plugin.storage.setSynced('zoteroData', undefined);
               }
       }
       if (!stored) {
               const existing = await plugin.storage.getSynced(`zoteroData_${selected}`);
               if (existing) {
                       await plugin.storage.setSynced('zoteroData', existing);
               }
       }
       await plugin.storage.setSynced('syncedLibraryId', selected);
}

function watchSyncSettings(plugin: RNPlugin) {
       let previousKey: string | undefined;
       plugin.track(async (reactive) => {
               const userId = await reactive.settings.getSetting('zotero-user-id');
               const apiKey = await reactive.settings.getSetting('zotero-api-key');
               const libraryId = await reactive.settings.getSetting('zotero-library-id');
               const currentKey = `${userId ?? ''}:${apiKey ?? ''}:${libraryId ?? ''}`;
               if (currentKey === previousKey) {
                       return;
               }
               previousKey = currentKey;

               if (userId && apiKey && libraryId) {
                       await handleLibrarySwitch(plugin);
                       const manager = new ZoteroSyncManager(plugin);
                       await manager.sync();
               }
       });
}

async function registerDebugCommands(plugin: RNPlugin) {
	await plugin.app.registerCommand({
		name: 'Citationista Force Syncing of Zotero Library',
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
		name: 'Citationista Force Quit Syncing',
		description: 'Force stop syncing with Zotero.',
		id: 'force-stop-syncing',
		icon: '🛑',
		keywords: 'zotero, stop, sync',
		action: async () => {
			await markForceStopRequested(plugin);
		},
	});
	await plugin.app.registerCommand({
		id: 'log-values',
		name: 'citationista log values',
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
			const rem = await plugin.rem.createRem();
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
		description: 'Reset Synced Zotero Data and delete all Citationista generated Rems',
		quickCode: 'rszd',
                action: async () => {
                        if (
                                window.confirm(
                                        'This will delete EVERYTHING generated by Citationista. Are you sure you want to proceed?'
                                )
                        ) {
                                await plugin.storage.setSynced('zoteroData', undefined);
                                await _deleteTaggedRems(plugin, [
                                        powerupCodes.ZITEM,
                                        powerupCodes.COLLECTION,
                                        powerupCodes.ZOTERO_SYNCED_LIBRARY,
                                        powerupCodes.CITATION_POOL,
                                        powerupCodes.ZOTERO_UNFILED_ITEMS,
                                ]);
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
				console.log(focusedRem.text);
			}
		},
	});
	// command to reregister icon CSS
	await plugin.app.registerCommand({
		id: 'register-icon-css',
		name: 'Register Icon CSS',
		description: 'Registers the icon CSS for Citationista.',
		quickCode: 'ric',
		action: async () => {
			await registerIconCSS(plugin);
			plugin.app.toast('Icon CSS registered successfully!');
		},
	});
}

async function onActivate(plugin: RNPlugin) {
        await registerSettings(plugin);
        await registerPowerups(plugin);
       await handleLibrarySwitch(plugin);
       watchSyncSettings(plugin);

        const isNewDebugMode = await isDebugMode(plugin);

	plugin.track(async (reactivePlugin) => {
		await registerIconCSS(plugin);
		await isDebugMode(reactivePlugin).then(async (debugMode) => {
			if (debugMode) {
				plugin.app.toast('Debug Mode Enabled; Registering Debug Tools for Citationista...');
				await registerDebugCommands(plugin);
			}
		});
	});

	await plugin.app.waitForInitialSync();
	if (!isNewDebugMode) {
		// await syncLibrary(plugin);
		setTimeout(() => {
			autoSyncInterval = setInterval(async () => {
				await plugin.app.waitForInitialSync();
				await autoSync(plugin);
			}, 300000);
		}, 25);
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
