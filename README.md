# كورال الأنبا كاراس Ⲁⲃⲃⲁ Ⲕⲁⲣⲁⲥ

تطبيق إدارة الكورال مبني بـ Capacitor وFirebase.

## التسجيل
- المخدوم يسجل حسابًا بنفسه ويُنشأ سجل المخدوم ويرتبط بحسابه مباشرة.
- الخادم يحتاج كودًا يتحقق منه Firebase Cloud Function، ولا يوجد كود الخدام داخل كود التطبيق.

## قبل النشر
1. اتبع `FIREBASE_SETUP.md` لنشر قواعد Firestore ودالة `registerServant`.
2. عيّن السر `SERVANT_SIGNUP_CODE` عبر Firebase Secret Manager.
3. لاحظ أن تسجيل الحضور الذاتي عبر QR يحتاج تحويله إلى Cloud Function قبل تطبيق قواعد الإنتاج الصارمة؛ التفاصيل في دليل الإعداد.
4. بناء واجهة الويب: `npm install && npm run build`.
