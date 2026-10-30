export function demoModeFor(mode: string | undefined, pathname: string) {
  return mode === 'demo' || pathname === '/demo' || pathname.startsWith('/demo/');
}

export function isDemoMode() {
  return demoModeFor(
    import.meta.env.VITE_APP_MODE,
    typeof window === 'undefined' ? '/' : window.location.pathname,
  );
}

export function demoPreferenceKey(key: string) {
  return isDemoMode() ? `lifecity-demo:${key}` : key;
}

function originalUrl(value: string | undefined) {
  try {
    const url = new URL(value || 'https://lifecity-attendance.vercel.app/');
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch {}
  return 'https://lifecity-attendance.vercel.app/';
}

export const originalSiteUrl = originalUrl(import.meta.env.VITE_ORIGINAL_SITE_URL);

export function prepareDemoDocument() {
  if (!isDemoMode()) return;
  document.documentElement.dataset.lcDemo = 'true';
  document.title = 'LifeCity Attendance · Portfolio Demo';
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute(
      'content',
      'Explore the complete LifeCity Attendance app with private, fictional demo data. No account required.',
    );
  document
    .querySelector('meta[name="apple-mobile-web-app-title"]')
    ?.setAttribute('content', 'LifeCity Demo');
  document
    .querySelector('link[rel="manifest"]')
    ?.setAttribute('href', '/manifest-demo.webmanifest');
}
