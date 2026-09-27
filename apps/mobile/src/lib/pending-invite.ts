import AsyncStorage from '@react-native-async-storage/async-storage';

// An invite link opened before sign-in: the code waits here until onboarding picks it up
// (G3). AsyncStorage is localStorage on web, so it survives the email-code round trip.
const KEY = 'pending-invite-code';

export const savePendingInvite = (code: string) => AsyncStorage.setItem(KEY, code).catch(() => {});
export const readPendingInvite = () => AsyncStorage.getItem(KEY).catch(() => null);
export const clearPendingInvite = () => AsyncStorage.removeItem(KEY).catch(() => {});
