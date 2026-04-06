import { initDB } from './storage';
import type { InstalledMarketplaceItem, MarketplaceSubmission } from '@/types/marketplace';

const INSTALLED_STORE = 'marketplace_installed';
const SUBMISSIONS_STORE = 'marketplace_submissions';

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest | void,
  extractResult = true,
): Promise<T> {
  const db = await initDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = fn(store);
    if (request && extractResult) {
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
      return;
    }
    tx.oncomplete = () => resolve(undefined as T);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getInstalledMarketplaceItems(): Promise<InstalledMarketplaceItem[]> {
  return (await withStore<InstalledMarketplaceItem[]>(
    INSTALLED_STORE,
    'readonly',
    (store) => store.getAll(),
    true,
  )) || [];
}

export async function putInstalledMarketplaceItem(item: InstalledMarketplaceItem): Promise<void> {
  await withStore<void>(
    INSTALLED_STORE,
    'readwrite',
    (store) => {
      store.put(item, item.manifest.id);
    },
    false,
  );
}

export async function deleteInstalledMarketplaceItem(id: string): Promise<void> {
  await withStore<void>(
    INSTALLED_STORE,
    'readwrite',
    (store) => {
      store.delete(id);
    },
    false,
  );
}

export async function getMarketplaceSubmissions(): Promise<MarketplaceSubmission[]> {
  return (await withStore<MarketplaceSubmission[]>(
    SUBMISSIONS_STORE,
    'readonly',
    (store) => store.getAll(),
    true,
  )) || [];
}

export async function putMarketplaceSubmission(submission: MarketplaceSubmission): Promise<void> {
  await withStore<void>(
    SUBMISSIONS_STORE,
    'readwrite',
    (store) => {
      store.put(submission);
    },
    false,
  );
}
