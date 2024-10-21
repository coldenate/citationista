import { PropertyLocation, PropertyType, RNPlugin, declareIndexPlugin } from '@remnote/plugin-sdk';
import { citationFormats, powerupCodes } from './constants/constants';
import { setForceStop } from './services/pluginIO';
import { exportCitations } from './services/exportCitations';
import { syncCollections, syncLibrary } from './services/syncing';
import { birthZoteroRem } from './services/createLibraryRem';
import { itemTypes } from './constants/zoteroItemSchema';
import { registerItemPowerups } from './services/zoteroSchemaToRemNote';

async function onActivate(plugin: RNPlugin) {
	// TODO: RETURN THIS TO A NUMBER SETTINGS
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

	await plugin.settings.registerBooleanSetting({
		// TODO: implement this feature
		id: 'simple-mode',
		title: 'Simple Syncing Mode',
		description:
			'Enables Simple importing of Zotero Items. Toggling this ON will AVOID importing any metadata for a Zotero item. For ex, notes, date accessed, etc.',
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
		id: 'debug-mode',
		title: 'Debug Mode (Citationista)',
		description: 'Enables certain testing commands. Non-destructive.',
		defaultValue: false,
	});

	// export citations command (later on, (TODO:) we may want a export citations and add to zotero library command as an ext to this command)
	await plugin.app.registerCommand({
		name: 'Citationista export citations',
		description: 'Exports all citations of this Rem to clipboard...',
		id: 'export-citations',
		quickCode: 'cite',
		icon: '📑',
		keywords: 'citation, export',
		action: async () => await exportCitations(plugin),
	});

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
		code: powerupCodes.COOL_POOL,
		description: 'A pool of citationista rems.',
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

	const isNewDebugMode = await isDebugMode(plugin);

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
			await plugin.app.toast('Error registering powerup: ' + powerup.name);
			return;
		}
		const powerUpRem = await plugin.powerup.getPowerupByCode(powerup.code);
		if (powerUpRem) {
			await powerUpRem.addTag(zItemID);
		}
	}

	plugin.track(async (reactivePlugin) => {
		await isDebugMode(reactivePlugin).then(async (debugMode) => {
			if (debugMode) {
				plugin.app.toast('Debug Mode Enabled; Registering Debug Tools for Citationista...');
				await plugin.app.registerCommand({
					name: 'Citationista Force Library Rem Creation',
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

				await plugin.app.registerCommand({
					name: 'Citationista Force Syncing of Zotero Library',
					description: 'Forces synchronization with Zotero.',
					id: 'force-zotero-sync',
					quickCode: 'sync',
					icon: '🔁',
					keywords: 'zotero, sync',
					action: async () => {
						await syncLibrary(plugin);
						await plugin.app.toast('🔁 Synced with Zotero!');
					},
				});

				await plugin.app.registerCommand({
					name: 'Citationista Force Quit Syncing',
					description: 'Force stop syncing with Zotero.',
					id: 'force-stop-syncing',
					icon: '🛑',
					keywords: 'zotero, stop, sync',
					action: async () => {
						await setForceStop(plugin);
					},
				});
				await plugin.app.registerCommand({
					id: 'log-values',
					name: 'citationista log values',
					description:
						'Logs remote (Zotero Cloud) and Local (This RemNote KB) Collections, Items, and other values.',
					action: async () => {
						// TODO: implement this feature
						// log the key API key
						console.log(
							'Zotero API Key:',
							(await plugin.settings.getSetting('zotero-api-key')) ||
								'key not detected oops not good :('
						);
					},
				});
				await plugin.app.registerCommand({
					id: 'sync-collections',
					name: 'Sync Collections',
					description: 'Sync collections with Zotero',
					action: async () => {
						await syncCollections(reactivePlugin);
					},
				});
				await plugin.app.registerCommand({
					id: 'show-pool',
					name: 'Display Citationista Orphaned Powerup Rem',
					description: `Check for Citationista's Orphaned Rem`,
					action: async () => {
						const poolPowerup = await plugin.powerup.getPowerupByCode(
							powerupCodes.COOL_POOL
						);
						await plugin.window.openRem(poolPowerup!);
					},
				});
				await plugin.app.registerCommand({
					id: 'trash-all-plugin-footprint',
					name: 'Delete all Citationista Generated Rem',
					description: `Trash all of the plugin's footprint`,
					action: async () => {
						if (
							window.confirm(
								'This will delete EVERYTHING generated by Citationista. Are you sure you want to proceed?'
							)
						) {
							const zoteroItemPowerup = await plugin.powerup.getPowerupByCode(
								powerupCodes.ZITEM
							);
							const zoteroCollectionPowerup = await plugin.powerup.getPowerupByCode(
								powerupCodes.COLLECTION
							);
							const zoteroLibraryPowerup = await plugin.powerup.getPowerupByCode(
								powerupCodes.ZOTERO_SYNCED_LIBRARY
							);
							const citationistaPowerup = await plugin.powerup.getPowerupByCode(
								powerupCodes.COOL_POOL
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
						}
					},
				});
				await plugin.app.registerCommand({
					id: 'delete-all-remnote-items',
					name: 'Delete all RemNote Items',
					description: 'Delete all RemNote Items',
					quickCode: 'dari',
					action: async () => {
						const zoteroItemPowerup = await plugin.powerup.getPowerupByCode(
							powerupCodes.ZITEM
						);
						const taggedRems = await zoteroItemPowerup?.taggedRem();
						if (taggedRems) {
							taggedRems.forEach(async (rem) => {
								await rem!.remove();
							});
						}
					},
				});
				await plugin.app.registerCommand({
					id: 'delete-all-remnote-collections',
					name: 'Delete all RemNote Collections',
					description: 'Delete all RemNote Collections',
					quickCode: 'darc',
					action: async () => {
						const zoteroCollectionPowerup = await plugin.powerup.getPowerupByCode(
							powerupCodes.COLLECTION
						);
						const taggedRems = await zoteroCollectionPowerup?.taggedRem();
						if (taggedRems) {
							taggedRems.forEach(async (rem) => {
								await rem!.remove();
							});
						}
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
						rem?.setParent(currentRem!);
						await rem!.addPowerup(powerupCodes.ZITEM);
						await rem?.setPowerupProperty(powerupCodes.ZITEM, 'fullData', [
							"I'm a test!",
						]);
						await rem
							?.getPowerupProperty(powerupCodes.ZITEM, 'fullData')
							.then((result) => {
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
			}
		});
	});

	await plugin.app.waitForInitialSync();
	if (!isNewDebugMode) {
		await syncLibrary(plugin);
	}
}

export async function isDebugMode(reactivePlugin: RNPlugin): Promise<boolean> {
	return await reactivePlugin.settings.getSetting('debug-mode');
}

async function onDeactivate(_: RNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
