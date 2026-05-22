/**
 * ScreenGuard — anti-screenshot deterrents for the web platform.
 *
 * True OS-level screenshot blocking is impossible in browsers.
 * This component implements the best available web countermeasures:
 *   1. Tiled user watermark overlay (identifies who took the screenshot)
 *   2. Keyboard shortcut blocking (PrintScreen, Ctrl+P, Ctrl+Shift+S, etc.)
 *   3. Global CSS: user-select:none, -webkit-touch-callout:none
 *   4. Right-click disabled on <img> and <video> elements (via global listener)
 */

import { useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';

// Keys that trigger screen capture / print on desktop browsers
const BLOCKED_KEYS = new Set([
  'PrintScreen',
  'F12',        // DevTools (also can screenshot)
]);

const BLOCKED_CTRL_KEYS = new Set([
  'p',          // Ctrl+P — print (with screenshot)
  'P',
  's',          // Ctrl+S — save page
  'S',
  'u',          // Ctrl+U — view source
  'U',
]);

const BLOCKED_CTRL_SHIFT_KEYS = new Set([
  's', 'S',     // Ctrl+Shift+S — save as
  'i', 'I',     // Ctrl+Shift+I — DevTools
  'j', 'J',     // Ctrl+Shift+J — Console
]);

function buildWatermarkSvg(text: string): string {
  // Build a tileable SVG watermark with the user's name at 45°
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">
    <text
      x="50%" y="50%"
      dominant-baseline="middle"
      text-anchor="middle"
      font-family="system-ui, sans-serif"
      font-size="13"
      font-weight="600"
      fill="rgba(255,255,255,0.07)"
      transform="rotate(-30, 160, 90)"
      letter-spacing="1"
    >${escaped}</text>
  </svg>`;

  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

export default function ScreenGuard() {
  const { user } = useAuth();

  const watermarkLabel = useMemo(() => {
    if (!user) return 'nosigilo.net';
    const parts = [user.name, user.id ? `#${String(user.id).slice(-6)}` : ''].filter(Boolean);
    return parts.join(' ');
  }, [user?.id, user?.name]);

  const watermarkBg = useMemo(() => buildWatermarkSvg(watermarkLabel), [watermarkLabel]);

  // 1. Keyboard blocker
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // PrintScreen / bare blocked keys
      if (BLOCKED_KEYS.has(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // Ctrl / Cmd combos
      if (e.ctrlKey || e.metaKey) {
        if (e.shiftKey && BLOCKED_CTRL_SHIFT_KEYS.has(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (!e.shiftKey && BLOCKED_CTRL_KEYS.has(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
    };

    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, []);

  // 2. Right-click blocker on media elements
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG' || target.tagName === 'VIDEO') {
        e.preventDefault();
      }
    };
    document.addEventListener('contextmenu', handler, { capture: true });
    return () => document.removeEventListener('contextmenu', handler, { capture: true });
  }, []);

  // 3. Global CSS injection: user-select + touch-callout
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'screen-guard-css';
    style.textContent = `
      * {
        -webkit-touch-callout: none !important;
      }
      img, video {
        -webkit-user-drag: none !important;
        user-drag: none !important;
        pointer-events: auto;
      }
      @media print {
        body { display: none !important; }
      }
    `;
    document.head.appendChild(style);
    return () => document.getElementById('screen-guard-css')?.remove();
  }, []);

  // 4. Tiled watermark overlay (fixed, pointer-events:none so UI is unaffected)
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        pointerEvents: 'none',
        userSelect: 'none',
        backgroundImage: watermarkBg,
        backgroundRepeat: 'repeat',
        backgroundSize: '320px 180px',
        mixBlendMode: 'screen',
      }}
    />
  );
}
