/* ============================================================
   منصة حلقات الشيخ محمد البراك — النسخة الكاملة (بوابات متعددة)
   نموذج أولي عامل، بيانات في الذاكرة (Offline-first محاكاة)
   مطابقٌ لوثيقة SRS 4.0: RBAC(5)، قواعد التحفيظ(7)، المتطلبات(8)،
   التلعيب(9)، نموذج البيانات(11).
   ============================================================ */
const $ = s=>document.querySelector(s);
const arNum = n => Number(n).toLocaleString('ar-EG');

/* ---------- مراجع القواعد ---------- */
const ERR = {
  lafzi:{label:'خطأ لفظي',reps:100,cls:'err-lafzi'},
  adi:  {label:'خطأ عادي',reps:45, cls:'err-adi'},
  shak: {label:'شكّ',     reps:20, cls:'err-shak'}
};
const POINTS={present:5,dailyTarget:10,itqanPerPage:15,harvest:50,streakWeekly:20,dailyCap:40};
const SURAHS={2:'البقرة',3:'آل عمران',4:'النساء',5:'المائدة',6:'الأنعام',7:'الأعراف',8:'الأنفال',9:'التوبة'};

/* ---------- بيانات (بذور) ---------- */
const CIRCLES=[
  {id:'sabah',name:'حلقة الفجر',teacher:'أ. عبدالرحمن القحطاني',mosque:'جامع الإمام'},
  {id:'asr',  name:'حلقة العصر',teacher:'أ. عبدالرحمن القحطاني',mosque:'جامع الإمام'},
];
function mk(id,name,circle,age,surah,ayah,target,pts,streak,st,ach,guardian){
  return {id,name,circle,age,guardian,lastStop:{surah,ayah},dailyTarget:target,points:pts,streak,
    program:age<10?'معارج':age<14?'مراقي':'مُذّكِر',
    today:{status:st,achievedLines:ach,mistakes:{lafzi:0,adi:0,shak:0},itqan:false,done:st!=null,late:false}};
}
let STUDENTS=[
  mk(1,'محمد بن سعد الغامدي','sabah',12,2,183,10,128,6,'green',10,'g1'),
  mk(2,'عبدالله بن فهد العتيبي','sabah',11,2,142,10,95,4,'grad',6,'g1'),
  mk(3,'يوسف بن خالد الدوسري','sabah',13,3,45,15,210,9,'red',0,'g2'),
  mk(4,'إبراهيم بن ناصر القرني','sabah',9,2,88,8,64,2,'empty',null,'g3'),
  mk(5,'عمر بن تركي الشهري','sabah',12,2,201,10,150,7,'grad',7,'g2'),
  mk(6,'سلمان بن عايض الزهراني','sabah',11,4,12,10,88,3,null,null,'g3'),
  mk(7,'أنس بن ماجد الحربي','asr',12,5,3,10,172,8,'green',10,'g1'),
  mk(8,'زياد بن مشعل المطيري','asr',13,6,72,12,140,5,'grad',8,'g2'),
  mk(9,'فيصل بن بدر السبيعي','asr',10,2,255,10,60,1,'empty',null,'g3'),
  mk(10,'تركي بن نايف العنزي','asr',14,7,40,12,196,10,'green',12,'g1'),
];
const GUARDIANS={
  g1:{name:'أبو محمد الغامدي',phone:'0555•••123'},
  g2:{name:'أبو يوسف الدوسري',phone:'0555•••456'},
  g3:{name:'أبو إبراهيم القرني',phone:'0555•••789'},
};
let WAITLIST=[
  {id:'w1',name:'خالد بن عبدالعزيز المالكي',age:11,phone:'0554•••001',date:'٦ يوليو',status:'pending'},
  {id:'w2',name:'ريان بن سلطان العمري',age:9,phone:'0554•••002',date:'٧ يوليو',status:'pending'},
  {id:'w3',name:'عبدالإله بن حمد الشمري',age:13,phone:'0554•••003',date:'٨ يوليو',status:'pending'},
];
let PAYMENTS=[
  {id:'p1',payer:'أبو محمد الغامدي',amount:300,kind:'رسوم',target:'—',status:'ناجحة',date:'١ يوليو'},
  {id:'p2',payer:'داعم — م. سعد',amount:2000,kind:'تبرّع',target:'برنامج مُذّكِر',status:'ناجحة',date:'٣ يوليو'},
  {id:'p3',payer:'أبو يوسف الدوسري',amount:300,kind:'رسوم',target:'—',status:'مستردّة',date:'٤ يوليو'},
];
let REWARDS=[
  {id:'r1',name:'مصحف مجزّأ فاخر',cost:400,stock:5,ic:'📗'},
  {id:'r2',name:'قلم قرائي إلكتروني',cost:650,stock:3,ic:'🖊️'},
  {id:'r3',name:'حقيبة الحلقة',cost:250,stock:8,ic:'🎒'},
  {id:'r4',name:'بطاقة هدية مكتبة',cost:500,stock:4,ic:'🎁'},
  {id:'r5',name:'وسام المواظبة',cost:150,stock:20,ic:'🏅'},
  {id:'r6',name:'رحلة الحلقة',cost:800,stock:2,ic:'🚌'},
];
let NOTIFS=[
  {id:'n1',ev:'حاضر بلا إنجاز',to:'ولي الأمر',ch:'تطبيق + رسالة',when:'فور إغلاق الجلسة',time:'اليوم ٥:٤٠ ص',read:false,kind:'r'},
  {id:'n2',ev:'منح شارة إنجاز',to:'الطالب + ولي الأمر',ch:'تطبيق',when:'فور الاستحقاق',time:'أمس ٤:١٠ م',read:false,kind:'g'},
  {id:'n3',ev:'استحقاق رسوم',to:'ولي الأمر',ch:'تطبيق + رسالة',when:'قبل الاستحقاق ٣ أيام',time:'أمس ٩:٠٠ ص',read:true,kind:'a'},
  {id:'n4',ev:'تغيّب متكرر',to:'المشرف + ولي الأمر',ch:'تطبيق',when:'نهاية اليوم',time:'٧ يوليو',read:true,kind:'r'},
];
let AUDIT=[
  {who:'أ. عبدالرحمن',act:'رصد حضور وإنجاز — محمد الغامدي',time:'٥:٣٥ ص'},
  {who:'إداري — شؤون الطالب',act:'قبول طالب من قائمة الانتظار',time:'أمس ٨:٢٠ م'},
  {who:'النظام',act:'منح ٥٠ نقطة — اجتياز حصاد (تركي العنزي)',time:'أمس ٤:٠٠ م'},
];
let HARVEST=[
  {id:'h1',student:'تركي بن نايف العنزي',parts:10,scope:'جزء عمّ كاملاً',status:'بانتظار',note:''},
  {id:'h2',student:'أنس بن ماجد الحربي',parts:5,scope:'سورة المائدة ١–٥٠',status:'بانتظار',note:''},
];

/* ---------- الأدوار وقوائمها ---------- */
const ROLES={
  general:{name:'المشرف العام',who:'د. المشرف العام',nav:[
    ['الإشراف',[['dash','📊','لوحة القيادة'],['reports','📈','التقارير والمؤشرات'],['audit','🛡️','سجل التدقيق']]],
    ['التشغيل',[['exchange','📿','بورصة الإنجاز'],['admissions','📝','القبول والانتظار','wl'],['excuses','📄','الأعذار'],['linking','🔗','الربط والمراجعة']]],
    ['التربية',[['market','🛒','سوق الحلقة'],['kiosk','🖥️','شاشة المسجد'],['notif','🔔','الإشعارات','nf']]],
    ['المالية',[['finance','💳','البوابة المالية']]],
  ]},
  teacher:{name:'معلم الحلقة',who:'أ. عبدالرحمن القحطاني',nav:[
    ['الحلقة',[['tasmee','📖','التسميع اليومي'],['sheet','📋','ورقة المتابعة'],['exchange','📿','بورصة الإنجاز']]],
    ['أدوات',[['linking','🔗','الربط والمراجعة'],['excuses','📄','الأعذار'],['notif','🔔','الإشعارات','nf']]],
  ]},
  admin:{name:'الإداري (شؤون الطالب)',who:'أ. ماجد — شؤون الطالب',nav:[
    ['القبول',[['admissions','📝','القبول والانتظار','wl'],['excuses','📄','إدارة الأعذار']]],
    ['المتابعة',[['dash','📊','لوحة القيادة'],['reports','📈','التقارير'],['notif','🔔','الإشعارات','nf']]],
  ]},
  examiner:{name:'المُسمِّع (الحصاد)',who:'الشيخ المُسمِّع',nav:[
    ['الحصاد',[['harvest','🌾','جلسات الحصاد'],['exchange','📿','بورصة الإنجاز']]],
  ]},
  parent:{name:'ولي الأمر',who:'أبو محمد الغامدي',nav:[
    ['أبنائي',[['children','👨‍👦','أبنائي ومتابعتهم'],['approvals','✅','الموافقات والدفع']]],
    ['حساب',[['notif','🔔','الإشعارات','nf']]],
  ]},
  student:{name:'الطالب البالغ',who:'أنس بن ماجد الحربي',nav:[
    ['برنامجي',[['myprog','📚','برنامجي ونقاطي'],['market','🛒','سوق الحلقة'],['qr','🔳','سجل QR']]],
  ]},
  sponsor:{name:'الداعم / الكافل',who:'م. سعد — داعم',nav:[
    ['الأثر',[['impact','🤝','تقارير الأثر']]],
  ]},
};
let ROLE='teacher', VIEW='tasmee', activeCircle='sabah', sheetStudent=1, marketStudent=7, childSel=1;

/* ---------- عناوين الشاشات ---------- */
const TITLES={
  dash:['لوحة القيادة','نظرةٌ حيّة على حال الحلقات اليوم'],
  reports:['التقارير ومؤشرات النجاح','قياسٌ حيّ مقابل أهداف الوثيقة'],
  audit:['سجل التدقيق','توثيقُ العمليات الحسّاسة — SRS 10.7'],
  exchange:['بورصة الإنجاز اليومية','تصوّرٌ حيّ لوضع كل الطلاب اليوم — FR-ADM-01'],
  admissions:['القبول وقائمة الانتظار','مراجعة الطلبات وإدارة الانتظار — FR-ADM-04'],
  excuses:['إدارة الأعذار','تسجيل الأعذار وأثرها على الحضور — SRS 7.9'],
  linking:['الربط والمراجعة','ضبط جدولَي الربط والمراجعة — FR-ADM-02'],
  market:['سوق الحلقة','استبدال النقاط بجوائز عينية — SRS 9.5'],
  kiosk:['شاشة المسجد','لوحات شرفية للإتقان والمواظبة — FR-SCR-01'],
  notif:['الإشعارات','إشعاراتٌ موجّهة بالحدث — FR-NTF-01'],
  finance:['البوابة المالية','دفعٌ آمن وتوجيه الدعم — FR-FIN-01'],
  tasmee:['بوابة المعلم — التسميع اليومي','رصدٌ بلمسة وتحديدٌ تلقائي لآية البدء'],
  sheet:['ورقة المتابعة الشهرية','مخرَجٌ إلزامي يُنتجه النظام تلقائياً — SRS 7.7'],
  harvest:['جلسات الحصاد','سرد الطالب واعتماد الاجتياز — FR-EXM-01'],
  children:['أبنائي ومتابعتهم','متابعةٌ لحظية بالألوان — FR-PAR-01'],
  approvals:['الموافقات والدفع والتبرّع','موافقاتٌ ودفعٌ إلكتروني — FR-PAR-02'],
  myprog:['برنامجي ونقاطي','مقرراتي وخطتي ورصيد نقاطي — FR-STU-01'],
  qr:['سجل الطالب (QR)','رابطٌ موقّت يفتح سجلي — FR-REC-01'],
  impact:['تقارير الأثر','أثرٌ دوريّ بأرقام دون بيانات حسّاسة — FR-SPN-01'],
};

/* ---------- أدوات ---------- */
function circleStudents(c=activeCircle){return STUDENTS.filter(x=>x.circle===c);}
function achievePct(l,t){return t>0?Math.min(999,Math.round(l/t*100)):0;}
function statusClass(st){return st==='green'?'st-green':st==='red'?'st-red':st==='grad'?'st-grad':'st-empty';}
function barColor(st){return st==='green'?'var(--green)':st==='red'?'var(--red)':st==='grad'?'var(--amber)':'#ddd';}
function unreadNotif(){return NOTIFS.filter(n=>!n.read).length;}
function logAudit(who,act){AUDIT.unshift({who,act,time:'الآن'});DB.log(who,act);}

/* ---------- بناء القائمة الجانبية حسب الدور ---------- */
function buildRoleSelect(){
  $('#roleSel').innerHTML=Object.entries(ROLES).map(([k,r])=>`<option value="${k}" ${k===ROLE?'selected':''}>${r.name}</option>`).join('');
}
function buildNav(){
  const r=ROLES[ROLE];
  $('#nav').innerHTML=r.nav.map(([grp,items])=>`<div class="grp">${grp}</div>`+items.map(it=>{
    const [v,ic,label,badge]=it;
    let cnt='';
    if(badge==='wl') cnt=`<span class="cnt">${arNum(WAITLIST.filter(w=>w.status==='pending').length)}</span>`;
    if(badge==='nf'&&unreadNotif()) cnt=`<span class="cnt">${arNum(unreadNotif())}</span>`;
    return `<button data-v="${v}" class="${v===VIEW?'active':''}" onclick="switchTo('${v}')"><span class="ic">${ic}</span> ${label}${cnt}</button>`;
  }).join('')).join('');
  $('#whoName').textContent=r.who;
  $('#bellCnt').textContent=arNum(unreadNotif());
  $('#bellCnt').style.display=unreadNotif()?'flex':'none';
}
function switchRole(r){
  ROLE=r; VIEW=ROLES[r].nav[0][1][0][0];
  buildNav(); render();
  document.getElementById('sidebar').classList.remove('open');
}
function switchTo(v){ VIEW=v; buildNav(); render(); document.getElementById('sidebar').classList.remove('open'); }

/* ---------- الراوتر ---------- */
function render(){
  $('#viewTitle').textContent=TITLES[VIEW]?TITLES[VIEW][0]:'';
  $('#viewSub').textContent=TITLES[VIEW]?TITLES[VIEW][1]:'';
  const c=$('#content');
  const map={dash:renderDash,reports:renderReports,audit:renderAudit,exchange:renderExchange,
    admissions:renderAdmissions,excuses:renderExcuses,linking:renderLinking,market:renderMarket,
    kiosk:renderKiosk,notif:renderNotif,finance:renderFinance,tasmee:renderTasmee,sheet:renderSheet,
    harvest:renderHarvest,children:renderChildren,approvals:renderApprovals,myprog:renderMyprog,
    qr:renderQR,impact:renderImpact};
  (map[VIEW]||renderDash)(c);
}

/* ============================================================
   1) التسميع اليومي (بوابة المعلم)
   ============================================================ */
function computeKPIs(c=activeCircle){
  const cs=circleStudents(c);
  const marked=cs.filter(x=>x.today.done);
  const present=cs.filter(x=>['green','grad','red'].includes(x.today.status));
  const full=cs.filter(x=>x.today.status==='green');
  return {attendPct:cs.length?Math.round(marked.length/cs.length*100):0,
    itqanPct:present.length?Math.round(full.length/present.length*100):0,
    present:present.length,total:cs.length,avgTime:12};
}
function renderTasmee(c){
  const k=computeKPIs(); const cs=circleStudents();
  c.innerHTML=`
  <div class="kpis">
    <div class="kpi ${k.attendPct>=95?'ok':'warn'}"><div class="v">${arNum(k.attendPct)}%</div><div class="l">اكتمال الحضور اليوم</div><div class="t">الهدف ≥ ٩٥٪</div></div>
    <div class="kpi ${k.itqanPct>=85?'ok':'warn'}"><div class="v">${arNum(k.itqanPct)}%</div><div class="l">دقّة الإتقان</div><div class="t">الهدف ≥ ٨٥٪</div></div>
    <div class="kpi ok"><div class="v">${arNum(k.avgTime)} ث</div><div class="l">متوسط زمن التسميع</div><div class="t">الهدف ≤ ١٥ ث</div></div>
    <div class="kpi"><div class="v">${arNum(k.present)}/${arNum(k.total)}</div><div class="l">الحاضرون</div><div class="t" style="color:#9a9482">تحديث لحظي</div></div>
  </div>
  <div class="tabbar">${CIRCLES.map(cc=>`<button class="${cc.id===activeCircle?'active':''}" onclick="activeCircle='${cc.id}';render()">${cc.name}<small>${cc.mosque} ، ${arNum(STUDENTS.filter(s=>s.circle===cc.id).length)} طلاب</small></button>`).join('')}</div>
  <div class="legend"><span><i class="sw green"></i> إنجاز كامل ١٠٠٪+</span><span><i class="sw grad"></i> إنجاز جزئي</span><span><i class="sw red"></i> حاضر بلا إنجاز</span><span><i class="sw empty"></i> غائب / لم يُرصد</span></div>
  <div class="grid">${cs.map(studentCard).join('')}</div>`;
}
function studentCard(st){
  const t=st.today;
  const pct=t.status==='green'?100:t.status==='grad'?achievePct(t.achievedLines,st.dailyTarget):0;
  return `<div class="scard" onclick="openTasmee(${st.id})">
    <span class="status ${statusClass(t.status)}" style="--p:${pct}%"></span>
    <h4>${st.name.split(' ').slice(0,2).join(' ')}</h4>
    <div class="meta">${SURAHS[st.lastStop.surah]} ، هدف اليوم ${arNum(st.dailyTarget)} أسطر</div>
    <div class="bar"><i style="width:${Math.min(100,pct)}%;background:${barColor(t.status)}"></i></div>
    <div class="prog"><span>${t.done?(t.status==='red'?'حاضر — بلا إنجاز':t.status==='empty'?'غائب':'أُنجز '+arNum(pct)+'٪'):'لم يُسمّع بعد'}</span></div>
    <div class="pts">◆ ${arNum(st.points)} نقطة${st.streak>=7?' ، 🔥 مواظبة':''}</div></div>`;
}
/* نافذة التسميع */
let cur=null,tmrInt=null;
function openTasmee(id){
  const st=STUDENTS.find(x=>x.id===id);
  cur={student:st,status:st.today.status,startAyah:st.lastStop.ayah,
    stopAyah:st.lastStop.ayah+st.dailyTarget-1,mistakes:{lafzi:0,adi:0,shak:0},itqan:st.today.itqan,openedAt:Date.now()};
  drawModal(); $('#overlay').classList.add('show');
}
function closeModal(){$('#overlay').classList.remove('show');clearInterval(tmrInt);cur=null;}
$('#overlay').addEventListener('click',e=>{if(e.target.id==='overlay')closeModal();});
function drawModal(){
  const st=cur.student, lines=Math.max(0,cur.stopAyah-cur.startAyah+1), pct=achievePct(lines,st.dailyTarget);
  const achState=(cur.status==='red'||lines===0)?'none':pct>=100?'':'part';
  const tot=cur.mistakes.lafzi+cur.mistakes.adi+cur.mistakes.shak;
  $('#modal').innerHTML=`
  <div class="modal-h"><div><h3>${st.name}</h3><small>${CIRCLES.find(x=>x.id===st.circle).name} ، ${SURAHS[st.lastStop.surah]}</small></div><button class="x" onclick="closeModal()">×</button></div>
  <div class="modal-b">
    <div class="sec"><div class="lbl">١ ، رصد الحضور <span style="font-weight:500;color:#9a9482;font-size:11px">(لمسة واحدة)</span></div>
      <div class="chips">
        <button class="chip ${cur.status&&!['abs','exc','late'].includes(cur.status)?'on-present':''}" onclick="setStatus('present')">✓ حاضر</button>
        <button class="chip ${cur.status==='late'?'on-late':''}" onclick="setStatus('late')">⏱ متأخر</button>
        <button class="chip ${cur.status==='exc'?'on-exc':''}" onclick="setStatus('exc')">📄 مستأذن</button>
        <button class="chip ${cur.status==='abs'?'on-abs':''}" onclick="setStatus('abs')">✕ غائب</button>
      </div></div>
    <div class="sec"><div class="lbl">٢ ، المقرر — تحديد آية البدء بالتوقّف السابق</div>
      <div class="ayahbox">
        <div class="ayahrow"><div class="from">من <b class="quran">﴿${SURAHS[st.lastStop.surah]} : ${arNum(cur.startAyah)}﴾</b> <span class="autochip">↺ تلقائي من آخر توقّف</span></div>
          <div class="from">هدف اليوم: <b>${arNum(st.dailyTarget)}</b> أسطر</div></div>
        <div class="stepper"><button onclick="stepStop(-1)">−</button><div class="val">آية التوقّف: ${arNum(cur.stopAyah)}<small>${arNum(lines)} سطر مُسمّع</small></div><button onclick="stepStop(1)">+</button></div>
      </div>
      <div class="achieve ${achState}"><div><div class="lbl2">الإنجاز الفوري</div><div class="big">${['abs','exc'].includes(cur.status)?'—':arNum(pct)+'٪'}</div></div>
        <div style="text-align:end"><div class="lbl2">${pct>=100?'ما شاء الله — إنجاز كامل':pct>0?'إنجاز جزئي':'بلا إنجاز'}</div><div style="font-size:12px;font-weight:700;color:#7a745f">${arNum(lines)} / ${arNum(st.dailyTarget)} سطر</div></div></div>
    </div>
    <div class="sec"><div class="lbl">٣ ، تسجيل الأخطاء وتصنيفها <span style="font-weight:500;color:#9a9482;font-size:11px">(يربط تكراراً إلزامياً — SRS 7.3)</span></div>
      <div class="errbtns">${Object.entries(ERR).map(([k,e])=>`<button class="errbtn ${e.cls}" onclick="addErr('${k}')"><div class="n">${e.label}</div><div class="r">${arNum(e.reps)} تكرار إلزامي</div><div class="cnt">${arNum(cur.mistakes[k])}</div></button>`).join('')}</div>
      ${tot>0?`<div class="tasklist">${Object.entries(cur.mistakes).filter(([k,v])=>v>0).map(([k,v])=>`<div class="taskrow"><span>مهمة تكرار — ${ERR[k].label} ×${arNum(v)}</span><span class="pill">${arNum(v*ERR[k].reps)} تكرار إجمالي</span></div>`).join('')}</div>`:''}
    </div>
    <div class="sec"><div class="lbl">٤ ، خمسة الإتقان <span style="font-weight:500;color:#9a9482;font-size:11px">(SRS 7.4)</span></div>
      <div class="itqan ${cur.itqan?'on':''}" onclick="toggleItqan()"><div class="box">${cur.itqan?'✓':''}</div>
        <div><div class="t">اعتماد الحفظ — أول ٥ تكرارات بلا خطأ ولا شكّ</div><div class="d">${tot>0?'⚠ يوجد خطأ/شكّ ضمن الخمسة → يُصفَّر العدّاد':'جاهز للاعتماد (+'+arNum(POINTS.itqanPerPage)+' نقطة إتقان)'}</div></div></div>
    </div>
  </div>
  <div class="modal-f"><div class="timer">⏱ زمن الإدخال: <b id="tmr">٠ ث</b></div>
    <button class="btn btn-g" onclick="closeModal()">إلغاء</button><button class="btn btn-p btn-save" onclick="saveTasmee()">حفظ التسميع ◂</button></div>`;
  clearInterval(tmrInt);
  tmrInt=setInterval(()=>{const el=$('#tmr');if(!el||!cur){clearInterval(tmrInt);return;}el.textContent=arNum(Math.round((Date.now()-cur.openedAt)/1000))+' ث';},1000);
}
function redraw(){const o=cur.openedAt;drawModal();cur.openedAt=o;}
function setStatus(s){cur.status=s==='present'?'green':s;redraw();}
function stepStop(d){cur.stopAyah=Math.max(cur.startAyah-1,cur.stopAyah+d);
  const l=Math.max(0,cur.stopAyah-cur.startAyah+1),p=achievePct(l,cur.student.dailyTarget);
  if(!['abs','exc'].includes(cur.status))cur.status=p>=100?'green':p>0?'grad':'red';redraw();}
function addErr(k){cur.mistakes[k]++;if(cur.itqan)cur.itqan=false;redraw();}
function toggleItqan(){const t=cur.mistakes.lafzi+cur.mistakes.adi+cur.mistakes.shak;
  if(t>0){toast('⚠','لا يصح الاعتماد','يوجد خطأ أو شكّ ضمن خمسة الإتقان — يُصفَّر العدّاد');return;}cur.itqan=!cur.itqan;redraw();}
function saveTasmee(){
  const st=cur.student,t=st.today,lines=Math.max(0,cur.stopAyah-cur.startAyah+1),pct=achievePct(lines,st.dailyTarget);
  const secs=Math.round((Date.now()-cur.openedAt)/1000);
  if(cur.status==='abs'||cur.status==='exc'){t.status='empty';t.done=true;t.achievedLines=0;}
  else{t.status=pct>=100?'green':pct>0?'grad':'red';t.achievedLines=lines;t.late=cur.status==='late';t.done=true;if(lines>0)st.lastStop.ayah=cur.stopAyah+1;}
  t.mistakes={...cur.mistakes};t.itqan=cur.itqan;
  let earned=0;const dt=[];
  if(['green','grad','red'].includes(t.status)&&cur.status!=='late'){earned+=POINTS.present;dt.push('حضور في وقته +'+POINTS.present);}
  if(t.status==='green'){earned+=POINTS.dailyTarget;dt.push('الهدف اليومي +'+POINTS.dailyTarget);}
  if(cur.itqan){earned+=POINTS.itqanPerPage;dt.push('إتقان +'+POINTS.itqanPerPage);}
  if(earned>POINTS.dailyCap){earned=POINTS.dailyCap;dt.push('(سقف يومي '+POINTS.dailyCap+')');}
  st.points+=earned; if(t.status==='green')st.streak++;
  DB.saveSession({studentId:st.id,points:st.points,streak:st.streak,lastStopAyah:st.lastStop.ayah,
    startAyah:cur.startAyah,stopAyah:cur.stopAyah,lines,attendance:cur.status,itqan:t.itqan,
    performance:t.itqan?'itqan':t.status==='green'?'jayyid':'needs_review',mistakes:t.mistakes,earned,reason:dt.join('، ')});
  logAudit('أ. عبدالرحمن','رصد حضور وإنجاز — '+st.name.split(' ').slice(0,2).join(' '));
  if(t.status==='red'){NOTIFS.unshift({id:'n'+Date.now(),ev:'حاضر بلا إنجاز — '+st.name.split(' ')[0],to:'ولي الأمر',ch:'تطبيق + رسالة',when:'فور إغلاق الجلسة',time:'الآن',read:false,kind:'r'});}
  const em=t.status==='green'?'🌿':t.status==='red'?'💛':'📖';
  const head=t.status==='green'?'تقبّل الله — إنجازٌ كامل':t.status==='red'?'حاضرٌ نحتسبه — نتابع':t.status==='empty'?'سُجّل الغياب/العذر':'أُنجز جزءٌ من المقرر';
  const sub=`زمن الإدخال ${arNum(secs)} ث`+(earned>0?` ، +${arNum(earned)} نقطة (${dt.join('، ')})`:'');
  closeModal(); buildNav(); render(); toast(em,head,sub);
}

/* ============================================================
   2) ورقة المتابعة الشهرية
   ============================================================ */
function renderSheet(c){
  const st=STUDENTS.find(x=>x.id===sheetStudent);
  const days=['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس'];
  const rows=days.map((d,i)=>{
    const stt=i===5?st.today.status:(i%4===0?'red':'green');
    const page=arNum(st.lastStop.ayah-(5-i)*4);
    const tag=stt==='green'?'<span class="tag g">متقن</span>':stt==='red'?'<span class="tag r">حاضر بلا إنجاز</span>':'<span class="tag a">جيّد</span>';
    return `<tr><td class="s">${d} ${arNum(9+i)} يوليو</td><td>${page}</td><td>${arNum(2)} وجه</td><td>${tag}</td><td>${i%4===0?'خطأ عادي ×١':'—'}</td><td>${i%3===0?'شكّ ×١':'—'}</td></tr>`;
  }).join('');
  c.innerHTML=`
  <div class="note"><b>مخرَجٌ إلزامي:</b> يُنتج النظام هذه الورقة تلقائياً من سجل التسميع (التاريخ، الصفحة، محفوظ الأمس، الربط، المراجعة، الأخطاء/الشكوك) مع خانة ملاحظات المشرف — نموذج «مُذّكِر» في الملحق (أ).</div>
  <div class="selrow">${STUDENTS.map(x=>`<button class="${x.id===sheetStudent?'active':''}" onclick="sheetStudent=${x.id};render()">${x.name.split(' ').slice(0,2).join(' ')}</button>`).join('')}</div>
  <div class="panel"><div class="panel-h"><h3>${st.name}</h3><span class="hint">${CIRCLES.find(x=>x.id===st.circle).name} ، الرواية: حفص ، ◆ ${arNum(st.points)} نقطة ، 🔥 مواظبة ${arNum(st.streak)} يوم</span>
    <button class="btn btn-o btn-sm" onclick="toast('📄','تصدير PDF','تُصدَّر ورقة المتابعة وتُشارَك مع ولي الأمر')">⬇ تصدير PDF</button></div>
    <div class="panel-b" style="padding:0;overflow:auto"><table><thead><tr><th>اليوم والتاريخ</th><th>الصفحة</th><th>الجديد</th><th>تقييم التجويد</th><th>الأخطاء</th><th>الشكوك</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

/* ============================================================
   3) لوحة القيادة
   ============================================================ */
function allKPIs(){
  const all=STUDENTS,marked=all.filter(x=>x.today.done);
  const present=all.filter(x=>['green','grad','red'].includes(x.today.status));
  const full=all.filter(x=>x.today.status==='green');
  return{attend:Math.round(marked.length/all.length*100),
    itqan:present.length?Math.round(full.length/present.length*100):0,
    struggling:all.filter(x=>x.today.status==='red').length,
    present:present.length,total:all.length,
    points:all.reduce((a,b)=>a+b.points,0)};
}
function renderDash(c){
  const k=allKPIs();
  c.innerHTML=`
  <div class="kpis">
    <div class="kpi ${k.attend>=95?'ok':'warn'}"><div class="v">${arNum(k.attend)}%</div><div class="l">اكتمال الحضور</div><div class="t">الهدف ≥ ٩٥٪</div></div>
    <div class="kpi ${k.itqan>=85?'ok':'warn'}"><div class="v">${arNum(k.itqan)}%</div><div class="l">دقّة الإتقان</div><div class="t">الهدف ≥ ٨٥٪</div></div>
    <div class="kpi"><div class="v">${arNum(k.present)}/${arNum(k.total)}</div><div class="l">الحاضرون اليوم</div><div class="t" style="color:#9a9482">في حلقتين</div></div>
    <div class="kpi ${k.struggling?'bad':'ok'}"><div class="v">${arNum(k.struggling)}</div><div class="l">مؤشرات تعثّر</div><div class="t" style="color:${k.struggling?'var(--red)':'var(--green)'}">${k.struggling?'تحتاج متابعة':'لا يوجد'}</div></div>
    <div class="kpi"><div class="v">${arNum(WAITLIST.filter(w=>w.status==='pending').length)}</div><div class="l">بانتظار القبول</div><div class="t" style="color:var(--amber)">مراجعة مطلوبة</div></div>
    <div class="kpi"><div class="v">${arNum(k.points)}</div><div class="l">مجموع نقاط الطلاب</div><div class="t" style="color:#9a9482">سقف يومي ٤٠</div></div>
  </div>
  <div class="grid2">
    <div class="panel"><div class="panel-h"><h3>الحلقات</h3><span class="hint">اليوم</span></div><div class="panel-b">
      ${CIRCLES.map(cc=>{const kk=computeKPIs(cc.id);return `<div class="lrow"><div class="av">📿</div><div class="info"><div class="t">${cc.name}</div><div class="d">${cc.mosque} ، ${cc.teacher}</div></div><div style="text-align:end"><div style="font-weight:800;color:var(--olive)">${arNum(kk.present)}/${arNum(kk.total)} حاضر</div><div style="font-size:11px;color:#9a9482">إتقان ${arNum(kk.itqanPct)}٪</div></div></div>`;}).join('')}
    </div></div>
    <div class="panel"><div class="panel-h"><h3>أحدث النشاط</h3><span class="hint">سجل التدقيق</span></div><div class="panel-b">
      ${AUDIT.slice(0,5).map(a=>`<div class="lrow"><div class="av">🛡️</div><div class="info"><div class="t" style="font-size:13px">${a.act}</div><div class="d">${a.who} ، ${a.time}</div></div></div>`).join('')}
    </div></div>
  </div>`;
}

/* ============================================================
   4) التقارير والمؤشرات
   ============================================================ */
function ring(pct,color){const r=50,cc=2*Math.PI*r,off=cc-(Math.min(100,pct)/100)*cc;
  return `<svg width="116" height="116"><circle cx="58" cy="58" r="${r}" stroke="#eee6d4" stroke-width="12" fill="none"/><circle cx="58" cy="58" r="${r}" stroke="${color}" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="${cc}" stroke-dashoffset="${off}"/><text x="58" y="58" transform="rotate(90 58 58)" text-anchor="middle" dy="7" font-size="23" font-weight="700" fill="var(--olive)" font-family="IBM Plex Sans Arabic,Tajawal,sans-serif">${arNum(pct)}%</text></svg>`;}
function renderReports(c){
  const k=allKPIs(),bqa=Math.min(99,Math.round(k.present/k.total*100)+8);
  c.innerHTML=`
  <div class="note"><b>لا يُحكم بالنجاح انطباعاً:</b> يقيس النظام كل مؤشر بصيغته ومصدره ودوريّته (SRS 2.3). القيم تُحسب حيّاً من تسميع اليوم.</div>
  <div class="panel"><div class="panel-h"><h3>مؤشرات النجاح مقابل أهداف الوثيقة</h3><span class="hint">تحديث لحظي</span></div><div class="panel-b"><div class="ringwrap">
    <div class="ring">${ring(bqa,'var(--green)')}<div class="lab">بقاء الطلاب</div><div class="sub2">الهدف ≥ ٨٠٪ ، شهري</div></div>
    <div class="ring">${ring(k.itqan,k.itqan>=85?'var(--green)':'var(--amber)')}<div class="lab">دقّة الإتقان</div><div class="sub2">الهدف ≥ ٨٥٪ ، شهري</div></div>
    <div class="ring">${ring(k.attend,k.attend>=95?'var(--green)':'var(--amber)')}<div class="lab">اكتمال الحضور</div><div class="sub2">الهدف ≥ ٩٥٪ ، يومي</div></div>
    <div class="ring">${ring(80,'var(--green)')}<div class="lab">تفاعل ولي الأمر</div><div class="sub2">الهدف ≥ ٦٠٪ ، أسبوعي</div></div>
  </div></div></div>
  <div class="kpis">
    <div class="kpi ok"><div class="v">${arNum(12)} ث</div><div class="l">زمن التسميع (P95)</div><div class="t">الهدف ≤ ١٥ ث</div></div>
    <div class="kpi ok"><div class="v">١٫٤ ث</div><div class="l">تحميل شاشة التسميع</div><div class="t">الهدف ≤ ٢ ث</div></div>
    <div class="kpi"><div class="v">${arNum(k.points)}</div><div class="l">مجموع النقاط</div><div class="t" style="color:#9a9482">سقف يومي ٤٠</div></div>
    <div class="kpi ${k.struggling?'bad':'ok'}"><div class="v">${arNum(k.struggling)}</div><div class="l">تعثّر اليوم</div><div class="t" style="color:${k.struggling?'var(--red)':'var(--green)'}">متابعة أسرية</div></div>
  </div>
  <div class="panel"><div class="panel-h"><h3>تقارير متعددة المستويات (FR-ADM-03)</h3></div><div class="panel-b" style="display:flex;gap:10px;flex-wrap:wrap">
    ${['يومي','أسبوعي','تراكمي','فصلي'].map(t=>`<button class="btn btn-g btn-sm" onclick="toast('📈','تقرير ${t}','تصدير PDF ورابط مشاركة — قابل للتخصيص بالمستوى')">${t}</button>`).join('')}
    <button class="btn btn-o btn-sm" onclick="toast('⬇','تصدير','PDF + رابط مشاركة')">⬇ تصدير PDF</button>
  </div></div>`;
}

/* ============================================================
   5) بورصة الإنجاز اليومية (FR-ADM-01)
   ============================================================ */
function renderExchange(c){
  c.innerHTML=`
  <div class="note"><b>تصوّرٌ مباشر:</b> المطلوب مقابل الفعلي بتمييزٍ لوني، لكل الطلاب في الحلقتين — لرصد المتعثّر مبكراً.</div>
  <div class="legend"><span><i class="sw green"></i> أنجز الهدف</span><span><i class="sw grad"></i> جزئي</span><span><i class="sw red"></i> حاضر بلا إنجاز</span><span><i class="sw empty"></i> غائب</span></div>
  ${CIRCLES.map(cc=>`<div class="panel"><div class="panel-h"><h3>${cc.name}</h3><span class="hint">${arNum(circleStudents(cc.id).filter(s=>s.today.status==='green').length)} أنجزوا الهدف كاملاً</span></div>
    <div class="panel-b"><div class="grid">${circleStudents(cc.id).map(st=>{const t=st.today;const pct=t.status==='green'?100:t.status==='grad'?achievePct(t.achievedLines,st.dailyTarget):0;
      return `<div class="scard" style="cursor:default"><span class="status ${statusClass(t.status)}" style="--p:${pct}%"></span><h4>${st.name.split(' ').slice(0,2).join(' ')}</h4>
        <div class="meta">مطلوب ${arNum(st.dailyTarget)} ، فعلي ${arNum(t.status==='green'?st.dailyTarget:t.achievedLines||0)} سطر</div>
        <div class="bar"><i style="width:${Math.min(100,pct)}%;background:${barColor(t.status)}"></i></div>
        <div class="prog"><span>${t.status==='green'?'أنجز ✓':t.status==='grad'?arNum(pct)+'٪':t.status==='red'?'تعثّر':'غائب'}</span></div></div>`;}).join('')}</div></div></div>`).join('')}`;
}

/* ============================================================
   6) القبول وقائمة الانتظار (FR-ADM-04)
   ============================================================ */
function renderAdmissions(c){
  const pend=WAITLIST.filter(w=>w.status==='pending');
  c.innerHTML=`
  <div class="note"><b>تدفّق التسجيل:</b> يُسجّل الطالب عبر رابط ويكمل الملف، يراجعه الإداري فيقبله أو يرفضه بسبب. عند اكتمال العدد يُدرج في قائمة الانتظار ويُرقّى أول المنتظرين آلياً عند شغور مقعد.</div>
  <div class="kpis">
    <div class="kpi"><div class="v">${arNum(pend.length)}</div><div class="l">طلبات بانتظار المراجعة</div><div class="t" style="color:var(--amber)">مطلوب إجراء</div></div>
    <div class="kpi"><div class="v">${arNum(STUDENTS.length)}</div><div class="l">طلاب نشطون</div><div class="t ok">مقبولون</div></div>
    <div class="kpi"><div class="v">${arNum(50)}</div><div class="l">سعة الحلقات</div><div class="t" style="color:#9a9482">حدّ الطاقة</div></div>
  </div>
  <div class="panel"><div class="panel-h"><h3>قائمة الانتظار</h3><span class="hint">مرتبة بأولوية التسجيل</span></div><div class="panel-b">
    ${pend.length?pend.map((w,i)=>`<div class="lrow"><div class="av">${i===0?'⭐':'👤'}</div><div class="info"><div class="t">${w.name} ${i===0?'<span class="tag b">أول المنتظرين</span>':''}</div><div class="d">العمر ${arNum(w.age)} ، ${w.phone} ، طلب في ${w.date}</div></div>
      <div class="acts"><button class="btn btn-green btn-sm" onclick="acceptStudent('${w.id}')">✓ قبول</button><button class="btn btn-g btn-sm" onclick="rejectStudent('${w.id}')">✕ رفض بسبب</button></div></div>`).join(''):'<div style="text-align:center;color:#9a9482;padding:20px">لا طلبات بانتظار المراجعة — أضف عبر رابط التسجيل.</div>'}
  </div></div>`;
}
function acceptStudent(id){
  const w=WAITLIST.find(x=>x.id===id);w.status='accepted';
  const nid=Math.max(...STUDENTS.map(s=>s.id))+1;
  STUDENTS.push(mk(nid,w.name,'sabah',w.age,2,1,8,0,0,null,null,'g3'));
  DB.acceptStudent({full_name:w.name,age:w.age,circle_id:'sabah',program:'معارج',last_stop_surah:2,last_stop_ayah:1,daily_target:8,status:'tajribi'});
  DB.updateWaitlist(Number(id),'accepted');
  logAudit('إداري — شؤون الطالب','قبول طالب: '+w.name.split(' ').slice(0,2).join(' '));
  NOTIFS.unshift({id:'n'+Date.now(),ev:'قبول ابنكم في الحلقة',to:'ولي الأمر',ch:'تطبيق + رسالة',when:'فور القبول',time:'الآن',read:false,kind:'g'});
  buildNav();render();toast('🎉','تم القبول',w.name.split(' ').slice(0,2).join(' ')+' — انتقل إلى «بانتظار البدء» وأُشعر ولي الأمر');
}
function rejectStudent(id){
  const w=WAITLIST.find(x=>x.id===id);w.status='rejected';
  DB.updateWaitlist(Number(id),'rejected');
  logAudit('إداري — شؤون الطالب','رفض طلب مع حفظ السبب: '+w.name.split(' ')[0]);
  buildNav();render();toast('📝','سُجّل الرفض','حُفظ السبب في السجل — لا يُحذف الطلب');
}

/* ============================================================
   7) إدارة الأعذار (SRS 7.9)
   ============================================================ */
function renderExcuses(c){
  c.innerHTML=`
  <div class="note"><b>الأعذار:</b> عند تسجيل عذر (مرض/سفر/اختبارات) لا يُحتسب الغياب انقطاعاً، ويظهر «معذور» مسبقاً في شاشة الرصد. التغيّب المتكرر بلا عذر → تنبيه ولي الأمر وتحويل الحالة إلى «منقطع».</div>
  <div class="grid2">
    <div class="panel"><div class="panel-h"><h3>تسجيل عذر</h3></div><div class="panel-b">
      <div class="field"><label>الطالب</label><select id="excSt">${STUDENTS.map(s=>`<option>${s.name.split(' ').slice(0,2).join(' ')}</option>`).join('')}</select></div>
      <div class="field"><label>نوع العذر</label><select id="excType"><option>مرض</option><option>سفر</option><option>اختبارات</option><option>ظرف أسري</option></select></div>
      <div class="field"><label>المدة (أيام)</label><input id="excDays" type="number" value="3" min="1"></div>
      <button class="btn btn-p" style="width:100%" onclick="addExcuse()">حفظ العذر</button>
    </div></div>
    <div class="panel"><div class="panel-h"><h3>الأعذار الحالية</h3></div><div class="panel-b" id="excList">${excuseList()}</div></div>
  </div>`;
}
let EXCUSES=[{st:'يوسف بن خالد',type:'اختبارات',days:5,by:'ولي الأمر'}];
function excuseList(){return EXCUSES.length?EXCUSES.map(e=>`<div class="lrow"><div class="av">📄</div><div class="info"><div class="t">${e.st}</div><div class="d">${e.type} ، ${arNum(e.days)} أيام ، سجّله: ${e.by}</div></div><span class="tag b">معذور</span></div>`).join(''):'<div style="text-align:center;color:#9a9482;padding:16px">لا أعذار حالية</div>';}
function addExcuse(){
  const st=$('#excSt').value,type=$('#excType').value,days=$('#excDays').value;
  EXCUSES.unshift({st,type,days:+days,by:'إداري'});
  logAudit('إداري — شؤون الطالب','تسجيل عذر ('+type+') — '+st);
  $('#excList').innerHTML=excuseList();
  toast('✅','سُجّل العذر',st+' — لن يُحتسب الغياب انقطاعاً خلال المدة');
}

/* ============================================================
   8) الربط والمراجعة (FR-ADM-02)
   ============================================================ */
function renderLinking(c){
  const st=STUDENTS.find(x=>x.id===sheetStudent);
  c.innerHTML=`
  <div class="note"><b>التعديل للمشرف فقط:</b> يُوثّق كل تعديل في سجل التدقيق. الربط = محفوظ آخر ~٢٠ يوماً يُكرَّر يومياً حتى يرسخ. توزيع المراجعة على ٢–٧ أيام بحسب المقدار (SRS 7.5).</div>
  <div class="selrow">${STUDENTS.map(x=>`<button class="${x.id===sheetStudent?'active':''}" onclick="sheetStudent=${x.id};render()">${x.name.split(' ').slice(0,2).join(' ')}</button>`).join('')}</div>
  <div class="grid2">
    <div class="panel"><div class="panel-h"><h3>🔗 جدول الربط — ${st.name.split(' ').slice(0,2).join(' ')}</h3></div><div class="panel-b">
      <table><thead><tr><th>المقدار</th><th>يُكرَّر</th><th>الحالة</th></tr></thead><tbody>
        <tr><td class="s">${SURAHS[st.lastStop.surah]} (آخر ٢٠ يوماً)</td><td>يومياً</td><td><span class="tag a">قيد الترسيخ</span></td></tr>
        <tr><td class="s">جزء تبارك</td><td>يومياً</td><td><span class="tag g">راسخ</span></td></tr>
      </tbody></table>
      <button class="btn btn-o btn-sm" style="margin-top:12px" onclick="adjustLink('ربط')">＋ إضافة مقدار للربط</button>
    </div></div>
    <div class="panel"><div class="panel-h"><h3>📅 توزيع المراجعة</h3></div><div class="panel-b">
      <table><thead><tr><th>المقدار</th><th>التوزيع</th></tr></thead><tbody>
        <tr><td class="s">الأجزاء ١–٥</td><td>على ٥ أيام</td></tr>
        <tr><td class="s">الأجزاء ٦–١٠</td><td>على ٧ أيام</td></tr>
      </tbody></table>
      <div class="field" style="margin-top:14px"><label>إعادة توزيع المراجعة على (أيام)</label><input id="revDays" type="number" value="7" min="2" max="7"></div>
      <button class="btn btn-p" style="width:100%" onclick="adjustLink('مراجعة')">تطبيق التوزيع (يُوثّق)</button>
    </div></div>
  </div>`;
}
function adjustLink(kind){
  const st=STUDENTS.find(x=>x.id===sheetStudent);
  logAudit('المشرف التعليمي','تعديل جدول ال'+kind+' — '+st.name.split(' ').slice(0,2).join(' '));
  toast('🔗','تم التعديل','عُدّل جدول ال'+kind+' ووُثّق في سجل التدقيق');
}

/* ============================================================
   9) سوق الحلقة (SRS 9.5)
   ============================================================ */
function renderMarket(c){
  const st=STUDENTS.find(x=>x.id===marketStudent);
  c.innerHTML=`
  <div class="note"><b>الجوائز عينية:</b> النقاط تُصرف في جوائز حقيقية لا تُشترى بالمال. الاستبدال يُسجَّل ويُخصم الرصيد، ويُبنى كل صرف على حدثٍ نظامي موثّق (SRS 9.4).</div>
  <div class="selrow">${STUDENTS.map(x=>`<button class="${x.id===marketStudent?'active':''}" onclick="marketStudent=${x.id};render()">${x.name.split(' ').slice(0,2).join(' ')}</button>`).join('')}</div>
  <div class="levbar"><div class="top"><span>رصيد ${st.name.split(' ').slice(0,2).join(' ')}</span><span style="color:var(--gold-d)">◆ ${arNum(st.points)} نقطة</span></div>
    <div class="track"><i style="width:${Math.min(100,st.points/10)}%"></i></div></div>
  <div class="market">${REWARDS.map(r=>`<div class="mcard"><div class="ic">${r.ic}</div><div class="n">${r.name}</div><div class="stk">متوفّر: ${arNum(r.stock)}</div><div class="cost">◆ ${arNum(r.cost)}</div>
    <button class="btn ${st.points>=r.cost&&r.stock>0?'btn-p':'btn-g'} btn-sm" style="width:100%" ${st.points>=r.cost&&r.stock>0?'':'disabled'} onclick="redeem('${r.id}')">${r.stock<=0?'نفد':st.points>=r.cost?'استبدال':'نقاط غير كافية'}</button></div>`).join('')}</div>`;
}
function redeem(id){
  const r=REWARDS.find(x=>x.id===id),st=STUDENTS.find(x=>x.id===marketStudent);
  if(st.points<r.cost||r.stock<=0)return;
  st.points-=r.cost;r.stock--;
  DB.updateReward(r.id,r.stock); DB.updateStudentPoints(st.id,st.points);
  logAudit('سوق الحلقة','استبدال «'+r.name+'» ('+r.cost+' نقطة) — '+st.name.split(' ')[0]);
  render();toast(r.ic,'تم الاستبدال',r.name+' — خُصم ◆ '+arNum(r.cost)+' وسُجّل التسليم');
}

/* ============================================================
   10) شاشة المسجد (FR-SCR-01)
   ============================================================ */
function renderKiosk(c){
  const byItqan=[...STUDENTS].sort((a,b)=>(b.today.status==='green')-(a.today.status==='green')||b.points-a.points).slice(0,4);
  const byStreak=[...STUDENTS].sort((a,b)=>b.streak-a.streak).slice(0,4);
  const byHarvest=HARVEST.map(h=>h.student);
  c.innerHTML=`
  <div class="note"><b>وضع Kiosk بلا تدخّل:</b> تُبرز اللوحات «الإتقان» و«المواظبة» لا «الأكثر حفظاً» فقط، بألوان الهوية — ضمن روح المنافسة الشريفة.</div>
  <div class="kiosk"><h2>لوحة الشرف — حلقات الشيخ محمد البراك</h2>
    <div class="verse quran">﴿ وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ ﴾</div>
    <div class="board">
      <div class="honor"><div class="ttl">🌿 لوحة الإتقان</div>${byItqan.map((s,i)=>`<div class="nm"><span><span class="rk">${arNum(i+1)}</span>${s.name.split(' ').slice(0,2).join(' ')}</span><span>${s.today.status==='green'?'متقن ✓':arNum(s.points)+' ◆'}</span></div>`).join('')}</div>
      <div class="honor"><div class="ttl">🔥 لوحة المواظبة</div>${byStreak.map((s,i)=>`<div class="nm"><span><span class="rk">${arNum(i+1)}</span>${s.name.split(' ').slice(0,2).join(' ')}</span><span>${arNum(s.streak)} يوم</span></div>`).join('')}</div>
      <div class="honor"><div class="ttl">🌾 مجتازو الحصاد</div>${byHarvest.map((n,i)=>`<div class="nm"><span><span class="rk">${arNum(i+1)}</span>${n.split(' ').slice(0,2).join(' ')}</span><span>+٥٠ ◆</span></div>`).join('')||'<div class="nm">—</div>'}</div>
    </div>
  </div>`;
}

/* ============================================================
   11) الإشعارات (FR-NTF-01)
   ============================================================ */
function renderNotif(c){
  NOTIFS.forEach(n=>n.read=true); // فتح الشاشة يقرأها
  c.innerHTML=`
  <div class="grid2">
    <div class="panel"><div class="panel-h"><h3>سجل الإشعارات</h3><span class="hint">مجمّعة بالحدث ، تُحترم أوقات الهدوء</span></div><div class="panel-b">
      ${NOTIFS.map(n=>`<div class="lrow"><div class="av">${n.kind==='r'?'🔴':n.kind==='g'?'🟢':'🟡'}</div><div class="info"><div class="t" style="font-size:13.5px">${n.ev}</div><div class="d">إلى: ${n.to} ، عبر: ${n.ch} ، ${n.time}</div></div></div>`).join('')}
    </div></div>
    <div class="panel"><div class="panel-h"><h3>مصفوفة الإشعارات (SRS 8.11)</h3></div><div class="panel-b" style="padding:0;overflow:auto"><table class="matrix"><thead><tr><th>الحدث</th><th>المستقبِل</th><th>القناة</th><th>التوقيت</th></tr></thead><tbody>
      <tr><td class="s">حاضر بلا إنجاز</td><td>ولي الأمر</td><td>تطبيق + رسالة</td><td>فور إغلاق الجلسة</td></tr>
      <tr><td class="s">تغيّب متكرر</td><td>المشرف + ولي الأمر</td><td>تطبيق</td><td>نهاية اليوم</td></tr>
      <tr><td class="s">اجتياز/رسوب حصاد</td><td>ولي الأمر + المشرف</td><td>تطبيق</td><td>فور الاعتماد</td></tr>
      <tr><td class="s">استحقاق رسوم</td><td>ولي الأمر</td><td>تطبيق + رسالة</td><td>قبل الاستحقاق ٣ أيام</td></tr>
      <tr><td class="s">منح شارة/إنجاز</td><td>الطالب + ولي الأمر</td><td>تطبيق</td><td>فور الاستحقاق</td></tr>
    </tbody></table></div></div>
  </div>`;
  buildNav();
}

/* ============================================================
   12) البوابة المالية (FR-FIN-01)
   ============================================================ */
function renderFinance(c){
  const total=PAYMENTS.filter(p=>p.status==='ناجحة').reduce((a,b)=>a+b.amount,0);
  const donations=PAYMENTS.filter(p=>p.kind==='تبرّع'&&p.status==='ناجحة').reduce((a,b)=>a+b.amount,0);
  c.innerHTML=`
  <div class="note"><b>دفعٌ آمن دون تخزين بطاقات:</b> عبر مزوّد سعودي معتمد يدعم Apple Pay وSTC Pay (PCI-DSS)، وكل تحويل يُسجَّل في سجل التدقيق. التبرّع يُوجَّه لبرنامج/جائزة بإيصال موثّق.</div>
  <div class="kpis">
    <div class="kpi ok"><div class="v">${arNum(total)}</div><div class="l">إجمالي المحصّل (ريال)</div><div class="t ok">هذا الشهر</div></div>
    <div class="kpi"><div class="v">${arNum(donations)}</div><div class="l">التبرّعات الموجّهة</div><div class="t" style="color:var(--gold-d)">لبرامج محدّدة</div></div>
    <div class="kpi"><div class="v">${arNum(PAYMENTS.filter(p=>p.status==='مستردّة').length)}</div><div class="l">عمليات مستردّة</div><div class="t" style="color:var(--amber)">دون تكرار رسوم</div></div>
  </div>
  <div class="panel"><div class="panel-h"><h3>لوحة العمليات المالية</h3><button class="btn btn-p btn-sm" onclick="newPayment()">＋ تسجيل دفعة/تبرّع</button></div>
    <div class="panel-b" style="padding:0;overflow:auto"><table><thead><tr><th>المدفوع من</th><th>المبلغ</th><th>النوع</th><th>الوجهة</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody id="payBody">${payRows()}</tbody></table></div></div>`;
}
function payRows(){return PAYMENTS.map(p=>`<tr><td class="s">${p.payer}</td><td>${arNum(p.amount)} ﷼</td><td>${p.kind}</td><td>${p.target}</td><td><span class="tag ${p.status==='ناجحة'?'g':p.status==='مستردّة'?'a':'r'}">${p.status}</span></td><td>${p.date}</td></tr>`).join('');}
function newPayment(){
  PAYMENTS.unshift({id:'p'+Date.now(),payer:'داعم جديد',amount:1000,kind:'تبرّع',target:'برنامج معارج',status:'ناجحة',date:'الآن'});
  DB.addPayment({payer:'داعم جديد',amount:1000,kind:'donation',target:'برنامج معارج',status:'success'});
  logAudit('البوابة المالية','تسجيل تبرّع ١٬٠٠٠ ﷼ — برنامج معارج');
  $('#payBody').innerHTML=payRows();
  toast('💳','دفعٌ آمن ناجح','إيصال موثّق ، وُجّه التبرّع لبرنامج معارج ، سُجّل في التدقيق');
}

/* ============================================================
   13) سجل التدقيق (SRS 10.7)
   ============================================================ */
function renderAudit(c){
  c.innerHTML=`
  <div class="note"><b>توثيقٌ للعمليات الحسّاسة:</b> تعديل الإنجاز، منح النقاط، المدفوعات، القبول/الرفض، تعديل الربط — كلها تُسجَّل بالفاعل والإجراء والوقت (SRS 10.7 / 5.4).</div>
  <div class="panel"><div class="panel-h"><h3>سجل التدقيق</h3><span class="hint">${arNum(AUDIT.length)} عملية</span></div><div class="panel-b">
    ${AUDIT.map(a=>`<div class="lrow"><div class="av">🛡️</div><div class="info"><div class="t" style="font-size:13.5px">${a.act}</div><div class="d">الفاعل: ${a.who} ، ${a.time}</div></div></div>`).join('')}
  </div></div>`;
}

/* ============================================================
   14) جلسات الحصاد (FR-EXM-01)
   ============================================================ */
function renderHarvest(c){
  c.innerHTML=`
  <div class="note"><b>المُسمِّع مستقلٌّ عن المعلم:</b> يقيم «الحصاد» ويعتمد اجتياز المراحل. عند الاجتياز يُمنح ٥٠ نقطة آلياً؛ وعند الرسوب يُوثّق السبب وتُقترح خطة إعادة للمشرف.</div>
  <div class="panel"><div class="panel-h"><h3>جلسات بانتظار السرد والاعتماد</h3></div><div class="panel-b">
    ${HARVEST.filter(h=>h.status==='بانتظار').length?HARVEST.filter(h=>h.status==='بانتظار').map(h=>`<div class="lrow"><div class="av">🌾</div><div class="info"><div class="t">${h.student}</div><div class="d">${h.scope} ، حتى ${arNum(h.parts)} أجزاء</div></div>
      <div class="acts"><button class="btn btn-green btn-sm" onclick="harvestPass('${h.id}')">✓ اعتماد الاجتياز</button><button class="btn btn-red btn-sm" onclick="harvestFail('${h.id}')">✕ رسوب + خطة</button></div></div>`).join(''):'<div style="text-align:center;color:#9a9482;padding:20px">لا جلسات بانتظار الاعتماد</div>'}
  </div></div>
  <div class="panel"><div class="panel-h"><h3>المعتمدون</h3></div><div class="panel-b">
    ${HARVEST.filter(h=>h.status!=='بانتظار').map(h=>`<div class="lrow"><div class="av">${h.status==='اجتاز'?'🏆':'📝'}</div><div class="info"><div class="t">${h.student}</div><div class="d">${h.scope} ، ${h.note||''}</div></div><span class="tag ${h.status==='اجتاز'?'g':'r'}">${h.status}</span></div>`).join('')||'<div style="text-align:center;color:#9a9482;padding:16px">—</div>'}
  </div></div>`;
}
function harvestPass(id){
  const h=HARVEST.find(x=>x.id===id);h.status='اجتاز';h.note='+٥٠ نقطة';
  const st=STUDENTS.find(s=>s.name===h.student);if(st){st.points+=POINTS.harvest;}
  logAudit('المُسمِّع','اعتماد اجتياز حصاد (+٥٠) — '+h.student.split(' ').slice(0,2).join(' '));
  NOTIFS.unshift({id:'n'+Date.now(),ev:'اجتياز حصاد — '+h.student.split(' ')[0],to:'ولي الأمر + المشرف',ch:'تطبيق',when:'فور الاعتماد',time:'الآن',read:false,kind:'g'});
  buildNav();render();toast('🏆','تقبّل الله — اجتاز',h.student.split(' ').slice(0,2).join(' ')+' ، مُنح ٥٠ نقطة آلياً');
}
function harvestFail(id){
  const h=HARVEST.find(x=>x.id===id);h.status='إعادة';h.note='خطة إعادة مقترحة للمشرف';
  logAudit('المُسمِّع','توثيق رسوب واقتراح خطة إعادة — '+h.student.split(' ')[0]);
  render();toast('📝','سُجّل واقتُرحت خطة','وُثّق السبب وأُرسلت خطة الإعادة للمشرف');
}

/* ============================================================
   15) بوابة ولي الأمر — أبنائي (FR-PAR-01)
   ============================================================ */
function guardianChildren(){return STUDENTS.filter(s=>s.guardian==='g1');}
function renderChildren(c){
  const kids=guardianChildren();
  c.innerHTML=`
  <div class="note"><b>متابعةٌ لحظية:</b> اربط أبناءك وتنقّل بين سجلاتهم بسهولة، بعرض الإنجاز بالألوان وإشعارٍ فوري عند «عدم التحضير» أو التعثّر (FR-PAR-01).</div>
  <div class="grid2">${kids.map(st=>{const t=st.today;const pct=t.status==='green'?100:t.status==='grad'?achievePct(t.achievedLines,st.dailyTarget):0;
    return `<div class="panel"><div class="panel-h"><h3>${st.name.split(' ').slice(0,2).join(' ')}</h3><span class="tag ${t.status==='green'?'g':t.status==='grad'?'a':t.status==='red'?'r':'n'}">${t.status==='green'?'أتقن اليوم':t.status==='grad'?'أنجز جزئياً':t.status==='red'?'حاضر بلا إنجاز':'لم يُرصد'}</span></div>
      <div class="panel-b">
        <div class="lrow" style="margin:0 0 10px"><div class="av">📖</div><div class="info"><div class="t" style="font-size:13px">${CIRCLES.find(x=>x.id===st.circle).name} ، ${st.program}</div><div class="d">${SURAHS[st.lastStop.surah]} ، هدف اليوم ${arNum(st.dailyTarget)} أسطر</div></div></div>
        <div class="bar"><i style="width:${Math.min(100,pct)}%;background:${barColor(t.status)}"></i></div>
        <div style="display:flex;justify-content:space-between;font-size:12.5px;font-weight:700;margin-top:7px"><span>إنجاز اليوم ${arNum(pct)}٪</span><span style="color:var(--gold-d)">◆ ${arNum(st.points)} نقطة</span></div>
        <div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-o btn-sm" onclick="sheetStudent=${st.id};ROLE='general';switchTo('sheet')">📋 ورقة المتابعة</button>${t.status==='red'?'<span class="tag r" style="align-self:center">⚠ يحتاج متابعتك</span>':''}</div>
      </div></div>`;}).join('')}</div>`;
}

/* ============================================================
   16) الموافقات والدفع (FR-PAR-02)
   ============================================================ */
let APPROVALS=[{id:'a1',title:'رحلة الحلقة إلى الحرم',date:'١٥ يوليو',status:'pending'},{id:'a2',title:'مشاركة في مسابقة رمضان',date:'—',status:'pending'}];
function renderApprovals(c){
  c.innerHTML=`
  <div class="note"><b>إلكترونياً بالكامل:</b> وافق أو ارفض الرحلات، وادفع الرسوم أو تبرّع عبر بوابة آمنة بإيصال إلكتروني. عند فشل الدفع تُحفظ المحاولة وتُتاح إعادةٌ دون تكرار الرسوم (FR-PAR-02).</div>
  <div class="grid2">
    <div class="panel"><div class="panel-h"><h3>موافقات بانتظارك</h3></div><div class="panel-b" id="apprList">${apprList()}</div></div>
    <div class="panel"><div class="panel-h"><h3>الدفع والتبرّع</h3></div><div class="panel-b">
      <div class="lrow"><div class="av">💳</div><div class="info"><div class="t">رسوم الاشتراك الشهري</div><div class="d">مستحقة ، ٣٠٠ ﷼</div></div><button class="btn btn-p btn-sm" onclick="payFee()">ادفع الآن</button></div>
      <div class="lrow"><div class="av">🤝</div><div class="info"><div class="t">تبرّع لدعم طالب</div><div class="d">عام أو مخصّص لبرنامج</div></div><button class="btn btn-o btn-sm" onclick="donate()">تبرّع</button></div>
      <div style="font-size:11.5px;color:#9a9482;margin-top:8px;text-align:center">مدعوم: Apple Pay ، STC Pay ، مدى — دون تخزين بيانات البطاقة</div>
    </div></div>
  </div>`;
}
function apprList(){return APPROVALS.filter(a=>a.status==='pending').length?APPROVALS.filter(a=>a.status==='pending').map(a=>`<div class="lrow"><div class="av">✅</div><div class="info"><div class="t">${a.title}</div><div class="d">${a.date!=='—'?'التاريخ: '+a.date:'بانتظار موافقتك'}</div></div><div class="acts"><button class="btn btn-green btn-sm" onclick="approve('${a.id}',1)">موافقة</button><button class="btn btn-g btn-sm" onclick="approve('${a.id}',0)">رفض</button></div></div>`).join(''):'<div style="text-align:center;color:#9a9482;padding:16px">لا موافقات معلّقة</div>';}
function approve(id,ok){const a=APPROVALS.find(x=>x.id===id);a.status=ok?'approved':'rejected';
  $('#apprList').innerHTML=apprList();toast(ok?'✅':'✖',ok?'تمت الموافقة':'سُجّل الرفض',a.title);}
function payFee(){PAYMENTS.unshift({id:'p'+Date.now(),payer:'أبو محمد الغامدي',amount:300,kind:'رسوم',target:'—',status:'ناجحة',date:'الآن'});
  DB.addPayment({payer:'أبو محمد الغامدي',amount:300,kind:'fees',target:'—',status:'success'});
  logAudit('البوابة المالية','دفع رسوم ٣٠٠ ﷼ — أبو محمد');toast('💳','دفعٌ آمن ناجح','إيصال إلكتروني — مدعوم Apple Pay/STC Pay');}
function donate(){PAYMENTS.unshift({id:'p'+Date.now(),payer:'أبو محمد الغامدي',amount:500,kind:'تبرّع',target:'دعم طالب',status:'ناجحة',date:'الآن'});
  DB.addPayment({payer:'أبو محمد الغامدي',amount:500,kind:'donation',target:'دعم طالب',status:'success'});
  logAudit('البوابة المالية','تبرّع ٥٠٠ ﷼ — دعم طالب');toast('🤝','جزاك الله خيراً','تبرّعك ٥٠٠ ﷼ وُجّه بإيصال موثّق');}

/* ============================================================
   17) بوابة الطالب — برنامجي ونقاطي (FR-STU-01)
   ============================================================ */
function renderMyprog(c){
  const st=STUDENTS.find(x=>x.id===7);
  const lvl=Math.floor(st.points/100)+1,next=lvl*100,prog=(st.points%100);
  c.innerHTML=`
  <div class="levbar"><div class="top"><span>المستوى ${arNum(lvl)} — ${st.program}</span><span style="color:var(--gold-d)">◆ ${arNum(st.points)} نقطة</span></div>
    <div class="track"><i style="width:${prog}%"></i></div>
    <div style="font-size:11.5px;color:#9a9482;margin-top:6px">تحتاج ${arNum(next-st.points)} نقطة للمستوى ${arNum(lvl+1)}</div>
    <div class="badges"><span class="bdg">🌿 أول ختمة جزء</span><span class="bdg">🔥 مواظبة ${arNum(st.streak)} يوم</span><span class="bdg">🏅 إتقان بلا خطأ</span><span class="bdg lock">🔒 مواظبة شهر</span></div>
  </div>
  <div class="grid2">
    <div class="panel"><div class="panel-h"><h3>مقرراتي وخطة الأيام القادمة</h3></div><div class="panel-b">
      <table><thead><tr><th>المقرر</th><th>النوع</th><th>الهدف</th></tr></thead><tbody>
        <tr><td class="s">${SURAHS[st.lastStop.surah]} من ${arNum(st.lastStop.ayah)}</td><td><span class="tag b">حفظ جديد</span></td><td>${arNum(st.dailyTarget)} أسطر/يوم</td></tr>
        <tr><td class="s">محفوظ آخر ٢٠ يوماً</td><td><span class="tag a">ربط</span></td><td>يومياً</td></tr>
        <tr><td class="s">الأجزاء ١–٣</td><td><span class="tag g">مراجعة</span></td><td>على ٥ أيام</td></tr>
      </tbody></table>
    </div></div>
    <div class="panel"><div class="panel-h"><h3>رصيدي وسوق الحلقة</h3></div><div class="panel-b">
      <div class="lrow"><div class="av">◆</div><div class="info"><div class="t">${arNum(st.points)} نقطة متاحة</div><div class="d">اكسب أكثر بالحضور في وقته والإتقان والحصاد</div></div><button class="btn btn-p btn-sm" onclick="marketStudent=7;ROLE='general';switchTo('market')">🛒 السوق</button></div>
      <div class="lrow"><div class="av">💳</div><div class="info"><div class="t">رسوم الاشتراك</div><div class="d">دفع إلكتروني آمن</div></div><button class="btn btn-o btn-sm" onclick="payFee()">ادفع</button></div>
    </div></div>
  </div>`;
}

/* ============================================================
   18) سجل الطالب QR (FR-REC-01)
   ============================================================ */
function renderQR(c){
  const st=STUDENTS.find(x=>x.id===7);
  const seed=[1,0,1,1,0,1,0,0,1,1,0, 0,1,1,0,1,0,1,1,0,0,1, 1,0,0,1,1,0,1,0,1,1,0, 0,1,1,0,0,1,0,1,1,0,1, 1,0,1,0,1,1,0,0,1,0,1, 0,1,0,1,1,0,1,1,0,1,0, 1,1,0,0,1,0,1,0,1,1,0, 0,1,1,0,1,1,0,1,0,0,1, 1,0,0,1,0,1,1,0,1,1,0, 0,1,1,0,1,0,0,1,0,1,1, 1,0,1,1,0,1,0,1,1,0,0];
  c.innerHTML=`
  <div class="note"><b>رابطٌ موقّت ومحدود الصلاحية:</b> افتح سجلك مباشرةً برابط أو QR دون تسجيل معقّد، ويمنع تخمين سجلات الآخرين (FR-REC-01).</div>
  <div class="panel"><div class="panel-b"><div class="qrbox">
    <div class="qr">${seed.map(v=>`<i class="${v?'':'o'}"></i>`).join('')}</div>
    <div><h3 style="font-size:18px;margin-bottom:4px">${st.name}</h3>
      <div style="color:#9a9482;font-size:13px;margin-bottom:12px">${CIRCLES.find(x=>x.id===st.circle).name} ، ${st.program}</div>
      <div style="font-size:13px;line-height:2">✅ رابط QR فريد يفتح على الأسبوع الحالي<br>📆 تصفّح الأسابيع السابقة وخريطة الحفظ<br>🗓️ خطة ١٠ أيام قادمة وتصدير PDF</div>
      <button class="btn btn-p btn-sm" style="margin-top:14px" onclick="toast('🔗','تم النسخ','رابطٌ موقّت صالح ٧ أيام — لا يُخمّن غيره')">📋 نسخ الرابط الموقّت</button>
    </div>
  </div></div></div>`;
}

/* ============================================================
   19) تقارير الأثر — الداعم (FR-SPN-01)
   ============================================================ */
function renderImpact(c){
  const kids=STUDENTS.length,harvests=HARVEST.filter(h=>h.status==='اجتاز').length+3;
  c.innerHTML=`
  <div class="note"><b>اطلاعٌ فقط دون تعديل:</b> تقارير دوريّة تُظهر أثر دعمك بأرقام، مع احترام خصوصية الطلاب (بلا بياناتٍ حسّاسة زائدة) — FR-SPN-01.</div>
  <div class="kpis">
    <div class="kpi ok"><div class="v">${arNum(kids)}</div><div class="l">طلاب مكفولون بدعمك</div><div class="t ok">نشطون</div></div>
    <div class="kpi"><div class="v">${arNum(harvests)}</div><div class="l">حصادات مُجتازة</div><div class="t" style="color:var(--gold-d)">هذا الفصل</div></div>
    <div class="kpi"><div class="v">٨٣%</div><div class="l">اكتمال الحضور</div><div class="t ok">في الحلقات المكفولة</div></div>
    <div class="kpi"><div class="v">${arNum(2000)}</div><div class="l">تبرّعك الموجّه (﷼)</div><div class="t" style="color:#9a9482">برنامج مُذّكِر</div></div>
  </div>
  <div class="panel"><div class="panel-h"><h3>أثر الدعم — تقرير دوريّ</h3><button class="btn btn-o btn-sm" onclick="toast('📄','تقرير الأثر','تصدير PDF دوريّ بأرقام مجمّعة')">⬇ تصدير</button></div><div class="panel-b">
    <div class="ringwrap">
      <div class="ring">${ring(83,'var(--green)')}<div class="lab">الحضور</div><div class="sub2">الحلقات المكفولة</div></div>
      <div class="ring">${ring(78,'var(--green)')}<div class="lab">بقاء الطلاب</div><div class="sub2">بعد ٩٠ يوماً</div></div>
      <div class="ring">${ring(91,'var(--gold)')}<div class="lab">رضا الأسر</div><div class="sub2">استبيان دوري</div></div>
    </div>
    <div style="text-align:center;font-size:12px;color:#9a9482;margin-top:14px">التقارير مجمّعة ولا تكشف بيانات طالبٍ بعينه، حمايةً للخصوصية (PDPL).</div>
  </div></div>`;
}

/* ---------- Toast ---------- */
let toastT=null;
function toast(em,tt,ts){const el=$('#toast');el.innerHTML=`<span class="em">${em}</span><div><div class="tt">${tt}</div><div class="ts">${ts||''}</div></div>`;
  el.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),3800);}

/* ---------- ربط بيانات Supabase (مع سقوط تلقائي للبذور المحلية) ---------- */
function applyRemote(d){
  if(d.circles&&d.circles.length){CIRCLES.length=0;d.circles.forEach(c=>CIRCLES.push({id:c.id,name:c.name,teacher:c.teacher,mosque:c.mosque}));}
  if(d.guardians&&d.guardians.length){Object.keys(GUARDIANS).forEach(k=>delete GUARDIANS[k]);d.guardians.forEach(g=>GUARDIANS[g.id]={name:g.name,phone:g.phone});}
  if(d.students&&d.students.length){STUDENTS.length=0;d.students.forEach(s=>STUDENTS.push({
    id:s.id,name:s.full_name,circle:s.circle_id,age:s.age,guardian:s.guardian_id,program:s.program||'معارج',
    lastStop:{surah:s.last_stop_surah||2,ayah:s.last_stop_ayah||1},dailyTarget:s.daily_target||8,
    points:s.points||0,streak:s.streak||0,
    today:{status:null,achievedLines:null,mistakes:{lafzi:0,adi:0,shak:0},itqan:false,done:false,late:false}}));}
  if(d.waitlist){WAITLIST.length=0;d.waitlist.filter(w=>w.status==='pending').forEach(w=>WAITLIST.push({id:String(w.id),name:w.full_name,age:w.age,phone:w.phone,date:'—',status:'pending'}));}
  if(d.payments&&d.payments.length){PAYMENTS.length=0;d.payments.forEach(p=>PAYMENTS.push({id:String(p.id),payer:p.payer,amount:Number(p.amount),kind:p.kind==='fees'?'رسوم':p.kind==='donation'?'تبرّع':'جائزة',target:p.target||'—',status:p.status==='success'?'ناجحة':p.status==='refunded'?'مستردّة':'فاشلة',date:'—'}));}
  if(d.rewards&&d.rewards.length){REWARDS.length=0;d.rewards.forEach(r=>REWARDS.push({id:r.id,name:r.name,cost:r.cost,stock:r.stock,ic:r.icon}));}
  if(d.harvest&&d.harvest.length){HARVEST.length=0;d.harvest.forEach(h=>{const st=STUDENTS.find(x=>x.id===h.student_id);HARVEST.push({id:String(h.id),student:st?st.name:'طالب',parts:h.parts,scope:h.scope,status:h.status==='pending'?'بانتظار':h.status==='passed'?'اجتاز':'إعادة',note:h.note||''});});}
  if(d.audit&&d.audit.length){AUDIT.length=0;d.audit.forEach(a=>AUDIT.push({who:a.actor,act:a.action,time:'—'}));}
}
/* ============================================================
   المصادقة — حسابٌ مستقل لكل مستخدم (جوال + كلمة سر)
   ============================================================ */
let CURRENT_USER=null;
const ROLE_LABELS={general:'مشرف عام',teacher:'معلم حلقة',admin:'إداري',examiner:'مُسمِّع',parent:'ولي أمر',student:'طالب',sponsor:'داعم'};

function showLogin(mode){
  mode=mode||'in'; const signup=mode==='up';
  let el=document.getElementById('authGate');
  if(!el){ el=document.createElement('div'); el.id='authGate'; document.body.appendChild(el); }
  el.className='authgate';
  el.removeAttribute('style');
  el.innerHTML=`
   <div class="authcard">
     <div class="head">
       <div class="logo">☾</div>
       <h2>حلقات الشيخ محمد البراك</h2>
       <p>${signup?'إنشاء حساب جديد':'تسجيل الدخول إلى المنصّة'}</p>
     </div>
     <div class="body">
       ${signup?`<div class="field"><label>الاسم الكامل</label><input id="auName" placeholder="مثال: عبدالله الغامدي" autocomplete="name"></div>`:''}
       <div class="field"><label>رقم الجوال</label><input id="auPhone" inputmode="numeric" placeholder="05xxxxxxxx" autocomplete="username"></div>
       <div class="field"><label>كلمة السر</label><input id="auPass" type="password" placeholder="٦ أحرف فأكثر" autocomplete="${signup?'new-password':'current-password'}"></div>
       ${signup?`<div class="field"><label>الصفة</label><select id="auRole">
          <option value="parent">ولي أمر</option>
          <option value="student">طالب</option></select>
          <div style="font-size:11px;color:var(--muted-2);margin-top:6px">صفات الكادر (معلم/مُسمِّع/إداري/مشرف) تُمنح من الإدارة بعد التسجيل.</div></div>`:''}
       <div id="auErr" class="autherr"></div>
       <button class="btn btn-p" style="width:100%" onclick="${signup?'doSignup()':'doLogin()'}">${signup?'إنشاء الحساب والدخول':'دخول'}</button>
       <div class="authswitch">
         ${signup?'لديك حساب؟ ':'ليس لديك حساب؟ '}
         <a onclick="showLogin('${signup?'in':'up'}')">${signup?'سجّل الدخول':'أنشئ حساباً'}</a>
       </div>
     </div>
   </div>`;
}
function authErr(m){ const e=document.getElementById('auErr'); if(e) e.textContent=m; }
function hideLogin(){ const el=document.getElementById('authGate'); if(el) el.remove(); }

async function doLogin(){
  const phone=(document.getElementById('auPhone').value||'').trim();
  const pass=document.getElementById('auPass').value||'';
  if(phone.replace(/\D/g,'').length<9) return authErr('أدخل رقم جوال صحيح');
  if(pass.length<6) return authErr('كلمة السر ٦ أحرف فأكثر');
  authErr('جارٍ الدخول…');
  const {error}=await DB.signIn({phone,password:pass});
  if(error) return authErr('تعذّر الدخول — تحقّق من الجوال وكلمة السر');
  await afterAuth();
}
async function doSignup(){
  const name=(document.getElementById('auName').value||'').trim();
  const phone=(document.getElementById('auPhone').value||'').trim();
  const pass=document.getElementById('auPass').value||'';
  const role=document.getElementById('auRole').value;
  if(!name) return authErr('أدخل الاسم');
  if(phone.replace(/\D/g,'').length<9) return authErr('أدخل رقم جوال صحيح');
  if(pass.length<6) return authErr('كلمة السر ٦ أحرف فأكثر');
  authErr('جارٍ إنشاء الحساب…');
  const {error,needsConfirm}=await DB.signUp({phone,password:pass,name,role});
  if(error){
    if(String(error.message).includes('registered')) return authErr('هذا الجوال مسجّل — سجّل الدخول');
    return authErr('تعذّر الإنشاء: '+error.message);
  }
  if(needsConfirm) return authErr('أُنشئ الحساب. فعّل «تعطيل تأكيد البريد» في Supabase ثم سجّل الدخول.');
  await afterAuth();
}
async function doLogout(){ await DB.signOut(); location.reload(); }

function applyProfileRole(p){
  if(p&&p.role&&ROLES[p.role]) ROLE=p.role;
  const rs=document.querySelector('.roleswitch'); if(rs) rs.style.display='none';
  const who=document.getElementById('whoBox');
  who.style.gap='8px';
  who.innerHTML=`<span class="dot"></span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(p&&p.full_name)||'مستخدم'} — ${ROLE_LABELS[ROLE]||''}</span><button onclick="doLogout()" style="background:rgba(255,255,255,.14);color:#fff;border-radius:8px;padding:6px 11px;font-size:11px;font-weight:700;flex-shrink:0">خروج ⏻</button>`;
}
async function loadData(){
  const data=await DB.loadAll(); if(data) applyRemote(data);
  const badge=document.querySelector('.offline');
  if(DB.isOnline()) badge.innerHTML='<span class="dot"></span> متصل بقاعدة البيانات';
}
async function afterAuth(){
  const session=await DB.getSession();
  const profile=session?await DB.getProfile(session.user.id):null;
  CURRENT_USER=profile;
  hideLogin();
  await loadData();
  applyProfileRole(profile);
  buildRoleSelect(); buildNav(); render();
}

async function boot(){
  const ok=DB.init();
  if(!ok){ /* لا اتصال بقاعدة البيانات — وضع عرض تجريبي بلا تسجيل دخول */
    buildRoleSelect(); buildNav(); render(); return;
  }
  const session=await DB.getSession();
  if(!session){ showLogin('in'); return; }
  const profile=await DB.getProfile(session.user.id);
  CURRENT_USER=profile;
  await loadData();
  applyProfileRole(profile);
  buildRoleSelect(); buildNav(); render();
}
boot();
