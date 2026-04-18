// ─── MAIN APPLICATION ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Popup is triggered only from inside the 3D museum (museum3d.js raycaster)
  // The 2D diorama frames are decorative only — no click handlers here.

  // ── ENTRANCE ANIMATION SEQUENCE ──────────────────────────────────────────
  const tl = anime.timeline({ easing: 'easeOutExpo' });

  // 1. Date badge
  tl.add({
    targets: '#date-badge',
    opacity: [0, 1],
    translateY: [-20, 0],
    duration: 700,
  }, 200);

  // 2. Main title
  tl.add({
    targets: '#main-title',
    opacity: [0, 1],
    translateY: [-30, 0],
    duration: 900,
  }, 400);

  // 3. Subtitle + ornament
  tl.add({
    targets: ['#subtitle', '.title-ornament'],
    opacity: [0, 1],
    translateY: [15, 0],
    delay: anime.stagger(120),
    duration: 700,
  }, 900);

  // 4. Hint text
  tl.add({
    targets: '#hint-text',
    opacity: [0, 1],
    duration: 600,
  }, 1200);

  // 5. Room box reveal
  tl.add({
    targets: '#room-box',
    opacity: [0, 1],
    duration: 1000,
  }, 1300);

  // 6. Frames staggered entrance (from left to right, top to bottom)
  tl.add({
    targets: '.frame-wrapper',
    opacity: [0, 1],
    translateZ: [-30, 0],
    scale: [0.7, 1],
    delay: anime.stagger(130, { from: 'first' }),
    duration: 700,
    easing: 'easeOutBack',
  }, 1600);

  // 7. Figurines entrance
  tl.add({
    targets: '.figurine',
    opacity: [0, 1],
    translateY: [20, 0],
    delay: anime.stagger(100),
    duration: 500,
  }, 2200);

  // 8. Decorative elements
  tl.add({
    targets: ['.mini-plant', '.mini-vase'],
    opacity: [0, 1],
    scale: [0, 1],
    delay: anime.stagger(80),
    duration: 400,
    easing: 'easeOutBack',
  }, 2400);

  // 9. Footer
  tl.add({
    targets: ['#love-footer .footer-msg', '#love-footer .footer-hearts'],
    opacity: [0, 1],
    translateY: [20, 0],
    delay: anime.stagger(200),
    duration: 700,
  }, 2600);

  // 10. Enter 3D button
  tl.add({
    targets: '#enter-3d-wrapper',
    opacity: [0, 1],
    translateY: [24, 0],
    duration: 750,
    easing: 'easeOutBack',
  }, 3000);

  // ── CANDLE LIGHT PULSE ────────────────────────────────────────────────────
  // Animate the left wall light and candle glow
  anime({
    targets: '.wall-light-source',
    opacity: [0.4, 1],
    scale:   [0.85, 1.15],
    duration: 1800,
    direction: 'alternate',
    loop: true,
    easing: 'easeInOutSine',
  });

  // ── MOUSE PARALLAX ────────────────────────────────────────────────────────
  let targetRotX = 6, targetRotY = -2;
  let currentRotX = 6, currentRotY = -2;

  document.addEventListener('mousemove', e => {
    if (typeof Transition !== 'undefined' && Transition.isIn3D()) return;
    const cx   = window.innerWidth  / 2;
    const cy   = window.innerHeight / 2;
    const dx   = (e.clientX - cx) / cx;
    const dy   = (e.clientY - cy) / cy;
    targetRotX = 6 - dy * 3.5;
    targetRotY = -2 + dx * 4;
  });

  document.addEventListener('mouseleave', () => {
    targetRotX = 6;
    targetRotY = -2;
  });

  // Smooth parallax loop
  const roomBox = document.getElementById('room-box');
  function parallaxLoop() {
    currentRotX += (targetRotX - currentRotX) * 0.06;
    currentRotY += (targetRotY - currentRotY) * 0.06;

    const rx = currentRotX.toFixed(3);
    const ry = currentRotY.toFixed(3);
    roomBox.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;

    requestAnimationFrame(parallaxLoop);
  }
  requestAnimationFrame(parallaxLoop);

  // ── FRAME HOVER PULSE ─────────────────────────────────────────────────────
  // Random subtle glow animation per frame
  document.querySelectorAll('.frame-glow').forEach((el, i) => {
    anime({
      targets: el,
      boxShadow: [
        '0 0 15px rgba(212,175,55,0.12), 0 0 30px rgba(168,85,247,0.06)',
        '0 0 30px rgba(212,175,55,0.30), 0 0 60px rgba(168,85,247,0.15)',
      ],
      duration: 2200 + i * 400,
      delay: i * 300,
      direction: 'alternate',
      loop: true,
      easing: 'easeInOutSine',
    });
  });

  // ── GOLD SHIMMER on title accent ─────────────────────────────────────────
  anime({
    targets: '.title-accent',
    backgroundPositionX: ['0%', '200%'],
    duration: 4000,
    loop: true,
    easing: 'linear',
  });

  // ── FOOTER HEARTS ─────────────────────────────────────────────────────────
  const footerHeartEls = document.querySelectorAll('.footer-hearts span');
  footerHeartEls.forEach((el, i) => {
    anime({
      targets: el,
      scale:    [1, 1.4, 1],
      duration: 1400,
      delay:    i * 280,
      loop: true,
      easing: 'easeInOutQuad',
    });
  });

  // ── WALL AURORA ANIMATION ─────────────────────────────────────────────────
  anime({
    targets: '.wall-aurora',
    filter: [
      'hue-rotate(0deg) brightness(1)',
      'hue-rotate(30deg) brightness(1.15)',
    ],
    duration: 8000,
    direction: 'alternate',
    loop: true,
    easing: 'easeInOutSine',
  });

  // ── TITLE BADGE SPARKLE ───────────────────────────────────────────────────
  setInterval(() => {
    const badge = document.getElementById('date-badge');
    anime({
      targets: badge,
      scale:   [1, 1.05, 1],
      duration: 600,
      easing: 'easeInOutQuad',
    });
  }, 5000);

  // ── FIGURINE SUBTLE SWAY ──────────────────────────────────────────────────
  document.querySelectorAll('.figurine').forEach((el, i) => {
    anime({
      targets: el,
      translateY: [0, -4 - i, 0],
      duration:   3500 + i * 600,
      delay:      i * 400,
      direction:  'alternate',
      loop: true,
      easing: 'easeInOutSine',
    });
  });

  // ── ROOM BORDER GLOW CYCLE ────────────────────────────────────────────────
  anime({
    targets: '.glass-front',
    boxShadow: [
      'inset 0 0 0 1px rgba(168,85,247,0.1)',
      'inset 0 0 0 1px rgba(168,85,247,0.35)',
    ],
    duration: 3000,
    direction: 'alternate',
    loop: true,
    easing: 'easeInOutSine',
  });

  // ── NEBULA WALL DRIFT ─────────────────────────────────────────────────────
  anime({
    targets: '.wall-nebula',
    translateX: [0, 6],
    translateY: [0, -4],
    scale:      [1, 1.025],
    duration:   12000,
    direction:  'alternate',
    loop: true,
    easing: 'easeInOutSine',
  });

  console.log('%c♥ Nuestro Pequeño Museo · 4 Meses ♥',
    'color: #a855f7; font-size: 18px; font-family: serif; padding: 8px;');
});
