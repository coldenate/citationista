import { RNPlugin } from '@remnote/plugin-sdk';

export async function birthZoteroRem(plugin: RNPlugin) {
	const lookForRemAlready = await plugin.rem.findByName(['Zotero Library'], null);
	if (lookForRemAlready !== undefined) {
		return;
	}
	const rem = await plugin.rem.createRem().catch((err) => {
		console.error(err);
		return;
	});
	await rem?.setText(['Zotero Library']);
	await rem?.addPowerup('zotero-synced-library');
	await rem?.setIsDocument(true); // we want this to be a folder rem!

	const helpInfoRem = await plugin.rem.createRem();
	await helpInfoRem?.setText([
		'Help Info: ',
		'This is your Zotero Library. It syncs every 5 minutes, and you can force sync it with the command: `force zotero sync.` ',
		'You can import papers from Zotero with the command: `zotero`. ',
		'You can export citations from your RemNote Library with the command: `export citations`. ',
		'You can set your Zotero API key and User ID in the settings. ',
		'These are all your collections. ',
	]);
	await helpInfoRem?.setIsQuote(true);
	await helpInfoRem?.setHighlightColor('Blue');
	await helpInfoRem?.setParent(rem!);
}