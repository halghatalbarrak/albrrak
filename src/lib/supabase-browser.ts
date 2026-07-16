"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// عميل Supabase في المتصفّح — للدخول فقط. يحمل الجلسة، وتُمرَّر كـJWT إلى الخادم.
// مفاتيح عامة (URL + anon). لا سرّ خادميّ هنا أبدًا.
// كسولٌ: لا يُنشأ إلا عند أول استعمال (فلا يكسر البناء إن غابت البيئة).
let client: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    );
  }
  return client;
}
