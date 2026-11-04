"use client";

import { useEffect } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * يسجّل الـService Worker الموحّد (/sw.js) بنطاق "/"، ويُبلغه معرّف المستخدم (لا بياناته)
 * ليفصل كاش الـAPI بين مستخدمي الجهاز الواحد. الإصدار من NEXT_PUBLIC_SW_VERSION (SHA النشر).
 */
export function RegisterSW() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const v = process.env.NEXT_PUBLIC_SW_VERSION || "dev";
    void (async () => {
      try {
        await navigator.serviceWorker.register(`/sw.js?v=${v}`, { scope: "/" });
        const reg = await navigator.serviceWorker.ready;
        const { data: { session } } = await supabaseBrowser().auth.getSession();
        reg.active?.postMessage({ type: "setUser", userId: session?.user?.id ?? "anon" });
      } catch {
        /* التسجيل غير حرج — تجاهل */
      }
    })();
  }, []);
  return null;
}
