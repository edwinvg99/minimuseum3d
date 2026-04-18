// ─── AURORA CANVAS (smooth nebula clouds) ──────────────────────────────────
(function () {
  const canvas = document.getElementById('aurora-canvas');
  const ctx    = canvas.getContext('2d');

  let W, H, t = 0;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // Soft flowing blobs (no sharp bands)
  const blobs = [
    { color: '109, 40, 217',  bx: 0.20, by: 0.28, sx: 0.00012, sy: 0.00008, rx: 0.18, ry: 0.10, rad: 0.55, a: 0.16 },
    { color: '79, 70, 229',   bx: 0.78, by: 0.45, sx: 0.00010, sy: 0.00011, rx: 0.15, ry: 0.09, rad: 0.50, a: 0.13 },
    { color: '168, 85, 247',  bx: 0.48, by: 0.15, sx: 0.00009, sy: 0.00013, rx: 0.20, ry: 0.07, rad: 0.42, a: 0.11 },
    { color: '14, 165, 233',  bx: 0.85, by: 0.78, sx: 0.00014, sy: 0.00007, rx: 0.12, ry: 0.08, rad: 0.40, a: 0.08 },
    { color: '236, 72, 153',  bx: 0.18, by: 0.82, sx: 0.00011, sy: 0.00009, rx: 0.15, ry: 0.06, rad: 0.38, a: 0.07 },
    { color: '16, 185, 129',  bx: 0.55, by: 0.55, sx: 0.00008, sy: 0.00010, rx: 0.22, ry: 0.12, rad: 0.50, a: 0.05 },
  ];

  function render(time) {
    // Deep space base
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#050013';
    ctx.fillRect(0, 0, W, H);

    // Soft aurora blend
    ctx.globalCompositeOperation = 'screen';

    blobs.forEach(b => {
      const cx = W * (b.bx + b.rx * Math.sin(time * b.sx));
      const cy = H * (b.by + b.ry * Math.cos(time * b.sy));
      const r  = Math.min(W, H) * b.rad;

      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grd.addColorStop(0,    `rgba(${b.color},${b.a})`);
      grd.addColorStop(0.35, `rgba(${b.color},${b.a * 0.55})`);
      grd.addColorStop(0.7,  `rgba(${b.color},${b.a * 0.15})`);
      grd.addColorStop(1,    `rgba(${b.color},0)`);

      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
    });

    ctx.globalCompositeOperation = 'source-over';
  }

  let lastTime = 0;
  function loop(ts) {
    const delta = ts - lastTime;
    lastTime = ts;
    t += delta;
    render(t);
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();

// ─── STARS ─────────────────────────────────────────────────────────────────
(function () {
  const layer = document.getElementById('stars-layer');
  const count = 160;

  for (let i = 0; i < count; i++) {
    const star    = document.createElement('div');
    star.className = 'star';
    const size    = Math.random() * 2.2 + 0.4;
    const hues    = [270, 210, 330, 190, 0];
    const hue     = hues[Math.floor(Math.random() * hues.length)];
    const light   = hue === 0 ? 95 : 80;
    const delay   = -(Math.random() * 6);
    const dur     = 2.5 + Math.random() * 6;
    const minOp   = 0.05 + Math.random() * 0.15;
    const maxOp   = 0.55 + Math.random() * 0.45;

    Object.assign(star.style, {
      left:    `${Math.random() * 100}%`,
      top:     `${Math.random() * 100}%`,
      width:   `${size}px`,
      height:  `${size}px`,
      background: hue === 0 ? '#fff' : `hsl(${hue}, 85%, ${light}%)`,
      boxShadow:  hue === 0 ? '0 0 4px rgba(255,255,255,0.6)' : `0 0 ${size * 2}px hsla(${hue},85%,${light}%,0.6)`,
      '--dur':    `${dur}s`,
      '--delay':  `${delay}s`,
      '--min-op': minOp,
      '--max-op': maxOp,
    });

    layer.appendChild(star);
  }
})();

// ─── AMBIENT PARTICLES ─────────────────────────────────────────────────────
(function () {
  const layer  = document.getElementById('particles-layer');
  const colors = [
    'rgba(168,85,247,',
    'rgba(6,182,212,',
    'rgba(236,72,153,',
    'rgba(212,175,55,',
    'rgba(255,255,255,',
  ];

  for (let i = 0; i < 28; i++) {
    const p     = document.createElement('div');
    p.className = 'particle';
    const size  = Math.random() * 4 + 1.5;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const op    = 0.25 + Math.random() * 0.5;

    Object.assign(p.style, {
      left:       `${Math.random() * 100}%`,
      width:      `${size}px`,
      height:     `${size}px`,
      background: `${color}${op})`,
      boxShadow:  `0 0 ${size * 3}px ${color}0.7)`,
      '--dur':    `${9 + Math.random() * 12}s`,
      '--delay':  `${-(Math.random() * 15)}s`,
      '--op':     op,
    });

    layer.appendChild(p);
  }
})();
