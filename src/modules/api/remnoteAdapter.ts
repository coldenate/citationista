// RemNote SDK adapter
// TODO: extract existing SDK calls into this module
export async function createRem(
	plugin: unknown,
	title: string,
	parentId?: string
): Promise<string> {
	// Placeholder implementation for tests
	return `rem-${title}`;
}

export async function moveRem(plugin: unknown, id: string, newParentId: string): Promise<void> {
	// Placeholder implementation
}

export async function deleteRem(plugin: unknown, id: string): Promise<void> {
	// Placeholder implementation
}
