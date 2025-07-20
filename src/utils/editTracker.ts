import { AppEvents, type RNPlugin } from '@remnote/plugin-sdk';

let programmaticEdits = new Set<string>();
let pluginEditing = false;

export function startProgrammaticEdits() {
	pluginEditing = true;
}

export function endProgrammaticEdits() {
	pluginEditing = false;
}

export function isProgrammaticallyEdited(remId: string): boolean {
	return programmaticEdits.has(remId);
}

export async function registerEditListener(plugin: RNPlugin) {
	plugin.event.addListener(AppEvents.RemChanged, undefined, async (payload) => {
		if (pluginEditing && payload?.remId) {
			programmaticEdits.add(payload.remId);
		}
	});
}

export async function loadStoredEdits(plugin: RNPlugin) {
	const stored = (await plugin.storage.getLocal('programmaticEdits')) as string[] | undefined;
	if (stored) {
		stored.forEach((id) => programmaticEdits.add(id));
		await plugin.storage.setLocal('programmaticEdits', undefined);
	}
}

export async function persistEdits(plugin: RNPlugin) {
	if (programmaticEdits.size > 0) {
		await plugin.storage.setLocal('programmaticEdits', Array.from(programmaticEdits));
	}
}

export function clearEdits() {
	programmaticEdits.clear();
}
