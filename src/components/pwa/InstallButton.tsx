"use client";

import { useEffect, useState } from "react";

import { useMe } from "@/lib/useMe";
import { Button, ui, sp } from "@/components/ui";
import { tPwa as t } from "@/i18n/ar/pwa";

const DISMISS_KEY = "albrrak.pwa.dismissed";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * زرّ «تثبيت التطبيق» — للمستخدم المسجّل فقط، يختفي بعد التثبيت أو الرفض.
 * أندرويد/كروم: عبر beforeinstallprompt. آيفون: تعليمات «مشاركة ← إضافة إلى الشاشة الرئيسية».
 */
export function InstallButton() {
  const { me } = useMe();
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    const dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    const ios = /iphone|ipad|ipod/i.test(nav.userAgent);
    setIsIos(ios);
    if (standalone || dismissed) { setHidden(true); return; }
    if (ios) { setHidden(false); return; } // سفاري لا يدعم beforeinstallprompt

    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as InstallPromptEvent); setHidden(false); };
    const onInstalled = () => { localStorage.setItem(DISMISS_KEY, "1"); setHidden(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!me || hidden) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setHidden(true);
    setShowIosHelp(false);
  }

  async function onInstall() {
    if (isIos) { setShowIosHelp(true); return; }
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    localStorage.setItem(DISMISS_KEY, "1"); // لا يُعاد الإلحاح في الحالتين
    setHidden(true);
  }

  return (
    <div style={{ position: "fixed", insetInlineEnd: sp(4), bottom: sp(4), zIndex: 50, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: sp(2) }}>
      {showIosHelp && (
        <div style={{ background: ui.color.surface, border: `1px solid ${ui.color.border}`, borderRadius: ui.radius.md, padding: sp(3), maxWidth: 280, boxShadow: ui.shadowCard, fontFamily: ui.font, color: ui.color.text }}>
          <p style={{ margin: 0, fontWeight: 700 }}>{t("iosTitle")}</p>
          <p style={{ margin: `${sp(2)} 0 0`, fontSize: ui.text.xs }}>١) {t("iosStep1")}</p>
          <p style={{ margin: `${sp(1)} 0 0`, fontSize: ui.text.xs }}>٢) {t("iosStep2")}</p>
          <div style={{ marginTop: sp(2), textAlign: "start" }}>
            <Button size="sm" variant="ghost" onClick={() => setShowIosHelp(false)}>{t("iosClose")}</Button>
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: sp(2) }}>
        <Button size="sm" onClick={() => void onInstall()}>{t("install")}</Button>
        <Button size="sm" variant="ghost" onClick={dismiss}>{t("dismiss")}</Button>
      </div>
    </div>
  );
}
