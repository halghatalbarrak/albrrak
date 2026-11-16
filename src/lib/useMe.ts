"use client";

import { useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase-browser";

export interface MeInfo { name: string; roles: string[]; muddakirStaff?: string[]; impersonating?: boolean }

// طلبٌ واحد في العمر — مشاركٌ بين كل مكوّناتٍ تستدعي useMe() في نفس التحميل.
let _cache: { data: MeInfo | null; ts: number } | null = null;
let _inflight: Promise<MeInfo | null> | null = null;
const TTL = 60_000;

function getOrFetch(): Promise<MeInfo | null> {
  const now = Date.now();
  if (_cache && now - _cache.ts < TTL) return Promise.resolve(_cache.data);
  if (_inflight) return _inflight;
  _inflight = supabaseBrowser()
    .auth.getSession()
    .then(async ({ data: { session } }) => {
      if (!session) return null;
      const res = await fetch("/api/me", { headers: { authorization: `Bearer ${session.access_token}` } });
      return res.ok ? (res.json() as Promise<MeInfo>) : null;
    })
    .then((data) => { _cache = { data, ts: Date.now() }; return data; })
    .catch(() => null)
    .finally(() => { _inflight = null; });
  return _inflight;
}

export function useMe(): { me: MeInfo | null; loading: boolean } {
  const [me, setMe] = useState<MeInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getOrFetch().then((data) => { setMe(data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return { me, loading };
}
