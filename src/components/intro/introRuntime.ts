/**
 * Zero-dependency runtime helpers for the opening cinematic intro.
 * Detects Android WebView / APK containers (Median, GoNative, Capacitor, Android wv)
 * so we can avoid expensive blur/filter/mix-blend compositing passes on Android WebView
 * while keeping the desktop Chrome experience completely untouched.
 */
export function isAndroidWebViewRuntime(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent || '';
  if (!/Android/i.test(ua)) {
    return false;
  }
  const win = window as unknown as {
    median?: unknown;
    gonative?: unknown;
    Capacitor?: unknown;
  };
  if (win.median || win.gonative || win.Capacitor) {
    return true;
  }
  if (/;\s*wv\b|\bwv\)|median|gonative|Capacitor|Version\/\d+\.\d+/i.test(ua)) {
    return true;
  }
  const cores = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 8;
  return cores <= 4;
}

const decodedImageCache = new Set<string>();

/**
 * Fetches and decodes an image off the main rendering path so subsequent
 * scene transitions do not stall on image decoding.
 */
export function preloadAndDecodeImage(src: string): Promise<void> {
  if (typeof window === 'undefined' || !src || decodedImageCache.has(src)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    const done = () => {
      decodedImageCache.add(src);
      resolve();
    };
    img.onload = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(done, done);
      } else {
        done();
      }
    };
    img.onerror = () => resolve();
    img.src = src;
  });
}
