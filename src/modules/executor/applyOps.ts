import { SyncOp } from '../models/interfaces';

export async function applyOps(ops: SyncOp[]) {
  // TODO: extract RemNote mutations here
  for (const op of ops) {
    // no-op
  }
}
