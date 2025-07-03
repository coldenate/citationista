// Rename summary: setForceStop -> markForceStopRequested; checkForForceStop -> checkForceStopFlag
import type { RNPlugin } from '@remnote/plugin-sdk';

export async function markForceStopRequested(plugin: RNPlugin) {
	await plugin.storage.setSession('isBeingStopped', true);
}

export async function checkForceStopFlag(plugin: RNPlugin) {
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

/**
 * Creates an AbortController that checks for force stop requests.
 * The controller will be aborted when a force stop is detected.
 */
export async function createSyncAbortController(plugin: RNPlugin): Promise<AbortController> {
	const controller = new AbortController();
	
	// Check for existing force stop flag
	if (await checkForceStopFlag(plugin)) {
		controller.abort();
	}
	
	return controller;
}

/**
 * Checks the force stop flag and aborts the controller if stop is requested.
 * This provides a cleaner way to handle cancellation throughout the sync process.
 */
export async function checkAbortSignal(plugin: RNPlugin, signal: AbortSignal): Promise<void> {
	if (signal.aborted) {
		return;
	}
	
	if (await checkForceStopFlag(plugin)) {
		// The checkForceStopFlag already shows the toast and resets the flag
		throw new DOMException('Sync was cancelled by force stop', 'AbortError');
	}
}
