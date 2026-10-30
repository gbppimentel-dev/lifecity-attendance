import { useLayoutEffect, useRef } from 'react';
import { motionEnabled } from '../lib/motion';
import './fold-text.css';

export default function FoldText({ text }: { text: string }) {
  const root = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const pieces = Array.from(element.querySelectorAll<HTMLElement>('.fold-text-piece'));
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animations = new Map<HTMLElement, Animation>();
    let revealing = false;
    let generation = 0;
    const stop = () => {
      generation++;
      animations.forEach((animation) => animation.cancel());
      animations.clear();
      revealing = false;
    };
    const reveal = () => {
      stop();
      if (!motionEnabled() || !element.getClientRects().length) return;
      revealing = true;
      const current = generation;
      const pending = pieces.map((piece, index) => {
        const animation = piece.animate(
          [
            { transform: 'rotateX(-92deg)', opacity: 0 },
            { transform: 'rotateX(0deg)', opacity: 1 },
          ],
          {
            duration: 650,
            delay: index * 45,
            easing: 'cubic-bezier(.215,.61,.355,1)',
            fill: 'backwards',
          },
        );
        animations.set(piece, animation);
        return animation.finished.catch(() => {});
      });
      void Promise.all(pending).then(() => {
        if (generation === current) revealing = false;
      });
    };
    const tilt = (event?: PointerEvent) => {
      if (revealing || !motionEnabled() || (event && event.pointerType !== 'mouse')) return;
      pieces.forEach((piece) => {
        const box = piece.getBoundingClientRect();
        const distance = event
          ? Math.hypot(
              box.left + box.width / 2 - event.clientX,
              box.top + box.height / 2 - event.clientY,
            )
          : 140;
        const angle = -35 * Math.max(0, 1 - distance / 140);
        const from = getComputedStyle(piece).transform;
        animations.get(piece)?.cancel();
        animations.set(
          piece,
          piece.animate([{ transform: from }, { transform: `rotateX(${angle}deg)` }], {
            duration: 300,
            easing: 'ease-out',
            fill: 'forwards',
          }),
        );
      });
    };
    const leave = () => tilt();
    reveal();
    media.addEventListener('change', reveal);
    window.addEventListener('lifecity-motion-change', reveal);
    element.addEventListener('pointermove', tilt);
    element.addEventListener('pointerleave', leave);
    return () => {
      stop();
      media.removeEventListener('change', reveal);
      window.removeEventListener('lifecity-motion-change', reveal);
      element.removeEventListener('pointermove', tilt);
      element.removeEventListener('pointerleave', leave);
    };
  }, [text]);

  return (
    <span ref={root} className="fold-text">
      <span className="fold-text-sr-only">{text}</span>
      <span aria-hidden="true">
        {text.split(/(\s+)/).map((word, index) =>
          /^\s+$/.test(word) ? (
            word
          ) : (
            <span className="fold-text-word" key={index}>
              {Array.from(word).map((char, i) => (
                <span className="fold-text-segment" key={i}>
                  <span className="fold-text-piece" data-fold-text={char}>
                    {char}
                  </span>
                </span>
              ))}
            </span>
          ),
        )}
      </span>
    </span>
  );
}
