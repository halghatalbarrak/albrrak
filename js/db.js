/* ============================================================
   طبقة الوصول للبيانات — تربط الواجهة بـ Supabase
   Offline-first: إن لم تتوفر الإعدادات أو فشل الاتصال،
   تعمل المنصة ببيانات محلية (بذور) دون توقّف — مطابقةً لمتطلب 10.1.
   ============================================================ */
window.DB = (function () {
  let sb = null;
  let online = false;

  // تهيئة العميل من config.js (إن وُجد)
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

  // تحميل كل البيانات؛ عند الفشل تُعاد null فيستخدم التطبيق البذور المحلية
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

  // كتابات «أفضل جهد» — تحدّث القاعدة إن كان الاتصال متاحاً، وإلا تُتجاهل بأمان
  // (الحالة المحلية تُحدَّث دائماً في الواجهة لضمان الاستجابة الفورية)
  async function saveSession(s) {
    if (!sb || !online) return;
    try {
      await sb.from('students').update({
        points: s.points, streak: s.streak,
        last_stop_ayah: s.lastStopAyah,
      }).eq('id', s.studentId);
      const { data: sess } = await sb.from('sessions').insert({
        student_id: s.studentId, start_ayah: s.startAyah, stop_ayah: s.stopAyah,
        achieved_lines: s.lines, attendance: s.attendance, itqan: s.itqan,
        performance: s.performance, sync_state: 'synced',
      }).select().single();
      if (sess && s.mistakes) {
        const rows = Object.entries(s.mistakes).filter(([, v]) => v > 0)
          .flatMap(([type, v]) => Array.from({ length: v }, () => ({
            session_id: sess.id, type,
            required_reps: type === 'lafzi' ? 100 : type === 'adi' ? 45 : 20,
            remaining_reps: type === 'lafzi' ? 100 : type === 'adi' ? 45 : 20,
          })));
        if (rows.length) await sb.from('mistakes').insert(rows);
      }
      if (s.earned > 0) await sb.from('points').insert({
        student_id: s.studentId, value: s.earned, reason: s.reason, source_event: 'tasmee',
      });
    } catch (e) { console.warn('saveSession:', e.message); }
  }

  async function log(actor, action) {
    if (!sb || !online) return;
    try { await sb.from('audit_log').insert({ actor, action }); } catch (e) {}
  }
  async function acceptStudent(st) {
    if (!sb || !online) return;
    try { await sb.from('students').insert(st); } catch (e) {}
  }
  async function updateWaitlist(id, status) {
    if (!sb || !online) return;
    try { await sb.from('waitlist').update({ status }).eq('id', id); } catch (e) {}
  }
  async function addPayment(p) {
    if (!sb || !online) return;
    try { await sb.from('payments').insert(p); } catch (e) {}
  }
  async function updateReward(id, stock) {
    if (!sb || !online) return;
    try { await sb.from('rewards').update({ stock }).eq('id', id); } catch (e) {}
  }
  async function updateStudentPoints(id, points) {
    if (!sb || !online) return;
    try { await sb.from('students').update({ points }).eq('id', id); } catch (e) {}
  }

  return {
    init, loadAll, saveSession, log, acceptStudent, updateWaitlist,
    addPayment, updateReward, updateStudentPoints,
    isOnline: () => online,
  };
})();
