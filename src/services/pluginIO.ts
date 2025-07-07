import type { RNPlugin } from '@remnote/plugin-sdk';
import { LogType, logMessage } from '../utils/logging';

export async function markAbortRequested(plugin: RNPlugin) {
	await plugin.storage.setSession('abortRequested', true);
}

export async function checkAbortFlag(plugin: RNPlugin) {
        const start = performance.now();
        const abortRequested = await plugin.storage.getSession('abortRequested');
        const duration = performance.now() - start;
        const debugMode = await plugin.settings.getSetting('debug-mode');

        if (debugMode) {
                await logMessage(
                        plugin,
                        `Abort flag check took ${duration.toFixed(2)}ms`,
                        LogType.Debug,
                        false
                );
        }

        switch (abortRequested) {
                case undefined:
                case false:
                        return false;
                case true:
                        await logMessage(plugin, 'Abort detected. Stopping sync.', LogType.Warning);
                        await plugin.storage.setSession('abortRequested', false);
                        return true;
        }
        return false;
}
