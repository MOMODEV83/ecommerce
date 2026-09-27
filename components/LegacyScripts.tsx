"use client";

import { useEffect } from "react";
import type { LegacyScript } from "@/lib/pages";

declare global {
  interface Window {
    __legacyScriptsLoaded?: boolean;
    jQuery?: { holdReady: (hold: boolean) => void };
  }
}

function run(script: LegacyScript): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement("script");
    if (script.id) el.id = script.id;
    if (script.src) {
      el.src = script.src;
      el.async = false;
      el.onload = () => {
        // Delay jQuery's "ready" callbacks until every plugin is loaded,
        // like on the original page where they ran after DOMContentLoaded.
        if (/\/jquery\.min\./.test(script.src!)) window.jQuery?.holdReady(true);
        resolve();
      };
      el.onerror = () => resolve();
    } else {
      el.textContent = script.code ?? "";
    }
    document.body.appendChild(el);
    if (!script.src) resolve();
  });
}

/**
 * Runs the original theme scripts (jQuery plugins, sliders, etc.) in their
 * original order after hydration, then replays the DOMContentLoaded and
 * window "load" events the theme relies on (menus, cart drawer, lazy backgrounds).
 */
export default function LegacyScripts({ scripts }: { scripts: LegacyScript[] }) {
  useEffect(() => {
    if (window.__legacyScriptsLoaded) return;
    window.__legacyScriptsLoaded = true;
    (async () => {
      for (const script of scripts) await run(script);
      window.jQuery?.holdReady(false);
      document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
      window.dispatchEvent(new Event("load"));
    })();
  }, [scripts]);

  return null;
}
