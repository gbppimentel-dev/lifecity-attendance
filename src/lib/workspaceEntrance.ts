import { contentRevealSelector, motionEnabled } from './motion';

export function animateWorkspaceEntrance(node: HTMLElement) {
  if (!motionEnabled() || document.hidden || typeof node.animate !== 'function') return;

  const workspaceSelector = '[data-lc-workspace-surface]';
  const easing = 'cubic-bezier(.4,0,.2,1)';
  const animations = new Map<Animation, HTMLElement>();
  const pending = new Set<Animation>();
  const revealed = new WeakSet<HTMLElement>();
  const interacted = new WeakSet<HTMLElement>();
  let frame = 0;
  let stopped = false;

  const queue = (element: HTMLElement, frames: Keyframe[], duration: number, delay = 0) => {
    const animation = element.animate(frames, { duration, delay, easing, fill: 'backwards' });
    animation.pause();
    animation.currentTime = 0;
    animations.set(animation, element);
    pending.add(animation);
    const forget = () => {
      animations.delete(animation);
      pending.delete(animation);
    };
    void animation.finished.then(forget, forget);
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (stopped || !motionEnabled() || document.hidden) {
          stop();
          return;
        }
        pending.forEach((entrance) => {
          const target = animations.get(entrance);
          if (target?.isConnected && !target.closest('[hidden],[aria-hidden="true"]'))
            entrance.play();
          else entrance.cancel();
        });
        pending.clear();
      });
    });
  };

  if (!node.querySelector(workspaceSelector) && !node.contains(document.activeElement))
    queue(node, [{ opacity: 0 }, { opacity: 1 }], 480);

  const reveal = () => {
    if (stopped || !motionEnabled() || document.hidden) return;
    let order = 0;
    node.querySelectorAll<HTMLElement>(contentRevealSelector).forEach((surface) => {
      if (
        revealed.has(surface) ||
        interacted.has(surface) ||
        surface.closest(workspaceSelector) !== node ||
        surface.parentElement?.closest(contentRevealSelector) ||
        surface.closest('.lc-motion-presence,[data-animated-content],[data-lc-loading="true"]') ||
        surface.contains(document.activeElement)
      )
        return;
      const rect = surface.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      revealed.add(surface);
      const targets = surface.matches('.dashboard-stats,.dashboard-grid')
        ? Array.from(
            surface.querySelectorAll<HTMLElement>(
              ':scope > .magic-bento__cell > .magic-bento__card',
            ),
          )
        : surface.matches('.lcd-metrics')
          ? Array.from(surface.children).filter(
              (child): child is HTMLElement => child instanceof HTMLElement,
            )
          : [surface];
      targets.forEach((target) => {
        const fadeOnly = target.querySelector(
          'dialog,video,canvas:not(.magic-bento__stars),.scanner-reader,.lmp-code',
        );
        queue(
          target,
          fadeOnly
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [
                { opacity: 0, translate: '0 16px' },
                { opacity: 1, translate: '0 0' },
              ],
          640,
          Math.min(order++ * 75, 225),
        );
      });
    });
  };
  reveal();

  const observer = new MutationObserver((records) => {
    if (
      records.some(
        (record) =>
          record.type === 'attributes' ||
          Array.from(record.addedNodes).some(
            (added) =>
              added instanceof HTMLElement &&
              (added.matches(contentRevealSelector) || added.querySelector(contentRevealSelector)),
          ),
      )
    )
      reveal();
  });
  observer.observe(node, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-lc-loading'],
  });
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    animations.forEach((_, animation) => animation.cancel());
    animations.clear();
    pending.clear();
  };
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const settle = () => {
    if (!motionEnabled()) stop();
  };
  const hide = () => {
    if (document.hidden) stop();
  };
  const interact = (event: Event) => {
    if (!(event.target instanceof HTMLElement)) return;
    const target = event.target;
    for (
      let surface: HTMLElement | null = target;
      surface && surface !== node;
      surface = surface.parentElement
    )
      if (surface.matches(contentRevealSelector)) interacted.add(surface);
    animations.forEach((surface, animation) => {
      if (surface === node || surface.contains(target)) {
        pending.delete(animation);
        animation.cancel();
      }
    });
  };
  window.addEventListener('lifecity-motion-change', settle);
  window.addEventListener('storage', settle);
  media.addEventListener('change', settle);
  node.addEventListener('pointerdown', interact, true);
  node.addEventListener('focusin', interact);
  document.addEventListener('visibilitychange', hide);
  return () => {
    stop();
    window.removeEventListener('lifecity-motion-change', settle);
    window.removeEventListener('storage', settle);
    media.removeEventListener('change', settle);
    node.removeEventListener('pointerdown', interact, true);
    node.removeEventListener('focusin', interact);
    document.removeEventListener('visibilitychange', hide);
  };
}
