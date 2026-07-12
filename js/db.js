/* ============================================================
   طبقة الوصول للبيانات + المصادقة — تربط الواجهة بـ Supabase
   Offline-first (SRS 10.1): إن غابت الإعدادات أو الشبكة، تعمل المنصة
   ببيانات محلية دون توقّف، وتُخزَّن الكتابات في طابور مزامنة محلي
   يُعاد إرساله تلقائياً عند عودة الاتصال — دون فقدان أي عملية.
   ============================================================ */
window.DB = (function () {
  let sb = null;
  let online = false;
  const QKEY = 'albrrak_sync_queue_v1';

  function init() {
    try {
      const cfg = window.SUPABASE_CONFIG;
      if (cfg && cfg.url && cfg.anonKey && window.supabase) {
        sb = window.supabase.createClient(cfg.url, cfg.anonKey);
        return true;
      }
    } catch (e) { console.warn('Supabase init skipped:', e.message); }
    return false;
  }
  function hasClient(){ return !!sb; }

  /* ---------- المصادقة (تسجيل الدخول بالجوال وكلمة السر) ----------
     نربط الجوال بحساب عبر بريدٍ اصطناعي داخلي، فلا نحتاج رسائل SMS. */
  // يقبل بريداً حقيقياً (كما هو) أو رقم جوال (يُحوَّل لبريد اصطناعي داخلي).
  // ملاحظة: البريد الاصطناعي على نطاق albrrak.app يتطلّب نطاقاً مسجّلاً بسجلّ MX
  // ليقبله Supabase؛ حتى ذلك الحين استخدم بريداً حقيقياً لحساب المشرف.
  function phoneToEmail(phone) {
    const s = String(phone).trim();
    if (s.includes('@')) return s.toLowerCase();
    const d = s.replace(/\D/g, '');
    return `u${d}@albrrak.app`;
  }
  // أدوار التسجيل الذاتي المسموح بها فقط — دفاعٌ في العمق (تُفرض أيضاً في RLS).
  const SELF_ROLES = ['parent', 'student'];
  async function signUp({ phone, password, name, role, guardianId, studentId }) {
    if (!sb) return { error: { message: 'لا يوجد اتصال بقاعدة البيانات' } };
    const safeRole = SELF_ROLES.includes(role) ? role : 'parent';
    const email = phoneToEmail(phone);
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) return { error };
    const uid = data.user && data.user.id;
    if (uid) {
      const profile = { id: uid, phone, full_name: name, role: safeRole };
      if (safeRole === 'parent'  && guardianId) profile.guardian_id = guardianId;
      if (safeRole === 'student' && studentId)  profile.student_id  = studentId;
      try { await sb.from('profiles').insert(profile); }
      catch (e) { console.warn('profile insert:', e.message); }
    }
    return { data, needsConfirm: !data.session };
  }
  async function signIn({ phone, password }) {
    if (!sb) return { error: { message: 'لا يوجد اتصال بقاعدة البيانات' } };
    const email = phoneToEmail(phone);
    return await sb.auth.signInWithPassword({ email, password });
  }
  async function signOut() { if (sb) await sb.auth.signOut(); }
  async function getSession() {
    if (!sb) return null;
    try { const { data } = await sb.auth.getSession(); return data.session; }
    catch (e) { return null; }
  }
  async function getProfile(uid) {
    if (!sb) return null;
    try {
      const { data } = await sb.from('profiles').select('*').eq('id', uid).single();
      return data;
    } catch (e) { return null; }
  }

  /* ---------- طابور المزامنة المحلي (Offline queue) ---------- */
  function loadQueue() {
    try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch (e) { return []; }
  }
  function saveQueue(q) {
    try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch (e) {}
  }
  function enqueue(entry) {
    const q = loadQueue();
    q.push(entry);
    saveQueue(q);
  }
  function pendingCount() { return loadQueue().length; }

  // تنفيذ عملية واحدة على القاعدة (تُرمى إن فشلت لتبقى في الطابور).
  async function applyEntry(e) {
    if (e.t === 'session') {
      const s = e.p;
      await sb.from('students').update({
        points: s.points, streak: s.streak, last_stop_ayah: s.lastStopAyah,
      }).eq('id', s.studentId);
      const { data: sess, error } = await sb.from('sessions').insert({
        student_id: s.studentId, start_ayah: s.startAyah, stop_ayah: s.stopAyah,
        achieved_lines: s.lines, attendance: s.attendance, itqan: s.itqan,
        performance: s.performance, sync_state: 'synced',
      }).select().single();
      if (error) throw error;
      if (sess && s.mistakes) {
        const reps = (type) => type === 'lafzi' ? 100 : type === 'adi' ? 45 : 20;
        const rows = Object.entries(s.mistakes).filter(([, v]) => v > 0)
          .flatMap(([type, v]) => Array.from({ length: v }, () => ({
            session_id: sess.id, type, required_reps: reps(type), remaining_reps: reps(type),
          })));
        if (rows.length) await sb.from('mistakes').insert(rows);
      }
      if (s.earned > 0) await sb.from('points').insert({
        student_id: s.studentId, value: s.earned, reason: s.reason, source_event: 'tasmee',
      });
      return;
    }
    let q = sb.from(e.table);
    if (e.op === 'insert') { const { error } = await q.insert(e.values); if (error) throw error; }
    else if (e.op === 'update') { const { error } = await q.update(e.values).eq(e.eq.col, e.eq.val); if (error) throw error; }
  }

  // إعادة إرسال كل ما في الطابور بالترتيب؛ يتوقّف عند أول فشل ليُعاد لاحقاً.
  async function flush() {
    if (!sb || !online) return;
    let q = loadQueue();
    while (q.length) {
      try { await applyEntry(q[0]); }
      catch (e) { console.warn('sync retry later:', e.message); break; }
      q.shift();
      saveQueue(q);
    }
  }

  // كتابة «أفضل جهد»: تُنفَّذ فوراً إن كنّا متصلين، وإلا (أو عند الفشل) تُخزَّن للمزامنة.
  async function write(entry) {
    if (sb && online) {
      try { await applyEntry(entry); return; }
      catch (e) { console.warn('write queued after failure:', e.message); }
    }
    enqueue(entry);
  }

  /* ---------- تحميل البيانات ---------- */
  async function loadAll() {
    if (!sb) return null;
    try {
      const [students, circles, guardians, waitlist, payments, rewards, harvest, audit] =
        await Promise.all([
          sb.from('students').select('*').order('id'),
          sb.from('circles').select('*'),
          sb.from('guardians').select('*'),
          sb.from('waitlist').select('*').order('id'),
          sb.from('payments').select('*').order('created_at', { ascending: false }),
          sb.from('rewards').select('*'),
          sb.from('harvest').select('*'),
          sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(50),
        ]);
      if (students.error) throw students.error;
      online = true;
      flush(); // أعد إرسال أي عمليات مؤجّلة فور نجاح الاتصال.
      return {
        students: students.data, circles: circles.data, guardians: guardians.data,
        waitlist: waitlist.data, payments: payments.data, rewards: rewards.data,
        harvest: harvest.data, audit: audit.data,
      };
    } catch (e) {
      console.warn('DB.loadAll fallback to offline seed:', e.message);
      online = false;
      return null;
    }
  }

  /* ---------- كتابات عبر الطابور (نفس الواجهة العامة السابقة) ---------- */
  async function saveSession(s) { return write({ t: 'session', p: s }); }
  async function log(actor, action) { return write({ op: 'insert', table: 'audit_log', values: { actor, action } }); }
  async function acceptStudent(st) { return write({ op: 'insert', table: 'students', values: st }); }
  async function updateWaitlist(id, status) { return write({ op: 'update', table: 'waitlist', values: { status }, eq: { col: 'id', val: id } }); }
  async function addPayment(p) { return write({ op: 'insert', table: 'payments', values: p }); }
  async function updateReward(id, stock) { return write({ op: 'update', table: 'rewards', values: { stock }, eq: { col: 'id', val: id } }); }
  async function updateStudentPoints(id, points) { return write({ op: 'update', table: 'students', values: { points }, eq: { col: 'id', val: id } }); }

  /* ---------- إدارة المستخدمين (للمشرف العام — الحماية داخل دوال القاعدة) ---------- */
  async function listProfiles() {
    if (!sb) return null;
    try {
      const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    } catch (e) { console.warn('listProfiles:', e.message); return null; }
  }
  async function adminSetRole(targetId, newRole) {
    if (!sb) return { error: { message: 'لا يوجد اتصال بقاعدة البيانات' } };
    return await sb.rpc('admin_set_role', { target_id: targetId, new_role: newRole });
  }
  async function adminSetStatus(targetId, newStatus) {
    if (!sb) return { error: { message: 'لا يوجد اتصال بقاعدة البيانات' } };
    return await sb.rpc('admin_set_status', { target_id: targetId, new_status: newStatus });
  }
  async function linkUser(targetId, studentId, guardianId) {
    if (!sb) return { error: { message: 'لا اتصال' } };
    return await sb.rpc('admin_link_user', {
      target_id: targetId,
      p_student_id: studentId || null,
      p_guardian_id: guardianId || null
    });
  }

  /* ---------- إدارة الحلقات والمعلمين ---------- */
  // إضافة/تعديل حلقة (upsert على المفتاح النصّي id) — تحميه سياسة الكادر
  async function saveCircle(circle) {
    if (!sb) return { error: { message: 'لا يوجد اتصال بقاعدة البيانات' } };
    return await sb.from('circles').upsert(circle);
  }
  // إضافة/تعديل طالب — إدراج جديد أو تحديث بالمعرّف
  async function saveStudent(student) {
    if (!sb) return { error: { message: 'لا يوجد اتصال بقاعدة البيانات' } };
    const { id, ...vals } = student;
    if (id) return await sb.from('students').update(vals).eq('id', id);
    return await sb.from('students').insert(vals);
  }
  // إضافة/تعديل عائلة (upsert على المفتاح النصّي id)
  async function saveGuardian(g) {
    if (!sb) return { error: { message: 'لا يوجد اتصال بقاعدة البيانات' } };
    return await sb.from('guardians').upsert(g);
  }
  // كشف المعلمين: الحسابات التي دورها 'teacher'
  async function loadStaffTeachers() {
    if (!sb) return [];
    try {
      const { data, error } = await sb.from('profiles')
        .select('id,full_name,phone,role').eq('role', 'teacher');
      if (error) throw error;
      return data || [];
    } catch (e) { console.warn('loadStaffTeachers:', e.message); return []; }
  }

  /* ---------- طلبات توظيف المعلمين ---------- */
  // إرسال طلب تقديم معلم (من الرابط العام أو إدخال المشرف)
  async function submitTeacherApp(app) {
    if (!sb) return { error: { message: 'لا اتصال' } };
    return await sb.from('teacher_applications').insert(app);
  }
  // جلب طلبات المعلمين (للكادر فقط — تحميه RLS)
  async function loadTeacherApps() {
    if (!sb) return null;
    try {
      const { data, error } = await sb.from('teacher_applications')
        .select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    } catch (e) { console.warn('loadTeacherApps:', e.message); return null; }
  }

  return {
    init, hasClient, isOnline: () => online, pendingCount, flush,
    signUp, signIn, signOut, getSession, getProfile,
    loadAll, saveSession, log, acceptStudent, updateWaitlist,
    addPayment, updateReward, updateStudentPoints,
    listProfiles, adminSetRole, adminSetStatus, linkUser,
    submitTeacherApp, loadTeacherApps,
    saveCircle, loadStaffTeachers, saveStudent, saveGuardian,
  };
})();
