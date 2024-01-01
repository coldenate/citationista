import { RNPlugin, ReactRNPlugin } from '@remnote/plugin-sdk';
// Define the log types enum
export enum LogType {
	Debug = 'Debug',
	Info = 'Info',
	Warning = 'Warning',
	Error = 'Error',
	Success = 'Success',
	Fatal = 'Fatal',
	Critical = 'Critical',
}

// Define a type for the log type with emoji
type LogTypeInfo = {
	[key in LogType]: { name: key; emoji: string };
};

// Define the log type to emoji mapping
const logTypeToEmoji: LogTypeInfo = {
	Debug: { name: LogType.Debug, emoji: '🐞' },
	Info: { name: LogType.Info, emoji: 'ℹ️' },
	Warning: { name: LogType.Warning, emoji: '⚠️' },
	Error: { name: LogType.Error, emoji: '❌' },
	Success: { name: LogType.Success, emoji: '✅' },
	Fatal: { name: LogType.Fatal, emoji: '💀' },
	Critical: { name: LogType.Critical, emoji: '🚨' },
};

export async function logMessage({
	plugin,
	message,
	type,
	consoleEmitType = 'log',
	isToast,
	omitIfNOTDebugMode = true,
}: {
	plugin: ReactRNPlugin | RNPlugin;
	message: any[] | string;
	type: LogType;
	consoleEmitType?: 'warn' | 'info' | 'error' | 'log';
	isToast: boolean;
	omitIfNOTDebugMode?: boolean;
}) {
	const debugMode = await plugin.storage.getSession('debugMode');
	if (omitIfNOTDebugMode === true) {
		if (debugMode === false) {
			return;
		}
	}

	const baseplateIdentifier = `Log Emitted from ${plugin.id}`;
	switch (consoleEmitType) {
		case 'warn':
			console.warn(baseplateIdentifier, message);
			break;
		case 'info':
			console.info(baseplateIdentifier, message);
			break;
		case 'error':
			console.error(baseplateIdentifier, message);
			break;
		default:
			console.log(baseplateIdentifier, message);
			break;
	}
	if (isToast === true) {
		await plugin.app.toast(String(message));
	}
}
