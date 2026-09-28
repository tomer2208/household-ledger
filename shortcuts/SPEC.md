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

### ממצאים (28.09.2026, iOS, אייפון של תומר)

| שאלה | תשובה |
|---|---|
| שמות המאפיינים של Shortcut Input | `Transaction`, `Card or Pass`, `Merchant`, `Amount`, `Name` |
| פורמט `amount` בש"ח | המפרסר קרא את הסכום נכון: ₪167.62 נשמר כ-16762 אגורות. הפורמט הגולמי לא נשמר |
| פורמט `amount` במט"ח | טרם נבדק |
| מה מגיע ב-`merchant` | שם באנגלית, **חתוך ל-20 תווים**: `Super Farm Ben Guryo`. שם בעברית טרם נבדק |
| מה מגיע ב-`card` | שם הכרטיס כפי שמופיע ב-Wallet (`CashCal Pro`), בלי ספרות |
| טריגר על in-app / אונליין | טרם נבדק |
| זמן מהקשה עד התפריט | שניות ספורות |
| שינויים שנדרשו | ראה "לקחים" |

### לקחים מהבנייה

- **הטוקן נשלח בגוף ה-JSON (`token`) ולא בכותרת.** כותרת Authorization שהוזנה ידנית ב-Shortcuts הגיעה ריקה לשרת, בשתי בניות. `capture` מקבל עכשיו את הטוקן מ-`Authorization`, מ-`X-Device-Token` או מ-`body.token`, ומתעלם מרווחים ומ-"Bearer".
- **האוטומציה נבנתה ישירות ב-Automation → Transaction → New Blank Automation**, בלי קיצור נפרד. כך `Shortcut Input` זמין בלי הגדרות קלט. החיסרון: אין קישור iCloud להפצה, וכל משתמש בונה אותה בעצמו (D4).
- **ערכים מ-Get Dictionary Value צריכים Type → Text,** אחרת ה-If מציע רק has any value.
- **כל `Get Dictionary Value` צריך `in: Contents of URL` ידנית,** כי ברירת המחדל היא הפלט של הפעולה שמעליו.
- **▶ בעורך שולח בקשה בלי קנייה.** השרת עונה `missing_merchant`, וזו בדיקה טובה לטוקן. בשגיאת 4xx, ל-Show Notification לא מגיע גוף התשובה.

### המבנה שנבנה בפועל

```
Receive transaction as input
Get contents of …/capture          JSON: merchant, amount, card, name ← Shortcut Input; token
Get Value for status in Contents of URL          (Type: Text)
If status is needs_input
    Get Value transaction_id → Set variable TxId
    Get Value prompt         → Set variable Prompt
    Get Value category_names
    Choose from list (Prompt)
    If Chosen Item contains "New category"
        Ask for Text → Set variable NewCategory
    End If
    Get contents of …/capture/confirm   JSON: token, transaction_id=TxId, category_name=Chosen Item, new_category_name=NewCategory
Otherwise
    If status is not logged → Show notification "FinPace couldn't log this purchase. Add it in the app."   (D2, option 1)
End If
```
