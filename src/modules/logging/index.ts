type Level = 'debug' | 'info' | 'warn' | 'error';

export function log(level: Level, ...args: unknown[]) {
	const env = process.env.LOG_LEVEL ?? 'info';
	const levels: Level[] = ['debug', 'info', 'warn', 'error'];
	if (levels.indexOf(level) >= levels.indexOf(env as Level)) {
		const method = level === 'debug' ? 'log' : level;
		// eslint-disable-next-line no-console
		(console as any)[method](...args);
	}
}
