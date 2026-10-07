import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LanguageToggle } from '@/components/language-picker';
import { Button, ErrorText, Field, Section } from '@/components/ui';
import { t } from '@/lib/i18n';
import { APP_URL, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import { fontFamily } from '@/lib/tokens';

// Sign in with Apple first (US-M1 AC1); an emailed one-time code as the fallback.
// The code length is a Supabase project setting (6–10 digits), so the field accepts any of them.
// A code rather than a magic link works the same in a dev build, TestFlight and the web preview.
export default function SignIn() {
  const c = useColors();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const signInWithApple = () =>
    run(async () => {
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL, AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
        nonce: hashedNonce,
      });
      if (!cred.identityToken) throw new Error(t.signIn.appleNoToken);
      const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken, nonce: rawNonce });
      if (error) throw error;
    });

  const sendCode = () =>
    run(async () => {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
      if (error) throw error;
      setStep('code');
    });

  const verifyCode = () =>
    run(async () => {
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
      if (error) throw error;
    });

  // Dev builds only: lets the preview and tests sign in without an inbox.
  const devPassword = () =>
    run(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    });

  return (
    <SafeAreaView style={[s.flex, { backgroundColor: c.groupedBackground }]}>
      {/* D1: the form sits in the middle of the screen, not under the top edge with the rest empty. */}
      <KeyboardAvoidingView style={[s.flex, s.center]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.hero}>
          {/* F6: the app's own mark, the same as on the Home Screen */}
          <Image source={require('@/assets/images/splash-icon.png')} style={s.logo} accessibilityIgnoresInvertColors />
          <Text style={[s.title, { color: c.label }]}>FinPace</Text>
          <Text style={[s.subtitle, { color: c.secondaryLabel }]}>{t.signIn.tagline}</Text>
        </View>

        {appleAvailable ? (
          <View style={s.apple}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={12}
              style={{ height: 50 }}
              onPress={signInWithApple}
            />
            <Text style={[s.or, { color: c.secondaryLabel }]}>{t.signIn.orEmail}</Text>
          </View>
        ) : null}

        {step === 'email' ? (
          <>
            <Section footer={t.signIn.emailFooter}>
              <Field
                label={t.signIn.email}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                last={!__DEV__}
              />
              {__DEV__ ? (
                <Field label="Dev password" value={password} onChangeText={setPassword} placeholder="optional" secureTextEntry last />
              ) : null}
            </Section>
            <View style={s.actions}>
              <Button title={t.signIn.sendCode} onPress={sendCode} loading={busy && !password} disabled={!email.includes('@')} />
              {__DEV__ && password ? <Button title="Dev sign in" kind="plain" onPress={devPassword} loading={busy} /> : null}
            </View>
            <Text style={[s.legal, { color: c.secondaryLabel }]}>
              {t.signIn.agreeBefore}
              <Text style={{ color: c.tint }} onPress={() => WebBrowser.openBrowserAsync(`${APP_URL}/terms.html`)}>
                {t.settings.terms}
              </Text>
              {t.signIn.agreeAnd}
              <Text style={{ color: c.tint }} onPress={() => WebBrowser.openBrowserAsync(`${APP_URL}/privacy.html`)}>
                {t.settings.privacy}
              </Text>
              {t.signIn.agreeAfter}
            </Text>
          </>
        ) : (
          <>
            <Section footer={t.signIn.sentTo(email.trim())}>
              <Field
                label={t.signIn.code}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
                placeholder={t.signIn.codePlaceholder}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                autoFocus
                maxLength={10}
                last
              />
            </Section>
            <View style={s.actions}>
              <Button title={t.signIn.signIn} onPress={verifyCode} loading={busy} disabled={code.length < 6} />
              <Button title={t.signIn.differentEmail} kind="plain" onPress={() => setStep('email')} />
            </View>
          </>
        )}
        <ErrorText error={error} />
        {/* P1-6: the language can be switched before there is a Settings tab. */}
        <View style={s.language}>
          <LanguageToggle />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  center: { justifyContent: 'center', paddingBottom: 48 },
  hero: { alignItems: 'center', marginBottom: 16, paddingHorizontal: 32, gap: 8 },
  logo: { width: 76, height: 76, marginBottom: 8 },
  title: { fontFamily: fontFamily.display, fontSize: 32 },
  subtitle: { fontFamily: fontFamily.body, fontSize: 16, textAlign: 'center' },
  apple: { marginHorizontal: 16, marginTop: 16, gap: 12 },
  or: { fontFamily: fontFamily.body, textAlign: 'center', fontSize: 13 },
  actions: { marginHorizontal: 16, marginTop: 16, gap: 8 },
  legal: { fontFamily: fontFamily.body, fontSize: 13, lineHeight: 18, textAlign: 'center', marginHorizontal: 32, marginTop: 16 },
  language: { marginTop: 24 },
});
