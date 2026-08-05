"use client";

import { useConvexOfflineDetector } from "@/lib/pwa/offline-detector";
import { useEffect, useState, useRef } from "react";
import { useOutbox } from "@/lib/offline/use-outbox";

interface CacheItem<T = any> {
  data: T;
  timestamp: number;
  key: string;
}

class SimpleOfflineManager {
  private static instance: SimpleOfflineManager | null = null;
  private db: IDBDatabase | null = null;
  private dbReady: boolean = false;
  private readonly CACHE_TTL: number = 24 * 60 * 60 * 1000; // 24 hours

  static getInstance(): SimpleOfflineManager {
    if (!SimpleOfflineManager.instance) {
      SimpleOfflineManager.instance = new SimpleOfflineManager();
    }
    return SimpleOfflineManager.instance;
  }

  constructor() {
    if (typeof window !== 'undefined') {
      this.initDB().catch((error) => {
        console.error('[useOffline] Failed to initialize DB:', error);
      });
    }
  }

  private async initDB(): Promise<void> {

    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      console.log('[useOffline] IndexedDB not available (SSR)');
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      console.log('[useOffline] Initializing IndexedDB...');
      const request: IDBOpenDBRequest = indexedDB.open('irank-offline-cache', 1);

      request.onerror = () => {
        console.error('[useOffline] IndexedDB error:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.dbReady = true;
        console.log('[useOffline] IndexedDB initialized successfully');

        if (this.db.objectStoreNames.contains('cache')) {
          console.log('[useOffline] Cache object store found');
        } else {
          console.error('[useOffline] Cache object store NOT found');
        }

        resolve();
      };

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        console.log('[useOffline] Upgrading IndexedDB schema...');
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('cache')) {
          const cacheStore: IDBObjectStore = db.createObjectStore('cache', { keyPath: 'key' });
          console.log('[useOffline] Created cache object store');
        } else {
          console.log('[useOffline] Cache object store already exists');
        }
      };
    });
  }

  async saveToCache<T>(key: string, data: T): Promise<void> {
    if (typeof window === 'undefined' || !this.dbReady || !this.db) {
      console.log('[useOffline] Database not ready, skipping cache');
      return Promise.resolve();
    }

    try {
      const transaction: IDBTransaction = this.db.transaction(['cache'], 'readwrite');
      const store: IDBObjectStore = transaction.objectStore('cache');

      const cacheItem: CacheItem<T> = {
        key,
        data,
        timestamp: Date.now()
      };

      await new Promise<void>((resolve, reject) => {
        const request: IDBRequest = store.put(cacheItem);

        request.onsuccess = () => {
          console.log('[useOffline] Put operation successful for:', key);
        };

        request.onerror = () => {
          console.error('[useOffline] Put operation failed:', request.error);
          reject(request.error);
        };

        transaction.oncomplete = () => {
          console.log('[useOffline] Transaction completed, data cached:', key);
          resolve();
        };

        transaction.onerror = () => {
          console.error('[useOffline] Transaction failed:', transaction.error);
          reject(transaction.error || new Error('Transaction failed'));
        };

        transaction.onabort = () => {
          console.error('[useOffline] Transaction aborted');
          reject(new Error('Transaction aborted'));
        };
      });
    } catch (error) {
      console.error('[useOffline] Cache save error:', error);
    }
  }

  private async verifySave(key: string): Promise<void> {
    if (typeof window === 'undefined' || !this.db) {
      console.error('[useOffline] ❌ Verification: Database not available');
      return Promise.resolve();
    }

    try {
      setTimeout(async () => {
        if (!this.db) return;

        const transaction: IDBTransaction = this.db.transaction(['cache'], 'readonly');
        const store: IDBObjectStore = transaction.objectStore('cache');

        const request: IDBRequest = store.get(key);
        request.onsuccess = () => {
          if (request.result) {
            console.log('[useOffline] ✅ Verification: Data exists in IndexedDB for:', key, request.result);
          } else {
            console.error('[useOffline] ❌ Verification: Data NOT found in IndexedDB for:', key);
          }
        };
        request.onerror = () => {
          console.error('[useOffline] ❌ Verification failed:', request.error);
        };
      }, 100);
    } catch (error) {
      console.error('[useOffline] Verification error:', error);
    }
  }

  async debugListAll(): Promise<void> {
    if (typeof window === 'undefined' || !this.dbReady || !this.db) {
      console.log('[useOffline] Debug: Database not ready');
      return Promise.resolve();
    }

    try {
      const transaction: IDBTransaction = this.db.transaction(['cache'], 'readonly');
      const store: IDBObjectStore = transaction.objectStore('cache');

      const request: IDBRequest = store.getAll();
      request.onsuccess = () => {
        const results: CacheItem[] = request.result;
        console.log('[useOffline] Debug: All cached items:', results);
        console.log('[useOffline] Debug: Total items in cache:', results.length);
      };
      request.onerror = () => {
        console.error('[useOffline] Debug: Failed to get all items:', request.error);
      };
    } catch (error) {
      console.error('[useOffline] Debug error:', error);
    }
  }

  async getFromCache<T>(key: string): Promise<T | null> {
    if (typeof window === 'undefined' || !this.dbReady || !this.db) {
      return Promise.resolve(null);
    }

    try {
      const transaction: IDBTransaction = this.db.transaction(['cache'], 'readonly');
      const store: IDBObjectStore = transaction.objectStore('cache');

      return new Promise<T | null>((resolve) => {
        const request: IDBRequest = store.get(key);
        request.onsuccess = () => {
          const result = request.result as CacheItem<T> | undefined;

          if (!result) {
            resolve(null);
            return;
          }

          if (Date.now() - result.timestamp > this.CACHE_TTL) {
            console.log('[useOffline] Cache expired for:', key);
            resolve(null);
            return;
          }

          console.log('[useOffline] Cache hit for:', key);
          resolve(result.data);
        };
        request.onerror = () => resolve(null);
      });
    } catch (error) {
      console.error('[useOffline] Cache read error:', error);
      return Promise.resolve(null);
    }
  }
}

function isQueryResult<T>(value: T): value is Exclude<T, Function> {
  return typeof value !== 'function';
}

function isMutationFunction<T>(value: T): value is T extends Function ? T : never {
  return typeof value === 'function';
}


interface UseOfflineReturn<T> {
  data: T;
  isFromCache: boolean;
  isOffline: boolean;
}

export function useOffline<T>(hookResult: T, cacheKey?: string): T {
  const { isOffline } = useConvexOfflineDetector();
  const [cachedData, setCachedData] = useState<T | null>(null);
  const [isFromCache, setIsFromCache] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);
  const manager = useRef<SimpleOfflineManager>(SimpleOfflineManager.getInstance());
  const generatedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const finalCacheKey: string | null = cacheKey ?? null;

  useEffect(() => {

    if (!mounted || !finalCacheKey || typeof window === 'undefined') {
      return;
    }

    if (isQueryResult(hookResult)) {
      if (!isOffline && hookResult !== undefined && hookResult !== null) {

        console.log('[useOffline] Online - caching data for:', finalCacheKey);
        manager.current.saveToCache<T>(finalCacheKey, hookResult).then(() => {

          setTimeout(() => {
            manager.current.debugListAll();
          }, 200);
        }).catch((error) => {
          console.error('[useOffline] Failed to save to cache:', error);
        });
        setCachedData(hookResult);
        setIsFromCache(false);
      } else if (isOffline) {

        console.log('[useOffline] Offline - checking cache for:', finalCacheKey);
        manager.current.getFromCache<T>(finalCacheKey).then((cached: T | null) => {
          if (cached !== null) {
            console.log('[useOffline] Using cached data for:', finalCacheKey);
            setCachedData(cached);
            setIsFromCache(true);
          } else {
            console.log('[useOffline] No cached data for:', finalCacheKey);
            setCachedData(null);
            setIsFromCache(false);
          }
        }).catch((error) => {
          console.error('[useOffline] Failed to get from cache:', error);
          setCachedData(null);
          setIsFromCache(false);
        });
      } else {

        setCachedData(hookResult);
        setIsFromCache(false);
      }
    }
  }, [hookResult, isOffline, finalCacheKey, mounted]);

  if (isQueryResult(hookResult)) {
    if (isOffline && isFromCache && cachedData !== null) {
      return cachedData;
    }
    return hookResult;
  }

  if (isMutationFunction(hookResult)) {
    return hookResult;
  }

  return hookResult;
}

export function useOfflineSync() {
  return useOutbox();
}

export function useOfflineState<T>(hookResult: T, cacheKey?: string): UseOfflineReturn<T> {
  const { isOffline } = useConvexOfflineDetector();
  const data = useOffline(hookResult, cacheKey);

  return {
    data,
    isFromCache: isOffline && data !== hookResult,
    isOffline
  };
}

export { SimpleOfflineManager };