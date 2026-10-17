import type { ErrorBoundaryProps } from 'expo-router';
import { View } from 'react-native';

import { ErrorState } from '@/components/ui';
import { useColors } from '@/lib/theme';

// QA-3 / QA-4: the whole screen when the app can't go on, instead of a blank page: a screen that
// failed to draw (the root ErrorBoundary), or the household that couldn't be loaded at start.
export function AppError({ error, onRetry, retrying }: { error: unknown; onRetry: () => void; retrying?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: c.groupedBackground }}>
      <ErrorState error={error} onRetry={onRetry} retrying={retrying} />
    </View>
  );
}

export function RootErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <AppError error={error} onRetry={() => retry()} />;
}
