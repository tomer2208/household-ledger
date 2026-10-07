import { Pressable, StyleSheet, Text } from 'react-native';

import { Icon, Row } from './ui';
import { lang, type LangChoice } from '@/lib/i18n';
import { langChoice, setLanguageChoice } from '@/lib/lang-store';
import { useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';

// P1-6: each language is named in itself, so someone who can't read the current one still
// finds theirs.
const NAMES: Record<'he' | 'en', string> = { he: 'עברית', en: 'English' };

// Settings → Language: the phone's language, or one of the two, with a check on the choice.
export function LanguageRows({ systemLabel }: { systemLabel: string }) {
  const c = useColors();
  const choice = langChoice();
  const options: { value: LangChoice; title: string }[] = [
    { value: 'system', title: systemLabel },
    { value: 'he', title: NAMES.he },
    { value: 'en', title: NAMES.en },
  ];
  return (
    <>
      {options.map((o, i) => (
        <Row
          key={o.value}
          title={o.title}
          chevron={false}
          onPress={o.value === choice ? undefined : () => setLanguageChoice(o.value)}
          right={o.value === choice ? <Icon name="checkmark" size={17} color={c.tint} /> : null}
          last={i === options.length - 1}
        />
      ))}
    </>
  );
}

// Sign-in and onboarding: one tap to the other language, before there is a Settings tab.
export function LanguageToggle() {
  const c = useColors();
  const other = lang() === 'he' ? 'en' : 'he';
  return (
    <Pressable
      onPress={() => setLanguageChoice(other)}
      accessibilityRole="button"
      accessibilityLanguage={other}
      hitSlop={12}
      style={s.toggle}>
      <Icon name="globe" size={16} color={c.tint} />
      <Text style={[s.toggleText, { color: c.tint }]}>{NAMES[other]}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', minHeight: 44, paddingHorizontal: 12 },
  toggleText: { fontFamily: fontFamily.body, fontSize: 15, fontWeight: '600' },
});
