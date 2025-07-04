// Rename summary: ensureZoteroRemExists -> ensureZoteroLibraryRemExists; ensureUnfiledItemsRem -> ensureUnfiledItemsRemExists; COOL_POOL -> CITATION_POOL
import { BuiltInPowerupCodes, type Rem, type RNPlugin } from '@remnote/plugin-sdk';
import { powerupCodes } from '../constants/constants';
import { LogType, logMessage } from '../utils/logging';

export async function ensureZoteroLibraryRemExists(plugin: RNPlugin) {
	// Measure the time taken
	const startTime = Date.now();
	await plugin.app.waitForInitialSync();
	const endTime = Date.now(); // TODO: figure this out
	await logMessage(
		plugin,
		`waitForInitialSync took ${endTime - startTime} ms`,
		LogType.Info,
		false
	);
	const zoteroLibraryRemId = await plugin.storage.getSynced('zoteroLibraryRemId');
	if (zoteroLibraryRemId !== undefined) {
		const doesRemExist = await plugin.rem.findOne(zoteroLibraryRemId as string);
		if (doesRemExist !== undefined) {
			await doesRemExist.setText(['Zotero Connector Home Page']);
			logMessage(plugin, 'Zotero Connector Home Page already exists', LogType.Info, false);
			return doesRemExist;
		}
	}
	await logMessage(plugin, 'Zotero Connector Home Page Ensured', LogType.Info, false);

	const rem: Rem | undefined = await plugin.rem.createRem();
	if (rem === undefined) {
		await logMessage(plugin, 'Failed to create Rem', LogType.Error, false);
		return;
	}

	await plugin.storage.setSynced('zoteroLibraryRemId', rem._id);

	await rem.setText(['Zotero Connector Home Page']);
	await rem.addPowerup(powerupCodes.ZOTERO_SYNCED_LIBRARY);
	await rem.setPowerupProperty(powerupCodes.ZOTERO_SYNCED_LIBRARY, 'progress', ['0']);
	await rem.addPowerup(BuiltInPowerupCodes.AutoSort);
	await rem.setIsDocument(true); // TODO: we want this to be a folder rem! https://linear.app/remnoteio/issue/ENG-25553/add-a-remsetisfolder-to-the-plugin-system

	// const helpInfoRem = await plugin.rem.createRem();
	// await helpInfoRem.setParent(poolPowerup!);
	// // await helpInfoRem.setText([
	// // 	'Help Info: ',
	// // 	'This is your Zotero Library. It syncs on app startup, and you can force sync it with the command: `force zotero sync.` ',
	// // 	'You can import papers from Zotero with the command: `zotero`. ',
	// // 	'You can export citations from your RemNote Library with the command: `export citations`. ',
	// // 	'You can set your Zotero API key and User ID in the settings. ',
	// // 	'These are all your collections. ',
	// // ]);
	// await helpInfoRem.setIsQuote(true);
	// await helpInfoRem.setHighlightColor('Blue');
	// await helpInfoRem.setParent(rem!);
	return rem;
}

export async function ensureSpecificLibraryRemExists(
	plugin: RNPlugin,
	library: { id: string; type: 'user' | 'group'; name: string }
): Promise<Rem | null> {
	const key = `${library.type}:${library.id}`;
	const map = (await plugin.storage.getSynced('libraryRemMap')) as
		| Record<string, string>
		| undefined;
	const existingId = map?.[key];
	if (existingId) {
		const existing = await plugin.rem.findOne(existingId);
		if (existing) return existing;
	}

	const root = await ensureZoteroLibraryRemExists(plugin);
	const rem = await plugin.rem.createRem();
	if (!rem) {
		await logMessage(plugin, 'Failed to create Library Rem', LogType.Error, false);
		return null;
	}
	await rem.setText([library.name || key]);
	await rem.addPowerup(powerupCodes.ZOTERO_SYNCED_LIBRARY);
	await rem.setPowerupProperty(powerupCodes.ZOTERO_SYNCED_LIBRARY, 'progress', ['0']);
	if (root) {
		await rem.setParent(root);
	}
	await plugin.storage.setSynced('libraryRemMap', { ...(map || {}), [key]: rem._id });
	return rem;
}

export async function ensureUnfiledItemsRemExists(
	plugin: RNPlugin,
	libraryKey: string
): Promise<void> {
	const map = (await plugin.storage.getSynced('unfiledRemMap')) as
		| Record<string, string>
		| undefined;
	const existingId = map?.[libraryKey];
	if (existingId) {
		const existingRem = await plugin.rem.findOne(existingId as string);
		if (existingRem) {
			logMessage(plugin, '"Unfiled Items" Rem already exists', LogType.Info, false);
			return;
		}
	}

	// Create the "Unfiled Items" Rem
	const unfiledRem = await plugin.rem.createRem();
	if (!unfiledRem) {
		await logMessage(plugin, 'Failed to create "Unfiled Items" Rem', LogType.Error, false);
		return;
	}

	await unfiledRem.setText(['Unfiled Items']);
	await unfiledRem.addPowerup(powerupCodes.ZOTERO_UNFILED_ITEMS);
	const zoteroRem = await getZoteroLibraryRem(plugin, libraryKey);
	if (zoteroRem) {
		await unfiledRem.setParent(zoteroRem);
	} else {
		await logMessage(
			plugin,
			'Failed to set parent for "Unfiled Items" Rem',
			LogType.Error,
			false
		);
		return;
	}

	await plugin.storage.setSynced('unfiledRemMap', {
		...(map || {}),
		[libraryKey]: unfiledRem._id,
	});
	logMessage(plugin, 'Created "Unfiled Items" Rem', LogType.Info, false);
}

export async function getZoteroLibraryRem(
	plugin: RNPlugin,
	libraryKey?: string
): Promise<Rem | null> {
	if (libraryKey) {
		const map = (await plugin.storage.getSynced('libraryRemMap')) as
			| Record<string, string>
			| undefined;
		const remId = map?.[libraryKey];
		if (remId) {
			const rem = await plugin.rem.findOne(remId);
			if (rem) return rem;
		}
		return null;
	}
	const zoteroLibraryPowerUpRem = await plugin.powerup.getPowerupByCode(
		powerupCodes.ZOTERO_SYNCED_LIBRARY
	);
	if (!zoteroLibraryPowerUpRem) {
		console.error('Zotero Library Power-Up not found!');
		return null;
	}
	const zoteroLibraryRem = (await zoteroLibraryPowerUpRem.taggedRem())[0];
	return zoteroLibraryRem || null;
}

export async function getUnfiledItemsRem(
	plugin: RNPlugin,
	libraryKey?: string
): Promise<Rem | null> {
	if (libraryKey) {
		const map = (await plugin.storage.getSynced('unfiledRemMap')) as
			| Record<string, string>
			| undefined;
		const remId = map?.[libraryKey];
		if (remId) {
			const rem = await plugin.rem.findOne(remId);
			if (rem) return rem;
		}
		return null;
	}
	const unfiledZoteroItemsPowerup = await plugin.powerup.getPowerupByCode(
		powerupCodes.ZOTERO_UNFILED_ITEMS
	);
	if (!unfiledZoteroItemsPowerup) {
		console.error('Unfiled Power-Up not found!');
		return null;
	}
	const firstUnfiledZoteroItem = (await unfiledZoteroItemsPowerup.taggedRem())[0];
	return firstUnfiledZoteroItem || null;
}
