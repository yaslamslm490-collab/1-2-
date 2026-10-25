# NADA AI Media OS — التشغيل والتحقق

## المتطلبات

- Node.js 18 أو أحدث.
- npm أو pnpm.
- Wrangler عند اختبار Worker محليًا.
- لا تضع أسرارًا في Git أو الواجهة.

## تشغيل الواجهة فقط

```bash
npm install
npm run dev
```

هذا يشغل Vite للواجهة. لا يعتبر تشغيلًا كاملًا؛ بدون Worker ستفشل مسارات `/api` أو قد يعيد Vite HTML fallback.

## تشغيل Worker محليًا

1. ابنِ الواجهة:

```bash
npm run build
```

2. شغّل Worker:

```bash
npx wrangler dev --local --ip 0.0.0.0 --port 8787
```

3. اختبر:

```bash
curl -i http://127.0.0.1:8787/api/health
curl -i http://127.0.0.1:8787/api/auth/session
```

يجب أن يكون `Content-Type: application/json`. إذا كانت المصادقة أو Gemini غير مهيأة، يجب أن تظهر حالة `503` صريحة، لا نجاحًا وهميًا.

## اختبار عقد API

مع Worker يعمل:

```bash
API_BASE_URL=http://127.0.0.1:8787 npm run test:api
```

الاختبار لا يرسل طلبًا إلى Gemini؛ يتحقق فقط من JSON ومسارات الأخطاء.

## الأسرار السحابية

يجب ضبطها في مدير أسرار Cloudflare فقط:

```text
OWNER_MASTER_PASSWORD أو OWNER_API_TOKEN
GEMINI_API_KEY
GEMINI_MODEL
```

لا تُكتب القيم في `.env` المتعقب أو في `dist` أو في المحادثة. يجب استخدام `wrangler secret put` أو لوحة Cloudflare بعد التأكد من الحساب والمورد الصحيحين.

## D1

`wrangler.jsonc` في الفرع يحتوي معرفًا تجريبيًا صفريًا. لا تستبدله عشوائيًا. قبل التشغيل السحابي يجب ربط قاعدة D1 حقيقية وتطبيق:

```bash
npx wrangler d1 migrations apply <database-name> --remote
```

لا تنفذ الأمر قبل اعتماد اسم قاعدة الحساب والتأكد من الصلاحية.

## التحقق من الصوت على Android

- افتح الرابط عبر HTTPS.
- تأكد من أن المتصفح يعرض إذن الميكروفون.
- اضغط زر الميكروفون وتحدث بالعربية.
- تحقق أن النص المعروض هو النص الملتقط فعلًا.
- عند رفض الإذن، يجب أن تظهر رسالة واضحة ويبقى الإدخال النصي متاحًا.
- اختبر زر النطق وتأكد من `speechSynthesis` وصوت عربي حقيقي؛ Audio Tone ليس بديلًا عن الرد الصوتي.

## حدود التشغيل الحالية

- لا يوجد اتصال Gemini حقيقي دون secret.
- لا يوجد تسجيل دخول مالك فعلي دون secret.
- لا يوجد D1 Cloud فعلي مع المعرف الحالي.
- لا توجد مكتبة فيديو دائمة في هذا الفرع.
- لا يعتبر نجاح `npm run build` دليلًا على تشغيل API أو Gemini.
