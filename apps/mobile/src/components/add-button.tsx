import * as Haptics from 'expo-haptics';
import { router, type Href } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './ui';
import { radius, useColors } from '@/lib/theme';

// The app's main action sits in the thumb zone (docs/DESIGN_PLAN.md §5), floating above the
// tab bar on Overview and Expenses instead of a small + in the header's far corner.
// Screens that show it pad their scroll content by ADD_BUTTON_SPACE so nothing hides under it.
export const ADD_BUTTON_SPACE = 88;
const HEIGHT = 56;

export function AddButton({ href = '/add' }: { href?: Href }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  // The web tab bar sits below the screen; the native iOS tab bar floats over it.
  const bottom = 16 + (Platform.OS === 'ios' ? insets.bottom + 49 : 0);
  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add expense"
        onPress={() => {
          if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(href);
        }}
        style={({ pressed }) => [
          s.button,
          { backgroundColor: c.tint, shadowColor: '#0F1B24' },
          pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
        ]}>
        <Icon name="plus" size={20} color={c.onTint} />
        <Text style={[s.label, { color: c.onTint }]}>Add expense</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  button: {
    height: HEIGHT,
    borderRadius: radius.pill,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  label: { fontSize: 17, fontWeight: '600' },
});
