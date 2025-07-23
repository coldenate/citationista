export enum Powerup {
	ZITEM = 'ZITEM',
	ZCOLL = 'ZCOLL',
}

export const itemTypeToPowerup: Record<string, Powerup> = {
	item: Powerup.ZITEM,
	collection: Powerup.ZCOLL,
};
