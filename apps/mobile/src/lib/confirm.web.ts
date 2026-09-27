// Web: Alert.alert is a no-op in react-native-web, so the browser's own dialog asks instead.
// It shows as a native sheet in the installed iPhone web app.
export function confirm(title: string, message: string, _action: string): Promise<boolean> {
  return Promise.resolve(window.confirm(`${title}\n\n${message}`));
}
