export function detectInAppBrowser(): {
  isInApp: boolean;
  app: "instagram" | "facebook" | null;
  os: "android" | "ios" | "other";
} {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const app = /Instagram/i.test(userAgent)
    ? "instagram"
    : /FBAN|FBAV|FB_IAB|FBIOS/i.test(userAgent)
      ? "facebook"
      : null;
  const os = /Android/i.test(userAgent)
    ? "android"
    : /iPhone|iPad|iPod/i.test(userAgent)
      ? "ios"
      : "other";

  return { isInApp: app !== null, app, os };
}