let syncing = false;

export function tryAcquire(): boolean {
  if (syncing) {
    return false;
  }
  syncing = true;
  return true;
}

export function release(): void {
  syncing = false;
}

export function isSyncing(): boolean {
  return syncing;
}
