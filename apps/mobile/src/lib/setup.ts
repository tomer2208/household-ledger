import AsyncStorage from '@react-native-async-storage/async-storage';

// P1-7: whoever creates a household goes through the setup wizard once. The flag is set when
// the household is created (not when joining one: the budgets already exist) and cleared when
// the wizard finishes or is skipped. The Overview checklist can be dismissed separately.
const PENDING = 'setup-pending';
const CARD_DISMISSED = 'setup-card-dismissed';

export const setSetupPending = () => AsyncStorage.setItem(PENDING, '1').catch(() => {});
export const readSetupPending = () => AsyncStorage.getItem(PENDING).then((v) => v === '1', () => false);
export const clearSetupPending = () => AsyncStorage.removeItem(PENDING).catch(() => {});

export const dismissSetupCard = () => AsyncStorage.setItem(CARD_DISMISSED, '1').catch(() => {});
export const readSetupCardDismissed = () => AsyncStorage.getItem(CARD_DISMISSED).then((v) => v === '1', () => false);
