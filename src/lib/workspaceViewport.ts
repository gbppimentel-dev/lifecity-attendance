import { motionEnabled } from './motion';

export function revealWorkspaceRegion(
  node: HTMLElement | null,
  align: 'nearest' | 'start' = 'nearest',
) {
  if (!node?.isConnected || node.closest('[hidden],[aria-hidden="true"]')) return;
  const viewport = window.visualViewport;
  const top = viewport?.offsetTop ?? 0;
  const bottom = top + (viewport?.height ?? innerHeight);
  const header = document.querySelector<HTMLElement>('.lc-mobile-workspace > .topbar');
  const navigation = document.querySelector<HTMLElement>('.lcm-bottom-nav');
  const headerIsFixed = header && /^(sticky|fixed)$/.test(getComputedStyle(header).position);
  const navigationIsFixed =
    navigation &&
    getComputedStyle(navigation).position === 'fixed' &&
    navigation.getClientRects().length > 0;
  const safeTop = Math.max(top, headerIsFixed ? header.getBoundingClientRect().bottom : top) + 16;
  const safeBottom =
    Math.min(bottom, navigationIsFixed ? navigation.getBoundingClientRect().top : bottom) - 16;
  const rect = node.getBoundingClientRect();
  const delta =
    align === 'start' || rect.top < safeTop
      ? rect.top - safeTop
      : rect.bottom > safeBottom
        ? Math.min(rect.top - safeTop, rect.bottom - safeBottom)
        : 0;
  if (Math.abs(delta) < 1) return;
  window.scrollTo({
    top: Math.max(0, window.scrollY + delta),
    behavior: motionEnabled() ? 'smooth' : 'auto',
  });
}
