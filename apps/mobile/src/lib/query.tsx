import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { onlineManager, QueryClient, useIsRestoring } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { ReactNode, useSyncExternalStore } from 'react';

import { retryDelay, shouldRetry } from './errors';

// Offline = read-only (Batch 3): cached queries render, mutations pause instead of failing.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((s) => setOnline(s.isConnected !== false)),
);

export const queryClient = new QueryClient({
  defaultOptions: {
    // P1-12: transient failures are retried with growing waits; refusals are shown at once.
    queries: { staleTime: 30_000, gcTime: 7 * 86_400_000, retry: shouldRetry, retryDelay },
    mutations: { networkMode: 'online' },
  },
});

const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'hl-query-cache' });

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 7 * 86_400_000, buster: 'v1' }}>
      {children}
    </PersistQueryClientProvider>
  );
}

export function useIsOnline() {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
}

export { useIsRestoring };
