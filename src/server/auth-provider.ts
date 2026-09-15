// منفذ إنشاء مستخدم المصادقة (Supabase auth.users). يُحقَن ليُختبَر بمزوّر مزيّف.
export interface AuthProvider {
  createAuthUser(args: {
    email: string;
    phone: string;
  }): Promise<{ authId: string }>;
  /** يضبط كلمة سرّ مستخدم المصادقة (عند التفعيل/إعادة التعيين). */
  setPassword(args: { authId: string; password: string }): Promise<void>;
}

// تطبيق الإنتاج: Supabase Admin API — يحتاج URL + SERVICE_ROLE_KEY + شبكة.
// (لا يُشغَّل في بيئة محجوبة؛ يُستبدَل بمزوّر مزيّف في الاختبار.)
export const supabaseAuthProvider: AuthProvider = {
  async createAuthUser({ email, phone }) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Supabase Admin غير مضبوط (URL / SERVICE_ROLE_KEY).");
    }
    const res = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: key,
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ email, phone, email_confirm: true }),
    });
    if (!res.ok) {
      throw new Error(`فشل إنشاء مستخدم المصادقة: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { id: string };
    return { authId: body.id };
  },

  async setPassword({ authId, password }) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Supabase Admin غير مضبوط (URL / SERVICE_ROLE_KEY).");
    }
    // المفتاح الجديد (sb_secret_…) ليس JWT ⟵ يُرسَل apikey أيضًا (لا Bearer وحده).
    const res = await fetch(`${url}/auth/v1/admin/users/${authId}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        apikey: key,
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      throw new Error(`فشل ضبط كلمة السرّ: HTTP ${res.status}`);
    }
  },
};

export const defaultAuthProvider: AuthProvider = supabaseAuthProvider;
