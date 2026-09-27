# בנק משימות

> נכתב ב-25.09.2026, ועודכן ב-27.09.2026 אחרי סשן שבו בוצעו כל המשימות שלא דורשות אותך.
>
> **החלטות:**
> - (25.09) האפליקציה מופצת כאפליקציית רשת שמוסיפים למסך הבית (PWA), ולא דרך TestFlight. אין תשלום ל-Apple. הקוד נשאר Expo, כך שאפשר לעבור ל-iOS מלא בהמשך.
> - (27.09) האפליקציה מיועדת לציבור הרחב. כמה אנשים חולקים משק בית אחד דרך קישור הזמנה.
>
> **איך מתחילים סשן:** "קרא את docs/BLUEPRINT.md ואת docs/NEXT_SESSION.md והתחל מהמשימה הראשונה שלא סומנה."

## מצב נוכחי בקצרה

- **Supabase:** פרויקט `household-ledger-dev` (`npwqqtdtqupacofkzqgr`), ארגון `tomer2208`, אזור פרנקפורט.
  - 20 migrations הוחלו.
  - פונקציות: `capture`, `push-dispatch`, `monthly-report`, `advisor-run`, `delete-account`, וגם `echo` הזמנית.
  - מפתחות VAPID ל-Web Push שמורים ב-Vault. לא צריך לשמור אותם בשום מקום אחר.
- **האפליקציה:** `apps/mobile` (Expo SDK 57). `sh scripts/build-web.sh` בונה את גרסת הרשת לתיקייה `dist/`.
- **AI:** הקריאה ל-Claude עצמה עוד לא רצה, כי אין מפתח. יש תקרה של $1 לחודש לכל משק בית.
- **גיט:** ריפו פרטי [tomer2208/household-ledger](https://github.com/tomer2208/household-ledger), ענף `main`.
- **אתר חי:** https://household-ledger-wedding-planner-2026.vercel.app (פרויקט Vercel `household-ledger` בצוות "tomer2208's projects"). כל push ל-`main` מעלה גרסה חדשה אוטומטית.

---

## 👤 מה שנשאר לך (לפי הסדר)

1. **A1: מייל עם קוד.** בלי זה אי אפשר להיכנס.
   - ב-Gmail: להפעיל אימות דו-שלבי וליצור "סיסמת אפליקציה" ב-myaccount.google.com/apppasswords.
   - ב-Supabase: Authentication → Emails → SMTP Settings. להפעיל Custom SMTP ולמלא:
     - Host: `smtp.gmail.com`
     - Port: `465`
     - Username: כתובת ה-Gmail
     - Password: סיסמת האפליקציה
     - Sender: אותה כתובת Gmail
   - ב-Templates: להדביק את `supabase/templates/magic_link.html` בתבנית "Magic Link" ואת `supabase/templates/confirm_signup.html` בתבנית "Confirm signup". שורת הנושא (Subject) כתובה בראש כל קובץ.
2. **B6: כתובת האתר ב-Supabase.** תחת Auth → URL Configuration → Site URL להדביק `https://household-ledger-wedding-planner-2026.vercel.app`.
3. **B7 + C6: בדיקה על אייפון.**
   - להוסיף את האפליקציה למסך הבית ולהיכנס.
   - להפעיל Budget alerts בהגדרות.
   - להזמין את אשתך בקישור.
   - לחצות 90% בקטגוריה אחת.
4. **A2: מפתח Anthropic,** כשתרצה AI אמיתי. שומרים אותו ב-Edge Functions → Secrets בשם `ANTHROPIC_API_KEY`, ולא מדביקים בצ'אט.
5. **G1: דומיין ו-Resend,** לפני פתיחה לציבור.
6. **G11: עורך דין** שיעבור על `public/privacy.html` ו-`public/terms.html` וימלא את מה שבסוגריים.
7. **G7: פרויקט prod,** כשמחליטים לפתוח לציבור.

---

## משימות

סימון 👤 = משימה שרק אתה יכול לעשות.

### א. הכנה

- [ ] 👤 **A1.** מייל עם קוד: SMTP ותבניות. ההוראות למעלה. התבניות מוכנות ב-`supabase/templates/`.
- [ ] 👤 **A2.** מפתח Anthropic: ב-console.anthropic.com לטעון קרדיט, להגדיר תקרה וליצור מפתח. ב-Supabase תחת Edge Functions → Secrets לשמור כ-`ANTHROPIC_API_KEY`.
- [x] **A3.** commit ראשון. בוצע על ענף `main`. `.env` לא נכנס לגיט, ויש `.env.example`. 👤 אם תרצה גיבוי: ריפו פרטי ב-GitHub.

### ב. הפיכה ל-PWA

- [x] **B1.** ה-Blueprint עודכן בסעיפים 0, 3.10 ו-5.
- [x] **B2.** manifest, אייקונים חדשים (בית עם גרף), תגיות Apple ו-`viewport-fit=cover` ב-`public/index.html`.
- [x] **B3.** `public/sw.js` שומר את מעטפת האפליקציה במכשיר. נבדק ב-Chrome: האפליקציה נפתחת בלי רשת.
- [x] **B4.** ליטוש לרשת:
  - שדה חיפוש
  - `confirm` במקום `Alert`
  - safe area לסרגל הטאבים
  - שדות קלט של 16px ומעלה
  - `inputMode` (מגיע אוטומטית מ-`keyboardType`)
  - מיפוי אייקונים מלא
  - מצב כהה נבדק
- [x] **B5.** פרוס ב-Vercel דרך GitHub. תיקיית השורש היא `apps/mobile`, הבנייה רצה ב-`scripts/build-web.sh`, ומשתני `EXPO_PUBLIC_*` מוגדרים בפרויקט. נבדק: כל הנתיבים מחזירים 200, `sw.js` מוגש עם no-cache, ושדה ה-dev לא נמצא ב-bundle. גרסאות preview מוגנות בהתחברות ל-Vercel, וגרסת ה-production פתוחה לציבור.
- [ ] 👤 **B6.** Site URL ב-Supabase.
- [ ] 👤 **B7.** בדיקה על אייפון אמיתי.

### ג. התראות פוש ברשת

- [x] **C1.** מפתחות VAPID נוצרו ונשמרו ב-Supabase Vault, אז לא נדרשת פעולה ממך. לפרויקט חדש: `node supabase/scripts/vapid-keys.mjs`.
- [x] **C2.** migration 17: טבלת `web_push_subscriptions` עם RLS לפי משתמש.
- [x] **C3.** ה-service worker מטפל ב-`push` וב-`notificationclick`, ולחיצה פותחת את הקטגוריה.
- [x] **C4.** מתג Budget alerts בהגדרות. באייפון שלא הותקן במסך הבית מוצג הסבר.
- [x] **C5.** `push-dispatch` שולח Web Push (`npm:web-push`). נבדק מול שירות הפוש של Google, שקיבל את ההודעה, וה-handler נבדק ב-service worker.
- [ ] 👤 **C6.** בדיקה על שני טלפונים.

### ד. שורטקאט Apple Pay (דורש אייפון)

- [ ] 👤 **D1.** Phase 0: שורטקאט בדיקה מול `echo`, וקנייה אמיתית אחת. לתעד ב-`shortcuts/SPEC.md`.
- [ ] **D2.** **החלטה:** מה קורה בנתיב הכשל? קישור שהשורטקאט פותח נפתח ב-Safari, ושם המשתמש לא מחובר. אפשרויות:
  - (1) להציג התראה עם הסכום.
  - (2) לשמור בשרת כ"נכשלה חלקית".
  - (3) להתחבר גם ב-Safari.
- [ ] **D3.** לבנות את "Log Expense" לפי `shortcuts/SPEC.md`. אם יחזור קוד 429, להציג "Too many requests".
- [ ] **D4.** להפיץ בקישור iCloud ולעדכן את מסך Shortcut & Devices.
- [ ] **D5.** בדיקה: סוחר חדש, אותו סוחר שוב, וקטגוריה חדשה.
- [ ] **D6.** למחוק את `echo`.

### ה. AI אמיתי (אחרי A2)

- [ ] **E1.** `capture` עם סוחרים חדשים: שם נקי, קטגוריה נכונה, וזיהוי של סניף אחר.
- [ ] **E2.** לכתוב מחדש את דוח אוגוסט. לוודא סטטוס `ready`, בלי מספרים שלא הגיעו מהנתונים.
- [ ] **E3.** `advisor-run` במצב AI.
- [ ] **E4.** עלות אמיתית במסך AI Activity. לאמת את המחירים ב-`app.ai_model_prices`, במיוחד של Sonnet 5, ולכוון את התקרה (`app.config` → `ai_monthly_cap_usd`).
- [ ] **E5.** לכייל את הספים (0.75, 0.45, 0.85) אחרי כמה שבועות של נתונים.

### ו. ניקוי ומעבר לשימוש אמיתי

- [ ] **F1.** למחוק נתוני בדיקה: משתמשי `dev-preview@householdledger.test` ו-`e2e-fixture@test.local`, ואת משקי הבית שלהם. זה יקרה לפני שימוש אמיתי. `supabase/tests/*.sql` נשענים עליהם.
- [x] **F2.** הוחלף ב-G7.
- [x] **F3.** נבדק: שדה "Dev password" לא נמצא ב-build של הרשת.
- [ ] **F4.** בפרויקט חדש:
  - להגדיר את `functions_url` ב-`app.config`.
  - ליצור מפתחות VAPID (C1).
  - לפרוס את 5 הפונקציות (בלי `echo`).

### ז. מוכנות לציבור הרחב

**מיילים**
- [ ] 👤 **G1.** להעביר את ה-SMTP ל-Resend עם דומיין מאומת. אין שינוי בקוד.
- [x] **G2.** תבניות מעוצבות ב-`supabase/templates/`. 👤 הגבלת קצב לשליחת קודים מוגדרת ב-Auth → Rate Limits. ברירת המחדל סבירה.

**שיתוף בין משתמשים**
- [x] **G3.** קישור הזמנה `/join/<code>`. מי שלא מחובר עובר דרך הכניסה, והקוד ממולא לו אוטומטית.
- [x] **G4.** הסרת חבר ויציאה ממשק בית (migration 18). היציאה מבטלת את טוקני השורטקאט של מי שיצא. אם החבר האחרון יוצא, משק הבית נמחק, אחרי אזהרה. נבדק ב-`supabase/tests/members_account.sql`.
- [x] **G5.** אות ראשונה של מי שהוסיף מופיעה על אייקון ההוצאה, ו"Added by" במסך הפרטים. מוצג רק כשיש יותר מחבר אחד.

**עלויות וסקייל**
- [x] **G6.** תקרת AI חודשית לכל משק בית (migration 19), ברירת מחדל $1. אחרי התקרה האפליקציה עוברת לטקסט המובנה. השימוש מוצג במסך AI Activity. תקרה אישית למשק בית: `app.household_ai_caps`. 👤 נשאר להחליט על מודל עסקי.
- [ ] 👤 **G7.** פרויקט prod נפרד בתוכנית Pro ($25 לחודש).
- [x] **G8.** הגבלת קצב ל-`capture` (migration 20): 20 בדקה לכל מכשיר ו-300 ביום לכל משק בית, אחרת מוחזר 429. נבדק: 20 עברו ו-5 נחסמו.

**משפטי ופרטיות**
- [x] **G9.** טיוטות `public/privacy.html` ו-`public/terms.html`, עם קישורים ממסך הכניסה ומההגדרות. כתוב בהן במפורש שהן טיוטה.
- [x] **G10.** מחיקת חשבון (פונקציית `delete-account`, עם אישור כפול) וייצוא CSV (עם BOM, כדי שעברית תיפתח נכון באקסל).
- [ ] 👤 **G11.** בדיקה משפטית (חוק הגנת הפרטיות, תיקון 13, ו-GDPR) ומילוי הפרטים בסוגריים.

**קליטה של משתמשים חדשים**
- [x] **G12.** מסך Set Up Guide בהגדרות, ובאנר "Add to your Home Screen" במסך הראשי. הבאנר מופיע רק בדפדפן ואפשר לסגור אותו.
- [x] **G13.** דף נחיתה ב-`public/welcome.html`. אפשר להפוך אותו לדף הראשי של הדומיין כשיהיה.

---

## דברים שכבר לא רלוונטיים במסלול PWA

אלה נשארים במסמך למקרה שנחזור ל-iOS native:
- Sign in with Apple
- EAS ו-TestFlight
- Expo push tokens
- LargeSecureStore
