const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp();
const db = getFirestore();
const SERVANT_SIGNUP_CODE = defineSecret('SERVANT_SIGNUP_CODE');

exports.registerServant = onCall({ secrets: [SERVANT_SIGNUP_CODE], enforceAppCheck: false }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'سجّل الدخول أولًا.');
  const { code, name, phone, contact } = request.data || {};
  if (typeof code !== 'string' || !code || code !== SERVANT_SIGNUP_CODE.value()) {
    throw new HttpsError('permission-denied', 'كود الخدام غير صحيح.');
  }
  if (typeof name !== 'string' || name.trim().length < 2) {
    throw new HttpsError('invalid-argument', 'اكتب الاسم بالكامل.');
  }
  const uid = request.auth.uid;
  const ref = db.collection('users').doc(uid);
  const existing = await ref.get();
  if (existing.exists && existing.data().role !== 'servant') {
    throw new HttpsError('already-exists', 'الحساب مرتبط بالفعل بمخدوم. تواصل مع مسؤول التطبيق.');
  }
  const data = {
    name: name.trim(), role: 'servant', phone: typeof phone === 'string' ? phone : '',
    contact: typeof contact === 'string' ? contact : '', memberId: '',
    createdAt: Date.now()
  };
  await ref.set(data, { merge: false });
  return data;
});
