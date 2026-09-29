import { Alert } from 'react-native';

// One place for "are you sure?" so screens don't branch on platform. iOS: a native alert.
// `destructive` (the default) paints the action red; pass false for a neutral yes, like turning a feature on.
export function confirm(title: string, message: string, action: string, destructive = true): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]),
  );
}
