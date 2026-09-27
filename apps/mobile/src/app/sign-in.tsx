import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorText, Field, Icon, Section } from '@/components/ui';
import { APP_URL, supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';

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
      if (!cred.identityToken) throw new Error('Apple did not return an identity token');
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
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.hero}>
          <View style={[s.logo, { backgroundColor: c.tint }]}>
            <Icon name="chart.pie" size={40} color="#fff" />
          </View>
          <Text style={[s.title, { color: c.label }]}>FinPace</Text>
          <Text style={[s.subtitle, { color: c.secondaryLabel }]}>Every shekel your household spends, in one place.</Text>
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
            <Text style={[s.or, { color: c.secondaryLabel }]}>or use email</Text>
          </View>
        ) : null}

        {step === 'email' ? (
          <>
            <Section footer="We'll email you a sign-in code. No password needed.">
              <Field
                label="Email"
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
              <Button title="Send Code" onPress={sendCode} loading={busy && !password} disabled={!email.includes('@')} />
              {__DEV__ && password ? <Button title="Dev sign in" kind="plain" onPress={devPassword} loading={busy} /> : null}
            </View>
            <Text style={[s.legal, { color: c.secondaryLabel }]}>
              By continuing you agree to the{' '}
              <Text style={{ color: c.tint }} onPress={() => WebBrowser.openBrowserAsync(`${APP_URL}/terms.html`)}>
                Terms of Use
              </Text>{' '}
              and{' '}
              <Text style={{ color: c.tint }} onPress={() => WebBrowser.openBrowserAsync(`${APP_URL}/privacy.html`)}>
                Privacy Policy
              </Text>
              .
            </Text>
          </>
        ) : (
          <>
            <Section footer={`Sent to ${email.trim()}.`}>
              <Field
                label="Code"
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
                placeholder="Code from the email"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                autoFocus
                maxLength={10}
                last
              />
            </Section>
            <View style={s.actions}>
              <Button title="Sign In" onPress={verifyCode} loading={busy} disabled={code.length < 6} />
              <Button title="Use a different email" kind="plain" onPress={() => setStep('email')} />
            </View>
          </>
        )}
        <ErrorText error={error} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  hero: { alignItems: 'center', marginTop: 48, marginBottom: 16, paddingHorizontal: 32, gap: 8 },
  logo: { width: 76, height: 76, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 16, textAlign: 'center' },
  apple: { marginHorizontal: 16, marginTop: 16, gap: 12 },
  or: { textAlign: 'center', fontSize: 13 },
  actions: { marginHorizontal: 16, marginTop: 16, gap: 8 },
  legal: { fontSize: 13, lineHeight: 18, textAlign: 'center', marginHorizontal: 32, marginTop: 16 },
});
