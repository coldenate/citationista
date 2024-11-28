import { Rem } from '@remnote/plugin-sdk';

export async function gatherFlattenedDescendantRems({
	remCursorAt,
}: {
	remCursorAt: Rem;
}): Promise<Rem[]> {
	const startingSet: Rem[] = await remCursorAt.getChildrenRem();
	const children: Rem[] = [];

	if (!startingSet) return children;

	children.push(remCursorAt);
	for (const child of startingSet) {
		children.push(child);
		const childrenOfChild = await child.getChildrenRem();
		children.push(...childrenOfChild);
	}

	return children;
}
