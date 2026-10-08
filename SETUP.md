# دليل تشغيل رفيق — الإصدار 2

يستغرق الإعداد نحو 30 دقيقة، مرة واحدة فقط. نفّذ الخطوات بالترتيب، وفي نهاية كل خطوة علامة تؤكد نجاحها.

> تحتاج إلى: حساب GitHub (الذي استخدمته سابقًا)، وحساب Google (Gmail).

---

## الخطوة 1: رفع ملفات التطبيق إلى GitHub

1. فك ضغط `rafeeq-v2.zip`. ستجد مجلدًا فيه: `index.html` و`config.js` و`sw.js` و`manifest.webmanifest` و`SETUP.md`، ومجلدات `js` و`vendor` و`icons` و`supabase` و`.github`.
2. افتح مستودع `rafeeq` على GitHub ← **Add file** ← **Upload files**.
3. اسحب **كل محتويات المجلد** (الملفات والمجلدات معًا) وأفلتها في الصفحة، ثم اضغط **Commit changes**.
4. تأكد أن مجلد `.github` ارتفع. إن لم يظهر في المستودع:
   - اضغط **Add file** ← **Create new file**.
   - في خانة الاسم اكتب: `.github/workflows/keepalive.yml`
   - افتح الملف نفسه من جهازك، وانسخ محتواه والصقه، ثم **Commit changes**.

**علامة النجاح:** بعد دقيقتين، يفتح رابط التطبيق (`https://اسم-حسابك.github.io/rafeeq/`) على شاشة الدخول، ومعها زر «الاستخدام على هذا الجهاز فقط». يمكنك استخدامه من الآن على جهاز واحد إلى أن تُكمل باقي الخطوات.

---

## الخطوة 2: إنشاء قاعدة البيانات في Supabase

1. ادخل إلى **supabase.com** ← **Start your project** ← سجّل الدخول بحساب GitHub.
2. اضغط **New project**:
   - **Name:** `rafeeq`
   - **Database Password:** اضغط **Generate a password** واحفظها في مكان آمن.
   - **Region:** اختر أقرب منطقة متاحة (مثل Frankfurt أو Mumbai).
   - اضغط **Create new project** وانتظر دقيقتين.
3. من القائمة الجانبية افتح **SQL Editor** ← **New query**.
4. افتح الملف `supabase/schema.sql` من جهازك، وانسخ محتواه كاملًا، والصقه، ثم اضغط **Run**.

**علامة النجاح:** تظهر رسالة **Success. No rows returned**.

---

## الخطوة 3: نسخ مفتاحي الربط

1. في Supabase افتح **Project Settings** (رمز الترس أسفل القائمة).
2. من **Data API** (أو **API**) انسخ **Project URL**. يبدو هكذا: `https://abcdxyz.supabase.co`
3. من **API Keys** انسخ مفتاح **anon public** (قد تجده في تبويب **Legacy API Keys**). يبدأ عادةً بـ `eyJ`.
   - هذا المفتاح عام وآمن للنشر؛ الحماية الفعلية في قاعدة البيانات، فكل مستخدم يرى بياناته فقط.
4. احتفظ بالقيمتين مؤقتًا في ملاحظة.

---

## الخطوة 4: تفعيل الدخول بحساب Google

### أ) في Supabase
1. افتح **Authentication** ← **Sign In / Providers** ← **Google**.
2. انسخ **Callback URL** الظاهر هناك. يبدو هكذا: `https://abcdxyz.supabase.co/auth/v1/callback`
3. اترك الصفحة مفتوحة.

### ب) في Google Cloud
1. افتح **console.cloud.google.com** بحساب Google.
2. من أعلى الصفحة: **Select a project** ← **New project** ← الاسم `rafeeq` ← **Create**، ثم اختره.
3. ابحث في الأعلى عن **Google Auth Platform** وافتحه ← **Get started**:
   - **App name:** رفيق
   - **User support email:** بريدك
   - **Audience:** External
   - **Contact email:** بريدك ← وافق على الشروط ← **Create**.
4. افتح **Clients** ← **Create client**:
   - **Application type:** Web application
   - **Authorized JavaScript origins** ← **Add URI**: `https://اسم-حسابك.github.io`
   - **Authorized redirect URIs** ← **Add URI**: الصق **Callback URL** من Supabase.
   - اضغط **Create**، وانسخ **Client ID** و**Client secret**.
5. افتح **Audience** ← اضغط **Publish app** ← **Confirm**.
   - هذه الخطوة تسمح لأي شخص بالدخول، ولا تحتاج مراجعة من Google لأن التطبيق يطلب الاسم والبريد فقط.

### ج) ارجع إلى Supabase
1. في صفحة **Google**: فعّل **Enable Sign in with Google**، والصق **Client ID** و**Client Secret** ← **Save**.
2. افتح **Authentication** ← **URL Configuration**:
   - **Site URL:** `https://اسم-حسابك.github.io/rafeeq/`
   - **Redirect URLs** ← **Add URL**: الرابط نفسه ← **Save**.

---

## الخطوة 5: ربط التطبيق بقاعدة البيانات

1. في مستودع GitHub افتح الملف `config.js` ← اضغط رمز القلم (Edit).
2. ضع القيمتين بين علامتي التنصيص:
   ```js
   window.RAFEEQ_CONFIG = {
     supabaseUrl: 'https://abcdxyz.supabase.co',
     supabaseAnonKey: 'eyJ....'
   };
   ```
3. اضغط **Commit changes**.

**علامة النجاح:** بعد دقيقتين، افتح التطبيق وأعد تحميل الصفحة مرتين؛ يظهر زر **المتابعة بحساب Google**. سجّل الدخول، فتظهر في الأعلى علامة **«متزامن»**.

---

## الخطوة 6: المنبّه الذي يُبقي الخادم نشطًا

1. في مستودع GitHub: **Settings** ← **Secrets and variables** ← **Actions** ← **New repository secret**:
   - الاسم `SUPABASE_URL` والقيمة: Project URL.
   - ثم سر آخر بالاسم `SUPABASE_ANON_KEY` والقيمة: مفتاح anon.
2. افتح تبويب **Actions** ← إن ظهر زر تفعيل فاضغطه ← اختر **keep-supabase-awake** ← **Run workflow**.

**علامة النجاح:** تظهر علامة صح خضراء بجوار التشغيل.

> ملاحظة: يوقف GitHub المهام المجدولة إذا لم يُحدَّث المستودع 60 يومًا، ويرسل لك بريدًا بذلك؛ اضغط الرابط في البريد لإعادة التفعيل.

---

## الخطوة 7: التثبيت على الموبايل

- **أندرويد (Chrome):** افتح الرابط ← القائمة ⋮ ← **إضافة إلى الشاشة الرئيسية** ← **تثبيت**.
- **آيفون (Safari):** افتح الرابط ← زر المشاركة ← **إضافة إلى الشاشة الرئيسية**.

ثم افتحه من الأيقونة، وسجّل الدخول بحساب Google نفسه، فتظهر بياناتك كاملة.

---

## نقل بياناتك السابقة

- **إذا استخدمت النسخة الأولى على الجهاز نفسه والرابط نفسه:** يظهر لك تنبيه «وُجدت مهام من النسخة السابقة» ← اضغط **استيرادها**.
- **أو من نسخة احتياطية:** المزيد ← **استيراد بيانات** ← اختر ملف `rafeeq-backup-....json`.
- **إذا استخدمت «على هذا الجهاز فقط» ثم سجّلت الدخول:** يظهر تنبيه لنقلها إلى حسابك.

## عند وصول تحديث جديد

ارفع الملفات الجديدة فوق القديمة كما في الخطوة 1، **ما عدا `config.js`** حتى لا تُمسح مفاتيحك. ثم أغلق التطبيق وافتحه مرتين.

---

## الإصدار 2.1 — مكتبة الملفات (Google Drive)

تُنفَّذ مرة واحدة:

1. **قاعدة البيانات:** Supabase ← SQL Editor ← New query ← الصق محتوى `supabase/002_files_drive.sql` ← Run.
2. **Google Cloud:** فعّل **Google Drive API** للمشروع (APIs & Services ← Library ← Google Drive API ← Enable).
3. **دالة الخادم:** Supabase ← Edge Functions ← Deploy a new function ← Via Editor:
   - الاسم: `google-token`
   - الكود: محتوى `supabase/functions/google-token/index.ts` ← Deploy.
4. **السر:** Supabase ← Edge Functions ← Secrets ← Add new secret:
   - الاسم `GOOGLE_CLIENT_SECRET`، والقيمة: Client secret من Google Cloud (يبدأ بـ `GOCSPX-`).
5. ارفع ملفات التطبيق الجديدة إلى GitHub (ما عدا `config.js`).

**علامة النجاح:** المكتبة ← ربط Google Drive ← توافق مرة واحدة ← ترفع ملفًا فيظهر في Drive داخل مجلد «رفيق».
