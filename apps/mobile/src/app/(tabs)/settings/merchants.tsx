import { router, Stack } from 'expo-router';
import { useState } from 'react';

import { useMerchants } from '@/api/queries';
import { ListSkeleton } from '@/components/skeleton';
import { matches, MerchantSearch } from '@/components/merchant-search';
import { CategoryIcon, Empty, LoadingState, Row, Screen, Section } from '@/components/ui';
import { t } from '@/lib/i18n';

// P1-13: every merchant the app has learned, most used first, to correct a wrong category or
// merge two spellings of one shop (settings/merchant).
export default function Merchants() {
  const merchants = useMerchants();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = (merchants.data ?? []).filter((m) => !q || matches(m, q));

  return (
    <Screen onRefresh={() => merchants.refetch()} refreshing={merchants.isRefetching}>
      <Stack.Screen options={{ title: t.merchants.title }} />
      {!merchants.data ? (
        <LoadingState
          error={merchants.error}
          onRetry={() => merchants.refetch()}
          retrying={merchants.isFetching}
          skeleton={<ListSkeleton rows={6} sections={1} />}
        />
      ) : merchants.data.length === 0 ? (
        <Empty icon="bag" title={t.merchants.emptyTitle} message={t.merchants.emptyMessage} />
      ) : (
        <>
          <MerchantSearch value={query} onChange={setQuery} />
          {shown.length === 0 ? (
            <Empty icon="magnifyingglass" title={t.merchants.noMatches} />
          ) : (
            <Section footer={t.merchants.footer}>
              {shown.map((m, i) => (
                <Row
                  key={m.id}
                  left={<CategoryIcon symbol={m.category?.sf_symbol ?? 'bag'} />}
                  title={m.display_name}
                  subtitle={`${m.category?.name ?? t.merchants.noCategory} · ${t.merchants.uses(m.tx_count)}`}
                  onPress={() => router.push({ pathname: '/settings/merchant', params: { id: m.id } })}
                  last={i === shown.length - 1}
                />
              ))}
            </Section>
          )}
        </>
      )}
    </Screen>
  );
}
