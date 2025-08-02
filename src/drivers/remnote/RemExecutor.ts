/*****************************************************************
 * RemExecutor
 * ────────────
 * Executes an ordered list of Rem operations produced by
 * `planRemOperations()`.  It touches **structure only**
 * (create / move / rename / delete).  Property hydration,
 * three-way merging, URL sources, … are handled later by the
 * HydrationPipeline.
 *
 * NB:  • Runs in small concurrent batches (BATCH = 10)
 *      • Keeps a local   key → Rem   lookup while running
 *      • Minimal error handling → logs and continues
 *****************************************************************/
import type { Rem, RNPlugin } from '@remnote/plugin-sdk';
import { powerupCodes } from '../../constants/constants';
import { createRem } from '../../services/pluginIO';
import type { RemOperation } from '../../types/types';
import { generatePowerupCode } from '../../utils/getCodeName';
import { LogType, logMessage } from '../../utils/logging';
import type { TouchedItem } from './HydrationPipeline';
import type { SyncTreeNode } from '../../core/SyncTree';

const BATCH = 10;

/** Internal cache entry so we don’t re-query RemNote constantly */
interface RemHandle {
	key: string;
	rem: Rem;
	parentKey: string | null;
}

export class RemExecutor {
	private plugin: RNPlugin;
	private cache = new Map<string, RemHandle>(); // key → Rem + parentKey

	constructor(plugin: RNPlugin) {
		this.plugin = plugin;
	}

	/** Entry-point
      @param plan     Ordered array of operations from the planner
      @param onProg   Optional progress callback (0-1 float)            */
	async run(
		plan: RemOperation[],
		onProg?: (progress: number) => Promise<void> | void
	): Promise<TouchedItem[]> {
		const total = plan.length;
		let done = 0;
		const touched: TouchedItem[] = [];

		// helper for progress
		const tick = async () => {
			done++;
			if (onProg) await onProg(done / total);
		};

		// execute in small concurrent batches
		for (let i = 0; i < plan.length; i += BATCH) {
			const batch = plan.slice(i, i + BATCH);

			await Promise.all(
				batch.map(async (op) => {
					try {
						switch (op.type) {
							case 'create': {
								const rem = await this.create(op.node, op.parentKey);
								if (rem && 'data' in op.node) {
									touched.push({
										key: op.key,
										remId: rem._id,
										remoteNode: op.node,
									});
								}
								break;
							}
							case 'move':
								await this.move(op.key, op.newParentKey);
								break;
							case 'update':
								await this.rename(op.node); // title only – full hydrate later
								break;
							case 'delete': {
								await this.remove(op.key);
								break;
							}
						}
					} catch (e) {
						await logMessage(
							this.plugin,
							`Executor error: ${String(e)}`,
							LogType.Error,
							false
						);
					} finally {
						await tick();
					}
				})
			);
		}

		return touched;
	}

	/* ──────────────────────────────────────────────────────────── *
	 *  Low-level helpers                                           *
	 * ──────────────────────────────────────────────────────────── */

	/** returns the Rem (fetches once, then cached) */
        private async getRem(key: string): Promise<Rem | null> {
                const cached = this.cache.get(key);
                if (cached) return cached.rem;

                const search = async (code: string): Promise<Rem | null> => {
                        const pu = await this.plugin.powerup.getPowerupByCode(code);
                        if (!pu) return null;
                        const rems = await pu.taggedRem();
                        for (const r of rems) {
                                const remKey = await r.getPowerupProperty(code, 'key');
                                if (remKey === key) return r;
                        }
                        return null;
                };

                const r = (await search(powerupCodes.ZITEM)) || (await search(powerupCodes.COLLECTION));
                if (!r) return null;

                const parentRem = await r.getParentRem();
                this.cache.set(key, {
                        key,
                        rem: r,
                        parentKey: parentRem?._id ?? null,
                });
                return r;
        }

	/* ---------- operations ---------- */

	private async create(node: SyncTreeNode, parentKey: string | null): Promise<Rem | null> {
		const rem = await createRem(this.plugin);
		if (!rem) throw new Error(`Cannot create Rem for ${node.key}`);

		// basic power-ups & key
		if ('name' in node) {
			await rem.addPowerup(powerupCodes.COLLECTION);
			await rem.setPowerupProperty(powerupCodes.COLLECTION, 'key', [node.key]);
			await rem.setText([node.name]);
		} else {
			await rem.addPowerup(powerupCodes.ZITEM);
			await rem.setPowerupProperty(powerupCodes.ZITEM, 'key', [node.key]);
			const pType = generatePowerupCode(node.data.itemType);
			const typePU = await this.plugin.powerup.getPowerupByCode(pType);
			if (typePU) await rem.addPowerup(pType);
			if (node.data.title) await rem.setText([node.data.title]);
		}

		// attach to parent
		if (parentKey) {
			const parentRem = await this.getRem(parentKey);
			if (parentRem) await rem.setParent(parentRem);
		}

		this.cache.set(node.key, { key: node.key, rem, parentKey });
		return rem;
	}

	private async move(nodeKey: string, newParentKey: string | null): Promise<void> {
		const rem = await this.getRem(nodeKey);
		if (!rem) return;

		await this.getRem(newParentKey ?? '');
		const current = this.cache.get(nodeKey);
		if (current?.parentKey === newParentKey) return; // already correct

		if (newParentKey) {
			const parentRem = await this.getRem(newParentKey);
			if (parentRem) await rem.setParent(parentRem);
		}

		this.cache.set(nodeKey, { key: nodeKey, rem, parentKey: newParentKey });
	}

	/** title only – all other fields in HydrationPipeline */
	private async rename(node: SyncTreeNode): Promise<void> {
		const rem = await this.getRem(node.key);
		if (!rem) return;

		if ('name' in node) {
			await rem.setText([node.name]);
		} else if (node.data.title) {
			await rem.setText([node.data.title]);
		}
	}

	private async remove(nodeKey: string): Promise<void> {
		const rem = await this.getRem(nodeKey);
		if (rem) await rem.remove();
		this.cache.delete(nodeKey);
	}
}
