'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   TRANSITION  —  orchestrates 2D ↔ 3D view swap with particle burst + fade
   Depends on: anime.min.js, museum3d.js
───────────────────────────────────────────────────────────────────────────── */
const Transition = (() => {

  let _in3D = false;

  const SELECTORS_2D = [
    '#site-header', '#museum-scene-section',
    '#enter-3d-wrapper', '#love-footer',
  ];

  /* ── enter 2D → 3D ──────────────────────────────────────────────────────── */
  function enterMuseum() {
    if (_in3D) return;

    const btn     = document.getElementById('enter-3d-btn');
    const overlay = document.getElementById('transition-overlay');
    const wrap3d  = document.getElementById('museum-3d-container');

    if (btn) btn.disabled = true;

    // 1. Particle burst from the button
    _burst(btn);

    // 2. Fade to dark
    setTimeout(() => {
      anime({
        targets: overlay,
        opacity: [0, 1],
        duration: 680,
        easing: 'easeInQuad',
        complete() {
          // 3. Swap views
          SELECTORS_2D.forEach(sel => {
            const el = document.querySelector(sel);
            if (el) el.style.display = 'none';
          });

          wrap3d.style.display = 'block';
          _in3D = true;

          // 4. Init 3D scene
          Museum3D.init(() => {
            // Controls hint fades after 3.5 s
            const hint = document.getElementById('controls-hint-3d');
            if (hint) {
              hint.style.opacity = '1';
              setTimeout(() => anime({
                targets: hint, opacity: 0, duration: 900, easing: 'easeOutQuad',
              }), 3500);
            }
          });

          // 5. Reveal 3D
          anime({
            targets: overlay,
            opacity: [1, 0],
            duration: 950,
            delay: 280,
            easing: 'easeOutQuad',
          });
        },
      });
    }, 320);
  }

  /* ── exit 3D → 2D ───────────────────────────────────────────────────────── */
  function exitMuseum() {
    if (!_in3D) return;

    if (typeof PopupController !== 'undefined') PopupController.close();

    const overlay = document.getElementById('transition-overlay');
    const wrap3d  = document.getElementById('museum-3d-container');
    const btn     = document.getElementById('enter-3d-btn');

    anime({
      targets: overlay,
      opacity: [0, 1],
      duration: 550,
      easing: 'easeInQuad',
      complete() {
        Museum3D.destroy();
        wrap3d.style.display = 'none';
        _in3D = false;

        // Restore 2D
        SELECTORS_2D.forEach(sel => {
          const el = document.querySelector(sel);
          if (el) el.style.display = '';
        });

        if (btn) btn.disabled = false;

        anime({
          targets: overlay,
          opacity: [1, 0],
          duration: 720,
          delay: 120,
          easing: 'easeOutQuad',
        });
      },
    });
  }

  /* ── particle burst helper ──────────────────────────────────────────────── */
  function _burst(btn) {
    if (!btn) return;
    const rect   = btn.getBoundingClientRect();
    const cx     = rect.left + rect.width  / 2;
    const cy     = rect.top  + rect.height / 2;
    const colors = ['#a855f7','#06b6d4','#ec4899','#d4af37','#7c3aed','#fff','#4f46e5'];
    const COUNT  = 36;

    for (let i = 0; i < COUNT; i++) {
      const p    = document.createElement('div');
      const size = 4 + Math.random() * 7;
      Object.assign(p.style, {
        position:      'fixed',
        left:          `${cx}px`,
        top:           `${cy}px`,
        width:         `${size}px`,
        height:        `${size}px`,
        borderRadius:  '50%',
        background:    colors[i % colors.length],
        boxShadow:     `0 0 ${size*1.5}px ${colors[i % colors.length]}`,
        pointerEvents: 'none',
        zIndex:        199,
        transform:     'translate(-50%,-50%) scale(0)',
      });
      document.body.appendChild(p);

      const angle = (i / COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const dist  = 70 + Math.random() * 130;

      anime({
        targets:     p,
        translateX:  [0, Math.cos(angle) * dist],
        translateY:  [0, Math.sin(angle) * dist],
        scale:       [0, 1, 0],
        opacity:     [1, 0],
        duration:    550 + Math.random() * 350,
        delay:       Math.random() * 100,
        easing:      'easeOutQuad',
        complete:    () => p.remove(),
      });
    }
  }

  /* ── bind buttons ───────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('enter-3d-btn')
      ?.addEventListener('click', enterMuseum);

    document.getElementById('museum-exit-btn')
      ?.addEventListener('click', exitMuseum);
  });

  return {
    enterMuseum,
    exitMuseum,
    isIn3D: () => _in3D,
  };
})();
