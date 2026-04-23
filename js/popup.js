// ─── POPUP DATA ────────────────────────────────────────────────────────────
const FRAMES_DATA = [
  {
   
    image:   "assets/images/1mes1.jpeg",
  },
  {
    
    image:   "assets/images/1mes2.jpeg",
  },
  {
    
    image:   "assets/images/1mes3.jpeg",
  },
  {
   
    image:   "assets/images/1mes4.jpeg",
  },
  {
   
    image:   "assets/images/1mes5.jpeg",
  },
  {
    title:   "La historia más bonita",
    message: "Eres la historia más hermosa que me ha tocado vivir. Y lo mejor es que apenas estamos en el primer capítulo.",
    image:   "assets/images/1mes6.jpeg",
  },
  {
    title:   "Gracias por elegirme",
    message: "Gracias por elegirme cada día, con mis locuras y mis defectos. Gracias por hacer de cada día ordinario algo extraordinario.",
    image:   "assets/images/1mes7.jpeg",
  },
  {
    title:   "Mi corazón encontró su hogar",
    message: "No sabía que me faltaba algo hasta que llegaste tú. Ahora no imagino mi mundo sin tu presencia, sin tu voz, sin tu amor.",
    image:   "assets/images/1mes8.jpeg",
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

  function _applyData(data) {
    imgEl.src            = data.image;
    imgEl.alt            = data.title;
    titleEl.textContent  = data.title;
    msgEl.textContent    = data.message;

    overlay.classList.add('active');
    isOpen = true;

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

    clearTimeout(heartTimeout);
    clearTimeout(starTimeout);
    starTimeout  = setTimeout(spawnStars,  50);
    heartTimeout = setTimeout(spawnHearts, 300);

    if (typeof Transition === 'undefined' || !Transition.isIn3D()) document.body.style.overflow = 'hidden';
  }

  function open(index) {
    if (isOpen && activeIndex === index) return;
    activeIndex = index;
    _applyData(FRAMES_DATA[index]);
  }

  function openDirect(data) {
    const wasOpen = isOpen;
    if (wasOpen) close();
    activeIndex = -1;
    setTimeout(() => _applyData(data), wasOpen ? 380 : 0);
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

  return { open, openDirect, close, bindFrames };
})();
