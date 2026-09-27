import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack screenOptions={{ headerLargeTitle: true, headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ title: 'Reports' }} />
    </Stack>
  );
}
