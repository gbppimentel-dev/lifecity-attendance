const viewport = window.visualViewport;
let timer: ReturnType<typeof setTimeout>;
function updateKeyboard() {
  const target = document.activeElement;
  const editing =
    target instanceof HTMLElement &&
    target.matches(
      'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=button]):not([type=submit]),textarea,[contenteditable=true]',
    ) &&
    !target.matches('[readonly],[disabled]');
  const mobile = window.matchMedia('(max-width:900px)').matches;
  document.documentElement.classList.toggle('lc-keyboard-editing', mobile && editing);
  clearTimeout(timer);
  if (
    mobile &&
    editing &&
    target.closest('.lc-scan-manual,.lc-service-editor,.manual-member-search,.service-form-card') &&
    !target.closest('dialog')
  ) {
    timer = setTimeout(() => {
      if (document.activeElement !== target || !target.isConnected) return;
      const top = viewport?.offsetTop ?? 0,
        bottom = top + (viewport?.height ?? innerHeight);
      const header = document.querySelector<HTMLElement>('.lc-mobile-workspace>.topbar');
      const safeTop = Math.max(top, header?.getBoundingClientRect().bottom ?? top) + 12,
        safeBottom = bottom - 16;
      const rect = target.getBoundingClientRect();
      const delta =
        rect.top < safeTop
          ? rect.top - safeTop
          : rect.bottom > safeBottom
            ? Math.min(rect.top - safeTop, rect.bottom - safeBottom)
            : 0;
      if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: 'auto' });
    }, 180);
  }
}
viewport?.addEventListener('resize', updateKeyboard);
viewport?.addEventListener('scroll', updateKeyboard);
window.addEventListener('resize', updateKeyboard);
document.addEventListener('focusin', updateKeyboard);
document.addEventListener('focusout', () => setTimeout(updateKeyboard, 0));
