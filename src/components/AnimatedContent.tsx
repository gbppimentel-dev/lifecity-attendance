import {
  createElement,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') gsap.registerPlugin(ScrollTrigger);

export type AnimatedContentOptions = {
  container?: string | HTMLElement | Window;
  distance?: number;
  direction?: 'vertical' | 'horizontal';
  reverse?: boolean;
  duration?: number;
  ease?: string;
  initialOpacity?: number;
  animateOpacity?: boolean;
  scale?: number;
  blur?: number;
  rotate?: number;
  tilt?: number;
  wipe?: 'none' | 'up' | 'down' | 'left' | 'right' | 'center';
  threshold?: number;
  delay?: number;
  stagger?: number;
  staggerFrom?: 'start' | 'end' | 'center' | 'edges' | 'random';
  trigger?: 'scroll' | 'mount';
  once?: boolean;
  scrub?: boolean | number;
  disappearAfter?: number;
  disappearDuration?: number;
  disappearEase?: string;
  onStart?: () => void;
  onComplete?: () => void;
  onDisappearanceComplete?: () => void;
};

export type AnimatedContentHandle = {
  settle: () => void;

  destroy: () => void;
  refresh: () => void;

  finished: Promise<void>;
};

type Props = AnimatedContentOptions &
  Omit<HTMLAttributes<HTMLElement>, 'children'> & {
    children: ReactNode;
    as?: 'div' | 'section' | 'article' | 'aside';
    style?: CSSProperties;
    animationKey?: unknown;
  };
type Target = HTMLElement | SVGElement;
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const active = new WeakMap<HTMLElement, AnimatedContentHandle>();

const watched = new Map<HTMLElement, () => void>();
let motionMedia: MediaQueryList | undefined;
let preferenceObserver: MutationObserver | undefined;
const getMotionMedia = () =>
  (motionMedia ??= window.matchMedia('(prefers-reduced-motion: reduce)'));
const contentMotionAllowed = () =>
  document.documentElement.dataset.lcMotion !== 'off' && !getMotionMedia().matches;
function settleWatched() {
  [...watched.values()].forEach((settle) => settle());
}
function sharedPreferenceChanged() {
  if (!contentMotionAllowed()) settleWatched();
}
function sharedVisibilityChanged() {
  if (document.hidden) settleWatched();
}
function sharedInteraction(event: Event) {
  event.composedPath().forEach((node) => {
    if (node instanceof HTMLElement) watched.get(node)?.();
  });
}
function watchMotion(element: HTMLElement, settle: () => void) {
  if (!watched.size) {
    preferenceObserver = new MutationObserver(sharedPreferenceChanged);
    preferenceObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-lc-motion'],
    });
    getMotionMedia().addEventListener('change', sharedPreferenceChanged);
    document.addEventListener('visibilitychange', sharedVisibilityChanged);
    document.addEventListener('pointerdown', sharedInteraction, true);
    document.addEventListener('focusin', sharedInteraction, true);
  }
  watched.set(element, settle);
  return () => {
    if (watched.get(element) !== settle) return;
    watched.delete(element);
    if (watched.size) return;
    preferenceObserver?.disconnect();
    preferenceObserver = undefined;
    getMotionMedia().removeEventListener('change', sharedPreferenceChanged);
    document.removeEventListener('visibilitychange', sharedVisibilityChanged);
    document.removeEventListener('pointerdown', sharedInteraction, true);
    document.removeEventListener('focusin', sharedInteraction, true);
  };
}
const finite = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));
const WIPES = {
  up: 'linear-gradient(to top, #000 calc(var(--ac-wipe) * 140% - 40%), transparent calc(var(--ac-wipe) * 140%))',
  down: 'linear-gradient(to bottom, #000 calc(var(--ac-wipe) * 140% - 40%), transparent calc(var(--ac-wipe) * 140%))',
  left: 'linear-gradient(to left, #000 calc(var(--ac-wipe) * 140% - 40%), transparent calc(var(--ac-wipe) * 140%))',
  right:
    'linear-gradient(to right, #000 calc(var(--ac-wipe) * 140% - 40%), transparent calc(var(--ac-wipe) * 140%))',
  center:
    'radial-gradient(farthest-corner at 50% 50%, #000 calc(var(--ac-wipe) * 140% - 40%), transparent calc(var(--ac-wipe) * 140%))',
};

export function animateContent(
  element: HTMLElement,
  options: AnimatedContentOptions = {},
): AnimatedContentHandle {
  active.get(element)?.destroy();
  const {
    container,
    distance = 100,
    direction = 'vertical',
    reverse = false,
    duration = 0.8,
    ease = 'power3.out',
    initialOpacity = 0,
    animateOpacity = true,
    scale = 1,
    blur = 0,
    rotate = 0,
    tilt = 0,
    wipe = 'none',
    threshold = 0.1,
    delay = 0,
    stagger = 0,
    staggerFrom = 'start',
    trigger = 'scroll',
    once = true,
    scrub = false,
    disappearAfter = 0,
    disappearDuration = 0.5,
    disappearEase = 'power3.in',
    onStart,
    onComplete,
    onDisappearanceComplete,
  } = options;
  const children = Array.from(element.children).filter(
    (child): child is Target =>
      (child instanceof HTMLElement || child instanceof SVGElement) &&
      child.getAttribute('aria-hidden') !== 'true',
  );
  const targets: Target[] = stagger > 0 && children.length ? children : [element];
  const hasTransform =
    finite(distance, 100) !== 0 ||
    finite(scale, 1) !== 1 ||
    !!rotate ||
    !!tilt ||
    disappearAfter > 0;

  const ownedStyles = [
    'opacity',
    ...(hasTransform ? ['transform', 'transform-origin', 'perspective'] : []),
    ...(blur > 0 ? ['filter'] : []),
    ...(wipe !== 'none' ? ['mask-image', '-webkit-mask-image', '--ac-wipe'] : []),
  ];
  const original = targets.map((target) => ({
    target,
    properties: ownedStyles.map((name) => ({
      name,
      value: target.style.getPropertyValue(name),
      priority: target.style.getPropertyPriority(name),
    })),
  }));
  let context: gsap.Context | null = null;
  let timeline: gsap.core.Timeline | null = null;
  let scroll: ScrollTrigger | null = null;
  let disappearance: gsap.core.Tween | null = null;
  let disposed = false,
    settled = false,
    completed = false;
  let resolveFinished: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });
  let unwatch: (() => void) | undefined;
  const stopped = () => disposed || settled;
  const restore = () => {
    original.forEach(({ target, properties }) =>
      properties.forEach(({ name, value, priority }) => {
        if (value) target.style.setProperty(name, value, priority);
        else target.style.removeProperty(name);
      }),
    );
  };
  const stopWatching = () => {
    unwatch?.();
    unwatch = undefined;
  };
  const stopAnimation = () => {
    disappearance?.kill();
    disappearance = null;
    scroll?.kill();
    scroll = null;
    timeline?.kill();
    timeline = null;
    context?.revert();
    context = null;
    restore();
  };
  function settle() {
    if (stopped()) return;
    settled = true;
    stopWatching();
    stopAnimation();
    if (active.get(element) === handle) active.delete(element);
    resolveFinished();
    if (!completed) {
      completed = true;
      onComplete?.();
    }
  }
  function destroy() {
    if (disposed) return;
    disposed = true;
    stopWatching();

    if (!settled) stopAnimation();
    if (active.get(element) === handle) active.delete(element);
    resolveFinished();
  }
  const handle: AnimatedContentHandle = {
    settle,
    destroy,
    refresh: () => {
      if (!stopped()) scroll?.refresh();
    },
    finished,
  };
  active.set(element, handle);

  if (
    !contentMotionAllowed() ||
    document.hidden ||
    duration <= 0 ||
    element.contains(document.activeElement)
  ) {
    settle();
    return handle;
  }

  unwatch = watchMotion(element, settle);

  try {
    const scroller =
      typeof container === 'string'
        ? document.querySelector<HTMLElement>(container)
        : (container ?? document.getElementById('snap-main-container'));
    const horizontal = direction === 'horizontal',
      axis = horizontal ? 'x' : 'y',
      sign = reverse ? -1 : 1;
    const mask = wipe === 'none' ? undefined : WIPES[wipe];
    const from: gsap.TweenVars = {
      opacity: animateOpacity ? clamp(finite(initialOpacity, 0), 0, 1) : 1,
    };
    const to: gsap.TweenVars = { opacity: 1, duration: Math.max(0, finite(duration, 0.8)), ease };
    if (hasTransform) {
      from[axis] = finite(distance, 100) * sign;
      from.scale = finite(scale, 1);
      to[axis] = 0;
      to.scale = 1;
    }
    if (blur > 0) {
      from.filter = `blur(${blur}px)`;
      to.filter = 'blur(0px)';
    }
    if (rotate) {
      from.rotation = rotate * sign;
      to.rotation = 0;
    }
    if (tilt) {
      const tiltAxis = horizontal ? 'rotationY' : 'rotationX';
      from[tiltAxis] = horizontal ? -tilt * sign : tilt * sign;
      to[tiltAxis] = 0;
      from.transformPerspective = 900;
      to.transformPerspective = 900;
    }
    if (mask) {
      from['--ac-wipe'] = 0;
      to['--ac-wipe'] = 1;
    }
    if (stagger > 0) to.stagger = { each: stagger, from: staggerFrom };

    const restorePresentation = () => {
      gsap.set(targets, { clearProps: ownedStyles.join(',') });
      restore();
    };
    const disappear = () => {
      if (stopped() || disappearAfter <= 0) return;
      const out: gsap.TweenVars = {
        [axis]: -finite(distance, 100) * sign,
        scale: 0.8,
        opacity: animateOpacity ? clamp(initialOpacity, 0, 1) : 0,
        delay: Math.max(0, disappearAfter),
        duration: Math.max(0, disappearDuration),
        ease: disappearEase,
        onComplete: () => {
          if (!stopped()) onDisappearanceComplete?.();
        },
      };
      if (blur > 0) out.filter = `blur(${blur}px)`;
      if (stagger > 0) out.stagger = { each: stagger, from: staggerFrom };
      disappearance = gsap.to(targets, out);
    };
    context = gsap.context(() => {
      if (mask) gsap.set(targets, { maskImage: mask, webkitMaskImage: mask });
      timeline = gsap.timeline({
        paused: true,
        onStart: () => {
          if (!stopped()) onStart?.();
        },
        onComplete: () => {
          if (stopped()) return;
          completed = true;
          if (once && !scrub && disappearAfter <= 0) {
            settled = true;
            stopWatching();
            stopAnimation();
            if (active.get(element) === handle) active.delete(element);
          } else if (!scrub) restorePresentation();
          resolveFinished();
          onComplete?.();
          if (!stopped() && once && !scrub) disappear();
        },
      });
      timeline.fromTo(targets, from, to, scrub ? 0 : Math.max(0, finite(delay, 0)));
      if (stopped()) return;
      if (trigger === 'mount') {
        timeline.play();
        return;
      }
      const start = `top ${(1 - clamp(threshold, 0, 1)) * 100}%`;
      if (scrub) {
        scroll = ScrollTrigger.create({
          trigger: element,
          scroller: scroller ?? undefined,
          start,
          end: `top ${Math.max((1 - clamp(threshold, 0, 1)) * 100 - 45, 5)}%`,
          scrub: scrub === true ? true : Math.max(Number(scrub) || 0, 0.01),
          animation: timeline,
        });
      } else {
        scroll = ScrollTrigger.create({
          trigger: element,
          scroller: scroller ?? undefined,
          start,
          once,
          onEnter: () => {
            if (!stopped()) {
              completed = false;
              timeline?.play();
            }
          },
          onLeaveBack: once
            ? undefined
            : () => {
                if (stopped()) return;
                completed = false;
                if (mask) gsap.set(targets, { maskImage: mask, webkitMaskImage: mask });
                timeline?.reverse();
              },
        });
      }
    }, element);
    if (stopped()) {
      context.revert();
      context = null;
      restore();
    }
  } catch {
    settle();
  }
  return handle;
}

export default function AnimatedContent({
  children,
  as = 'div',
  container,
  distance = 100,
  direction = 'vertical',
  reverse = false,
  duration = 0.8,
  ease = 'power3.out',
  initialOpacity = 0,
  animateOpacity = true,
  scale = 1,
  blur = 0,
  rotate = 0,
  tilt = 0,
  wipe = 'none',
  threshold = 0.1,
  delay = 0,
  stagger = 0,
  staggerFrom = 'start',
  trigger = 'scroll',
  once = true,
  scrub = false,
  disappearAfter = 0,
  disappearDuration = 0.5,
  disappearEase = 'power3.in',
  onStart,
  onComplete,
  onDisappearanceComplete,
  animationKey,
  className = '',
  style,
  ...attributes
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const callbacks = useRef({ onStart, onComplete, onDisappearanceComplete });
  callbacks.current = { onStart, onComplete, onDisappearanceComplete };
  useClientLayoutEffect(() => {
    if (!ref.current) return;
    const controller = animateContent(ref.current, {
      container,
      distance,
      direction,
      reverse,
      duration,
      ease,
      initialOpacity,
      animateOpacity,
      scale,
      blur,
      rotate,
      tilt,
      wipe,
      threshold,
      delay,
      stagger,
      staggerFrom,
      trigger,
      once,
      scrub,
      disappearAfter,
      disappearDuration,
      disappearEase,
      onStart: () => callbacks.current.onStart?.(),
      onComplete: () => callbacks.current.onComplete?.(),
      onDisappearanceComplete: () => callbacks.current.onDisappearanceComplete?.(),
    });
    return () => controller.destroy();
  }, [
    container,
    distance,
    direction,
    reverse,
    duration,
    ease,
    initialOpacity,
    animateOpacity,
    scale,
    blur,
    rotate,
    tilt,
    wipe,
    threshold,
    delay,
    stagger,
    staggerFrom,
    trigger,
    once,
    scrub,
    disappearAfter,
    disappearDuration,
    disappearEase,
    animationKey,
  ]);
  return createElement(
    as,
    {
      ...attributes,
      ref,
      className: `animated-content${className ? ` ${className}` : ''}`,
      style,
      'data-animated-content': '',
    },
    children,
  );
}
