# إعداد Firebase — كورال الأنبا كاراس

## 1) تفعيل خدمات Firebase
1. افتح مشروع Firebase المرتبط بالتطبيق.
2. من **Authentication → Sign-in method** فعّل **Email/Password**.
3. أنشئ **Cloud Firestore**.
4. تأكد أن المشروع على خطة **Blaze** لتشغيل Cloud Functions (قد تُطبق رسوم حسب الاستخدام).

## 2) تثبيت قواعد Firestore الآمنة
من **Firestore Database → Rules** استبدل القواعد الحالية بالقواعد التالية ثم اضغط **Publish**.

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function userDoc() { return get(/databases/$(database)/documents/users/$(request.auth.uid)); }
    function isServant() { return signedIn() && userDoc().data.role == 'servant'; }
    function changed() { return request.resource.data.diff(resource.data).affectedKeys(); }

    match /users/{userId} {
      allow read: if signedIn() && (request.auth.uid == userId || isServant());
      // إنشاء حساب مخدوم فقط من العميل. صلاحية الخادم تُمنح من Cloud Function موثوقة.
      allow create: if signedIn() && request.auth.uid == userId
                    && request.resource.data.role == 'member'
                    && request.resource.data.memberId is string;
      allow update: if signedIn() && request.auth.uid == userId
                    && changed().hasOnly(['name', 'contact', 'phone']);
      allow delete: if isServant();
    }

    match /members/{memberId} {
      allow read: if signedIn();
      allow create: if isServant() || (signedIn()
                    && request.resource.data.uid == request.auth.uid
                    && request.resource.data.points == 0
                    && request.resource.data.attended == 0);
      allow update: if isServant()
                    || (signedIn() && resource.data.uid == request.auth.uid
                        && changed().hasOnly(['photo', 'phone', 'birth', 'name', 'points', 'attended']));
      allow delete: if isServant();
    }

    match /events/{eventId} {
      allow read: if signedIn();
      allow write: if isServant();
    }
    match /attendance/{attendanceId} {
      allow read: if signedIn() && (isServant() || resource.data.memberId == userDoc().data.memberId);
      allow create: if isServant() || (signedIn() && get(/databases/$(database)/documents/members/$(request.resource.data.memberId)).data.uid == request.auth.uid);
      allow update, delete: if isServant();
    }
    match /notifs/{notificationId} {
      allow read: if signedIn() && (isServant() || resource.data.to == userDoc().data.memberId || resource.data.to == 'all');
      allow create: if isServant();
      allow update, delete: if isServant();
    }
    match /config/{configId} {
      allow read: if signedIn();
      allow write: if isServant();
    }
  }
}
```

> تنبيه أمني: القواعد تمنع ترقية الحساب إلى خادم من العميل. للحفاظ على عمل QR في النسخة الحالية، يسمح التحديث الذاتي بتعديل `points` و`attended`؛ وهذا لا يمنع عضوًا متقدمًا تقنيًا من محاولة التلاعب بنقاطه. قبل النشر الفعلي يُنصح بنقل تسجيل الحضور والنقاط إلى Cloud Function تتحقق من وقت البروفة وتحسب النقاط على الخادم.

## 3) نشر Cloud Function لتسجيل الخدام
كود الخادم السري لا يوضع في `src/config.js` ولا في تطبيق الهاتف؛ لأن أي قيمة داخل التطبيق يمكن استخراجها. الدالة `functions/registerServant` تتحقق من الكود على الخادم وتمنح دور `servant` باستخدام Admin SDK.

من جذر المشروع، بعد تثبيت Firebase CLI وتسجيل الدخول:

```bash
npm install -g firebase-tools
firebase login
firebase use youth-family-c039e
firebase init functions
```

إذا سألك `firebase init functions` عن الكتابة فوق ملفات `functions` الموجودة، **لا تستبدل الملفات الموجودة**. اختر JavaScript إن احتجت إنشاء الإعدادات فقط، ثم تأكد أن `functions/package.json` و`functions/index.js` الموجودين في هذا المشروع محفوظان.

اضبط كود الخدام السري على Firebase Secret Manager (اكتب الكود 2558 المطلوب حاليًا حتى يطابق شاشة التطبيق. لاحقًا يُفضّل تغييره إلى كود أطول وأكثر أمانًا):

```bash
firebase functions:secrets:set SERVANT_SIGNUP_CODE
```

اكتب `2558` عند الطلب، ثم انشر الدالة:

```bash
firebase deploy --only functions:registerServant
```

بعدها انشر قواعد Firestore من لوحة Firebase، أو احفظها في ملف `firestore.rules` ثم اربطها بإعدادات `firebase.json` وانشرها باستخدام `firebase deploy --only firestore:rules`.

## 4) طريقة التسجيل في التطبيق
- **المخدوم:** ينشئ حسابًا برقم الهاتف أو البريد الإلكتروني وكلمة مرور، ثم يملأ الاسم ورقم الهاتف وتاريخ الميلاد ويختار الكورال ويرفع صورة اختيارية. ينشأ له سجل مخدوم مرتبط بحسابه مباشرة؛ لا يحتاج أن يضيفه الخادم أولًا.
- **الخادم:** ينشئ حسابًا ويكتب كود الخدام. يتحقق الخادم من الكود عبر Cloud Function؛ لا يُمنح دور الخادم إذا كان الكود غير صحيح أو لم تُنشر الدالة.
- تسجيل الدخول في النسخة الحالية يستخدم Firebase Email/Password. عند كتابة رقم هاتف، يحوله التطبيق إلى عنوان داخلي ينتهي بـ `@phone.choir.app`؛ هذا ليس تحقق SMS ولا تسجيل دخول برقم الهاتف الحقيقي. يجب استخدام نفس الرقم عند تسجيل الدخول.

## 5) الصور
صور الملفات الشخصية تُخزن كبيانات صغيرة في Firestore في النسخة الحالية. للصور الكبيرة أو الاستخدام الفعلي مع عدد أعضاء أكبر، يوصى باستخدام Firebase Storage مع قواعد وصول مناسبة.

## 6) ملاحظات مهمة عن الإشعارات والحضور
- إشعارات أعياد الميلاد والتقرير الأسبوعي والتذكير بالمواعيد مجدولة محليًا على الجهاز؛ تعتمد على دعم الجهاز وإذن الإشعارات وفتح التطبيق لإعادة جدولة التذكيرات. إشعارات Firestore الفورية تظهر عندما يكون التطبيق متصلًا ويعمل. هذه النسخة لا تحتوي بعد على إرسال Push مضمون عبر FCM عندما يكون التطبيق مغلقًا.
- كود الخدام `2558` مخصص للإعداد الحالي، ويمكن لأي شخص يعرفه طلب دور الخادم؛ شاركه مع الخدام المصرح لهم فقط.
- قواعد Firestore الحالية تسمح للتطبيق بتحديث نقاط المخدوم المرتبط بحسابه لكي يعمل تسجيل الحضور الحالي. هذا ليس حماية كاملة ضد التلاعب المتعمد بالنقاط؛ قبل الاستخدام الحساس انقل حساب النقاط وتسجيل الحضور إلى Cloud Functions.

## 7) قائمة اختبار قبل الاستخدام الفعلي
- جرّب إنشاء مخدوم جديد وتأكد من ظهور سجلّه في قائمة المخدومين.
- جرّب كود خدام خاطئ وتأكد من رفض التسجيل.
- جرّب إنشاء خادم بالكود الصحيح بعد نشر الدالة.
- جرّب بحساب مخدوم تغيير `role` يدويًا من أدوات المطور؛ يجب أن ترفضه قواعد Firestore.
- اختبر تسجيل الحضور بالـ QR بعد نشر مسار الحضور الآمن على الخادم.
