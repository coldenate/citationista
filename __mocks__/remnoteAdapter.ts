export const createRem = jest.fn(
	async (_plugin: unknown, title: string, parentId?: string) => `mock-${title}`
);
export const moveRem = jest.fn(async () => {});
export const deleteRem = jest.fn(async () => {});
