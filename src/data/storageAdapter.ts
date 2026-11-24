/** The synchronous bootstrap contract; preserves the existing v1 keys and JSON bytes. */
export interface StorageAdapter {
  read(key: string): string | null
  write(key: string, value: string): void
  storageArea(): Storage | undefined
}

export function createStorageAdapter(resolveStorage: () => Pick<Storage, 'getItem' | 'setItem'>): StorageAdapter {
  return {
    read: (key) => resolveStorage().getItem(key),
    write: (key, value) => resolveStorage().setItem(key, value),
    storageArea: () => {
      try { return resolveStorage() as Storage } catch { return undefined }
    },
  }
}

// Resolve lazily: browsers may deny access, and tests can inject isolated storage.
export const localStorageAdapter = createStorageAdapter(() => localStorage)
