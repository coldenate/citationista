import { createHash } from 'crypto';

export function hashJsonSha256(value: unknown): string {
	const json = JSON.stringify(value);
	return createHash('sha256').update(json).digest('hex');
}
