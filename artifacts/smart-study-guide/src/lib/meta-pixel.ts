type MetaPixelEvent = "CompleteRegistration" | "InitiateCheckout" | "Purchase";
type MetaPixelParams = { value: number; currency: string };

declare global {
  interface Window {
    fbq?: (action: "track", event: MetaPixelEvent, params?: MetaPixelParams) => void;
  }
}

export function trackMetaPixel(event: MetaPixelEvent, params?: MetaPixelParams): boolean {
  if (typeof window.fbq !== "function") return false;

  try {
    if (params) window.fbq("track", event, params);
    else window.fbq("track", event);
    return true;
  } catch {
    // Analytics must never interrupt signup or checkout.
    return false;
  }
}