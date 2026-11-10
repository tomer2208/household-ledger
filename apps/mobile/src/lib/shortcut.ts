import { APP_URL } from './supabase';

// Where "Get FinPace" sends an iPhone. An iCloud link (Shortcuts → FinPace → Share → Copy iCloud
// Link) opens straight in the Shortcuts app with "Set Up Shortcut" and the household-key question,
// from Safari and from the home-screen app alike. The file on our own site is the fallback: an
// installed web app on iOS often can't download it, which left setup stuck on this step.
// The iCloud copy must be made from shortcuts/FinPace.shortcut as built (no key inside).
export const SHORTCUT_ICLOUD_URL = '';
export const SHORTCUT_FILE_URL = `${APP_URL}/FinPace.shortcut`;
export const SHORTCUT_URL = SHORTCUT_ICLOUD_URL || SHORTCUT_FILE_URL;
