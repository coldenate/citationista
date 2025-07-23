export class SyncError extends Error {}
export class FetchError extends SyncError {}
export class DiffError extends SyncError {}
export class ApplyError extends SyncError {}
