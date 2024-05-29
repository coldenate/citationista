import { BuiltInPowerupCodes, RNPlugin, Rem } from '@remnote/plugin-sdk';
import { LogType, logMessage } from '../utils/logging';
import { powerupCodes } from '../constants/constants';

export async function birthZoteroRem(plugin: RNPlugin) {
	await plugin.app.waitForInitialSync(); //TODO: Test to see if this slows down the plugin
	const zoteroLibraryRemId = await plugin.storage.getSynced('zoteroLibraryRemId');
	if (zoteroLibraryRemId != undefined) {
		const doesRemExist = await plugin.rem.findOne(zoteroLibraryRemId as string);
		if (doesRemExist !== undefined) {
			return;
		}
	}
	await logMessage(plugin, 'Zotero Library Ensured', LogType.Info, false);

	let rem: Rem | undefined = await plugin.rem.createRem();
	if (rem == undefined) {
		await logMessage(plugin, 'Failed to create Rem', LogType.Error, false);
		return;
	}
	const poolPowerup = await plugin.powerup.getPowerupByCode(powerupCodes.COOL_POOL);
	await plugin.storage.setSynced('zoteroLibraryRemId', rem._id);

	await rem.setText(['Zotero Library']);
	await rem.addPowerup(powerupCodes.ZOTERO_SYNCED_LIBRARY);
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
