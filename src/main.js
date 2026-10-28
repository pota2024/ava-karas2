import {initializeApp} from 'firebase/app';
import {getAuth,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,onAuthStateChanged} from 'firebase/auth';
import {getFirestore,doc,setDoc,getDoc,getDocs,collection,query,orderBy,limit,where,onSnapshot,writeBatch,increment,addDoc,updateDoc,deleteDoc} from 'firebase/firestore';
import {getFunctions,httpsCallable} from 'firebase/functions';
import QRCode from 'qrcode';
import {Html5Qrcode} from 'html5-qrcode';
import {Capacitor} from '@capacitor/core';
import {LocalNotifications as LN} from '@capacitor/local-notifications';
import {CFG} from './config.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app=initializeApp(CFG.firebase),auth=getAuth(app),db=getFirestore(app),functions=getFunctions(app);
const registerServantCall=httpsCallable(functions,'registerServant');
const CH={ib:'ابتدائي',ie:'إعدادي',th:'ثانوي',am:'عام',ql:'إعداد قادة'},CHK=Object.keys(CH);
const TY={rehearsal:['🎼','بروفة'],concert:['🎤','حفلة'],other:['📌','نشاط']};
const VERSES=[["سبحوا الله في قدسه. سبحوه في فلك قوته.","مزمور 150: 1"],["كل نسمة فلتسبح الرب. هللويا.","مزمور 150: 6"],["غنوا له أغنية جديدة. أجيدوا الضرب بالتهليل.","مزمور 33: 3"],["هلم نرنم للرب. نهتف لصخرة خلاصنا.","مزمور 95: 1"],["رنموا لله رنموا. رنموا لملكنا رنموا.","مزمور 47: 6"],["اعبدوا الرب بفرح. ادخلوا إلى حضرته بترنم.","مزمور 100: 2"],["المجد لله في الأعالي، وعلى الأرض السلام، وبالناس المسرة.","لوقا 2: 14"]];
let uid,me,tab='home',cur=null,fch='all',bt=null,S={members:[],events:[],att:[],notifs:[],cfg:{},qr:{}},unsubs=[],booted=0,scanner=null,tmpPhoto='',nInit=0,vi=0,mode='in',pend=null;
const isS=()=>me&&me.role==='servant';
const C=()=>({max:5,step:5,open:15,close:60,concert:75,solo:85,low:60,...S.cfg});
const mem=()=>me&&S.members.find(m=>m.id===me.memberId);
const norm=v=>String(v||'').replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/\D/g,'').slice(-10);
const toMail=v=>{v=String(v||'').trim();if(v.includes('@'))return v.toLowerCase();const d=norm(v);return d.length>=10?'0'+d+'@phone.choir.app':''};
const fmt=ms=>new Date(ms).toLocaleString('ar-EG',{weekday:'long',day:'numeric',month:'long',hour:'numeric',minute:'2-digit'});
const toast=(t,ok=1)=>{const e=$('#toast');e.textContent=t;e.className='show '+(ok?'ok':'bad');setTimeout(()=>e.className='',3000)};
const ERR=e=>({'auth/email-already-in-use':'الحساب ده موجود، سجّل دخول','auth/invalid-credential':'الرقم أو الباسورد غلط','auth/wrong-password':'الرقم أو الباسورد غلط','auth/user-not-found':'الرقم أو الباسورد غلط','auth/weak-password':'الباسورد 6 على الأقل','auth/invalid-email':'اكتب رقم تليفون أو إيميل صحيح','auth/network-request-failed':'مفيش اتصال بالنت','auth/too-many-requests':'محاولات كتير، استنى شوية','auth/operation-not-allowed':'فعّل Email/Password في Firebase'}[e.code]||'حصلت مشكلة، حاول تاني');
const av=m=>`<span class="av">${m.photo?`<img src="${m.photo}">`:esc((m.name||'؟')[0])}</span>`;
function calc(ev,now){const c=C(),t=(now-ev.when)/6e4;if(t < -c.open || t >= c.close)return null;if(t<=0)return{pts:c.max,late:0};return{pts:Math.max(0,c.max-Math.floor(t/c.step)),late:Math.floor(t)}}
function evFor(m){const c=C(),n=Date.now();return S.events.filter(e=>e.type==='rehearsal'&&e.when+c.close*6e4<n&&e.when>=(m.added||0)-864e5&&(e.choir==='all'||e.choir===m.choir))}
function stat(m,days){let E=evFor(m);if(days)E=E.filter(e=>e.when>Date.now()-days*864e5);const ids=new Set(E.map(e=>e.id)),a=S.att.filter(x=>x.memberId===m.id&&ids.has(x.eventId)).length;return{t:E.length,a,p:E.length?Math.round(a/E.length*100):null}}
function elig(p){const c=C();if(p===null)return['لا توجد بيانات','gray'];if(p>=c.solo)return['مستحق للحفلات والصولوهات','ok'];if(p>=c.concert)return['مستحق للحفلات فقط','wa'];return['غير مستحق حاليًا','no']}
const col=p=>p===null?'#889':p>=C().solo?'#4cc38a':p>=C().concert?'#f0a53a':'#ff6b81';
function nextBd(b){if(!b)return null;const [y,mo,d]=b.split('-').map(Number),n=new Date(),s=new Date(n.getFullYear(),n.getMonth(),n.getDate());let t=new Date(n.getFullYear(),mo-1,d);if(t<s)t=new Date(n.getFullYear()+1,mo-1,d);return{t,days:Math.round((t-s)/864e5),age:t.getFullYear()-y}}
const wa=p=>`https://wa.me/20${norm(p)}`;
// ---------- auth ----------
onAuthStateChanged(auth,async u=>{if(!u){uid=null;me=null;return login()}uid=u.uid;const d=await getDoc(doc(db,'users',uid));if(d.exists()){me={id:uid,...d.data()};await tryLink();start()}else if(pend){await mkUser(pend)}else{onboard()}});
const head=`<img class="logo" src="logo.png" alt=""><div style="text-align:center"><b style="font-size:20px">${esc(CFG.choir)}</b><div class="s">${esc(CFG.church)}</div></div>`;
function login(){
 $('#nav').innerHTML='';const r=mode==='up';
 $('#app').innerHTML=head+`<div class="card" style="margin-top:16px"><h3>${r?'إنشاء حساب جديد':'تسجيل الدخول'}</h3>${r?`<input id="nm" placeholder="الاسم بالكامل"><input id="ph" inputmode="tel" placeholder="رقم التليفون"><label>تاريخ الميلاد</label><input id="birth" type="date"><label>الكورال</label><select id="choir">${CHK.map(k=>`<option value="${k}">${CH[k]}</option>`).join('')}</select><label>صورتك (اختياري)</label><input id="profilePhoto" type="file" accept="image/*" onchange="ph(this)"><input id="cd" inputmode="numeric" placeholder="كود الخدام (2558) — اتركه فارغًا لو مخدوم">`:''}<input id="ct" inputmode="email" placeholder="رقم التليفون أو الإيميل"><input id="pw" type="password" placeholder="الباسورد (6 أحرف على الأقل)"><button class="btn g" onclick="sub()">${r?'إنشاء الحساب':'دخول'}</button><div style="height:10px"></div><button class="btn o" onclick="tg()">${r?'عندي حساب بالفعل':'أول مرة؟ سجّل حساب جديد'}</button></div>`;
}
window.tg=()=>{mode=mode==='in'?'up':'in';tmpPhoto='';login()};
window.sub=async()=>{const ct=$('#ct').value.trim(),id=toMail(ct),pw=$('#pw').value;if(!id){toast('اكتب رقم تليفون صحيح أو إيميل',0);return}if(pw.length<6){toast('الباسورد 6 على الأقل',0);return}
 try{if(mode==='in')await signInWithEmailAndPassword(auth,id,pw);else{const n=$('#nm').value.trim(),cd=$('#cd').value.trim(),phone=norm($('#ph').value),birth=$('#birth').value,choir=$('#choir').value;if(!n||!phone){toast('اكتب الاسم ورقم التليفون',0);return}pend={n,role:cd?'servant':'member',c:ct,ph:phone,birth,choir,photo:tmpPhoto,servantCode:cd};await createUserWithEmailAndPassword(auth,id,pw)}}catch(e){pend=null;toast(ERR(e),0)}
};
function onboard(){$('#nav').innerHTML='';$('#app').innerHTML=head+`<div class="card" style="margin-top:16px"><h3>كمّل بياناتك</h3><input id="nm" placeholder="الاسم بالكامل"><input id="ph" inputmode="tel" placeholder="رقم التليفون"><label>تاريخ الميلاد</label><input id="birth" type="date"><label>الكورال</label><select id="choir">${CHK.map(k=>`<option value="${k}">${CH[k]}</option>`).join('')}</select><label>صورة (اختياري)</label><input id="profilePhoto" type="file" accept="image/*" onchange="ph(this)"><input id="cd" inputmode="numeric" placeholder="كود الخدام (2558) — اتركه فارغًا لو مخدوم"><button class="btn g" onclick="fin()">حفظ وبدء الاستخدام</button></div>`}
window.fin=async()=>{const n=$('#nm').value.trim(),cd=$('#cd').value.trim();if(!n){toast('اكتب اسمك',0);return}await mkUser({n,role:cd?'servant':'member',c:(auth.currentUser.email||'').replace(/@phone.choir.app/,''),ph:norm($('#ph').value),birth:$('#birth').value,choir:$('#choir').value,photo:tmpPhoto,servantCode:cd})};
async function mkUser(p){
 try{
  let data;
  if(p.role==='servant'){
   const res=await registerServantCall({code:p.servantCode,name:p.n,phone:p.ph||'',contact:p.c||''});data={...res.data};
  }else{
   const memberRef=doc(collection(db,'members'));
   const profile={name:p.n,phone:p.ph||'',birth:p.birth||'',choir:p.choir||'ib',photo:p.photo||'',uid,points:0,attended:0,added:Date.now()};
   await setDoc(memberRef,profile);
   data={name:p.n,role:'member',contact:p.c||'',phone:p.ph||'',memberId:memberRef.id};
   await setDoc(doc(db,'users',uid),data);
  }
  pend=null;tmpPhoto='';me={id:uid,...data};start();
 }catch(e){toast(e?.message||'تعذر إنشاء الحساب. راجع إعدادات Firebase وكود الخدام.',0)}
}
async function tryLink(){/* التسجيل الذاتي ينشئ سجل المخدوم ويربطه بالحساب مباشرة */}
window.out=async()=>{unsubs.forEach(f=>f());unsubs=[];booted=0;nInit=0;S={members:[],events:[],att:[],notifs:[],cfg:{},qr:{}};tab='home';cur=null;await signOut(auth)};
// ---------- data ----------
const L=(q,k,map)=>unsubs.push(onSnapshot(q,s=>{S[k]=s.docs.map(d=>({id:d.id,...d.data()}));if(map)map(s);render();sched()}));
function start(){if(booted)return;booted=1;tab='home';
unsubs.push(onSnapshot(doc(db,'users',uid),s=>{if(s.exists()){me={id:uid,...s.data()};}}));
unsubs.push(onSnapshot(doc(db,'config','main'),s=>{S.cfg=s.data()||{};render()}));
L(query(collection(db,'members'),limit(500)),'members');
L(query(collection(db,'events'),orderBy('when','desc'),limit(200)),'events');
if(isS())L(query(collection(db,'attendance'),limit(5000)),'att');
else if(me.memberId){L(query(collection(db,'attendance'),where('memberId','==',me.memberId)),'att');
const m=mem();const to=['all',me.memberId];if(m&&m.choir)to.push(m.choir);
L(query(collection(db,'notifs'),where('to','in',to)),'notifs',s=>{if(nInit){s.docChanges().forEach(c=>{if(c.type==='added'){const n=c.doc.data();toast('🔔 '+n.title);ping(n.title,n.body)}})}nInit=1})}
render();setInterval(()=>{vi++;const e=$('#vb');if(e){e.style.opacity=0;setTimeout(()=>{e.innerHTML=vtxt();e.style.opacity=1},600)}},9000)}
const vtxt=()=>{const v=VERSES[vi%VERSES.length];return`${v[0]}<small>${v[1]}</small>`};
const lastSeen=()=>+localStorage.getItem('ns_'+uid)||0;
const unread=()=>S.notifs.filter(n=>n.at>lastSeen()).length;
// ---------- notifications ----------
let st;const sched=()=>{clearTimeout(st);st=setTimeout(doSched,2500)};
async function ping(title,body){if(!Capacitor.isNativePlatform())return;try{await LN.schedule({notifications:[{id:Math.floor(Math.random()*9e5)+5e4,title,body,schedule:{at:new Date(Date.now()+600)}}]})}catch(e){}}
async function doSched(){if(!Capacitor.isNativePlatform()||!me)return;try{const p=await LN.requestPermissions();if(p.display!=='granted')return;const pe=await LN.getPending();if(pe.notifications.length)await LN.cancel({notifications:pe.notifications.map(n=>({id:n.id}))});const A=[],now=Date.now(),m=mem();
S.events.filter(e=>e.when>now&&(isS()||!m||e.choir==='all'||e.choir===m.choir)).slice(0,20).forEach((e,i)=>{[[36e5,'بعد ساعة'],[864e5,'بكرة']].forEach(([d,w],j)=>{if(e.when-d>now)A.push({id:3000+i*2+j,title:'تذكير: '+e.title,body:'ميعادها '+fmt(e.when)+' ('+w+')',schedule:{at:new Date(e.when-d)}})})});
if(isS()){A.push({id:2000,title:'تقرير الحضور الأسبوعي',body:'افتح التطبيق لمتابعة نسب حضور المخدومين والافتقاد',schedule:{on:{weekday:3,hour:9,minute:0},allowWhileIdle:true}});
S.members.slice(0,300).forEach((x,i)=>{const b=nextBd(x.birth);if(!b)return;const dt=new Date(b.t.getFullYear(),b.t.getMonth(),b.t.getDate(),8,0);if(dt.getTime()>now&&dt.getTime()-now<60*864e5){const s=stat(x);A.push({id:1000+i,title:'🎂 عيد ميلاد '+x.name,body:'نسبة حضوره '+(s.p===null?'—':s.p+'%')+' — فرصة للافتقاد',schedule:{at:dt}})}})}
if(A.length)await LN.schedule({notifications:A})}catch(e){}}
// ---------- shell ----------
function nav(){const t=isS()?[['home','🏠','الرئيسية'],['members','👥','المخدومين'],['events','📅','الأحداث'],['report','📊','التقرير'],['set','⚙️','الإعدادات']]:[['home','🏠','الرئيسية'],['events','📅','الأحداث'],['board','🏆','الترتيب'],['me','👤','حسابي']];$('#nav').innerHTML=t.map(x=>`<button class="${tab===x[0]?'on':''}" onclick="go('${x[0]}')"><i>${x[1]}</i>${x[2]}${x[0]==='me'&&unread()?`<b>${unread()}</b>`:''}</button>`).join('')}
window.go=t=>{tab=t;cur=null;render(1)};
function render(f){if(!me)return;const a=document.activeElement;if(!f&&a&&['INPUT','TEXTAREA','SELECT'].includes(a.tagName))return;if($('#md').style.display==='flex'&&!f)return;nav();const y=scrollY;
const V=isS()?{home:sHome,members:sMembers,events:cur?sAtt:sEvents,report:sReport,set:sSet,rules:rules}:{home:mHome,events:mEvents,board:board,me:mMe,rules:rules};
$('#app').innerHTML=(V[tab]||mHome)();scrollTo(0,f?0:y)}
const vcard=()=>`<div class="card"><div class="vb" id="vb">${vtxt()}</div></div>`;
const cm=window.cm=()=>{$('#md').style.display='none';render(1)};
const om=h=>{$('#mb').innerHTML=h;$('#md').style.display='flex'};
// ---------- member views ----------
function nextEv(m){const n=Date.now(),c=C();return S.events.filter(e=>e.when+c.close*6e4>n&&(!m||e.choir==='all'||e.choir===m.choir)).sort((a,b)=>a.when-b.when)[0]}
function mHome(){const m=mem(),c=C();if(!m)return vcard()+`<div class="card hero"><h3>أهلاً ${esc(me.name)}</h3><div>رقمك لسه مش مسجّل عند الخادم. اطلب منه يضيفك بنفس رقم التليفون، وبعدها اخرج وادخل تاني.</div></div>`;
const e=nextEv(m),open=e&&calc(e,Date.now()),s=stat(m);
return`<h2>أهلاً يا ${esc(m.name.split(' ')[0])} 🎶</h2>${vcard()}<div class="card hero"><div class="s">رصيد نقاطك</div><div class="pts">${m.points||0}</div><div class="s">كورال ${CH[m.choir]||''} · نسبة حضورك ${s.p===null?'—':s.p+'%'}</div></div>
<div class="card"><h3>الحدث القادم</h3>${e?`<div class="row sp"><b>${TY[e.type][0]} ${esc(e.title)}</b></div><div class="s">${fmt(e.when)}</div>${e.note?`<div style="margin-top:6px">${esc(e.note)}</div>`:''}`:'<div class="s">مفيش أحداث قادمة</div>'}</div>
${open?`<button class="btn g" style="font-size:18px;padding:18px" onclick="scan()">📷 سجّل حضورك (مسح QR)</button><div class="s" style="text-align:center;margin:6px 0 12px">لو سجلت دلوقتي هتاخد ${open.pts} نقطة</div>`:e?`<div class="card"><div class="s">التسجيل بيفتح قبل الميعاد بـ ${c.open} دقيقة</div></div>`:''}
<button class="btn o" onclick="go('rules')">📜 قواعد الحضور والنقاط</button>`}
function mEvents(){const n=Date.now(),m=mem(),E=S.events.filter(e=>!m||e.choir==='all'||e.choir===m.choir),up=E.filter(e=>e.when+C().close*6e4>=n).sort((a,b)=>a.when-b.when),past=E.filter(e=>e.when+C().close*6e4<n).slice(0,6),row=e=>`<div class="li"><span style="font-size:24px">${TY[e.type][0]}</span><div style="flex:1"><b>${esc(e.title)}</b><div class="s">${fmt(e.when)} · ${e.choir==='all'?'الكل':CH[e.choir]}</div>${e.note?`<div class="s">${esc(e.note)}</div>`:''}</div></div>`;
return`<h2>الأحداث 📅</h2><div class="card"><h3>القادمة</h3>${up.map(row).join('')||'<div class="s">مفيش</div>'}</div><div class="card"><h3>السابقة</h3>${past.map(row).join('')||'<div class="s">مفيش</div>'}</div>`}
function board(){const m=mem(),k=bt||(m&&m.choir)||'all',L2=S.members.filter(x=>k==='all'||x.choir===k).sort((a,b)=>(b.points||0)-(a.points||0));
return`<h2>لوحة الترتيب 🏆</h2><div class="chips">${['all',...CHK].map(x=>`<button class="${k===x?'on':''}" onclick="setBt('${x}')">${x==='all'?'الكل':CH[x]}</button>`).join('')}</div><div class="card">${L2.map((x,i)=>`<div class="li" style="${m&&x.id===m.id?'background:#e3b85a22;border-radius:12px':''}"><b style="width:26px;color:var(--g)">${['🥇','🥈','🥉'][i]||i+1}</b>${av(x)}<span style="flex:1">${esc(x.name)}</span><b>${x.points||0}</b></div>`).join('')||'<div class="s">لسه مفيش أعضاء</div>'}</div>`}
window.setBt=k=>{bt=k;render(1)};window.setF=k=>{fch=k;render(1)};window.openEv=id=>{tab='events';cur=id;render(1)};
function mMe(){const m=mem();if(!m)return`<h2>${esc(me.name)}</h2><button class="btn o" onclick="out()">تسجيل خروج</button>`;const s=stat(m),e=elig(s.p),H=S.att.filter(x=>x.memberId===m.id).sort((a,b)=>b.at-a.at).slice(0,15);
localStorage.setItem('ns_'+uid,Date.now());
return`<div style="text-align:center">${av(m).replace('class="av"','class="av" style="width:90px;height:90px;font-size:34px;margin:6px auto"')}<h2 style="margin:6px 0">${esc(m.name)}</h2><div class="s">كورال ${CH[m.choir]||''}</div></div>
<div class="card"><div class="row sp"><div><div class="s">النقاط</div><b style="font-size:28px;color:var(--g)">${m.points||0}</b></div><span class="pill ${e[1]}">${e[0]}</span></div><div class="s" style="margin:10px 0 6px">نسبة الحضور ${s.p===null?'—':s.p+'%'} (${s.a} من ${s.t} بروفة)</div><div class="bar"><i style="width:${s.p||0}%"></i></div></div>
<div class="card"><h3>الإشعارات</h3>${S.notifs.sort((a,b)=>b.at-a.at).slice(0,12).map(n=>`<div class="li"><div><b>${esc(n.title)}</b><div class="s">${esc(n.body)}</div></div></div>`).join('')||'<div class="s">مفيش إشعارات</div>'}</div>
<div class="card"><h3>سجل الحضور</h3>${H.map(x=>`<div class="li"><span style="flex:1">${esc(x.title)}<div class="s">${fmt(x.when)}</div></span><b>+${x.pts}</b></div>`).join('')||'<div class="s">لسه</div>'}</div>
<button class="btn o" onclick="go('rules')">📜 القواعد</button><div style="height:8px"></div><button class="btn o" onclick="out()">تسجيل خروج</button>`}
function rules(){const c=C();return`<h2>قواعد الحضور والنقاط 📜</h2><div class="card" style="line-height:2"><div>• التسجيل بيفتح قبل ميعاد البروفة بـ <b>${c.open}</b> دقيقة.</div><div>• الحضور من وقت فتح التسجيل لحد ميعاد البروفة بالظبط = <b>${c.max}</b> نقط.</div><div>• بعد ميعاد البروفة بتتخصم نقطة كل <b>${c.step}</b> دقايق؛ وبعد <b>${c.max*c.step}</b> دقيقة تأخير النقاط = صفر.</div><div>• التسجيل بيتقفل بعد مرور <b>${c.close}</b> دقيقة من ميعاد البروفة؛ بعدها لا يضيف حضورًا إلا الخادم يدويًا.</div><div>• للخادم الحق يخصم نقط، وبيوصلك إشعار بالسبب.</div><div>• استحقاق الحفلات: نسبة حضور <b>${c.concert}%</b> فأكتر، والصولوهات: <b>${c.solo}%</b> فأكتر.</div></div><button class="btn o" onclick="go('${isS()?'set':'home'}')">رجوع</button>`}
// ---------- scan ----------
async function checkIn(eid,m,manual){let ev=S.events.find(x=>x.id===eid);if(!ev){const d=await getDoc(doc(db,'events',eid));if(!d.exists())return'الحدث غير موجود';ev={id:d.id,...d.data()}}
const id=eid+'_'+m.id,ref=doc(db,'attendance',id);if((await getDoc(ref)).exists())return'اتسجل حضورك قبل كده ✔';let r=calc(ev,Date.now());if(!r){if(!manual)return Date.now()<ev.when?'التسجيل لسه ماتفتحش':'التسجيل اتقفل، كلّم الخادم';r={pts:0,late:0}}
const b=writeBatch(db);b.set(ref,{eventId:eid,memberId:m.id,name:m.name,choir:m.choir,title:ev.title,when:ev.when,status:r.late>0?'l':'p',pts:r.pts,at:Date.now(),manual:!!manual});b.update(doc(db,'members',m.id),{points:increment(r.pts),attended:increment(1)});await b.commit();return{r}}
window.scan=async()=>{$('#scan').style.display='flex';scanner=new Html5Qrcode('rd');try{await scanner.start({facingMode:'environment'},{fps:10,qrbox:240},async t=>{if(!t.startsWith('KC|'))return;await stopScan();const x=await checkIn(t.slice(3),mem());if(typeof x==='string')toast(x,0);else toast(x.r.late?`اتسجل حضورك (متأخر ${x.r.late} د): +${x.r.pts} نقطة`:`🎉 حضور في الميعاد: +${x.r.pts} نقطة`)},()=>{})}catch(e){await stopScan();toast('اسمح للتطبيق بالكاميرا',0)}};
window.stopScan=async()=>{try{if(scanner){await scanner.stop();scanner.clear()}}catch(e){}scanner=null;$('#scan').style.display='none'};
// ---------- servant views ----------
function sHome(){const m=S.members,n=Date.now(),e=S.events.filter(x=>x.when+C().close*6e4>n).sort((a,b)=>a.when-b.when)[0],ps=m.map(x=>stat(x).p).filter(p=>p!==null),avg=ps.length?Math.round(ps.reduce((a,b)=>a+b)/ps.length):0,low=m.filter(x=>{const p=stat(x).p;return p!==null&&p<C().low}).length;
const bd=m.map(x=>({x,b:nextBd(x.birth)})).filter(o=>o.b&&o.b.days<=14).sort((a,b)=>a.b.days-b.b.days);
return`<h2>أهلاً يا ${esc(me.name.split(' ')[0])} 🙏</h2>${vcard()}<div class="card"><div class="row sp"><div><div class="s">المخدومين</div><b style="font-size:26px">${m.length}</b></div><div><div class="s">متوسط الحضور</div><b style="font-size:26px;color:var(--g)">${avg}%</b></div><div><div class="s">يحتاجون افتقاد</div><b style="font-size:26px;color:var(--no)">${low}</b></div></div></div>
<div class="card"><h3>الحدث القادم</h3>${e?`<b>${TY[e.type][0]} ${esc(e.title)}</b><div class="s">${fmt(e.when)}</div><div style="height:8px"></div><button class="btn g" onclick="openEv('${e.id}')">فتح تسجيل الحضور</button>`:'<div class="s">مفيش. أضف حدث من تبويب الأحداث.</div>'}</div>
<div class="card"><h3>🎂 أعياد ميلاد قريبة</h3>${bd.map(o=>{const s=stat(o.x);return`<div class="li">${av(o.x)}<div style="flex:1"><b>${esc(o.x.name)}</b><div class="s">${o.b.days===0?'النهارده 🎉':'بعد '+o.b.days+' يوم'} · ${o.b.age} سنة · حضور ${s.p===null?'—':s.p+'%'}</div></div><a class="btn sm o" href="${wa(o.x.phone)}" target="_blank">واتساب</a></div>`}).join('')||'<div class="s">مفيش في الأسبوعين الجايين</div>'}</div>`}
function sMembers(){const L2=S.members.filter(x=>fch==='all'||x.choir===fch).sort((a,b)=>a.name.localeCompare(b.name,'ar'));
return`<div class="row sp"><h2>المخدومين</h2><button class="btn sm g" onclick="mf()">+ إضافة</button></div><div class="chips">${['all',...CHK].map(x=>`<button class="${fch===x?'on':''}" onclick="setF('${x}')">${x==='all'?'الكل ('+S.members.length+')':CH[x]}</button>`).join('')}</div><div class="card">${L2.map(x=>{const s=stat(x);return`<div class="li" onclick="mv('${x.id}')">${av(x)}<div style="flex:1"><b>${esc(x.name)}</b><div class="s">${CH[x.choir]} · ${x.points||0} نقطة${x.uid?' · 📱':''}</div></div><b style="color:${col(s.p)}">${s.p===null?'—':s.p+'%'}</b></div>`}).join('')||'<div class="s">لسه مفيش مخدومين</div>'}</div>`}
window.mv=id=>{const x=S.members.find(m=>m.id===id),s=stat(x),e=elig(s.p),b=nextBd(x.birth);om(`<div style="text-align:center">${av(x).replace('class="av"','class="av" style="width:90px;height:90px;font-size:34px;margin:0 auto"')}<h2 style="margin:8px 0 2px">${esc(x.name)}</h2><div class="s">${CH[x.choir]} · ${esc(x.phone||'بدون رقم')}${b?' · ميلاد '+x.birth:''}</div></div><div class="card" style="margin-top:12px"><div class="row sp"><b style="font-size:26px;color:${col(s.p)}">${s.p===null?'—':s.p+'%'}</b><span class="pill ${e[1]}">${e[0]}</span></div><div class="s">${s.a} من ${s.t} بروفة · ${x.points||0} نقطة</div></div><div class="row w"><button class="btn sm o" onclick="location.href='tel:0${x.phone}'">📞 اتصال</button><button class="btn sm o" onclick="window.open('${wa(x.phone)}','_blank')">واتساب</button><button class="btn sm o" onclick="mf('${x.id}')">تعديل</button><button class="btn sm no" onclick="adj('${x.id}')">نقاط ±</button></div>`)};
window.ph=async inp=>{const f=inp.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=c.height=130;const g=c.getContext('2d'),s=Math.min(im.width,im.height);g.drawImage(im,(im.width-s)/2,(im.height-s)/2,s,s,0,0,130,130);tmpPhoto=c.toDataURL('image/jpeg',.6);if($('#pv'))$('#pv').innerHTML=`<img src="${tmpPhoto}">`};im.src=r.result};r.readAsDataURL(f)};
window.mf=id=>{const x=id?S.members.find(m=>m.id===id):{};tmpPhoto=x.photo||'';om(`<h3>${id?'تعديل':'إضافة'} مخدوم</h3><div class="row"><span class="av" id="pv" style="width:64px;height:64px">${x.photo?`<img src="${x.photo}">`:'📷'}</span><input type="file" accept="image/*" onchange="ph(this)" style="margin:0"></div><div style="height:8px"></div><input id="fn" placeholder="الاسم" value="${esc(x.name||'')}"><input id="fp" inputmode="tel" placeholder="رقم التليفون" value="${esc(x.phone?'0'+x.phone:'')}"><label>تاريخ الميلاد</label><input id="fb" type="date" value="${x.birth||''}"><label>الكورال</label><select id="fc">${CHK.map(k=>`<option value="${k}" ${x.choir===k?'selected':''}>${CH[k]}</option>`).join('')}</select><button class="btn g" onclick="sm('${id||''}')">حفظ</button>${id?`<div style="height:8px"></div><button class="btn no" onclick="dm('${id}')">حذف المخدوم</button>`:''}`)};
window.sm=async id=>{const n=$('#fn').value.trim();if(!n){toast('اكتب الاسم',0);return}const d={name:n,phone:norm($('#fp').value),birth:$('#fb').value,choir:$('#fc').value,photo:tmpPhoto};try{if(id)await updateDoc(doc(db,'members',id),d);else await addDoc(collection(db,'members'),{...d,uid:'',points:0,attended:0,added:Date.now()});$('#md').style.display='none';toast('تم الحفظ')}catch(e){toast('فشل الحفظ: تأكد من القواعد',0)}};
window.dm=async id=>{if(confirm('حذف المخدوم نهائيًا؟')){await deleteDoc(doc(db,'members',id));$('#md').style.display='none'}};
window.adj=async id=>{const v=parseInt(prompt('عدد النقاط (سالب للخصم، موجب للإضافة)'));if(!v)return;const why=v<0?prompt('سبب الخصم؟')||'':'';await updateDoc(doc(db,'members',id),{points:increment(v)});await addDoc(collection(db,'notifs'),{to:id,title:v<0?'تم خصم نقاط':'تمت إضافة نقاط',body:(v<0?'خصم '+(-v)+' نقطة':'إضافة '+v+' نقطة')+(why?' — '+why:''),at:Date.now()});$('#md').style.display='none';toast('تم')};
function sEvents(){const E=[...S.events].sort((a,b)=>b.when-a.when);return`<h2>الأحداث 📅</h2><div class="card"><h3>حدث جديد</h3><select id="et"><option value="rehearsal">بروفة</option><option value="concert">حفلة</option><option value="other">نشاط آخر</option></select><input id="ei" placeholder="العنوان (مثال: بروفة الأسبوع)"><label>الميعاد</label><input id="ew" type="datetime-local"><label>الكورال</label><select id="ec"><option value="all">الكل</option>${CHK.map(k=>`<option value="${k}">${CH[k]}</option>`).join('')}</select><input id="en" placeholder="ملاحظة (اختياري)"><button class="btn g" onclick="ne()">نشر وإبلاغ المخدومين</button></div><div class="card"><h3>كل الأحداث</h3>${E.map(e=>`<div class="li" onclick="openEv('${e.id}')"><span style="font-size:22px">${TY[e.type][0]}</span><div style="flex:1"><b>${esc(e.title)}</b><div class="s">${fmt(e.when)} · ${e.choir==='all'?'الكل':CH[e.choir]}</div></div></div>`).join('')||'<div class="s">مفيش</div>'}</div>`}
window.ne=async()=>{const t=$('#ei').value.trim(),w=$('#ew').value;if(!t||!w){toast('اكتب العنوان والميعاد',0);return}const e={type:$('#et').value,title:t,when:new Date(w).getTime(),choir:$('#ec').value,note:$('#en').value.trim(),created:Date.now()};await addDoc(collection(db,'events'),e);await addDoc(collection(db,'notifs'),{to:e.choir,title:TY[e.type][1]+' جديدة: '+t,body:'ميعادها '+fmt(e.when)+(e.note?' — '+e.note:''),at:Date.now()});toast('تم النشر')};
async function qrFor(id){if(S.qr[id])return;S.qr[id]=await QRCode.toDataURL('KC|'+id,{width:480,margin:1,color:{dark:'#0b1b3f'}});render()}
function sAtt(){const ev=S.events.find(e=>e.id===cur);if(!ev){cur=null;return sEvents()}qrFor(ev.id);const M=S.members.filter(x=>ev.choir==='all'||x.choir===ev.choir),A=Object.fromEntries(S.att.filter(a=>a.eventId===ev.id).map(a=>[a.memberId,a])),n=Object.keys(A).length,r=calc(ev,Date.now());
return`<div class="row sp"><h2>${TY[ev.type][0]} ${esc(ev.title)}</h2><button class="btn sm o" onclick="openEv(null)">رجوع</button></div><div class="card" style="text-align:center"><div class="s">${fmt(ev.when)} · ${r?'التسجيل مفتوح':'التسجيل مقفول'}</div>${S.qr[ev.id]?`<img class="qr" src="${S.qr[ev.id]}">`:''}<div class="s">الحضور ${n} من ${M.length}</div></div><div class="card"><h3>المخدومين (تسجيل يدوي)</h3>${M.map(x=>{const a=A[x.id];return`<div class="li">${av(x)}<span style="flex:1">${esc(x.name)}${a?`<div class="s">${a.status==='l'?'متأخر':'حاضر'} · +${a.pts}${a.manual?' · يدوي':''}</div>`:''}</span>${a?`<button class="btn sm o" onclick="ra('${a.id}','${x.id}',${a.pts})">✕</button>`:`<button class="btn sm g" onclick="ma('${x.id}')">حضر</button>`}</div>`}).join('')||'<div class="s">مفيش</div>'}</div><button class="btn no" onclick="de('${ev.id}')">حذف الحدث</button>`}
window.ma=async mid=>{const ev=S.events.find(e=>e.id===cur),x=await checkIn(ev.id,S.members.find(m=>m.id===mid),true);if(typeof x==='string')toast(x,0)};
window.ra=async(aid,mid,p)=>{if(!confirm('إلغاء تسجيل الحضور؟'))return;const b=writeBatch(db);b.delete(doc(db,'attendance',aid));b.update(doc(db,'members',mid),{points:increment(-p),attended:increment(-1)});await b.commit()};
window.de=async id=>{if(confirm('حذف الحدث؟ سجلات الحضور تفضل محفوظة.')){await deleteDoc(doc(db,'events',id));cur=null}};
function sReport(){const c=C(),R=S.members.map(x=>({x,a:stat(x),w:stat(x,7)})).sort((a,b)=>(a.a.p??101)-(b.a.p??101)),txt=R.map(o=>`${o.x.name}: ${o.a.p===null?'—':o.a.p+'%'}`).join('\n');window._rt=`تقرير حضور ${CFG.choir}\n${new Date().toLocaleDateString('ar-EG')}\n\n${txt}`;
return`<h2>تقرير الحضور 📊</h2><div class="s" style="margin-bottom:10px">التقرير الأسبوعي بيجيلك إشعار كل ثلاثاء الساعة 9 صباحًا. الأحمر = أقل من ${c.low}% (محتاج افتقاد).</div><button class="btn o" onclick="window.open('https://wa.me/?text='+encodeURIComponent(window._rt),'_blank')">مشاركة التقرير على واتساب</button><div style="height:12px"></div><div class="card">${R.map(o=>`<div class="li" onclick="mv('${o.x.id}')">${av(o.x)}<div style="flex:1"><b>${esc(o.x.name)}</b><div class="s">${CH[o.x.choir]} · الأسبوع: ${o.w.t?o.w.a+'/'+o.w.t:'—'}</div><div class="bar" style="margin-top:5px"><i style="width:${o.a.p||0}%;background:${col(o.a.p)}"></i></div></div><b style="color:${o.a.p!==null&&o.a.p<c.low?'var(--no)':col(o.a.p)}">${o.a.p===null?'—':o.a.p+'%'}</b></div>`).join('')||'<div class="s">لسه مفيش بيانات</div>'}</div>`}
function sSet(){const c=C();const f=(k,l)=>`<label>${l}</label><input id="c_${k}" type="number" value="${c[k]}">`;return`<h2>الإعدادات ⚙️</h2><div class="card"><h3>نظام النقاط</h3>${f('max','نقاط الحضور في الميعاد')}${f('step','خصم نقطة كل (دقيقة تأخير)')}${f('open','فتح التسجيل قبل البروفة بـ (دقيقة، حتى 30)')}${f('close','قفل التسجيل بعد البروفة بـ (دقيقة)')}<h3>الاستحقاق</h3>${f('concert','حد الحفلات (%)')}${f('solo','حد الصولو (%)')}${f('low','حد الافتقاد (%)')}<button class="btn g" onclick="sc()">حفظ</button></div>
<div class="card"><h3>إرسال إشعار للمخدومين</h3><select id="nt"><option value="all">الكل</option>${CHK.map(k=>`<option value="${k}">${CH[k]}</option>`).join('')}</select><input id="ni" placeholder="العنوان"><textarea id="nb" rows="2" placeholder="الرسالة"></textarea><button class="btn" onclick="sn()">إرسال</button></div>
<button class="btn o" onclick="go('rules')">📜 معاينة القواعد كما يراها المخدوم</button><div style="height:8px"></div><button class="btn o" onclick="out()">تسجيل خروج</button>`}
window.sc=async()=>{const d={};['max','step','open','close','concert','solo','low'].forEach(k=>d[k]=+$('#c_'+k).value);if(d.open>30||d.step<1||d.max<0){toast('راجع القيم (فتح التسجيل حتى 30 دقيقة)',0);return}await setDoc(doc(db,'config','main'),d,{merge:true});toast('تم الحفظ')};
window.sn=async()=>{const t=$('#ni').value.trim();if(!t){toast('اكتب العنوان',0);return}await addDoc(collection(db,'notifs'),{to:$('#nt').value,title:t,body:$('#nb').value.trim(),at:Date.now()});$('#ni').value=$('#nb').value='';toast('تم الإرسال')};

