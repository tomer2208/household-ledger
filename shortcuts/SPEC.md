# מפרט השורטקאט

## Session 0.1: ספייק echo

**מטרה:** לתעד בדיוק מה אוטומציית Wallet Transaction שולחת, לפני שכותבים את `/capture` האמיתי.

- Endpoint: `https://npwqqtdtqupacofkzqgr.supabase.co/functions/v1/echo` (פרויקט `household-ledger-dev`).
- קוד: `supabase/functions/echo/index.ts`. נמחק אחרי Phase 0.
- כל בקשה נרשמת ביומן כשורה אחת שמתחילה ב-`SPIKE_ECHO`, כולל פירוק של כל תו שאינו ASCII (כך נראה ₪, סימני RLM/LRM ועברית).

### בניית שורטקאט הבדיקה ("Spike Echo")

1. Shortcuts → `+` → שם: **Spike Echo**.
2. פעולה **Get Contents of URL**:
   - URL: ה-endpoint למעלה.
   - Method: `POST`.
   - Headers: `Authorization` = `Bearer <spike token>`.
   - Request Body: `JSON`, עם השדות הבאים (כולם מסוג Text):
     - `amount` → Shortcut Input, מאפיין Amount
     - `merchant` → Shortcut Input, מאפיין Merchant
     - `card` → Shortcut Input, מאפיין Card (או השם שמופיע בפועל)
     - `name` → Shortcut Input, מאפיין Name, אם קיים
     - `raw` → Shortcut Input עצמו, בלי מאפיין. זו רשת הביטחון: אם שמות המאפיינים שונים, נראה כאן את כל מה שהגיע.
     - `occurred_at` → Current Date, בפורמט ISO 8601
   - **אם שמות המאפיינים שונים ממה שכתוב כאן, רשום מה ראית ברשימה.** זה בדיוק אחד הממצאים.
3. Shortcuts → Automation → `+` → **Transaction**:
   - Cards: כל הכרטיסים ב-Wallet.
   - Categories / Merchants: הכול.
   - **Run Immediately**, ו-Notify When Run כבוי.
   - Next → בחר את **Spike Echo**.

### מטריצת בדיקות

| # | תרחיש | בוצע | הערות מהשטח |
|---|---|---|---|
| T1 | קנייה בש"ח במסוף פיזי, סוחר עם שם בעברית | | |
| T2 | קנייה בש"ח במסוף פיזי, רשת עם שם באנגלית | | |
| T3 | קנייה באפליקציה או באתר עם Apple Pay | | האם האוטומציה בכלל רצה? |
| T4 | קנייה במט"ח (למשל אתר בדולרים עם Apple Pay) | | אם אפשר |
| T5 | אותה קנייה מהאייפון של בן/בת הזוג | | אם זמין |

בכל בדיקה חשוב לשים לב: האם האוטומציה רצה מיד בזמן ההקשה, או כמה שניות אחר כך? האם הופיעה התראה או משהו על המסך?

### ממצאים (ימולא אחרי הבדיקות)

| שאלה | תשובה |
|---|---|
| שמות המאפיינים המדויקים של Shortcut Input | |
| פורמט `amount` בש"ח (מחרוזת? מספר? עם ₪? תווים נסתרים?) | |
| פורמט `amount` במט"ח | |
| מה מגיע ב-`merchant` בעסקה עם שם עברי | |
| מה מגיע ב-`card` (שם הכרטיס? 4 ספרות?) | |
| האם הטריגר רץ על עסקאות in-app ואונליין | |
| זמן מהקשה ועד רישום בשרת | |
| שינויים נדרשים ב-BLUEPRINT §3.6 ו-§3.11 | |
