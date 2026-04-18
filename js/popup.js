// ─── POPUP DATA ────────────────────────────────────────────────────────────
const FRAMES_DATA = [
  {
    title:   "El inicio de todo",
    message: "El momento en que te vi por primera vez, algo dentro de mí supo que eras especial. No hay palabra que describa lo que sentí.",
    image:   "https://picsum.photos/seed/aurora1/300/360",
  },
  {
    title:   "Tu sonrisa",
    message: "Tu sonrisa es lo primero que pienso cuando despierto y lo último que recuerdo antes de dormir. Eres mi luz favorita.",
    image:   "https://picsum.photos/seed/nebula2/380/420",
  },
  {
    title:   "Momentos eternos",
    message: "Contigo, hasta el silencio se vuelve mágico. Cada momento a tu lado es un recuerdo que guardo en el lugar más bonito de mi corazón.",
    image:   "https://picsum.photos/seed/cosmos3/300/370",
  },
  {
    title:   "Mi lugar favorito",
    message: "En tus brazos encontré el lugar al que siempre quise volver. No importa dónde esté, mientras estés tú, ya llegué a casa.",
    image:   "https://picsum.photos/seed/galaxy4/230/280",
  },
  {
    title:   "4 Meses de magia",
    message: "Cuatro meses de risas, de miradas, de sueños compartidos. Cuatro meses que ya parecen toda una vida, porque contigo el tiempo vuela.",
    image:   "https://picsum.photos/seed/star5/330/400",
  },
  {
    title:   "La historia más bonita",
    message: "Eres la historia más hermosa que me ha tocado vivir. Y lo mejor es que apenas estamos en el primer capítulo.",
    image:   "https://picsum.photos/seed/violet6/310/350",
  },
  {
    title:   "Gracias por elegirme",
    message: "Gracias por elegirme cada día, con mis locuras y mis defectos. Gracias por hacer de cada día ordinario algo extraordinario.",
    image:   "https://picsum.photos/seed/bloom7/330/400",
  },
  {
    title:   "Mi corazón encontró su hogar",
    message: "No sabía que me faltaba algo hasta que llegaste tú. Ahora no imagino mi mundo sin tu presencia, sin tu voz, sin tu amor.",
    image:   "https://picsum.photos/seed/night8/200/250",
  },
];

// ─── POPUP CONTROLLER ──────────────────────────────────────────────────────
const PopupController = (() => {
  const overlay   = document.getElementById('popup-overlay');
  const container = document.getElementById('popup-container');
  const closeBtn  = document.getElementById('popup-close');
  const imgEl     = document.getElementById('popup-img');
  const titleEl   = document.getElementById('popup-title');
  const msgEl     = document.getElementById('popup-message');
  const heartsBox = document.getElementById('popup-hearts-container');
  const starsBox  = document.getElementById('popup-particles');

  let isOpen       = false;
  let activeIndex  = -1;
  let heartTimeout = null;
  let starTimeout  = null;

  function spawnHearts() {
    heartsBox.innerHTML = '';
    const emojis  = ['♥', '♡', '❤', '💜', '✦', '✧', '♥'];
    const count   = 18;

    for (let i = 0; i < count; i++) {
      const h   = document.createElement('div');
      h.className = 'popup-heart';
      h.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      const size  = 0.7 + Math.random() * 1.2;
      const left  = 10 + Math.random() * 80;
      const rot   = -30 + Math.random() * 60;
      const delay = Math.random() * 2.5;
      const dur   = 3 + Math.random() * 3;
      const colorMap = ['#ec4899', '#a855f7', '#d4af37', '#f0c040', '#7c3aed'];
      const color = colorMap[Math.floor(Math.random() * colorMap.length)];

      Object.assign(h.style, {
        left:      `${left}%`,
        fontSize:  `${size}rem`,
        color,
        '--dur':   `${dur}s`,
        '--delay': `${delay}s`,
        '--rot':   `${rot}deg`,
      });
      heartsBox.appendChild(h);
    }
  }

  function spawnStars() {
    starsBox.innerHTML = '';
    const count  = 24;
    const colors = ['#a855f7','#06b6d4','#ec4899','#d4af37','#7c3aed','#ffffff'];
    const cx     = container.offsetWidth  / 2;
    const cy     = container.offsetHeight / 2;

    for (let i = 0; i < count; i++) {
      const s    = document.createElement('div');
      s.className = 'popup-star-particle';
      const size  = 2 + Math.random() * 5;
      const angle = Math.random() * Math.PI * 2;
      const dist  = 80 + Math.random() * 200;
      const tx    = Math.cos(angle) * dist;
      const ty    = Math.sin(angle) * dist;
      const color = colors[Math.floor(Math.random() * colors.length)];

      Object.assign(s.style, {
        left:      `${cx + (Math.random() - 0.5) * 40}px`,
        top:       `${cy + (Math.random() - 0.5) * 40}px`,
        width:     `${size}px`,
        height:    `${size}px`,
        background: color,
        boxShadow: `0 0 ${size * 2}px ${color}`,
        '--dur':   `${0.8 + Math.random() * 1.5}s`,
        '--delay': `${Math.random() * 0.4}s`,
        '--tx':    `${tx}px`,
        '--ty':    `${ty}px`,
      });
      starsBox.appendChild(s);
    }
  }

  function open(index) {
    if (isOpen && activeIndex === index) return;

    const data      = FRAMES_DATA[index];
    activeIndex     = index;
    isOpen          = true;

    imgEl.src      = data.image;
    imgEl.alt      = data.title;
    titleEl.textContent  = data.title;
    msgEl.textContent    = data.message;

    overlay.classList.add('active');

    // Anime.js entrance
    anime({
      targets: [titleEl, msgEl],
      opacity: [0, 1],
      translateY: [20, 0],
      delay: anime.stagger(120, { start: 200 }),
      duration: 600,
      easing: 'easeOutExpo',
    });

    anime({
      targets: '.popup-ornament-top, .popup-date-badge',
      opacity: [0, 1],
      scale:   [0.5, 1],
      delay:   anime.stagger(80, { start: 100 }),
      duration: 500,
      easing: 'easeOutBack',
    });

    // Spawn particles after short delay
    clearTimeout(heartTimeout);
    clearTimeout(starTimeout);
    starTimeout  = setTimeout(spawnStars,  50);
    heartTimeout = setTimeout(spawnHearts, 300);

    // Prevent body scroll
    if (typeof Transition === 'undefined' || !Transition.isIn3D()) document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;

    anime({
      targets: container,
      scale:       [1, 0.85],
      opacity:     [1, 0],
      translateY:  [0, 30],
      duration: 350,
      easing: 'easeInExpo',
      complete() {
        overlay.classList.remove('active');
        container.style.opacity   = '';
        container.style.transform = '';
        heartsBox.innerHTML = '';
        starsBox.innerHTML  = '';
        if (typeof Transition === 'undefined' || !Transition.isIn3D()) document.body.style.overflow = '';
      }
    });
  }

  // Bind frame clicks
  function bindFrames() {
    document.querySelectorAll('.frame-wrapper').forEach((el, i) => {
      el.addEventListener('click', () => open(i));
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') open(i);
      });
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `Ver recuerdo ${i + 1}`);
    });
  }

  // Close events
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  return { open, close, bindFrames };
})();
