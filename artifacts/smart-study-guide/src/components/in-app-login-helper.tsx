import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { detectInAppBrowser } from "@/lib/in-app-browser";

type BrowserInfo = ReturnType<typeof detectInAppBrowser>;
type HelperEvent = "inapp_helper_shown" | "inapp_open_chrome_click";

declare global {
  interface Window {
    gtag?: (command: "event", event: HelperEvent, params: { app: BrowserInfo["app"]; os: BrowserInfo["os"] }) => void;
  }
}

function trackHelperEvent(event: HelperEvent, browser: BrowserInfo) {
  try {
    window.gtag?.("event", event, { app: browser.app, os: browser.os });
  } catch {
    // Analytics must not interfere with signing in or opening Chrome.
  }
}

export function InAppLoginHelper({ browser }: { browser: BrowserInfo }) {
  const trackedShown = useRef(false);

  useEffect(() => {
    if (!browser.isInApp || trackedShown.current) return;
    trackedShown.current = true;
    trackHelperEvent("inapp_helper_shown", browser);
  }, [browser.app, browser.os, browser.isInApp]);

  if (!browser.isInApp) return null;

  const chromeIntentUrl = browser.os === "android"
    ? `intent://topperstrick.com${window.location.pathname}${window.location.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(`https://${window.location.host}${window.location.pathname}${window.location.search}`)};end`
    : null;

  return (
    <aside
      data-testid="inapp-login-helper"
      className="mx-auto w-full max-w-[440px] rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-left text-sm text-foreground"
    >
      <p className="leading-relaxed">
        Google password yaad nahi? Neeche apna email daalo — code aayega, password ki zaroorat nahi.
      </p>
      {chromeIntentUrl && (
        <Button asChild variant="outline" size="sm" className="mt-3 h-auto max-w-full whitespace-normal py-2 text-center text-xs">
          <a
            data-testid="link-open-in-chrome"
            href={chromeIntentUrl}
            onClick={() => trackHelperEvent("inapp_open_chrome_click", browser)}
          >
            Chrome mein kholo — 1 tap Google login
          </a>
        </Button>
      )}
    </aside>
  );
}