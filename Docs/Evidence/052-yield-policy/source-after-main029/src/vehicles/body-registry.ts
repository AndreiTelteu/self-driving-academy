import type { BodyIdentity, BodyState } from './body-port';

export const BODY_LIMITS = Object.freeze({
  entities: 110,
  subscriptionsPerBody: 8,
  subscriptions: 880,
});
interface Entry {
  readonly identity: BodyIdentity;
  readonly listeners: Set<(state: BodyState, tick: number) => void>;
  lastTick: number;
  publication: object | undefined;
}

/** Active entries only. Object identity fences reused handles/IDs, including another world. */
export class PhysicsBodyRegistry {
  private readonly entities = new Map<string, Entry>();
  private readonly handles = new Map<number, Entry>();
  private generation = 0;
  private subscriptions = 0;
  private disposed = false;

  admit(entityId: string): void {
    if (this.disposed) throw new Error('Body registry disposed');
    if (typeof entityId !== 'string' || !entityId.trim() || this.entities.has(entityId))
      throw new RangeError('Body identity');
    if (this.entities.size >= BODY_LIMITS.entities || this.generation >= Number.MAX_SAFE_INTEGER)
      throw new RangeError('Body capacity');
  }
  register(entityId: string, handle: number): BodyIdentity {
    this.admit(entityId);
    if (!Number.isFinite(handle) || this.handles.has(handle)) throw new RangeError('Body handle');
    const identity = Object.freeze({ entityId, handle, generation: ++this.generation });
    const entry: Entry = { identity, listeners: new Set(), lastTick: -1, publication: undefined };
    this.entities.set(entityId, entry);
    this.handles.set(handle, entry);
    return identity;
  }
  identity(entityId: string): BodyIdentity | undefined {
    return this.entities.get(entityId)?.identity;
  }
  forHandle(handle: number): BodyIdentity | undefined {
    return this.handles.get(handle)?.identity;
  }
  isCurrent(identity: BodyIdentity): boolean {
    return !this.disposed && this.entities.get(identity.entityId)?.identity === identity;
  }
  assertCurrent(identity: BodyIdentity): void {
    if (!this.isCurrent(identity)) throw new Error('Stale body identity');
  }
  remove(identity: BodyIdentity): boolean {
    if (!this.isCurrent(identity)) return false;
    const entry = this.entities.get(identity.entityId)!;
    this.subscriptions -= entry.listeners.size;
    entry.listeners.clear();
    this.entities.delete(identity.entityId);
    this.handles.delete(identity.handle);
    return true;
  }
  subscribe(
    identity: BodyIdentity,
    listener: (state: BodyState, tick: number) => void,
  ): () => void {
    this.assertCurrent(identity);
    const entry = this.entities.get(identity.entityId)!;
    if (typeof listener !== 'function') throw new TypeError('Invalid body listener');
    if (
      entry.listeners.size >= BODY_LIMITS.subscriptionsPerBody ||
      this.subscriptions >= BODY_LIMITS.subscriptions
    )
      throw new RangeError('Body subscription capacity');
    // Each subscription has independent ownership even when the caller reuses a function.
    const subscription = (state: BodyState, tick: number) => listener(state, tick);
    entry.listeners.add(subscription);
    this.subscriptions++;
    return () => {
      if (entry.listeners.delete(subscription)) this.subscriptions--;
    };
  }
  publish(state: BodyState, tick: number): boolean {
    if (!this.isCurrent(state.identity)) return false;
    if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError('Invalid body tick');
    const entry = this.entities.get(state.identity.entityId)!;
    if (tick < entry.lastTick) return false;
    entry.lastTick = tick;
    const publication = {};
    entry.publication = publication;
    // A callback may unsubscribe, remove/recreate this entity or dispose the world.
    for (const listener of [...entry.listeners]) {
      if (!this.isCurrent(state.identity) || entry.publication !== publication) break;
      if (entry.listeners.has(listener)) listener(state, tick);
    }
    return true;
  }
  counts(): { entities: number; subscriptions: number } {
    return { entities: this.entities.size, subscriptions: this.subscriptions };
  }
  dispose(): void {
    if (this.disposed) return;
    for (const entry of this.entities.values()) entry.listeners.clear();
    this.entities.clear();
    this.handles.clear();
    this.subscriptions = 0;
    this.disposed = true;
  }
}
