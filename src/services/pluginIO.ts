import type { RNPlugin } from '@remnote/plugin-sdk';

export async function markAbortRequested(plugin: RNPlugin) {
       await plugin.storage.setSession('abortRequested', true);
}

export async function checkAbortFlag(plugin: RNPlugin) {
       const abortRequested = await plugin.storage.getSession('abortRequested');
       switch (abortRequested) {
               case undefined:
               case false:
                       return false;
               case true:
                       console.warn('Abort detected. Stopping sync.');
                       await plugin.app.toast('Abort detected. Stopping sync.');
                       await plugin.storage.setSession('abortRequested', false);
                       return true;
       }
       return false;
}
