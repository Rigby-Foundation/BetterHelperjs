import { isBrowser } from './runtime.js';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear?(): void;
  key?(index: number): string | null;
  readonly length?: number;
}

export class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  public setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  public removeItem(key: string): void {
    this.map.delete(key);
  }

  public clear(): void {
    this.map.clear();
  }

  public key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  public get length(): number {
    return this.map.size;
  }
}

const sharedMemoryStorage = new MemoryStorage();

export class NamespaceStorage {
  private readonly storage: StorageLike;
  private readonly namespace: string;

  constructor(storage: StorageLike, namespace: string) {
    this.storage = storage;
    this.namespace = namespace;
  }

  public get(key: string): string | null {
    return this.storage.getItem(this.namespace + key);
  }

  public set(key: string, value: string): void {
    this.storage.setItem(this.namespace + key, value);
  }

  public remove(key: string): void {
    this.storage.removeItem(this.namespace + key);
  }

  public clear(): void {
    for (const key of this.keys()) {
      if (key.startsWith(this.namespace)) {
        this.storage.removeItem(key);
      }
    }
  }

  private keys(): string[] {
    if (typeof this.storage.key === 'function' && typeof this.storage.length === 'number') {
      const result: string[] = [];
      for (let i = 0; i < this.storage.length; i += 1) {
        const key = this.storage.key(i);
        if (key != null) result.push(key);
      }
      return result;
    }

    return Object.keys(this.storage as unknown as Record<string, unknown>);
  }
}

export function resolveStorage(explicit?: StorageLike): StorageLike {
  if (explicit) return explicit;
  if (isBrowser && typeof localStorage !== 'undefined') return localStorage;
  return sharedMemoryStorage;
}

export function createNamespaceStorage(namespace: string, storage?: StorageLike): NamespaceStorage {
  return new NamespaceStorage(resolveStorage(storage), namespace);
}
