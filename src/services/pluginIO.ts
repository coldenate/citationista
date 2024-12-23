import { RNPlugin } from '@remnote/plugin-sdk';

export async function setForceStop(plugin: RNPlugin) {
	await plugin.storage.setSession('isBeingStopped', true);
}

export async function checkForForceStop(plugin: RNPlugin) {
	const isBeingStopped = await plugin.storage.getSession('isBeingStopped');
	switch (isBeingStopped) {
		case undefined:
		case false:
			return false;
		case true:
			console.warn('Force stop detected. Stopping sync.');
			await plugin.app.toast('Force stop detected. Stopping sync.');
			await plugin.storage.setSession('isBeingStopped', false);
			return true;
	}
}
