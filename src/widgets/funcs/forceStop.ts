import { RNPlugin } from '@remnote/plugin-sdk';

export async function checkForForceStop(plugin: RNPlugin) {
	const isBeingStopped = await plugin.storage.getSession('isBeingStopped');
	switch (isBeingStopped) {
		case undefined:
		case false:
			// we are not being stopped.
			return false;
		case true:
			// we are being stopped.
			console.log('Force stop detected. Stopping sync.');
			await plugin.app.toast('Force stop detected. Stopping sync.');
			// unset the isBeingStopped flag
			await plugin.storage.setSession('isBeingStopped', false);
			return true;
	}
}

export async function setForceStop(plugin: RNPlugin) {
	await plugin.storage.setSession('isBeingStopped', true);
}
