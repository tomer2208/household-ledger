import { StyleSheet, Text, View } from 'react-native';

import { Icon } from './ui';
import { useIsOnline } from '@/lib/query';
import { useColors } from '@/lib/theme';

// Offline is read-only by design (Batch 3), so say so instead of letting saves fail.
export function OfflineBanner() {
  const c = useColors();
  const online = useIsOnline();
  if (online) return null;
  return (
    <View style={[s.banner, { backgroundColor: c.fill }]}>
      <Icon name="wifi.slash" size={16} color={c.secondaryLabel} />
      <Text style={[s.text, { color: c.secondaryLabel }]}>Offline. Showing saved data; changes are paused.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, padding: 10, borderRadius: 10 },
  text: { fontSize: 13, flex: 1 },
});
