"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

const box: React.CSSProperties = {
  maxWidth: 400,
  margin: "0 auto",
  padding: "2rem 1.5rem",
  fontFamily: "system-ui, sans-serif",
};
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 };
const input: React.CSSProperties = { padding: "0.5rem", fontSize: "1rem", fontFamily: "inherit" };

// البريد الاصطناعي — نفس نمط م١ (الجوال ← u<digits>@albrrak.app).
function syntheticEmail(phone: string): string {
  return `u${phone.replace(/\D/g, "")}@albrrak.app`;
}

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const { error } = await supabaseBrowser().auth.signInWithPassword({
      email: syntheticEmail(phone),
      password,
    });
    setBusy(false);
    if (error) {
      setErr("تعذّر الدخول — تحقّق من الجوال وكلمة السر.");
    } else {
      window.location.href = "/me";
    }
  }

  return (
    <main style={box}>
      <h1>تسجيل الدخول</h1>
      <form onSubmit={onSubmit}>
        <label style={field}>
          <span>الجوال</span>
          <input
            style={input}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            required
          />
        </label>
        <label style={field}>
          <span>كلمة السر</span>
          <input
            style={input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {err && <p style={{ color: "#b00020" }}>{err}</p>}
        <button style={{ ...input, cursor: "pointer", fontWeight: 700 }} disabled={busy}>
          {busy ? "جارٍ الدخول…" : "دخول"}
        </button>
      </form>
    </main>
  );
}
