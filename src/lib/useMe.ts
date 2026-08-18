"use client";

import { useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";

// خطّافٌ مشترك: يجلب اسم الداخل وأدواره (للشريط الجانبيّ في AppShell). قراءةٌ فقط،
// إضافةٌ للواجهة لا تمسّ منطق الصفحة. الصفحات محميّةٌ في الخادم أصلاً.
export interface MeInfo { name: string; roles: string[] }

export function useMe(): { me: MeInfo | null; loading: boolean } {
  const [me, setMe] = useState<MeInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const { data: { session } } = await supabaseBrowser().auth.getSession();
        if (session) {
          const res = await fetch("/api/me", { headers: { authorization: `Bearer ${session.access_token}` } });
          if (res.ok) setMe((await res.json()) as MeInfo);
        }
      } catch {
        /* تجاهل — اللوحة لا تُعطّل الصفحة */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { me, loading };
}
