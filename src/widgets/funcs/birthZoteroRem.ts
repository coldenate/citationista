import { BuiltInPowerupCodes, RNPlugin, Rem } from '@remnote/plugin-sdk';
import { LogType, logMessage } from './logging';

export async function birthZoteroRem(plugin: RNPlugin) {
	const zoteroLibraryRemId = await plugin.storage.getSynced('zoteroLibraryRemId');
	if (zoteroLibraryRemId != undefined) {
		const checkforRem = await plugin.rem.findOne(zoteroLibraryRemId as string);
		if (checkforRem == undefined) {
			await logMessage({
				plugin,
				message: 'Zotero Library Rem not found, creating a new one',
				type: LogType.Info,
				consoleEmitType: 'info',
				isToast: false,
			});
		} else {
			return;
		}
	}

	const rem: Rem | undefined | void = await plugin.rem.createRem().catch((err) => {
		console.error(err);
		return;
	});
	const poolPowerup = await plugin.powerup.getPowerupByCode('coolPool');
	// save the remId to the plugin storage (synced)
	await plugin.storage.setSynced('zoteroLibraryRemId', rem?._id);

	await rem?.setText(['Zotero Library']);
	await rem?.addPowerup('zotero-synced-library');
	await rem?.addPowerup(BuiltInPowerupCodes.AutoSort);
	await rem?.setIsDocument(true); // we want this to be a folder rem!

	// const helpInfoRem = await plugin.rem.createRem();
	// await helpInfoRem?.setParent(poolPowerup!); // FIXME: not type safe
	// // await helpInfoRem?.setText([
	// // 	'Help Info: ',
	// // 	'This is your Zotero Library. It syncs on app startup, and you can force sync it with the command: `force zotero sync.` ',
	// // 	'You can import papers from Zotero with the command: `zotero`. ',
	// // 	'You can export citations from your RemNote Library with the command: `export citations`. ',
	// // 	'You can set your Zotero API key and User ID in the settings. ',
	// // 	'These are all your collections. ',
	// // ]);
	// await helpInfoRem?.setIsQuote(true);
	// await helpInfoRem?.setHighlightColor('Blue');
	// await helpInfoRem?.setParent(rem!);
	return rem;
}
