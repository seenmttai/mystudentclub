const getCompanyLogoSVG = (company) => {
  const comp = (company || '').trim().toLowerCase();

  const officialLogos = {
    'amazon': 'amazon.svg',
    'flipkart': 'flipkart.svg',
    'ubs': 'ubs.svg',
    'shaw': 'deshaw.svg',
    'morgan': 'morgan_stanley.svg',
    'stanley': 'morgan_stanley.svg',
    'goldman': 'goldman_sachs.svg',
    'sachs': 'goldman_sachs.svg',
    'hdfc': 'hdfc.svg',
    'barclays': 'barclays.svg',
    'birla': 'aditya_birla.svg',
    'grasim': 'aditya_birla.svg',
    'itc': 'itc.svg',
    'kotak': 'kotak.svg',
    'cipla': 'cipla.svg',
    'hsbc': 'hsbc.svg',
    'reliance': 'reliance.svg'
  };

  for (const [key, filename] of Object.entries(officialLogos)) {
    if (comp.includes(key)) {
      return `<img src="/assets/company-logos/${filename}" alt="${company}" class="company-logo-svg" loading="lazy">`;
    }
  }

  if (comp.includes('deloitte')) {
    return `<svg viewBox="0 0 110 26" class="company-logo-svg" fill="none">
      <text x="2" y="20" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="20" font-weight="900" fill="#000000" letter-spacing="-0.5px">Deloitte<tspan fill="#86BC25">.</tspan></text>
    </svg>`;
  }

  if (comp === 'ey' || comp.includes('ernst') || comp.includes('young')) {
    return `<svg viewBox="0 0 56 26" class="company-logo-svg" fill="none">
      <text x="6" y="20" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="22" font-weight="900" fill="#111827">EY</text>
      <path d="M20 22 L44 22 L40 25 L16 25 Z" fill="#FFE600"/>
    </svg>`;
  }

  if (comp.includes('kpmg')) {
    return `<svg viewBox="0 0 76 28" class="company-logo-svg" fill="none">
      <g stroke="#00338D" stroke-width="1.2" fill="none" opacity="0.85">
        <rect x="3" y="1" width="14" height="9" rx="1.5"/>
        <rect x="21" y="1" width="14" height="9" rx="1.5"/>
        <rect x="39" y="1" width="14" height="9" rx="1.5"/>
        <rect x="57" y="1" width="14" height="9" rx="1.5"/>
      </g>
      <text x="2" y="24" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="900" font-style="italic" fill="#00338D" letter-spacing="1px">KPMG</text>
    </svg>`;
  }

  if (comp.includes('pwc') || comp.includes('pricewaterhouse')) {
    return `<svg viewBox="0 0 66 30" class="company-logo-svg" fill="none">
      <rect x="26" y="1" width="7" height="7" fill="#DC6900"/>
      <rect x="33" y="1" width="7" height="7" fill="#EB8C00"/>
      <rect x="29" y="7" width="8" height="7" fill="#E0301E"/>
      <rect x="22" y="7" width="7" height="7" fill="#FFB600"/>
      <text x="8" y="26" font-family="'Georgia', serif" font-size="18" font-weight="bold" fill="#000000" letter-spacing="-0.5px">pwc</text>
    </svg>`;
  }

  if (comp.includes('bsr')) {
    return `<svg viewBox="0 0 74 26" class="company-logo-svg" fill="none">
      <g transform="translate(2, 3)">
        <circle cx="9" cy="9" r="8" stroke="#E07A5F" stroke-width="2.2" stroke-dasharray="2.5 1.5" fill="none"/>
        <circle cx="9" cy="9" r="3.5" fill="#E07A5F"/>
      </g>
      <text x="27" y="18" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="17" font-weight="800" fill="#334155" letter-spacing="0.5px">BSR</text>
    </svg>`;
  }

  if (comp.includes('genpact')) {
    return `<svg viewBox="0 0 90 26" class="company-logo-svg" fill="none">
      <g transform="translate(1, 3)">
        <polygon points="9,1 16,5 16,13 9,17 2,13 2,5" fill="none" stroke="#E63946" stroke-width="2"/>
        <polygon points="9,1 16,5 9,9 2,5" fill="#0d9488"/>
      </g>
      <text x="24" y="18" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="15" font-weight="800" fill="#0d9488" letter-spacing="-0.3px">genpact</text>
    </svg>`;
  }

  if (comp.includes('infosys')) {
    return `<svg viewBox="0 0 80 26" class="company-logo-svg" fill="none">
      <text x="2" y="19" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="18" font-weight="700" fill="#007cc3" letter-spacing="-0.3px">Infosys</text>
    </svg>`;
  }

  if (comp.includes('amazon')) {
    return `<svg viewBox="0 0 78 26" class="company-logo-svg" fill="none">
      <text x="2" y="17" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="800" fill="#111827">amazon</text>
      <path d="M12 21 C 28 26, 48 25, 62 20" stroke="#FF9900" stroke-width="2" fill="none" stroke-linecap="round"/>
      <polygon points="62,18 67,20 62,23" fill="#FF9900"/>
    </svg>`;
  }

  if (comp.includes('flipkart')) {
    return `<svg viewBox="0 0 80 26" class="company-logo-svg" fill="none">
      <text x="2" y="18" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="800" font-style="italic" fill="#2874F0">Flipkart</text>
      <polygon points="68,9 72,13 68,17" fill="#FFE500"/>
    </svg>`;
  }

  if (comp.includes('shaw')) {
    return `<svg viewBox="0 0 105 26" class="company-logo-svg" fill="none">
      <text x="2" y="17" font-family="'Georgia', serif" font-size="12.5" font-weight="bold" fill="#002D62" letter-spacing="0.2px">DE Shaw & Co</text>
    </svg>`;
  }

  if (comp.includes('morgan') || comp.includes('stanley')) {
    return `<svg viewBox="0 0 98 26" class="company-logo-svg" fill="none">
      <text x="2" y="17" font-family="'Georgia', serif" font-size="12" font-weight="bold" fill="#111827">Morgan Stanley</text>
    </svg>`;
  }

  if (comp.includes('goldman') || comp.includes('sachs')) {
    return `<svg viewBox="0 0 92 26" class="company-logo-svg" fill="none">
      <text x="2" y="12" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="10" font-weight="800" fill="#111827">Goldman</text>
      <text x="2" y="23" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="10" font-weight="800" fill="#111827">Sachs</text>
    </svg>`;
  }

  if (comp.includes('deutsche')) {
    return `<svg viewBox="0 0 92 26" class="company-logo-svg" fill="none">
      <rect x="2" y="4" width="16" height="16" stroke="#0018A8" stroke-width="2" fill="none"/>
      <line x1="5" y1="17" x2="15" y2="7" stroke="#0018A8" stroke-width="2.2"/>
      <text x="22" y="16" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="10" font-weight="700" fill="#0018A8">Deutsche Bank</text>
    </svg>`;
  }

  if (comp.includes('ubs')) {
    return `<svg viewBox="0 0 60 26" class="company-logo-svg" fill="none">
      <text x="2" y="19" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="19" font-weight="900" fill="#E60000" letter-spacing="1.5px">UBS</text>
    </svg>`;
  }

  if (comp.includes('hdfc')) {
    return `<svg viewBox="0 0 85 26" class="company-logo-svg" fill="none">
      <rect x="2" y="4" width="16" height="16" fill="#004C8F" rx="2"/>
      <rect x="6" y="8" width="8" height="8" fill="#ED232A"/>
      <text x="22" y="17" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="12" font-weight="800" fill="#004C8F">HDFC BANK</text>
    </svg>`;
  }

  if (comp.includes('reliance')) {
    return `<svg viewBox="0 0 85 26" class="company-logo-svg" fill="none">
      <text x="2" y="18" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="15" font-weight="800" fill="#D32F2F" letter-spacing="0.5px">Reliance</text>
    </svg>`;
  }

  if (comp.includes('cummins')) {
    return `<svg viewBox="0 0 78 26" class="company-logo-svg" fill="none">
      <rect x="2" y="4" width="16" height="16" fill="#D32F2F" rx="2"/>
      <text x="6" y="16" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="12" font-weight="900" fill="#fff">C</text>
      <text x="22" y="17" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="13" font-weight="800" fill="#111827">Cummins</text>
    </svg>`;
  }

  if (comp.includes('unilever')) {
    return `<svg viewBox="0 0 78 26" class="company-logo-svg" fill="none">
      <text x="2" y="18" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="800" fill="#1F36C7">Unilever</text>
    </svg>`;
  }

  if (comp.includes('godrej')) {
    return `<svg viewBox="0 0 90 26" class="company-logo-svg" fill="none">
      <text x="2" y="18" font-family="'Brush Script MT', 'Lucida Calligraphy', cursive, sans-serif" font-size="19" font-weight="bold" fill="#0d9488">Godrej</text>
      <text x="48" y="18" font-family="'Inter', sans-serif" font-size="10" font-weight="700" fill="#64748b">Agrovet</text>
    </svg>`;
  }

  if (comp.includes('hsbc')) {
    return `<svg viewBox="0 0 75 26" class="company-logo-svg" fill="none">
      <polygon points="8,13 2,7 14,7" fill="#DB0011"/>
      <polygon points="8,13 2,19 14,19" fill="#DB0011"/>
      <polygon points="8,13 14,7 14,19" fill="#DB0011"/>
      <text x="20" y="18" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="14" font-weight="800" fill="#111827">HSBC</text>
    </svg>`;
  }

  if (comp.includes('barclays')) {
    return `<svg viewBox="0 0 85 26" class="company-logo-svg" fill="none">
      <text x="2" y="18" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="14" font-weight="800" fill="#00AEEF">BARCLAYS</text>
    </svg>`;
  }

  if (comp.includes('pepsico') || comp.includes('pepsi')) {
    return `<svg viewBox="0 0 85 26" class="company-logo-svg" fill="none">
      <text x="2" y="18" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="14" font-weight="800" fill="#004B93">PEPSICO</text>
    </svg>`;
  }

  if (comp.includes('bpcl')) {
    return `<svg viewBox="0 0 75 26" class="company-logo-svg" fill="none">
      <circle cx="10" cy="13" r="8" fill="#FFCC00"/>
      <circle cx="10" cy="13" r="4" fill="#003399"/>
      <text x="24" y="18" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="14" font-weight="900" fill="#003399">BPCL</text>
    </svg>`;
  }

  if (comp.includes('dlf')) {
    return `<svg viewBox="0 0 65 26" class="company-logo-svg" fill="none">
      <text x="2" y="18" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="900" fill="#003399">DLF</text>
    </svg>`;
  }

  return `<span class="company-fallback-badge">${company}</span>`;
};

const generateData = () => {
  // Real student profiles with their ACTUAL placement companies
  const students = [
    { name: "Gaurav Jaat", course: "CA Articleship Training Program", linkedin: "https://www.linkedin.com/in/gauravjaat/", image: "../assets/gaurav.jpg", fallback: "gaurav.jpg", company: "DE Shaw" },
    { name: "Kanchan Kulhria", course: "CA Articleship Training Program", linkedin: "https://www.linkedin.com/in/kanchankulhria/", image: "../assets/kanchan.jpg", fallback: "kanchan.jpg", company: "Amazon" },
    { name: "Anisha Joshi", course: "CA Articleship Training Program", linkedin: "https://www.linkedin.com/in/anishajoshi76/", image: "../assets/joshi.jpg", fallback: "joshi.jpg", company: "Godrej Agrovet" },
    { name: "Khushi Gandhi", course: "CA Articleship Training Program", linkedin: "https://www.linkedin.com/in/khushi-gandhi-40a37a242/", image: "../assets/khushi.jpg", fallback: "khushi.jpg", company: "Morgan Stanley" },
    { name: "Rohit Varma", course: "CA Articleship Training Program", linkedin: "https://www.linkedin.com/in/rohit-varma-0bb4792b8/", image: "../assets/varma.jpg", fallback: "varma.jpg", company: "Cummins" },
    { name: "Vedang Sawant", course: "CA Articleship Training Program", linkedin: "https://www.linkedin.com/in/vedangsawant/", image: "../assets/vedang.jpg", fallback: "vedang.jpg", company: "Flipkart" },
    { name: "Ishaan Isham", course: "CA Articleship Training Program", linkedin: "https://www.linkedin.com/in/ishaanisham/", image: "../assets/ishaan.jpg", fallback: "ishaan.jpg", company: "UBS" },
    { name: "Simran Singh", course: "CA Articleship Training Program", linkedin: "https://www.linkedin.com/in/simransingh-ca-aspirant/", image: "../assets/simran.jpg", fallback: "simran.jpg", company: "Amazon" },
    { name: "Chery Lunia", course: "CA Articleship Training Program", linkedin: "https://www.linkedin.com/in/cheryluniya/", image: "../assets/Chery.jpeg", fallback: "Chery.jpeg", company: "Goldman Sachs" },
    { name: "Ananya Gupta", course: "CA Articleship Training Program", linkedin: "https://www.linkedin.com/in/ananyagupta-ca", image: "../assets/ananya.jpg", fallback: "ananya.jpg", company: "Amazon" },
    { name: "Chandini Meher", course: "CA Articleship Training Program", linkedin: "https://www.linkedin.com/in/chandini-meher/", image: "../assets/Chandini.jpeg", fallback: "Chandini.jpeg", company: "HDFC Bank" },
    { name: "Charu Kewalramani", course: "CA Articleship Training Program", linkedin: "https://www.linkedin.com/in/charu-kewalramani-40a55930b/", image: "../assets/Charu.jpg", fallback: "Charu.jpg", company: "DE Shaw" },
    { name: "Pooja Kedia", course: "CA Articleship Training Program", linkedin: "https://www.linkedin.com/in/pooja-kedia-2578a1214/", image: "../assets/Pooja.jpg", fallback: "Pooja.jpg", company: "HSBC" },
    { name: "Piyu Jain", course: "CA Articleship Training Program", linkedin: "https://www.linkedin.com/in/piyujain/", image: "../assets/Piyu.jpg", fallback: "Piyu.jpg", company: "Reliance" },
    { name: "Anisha Nagwani", course: "CA Articleship Training Program", linkedin: "https://www.linkedin.com/in/anisha-nagwani/", image: "../assets/nagwani.jpg", fallback: "nagwani.jpg", company: "Barclays" },
    { name: "Sajal Mittal", course: "CA Articleship Training Program", linkedin: "https://www.linkedin.com/in/sajalmittal15/", image: "../assets/sajal.jpg", fallback: "sajal.jpg", company: "PepsiCo" },
    { name: "Kirti Yadav", course: "CA Articleship Training Program", linkedin: "https://www.linkedin.com/in/kirtiyadav07/", image: "../assets/Kirti.jpeg", fallback: "Kirti.jpeg", company: "DLF" },
    { name: "Aakanksha Lolge", course: "CA Articleship Training Program", linkedin: "https://www.linkedin.com/in/aakankshalolge/", image: "../assets/Aakanksha-Lolge.jpg", fallback: "Aakanksha-Lolge.jpg", company: "BPCL" }
  ];

  return { students };
};

const initializeCarousel = () => {
  const { students } = generateData();
  const carousel = document.getElementById('studentCarousel');
  const carouselContainer = document.getElementById('studentCarouselContainer');
  const prevBtn = document.getElementById('studentCarouselPrev');
  const nextBtn = document.getElementById('studentCarouselNext');

  if (!carousel) return;
  carousel.innerHTML = '';

  students.forEach(student => {
    if (!student.image) return;
    const card = document.createElement('div');
    card.className = 'student-card';
    card.innerHTML = `
      <div class="student-avatar-ring">
        <img src="${student.image}" alt="${student.name}" loading="lazy" decoding="async" onerror="this.onerror=null; this.src='https://www.mystudentclub.com/assets/${student.fallback || 'icon-70x70.png'}';" />
      </div>
      <h3 class="student-name" title="${student.name}">${student.name}</h3>
      <div class="student-firm-label">Placed at</div>
      <div class="student-company-logo">
        ${getCompanyLogoSVG(student.company)}
      </div>
      <a href="${student.linkedin}" class="linkedin-pill-btn" target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" class="linkedin-pill-icon" fill="currentColor">
          <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
        </svg>
        <span>View Profile</span>
      </a>
    `;
    carousel.appendChild(card);
  });

  // Duplicate cards for seamless continuous scrolling
  const originalCards = [...carousel.children];
  originalCards.forEach(card => {
    const clone = card.cloneNode(true);
    carousel.appendChild(clone);
  });

  let halfLength = carousel.scrollWidth / 2 || 2000;
  function updateHalfLength() {
    halfLength = carousel.scrollWidth / 2 || 2000;
  }
  window.addEventListener('resize', updateHalfLength);
  setTimeout(updateHalfLength, 100);

  let position = 0;
  const speed = 0.9;
  let animationId = null;
  let lastTime = 0;
  let onScreen = true;
  let isPaused = false;
  let dragging = false;
  let startX = 0;
  let dragStartPosition = 0;

  // Arrow Navigation Controls
  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const step = window.innerWidth <= 768 ? 210 : 242;
      position += step * 1.5;
      if (position > 0) {
        position = -halfLength;
      }
      carousel.style.transform = `translateX(${position}px)`;
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const step = window.innerWidth <= 768 ? 210 : 242;
      position -= step * 1.5;
      if (Math.abs(position) >= halfLength) {
        position = 0;
      }
      carousel.style.transform = `translateX(${position}px)`;
    });
  }

  // Hover to pause
  if (carouselContainer) {
    carouselContainer.addEventListener('mouseenter', () => { isPaused = true; });
    carouselContainer.addEventListener('mouseleave', () => { isPaused = false; });
  }

  function animate(currentTime) {
    if (!onScreen) {
      animationId = null;
      return;
    }
    if (!lastTime) lastTime = currentTime;
    const delta = currentTime - lastTime;

    if (!isPaused && !dragging) {
      position -= speed * (delta / 16);
      if (Math.abs(position) >= halfLength) {
        position = 0;
      }
      carousel.style.transform = `translateX(${position}px)`;
    }

    lastTime = currentTime;
    animationId = requestAnimationFrame(animate);
  }

  // Pause when offscreen
  if ('IntersectionObserver' in window && carouselContainer) {
    new IntersectionObserver(entries => {
      onScreen = entries[0].isIntersecting;
      if (onScreen && !dragging && animationId === null) {
        lastTime = 0;
        animationId = requestAnimationFrame(animate);
      }
    }).observe(carouselContainer);
  }

  // Mouse drag
  carousel.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.pageX;
    dragStartPosition = position;
    carousel.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const x = e.pageX;
    const walk = (x - startX) * 1.2;
    position = dragStartPosition + walk;
    if (position > 0) position = -halfLength;
    if (Math.abs(position) >= halfLength) position = 0;
    carousel.style.transform = `translateX(${position}px)`;
  });

  // Touch drag
  carousel.addEventListener('touchstart', (e) => {
    dragging = true;
    isPaused = true;
    startX = e.touches[0].pageX;
    dragStartPosition = position;
  }, { passive: true });

  carousel.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const x = e.touches[0].pageX;
    const walk = (x - startX) * 1.2;
    position = dragStartPosition + walk;
    if (position > 0) position = -halfLength;
    if (Math.abs(position) >= halfLength) position = 0;
    carousel.style.transform = `translateX(${position}px)`;
  }, { passive: true });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    isPaused = false;
    carousel.style.cursor = 'grab';
    lastTime = 0;
    if (onScreen && animationId === null) {
      animationId = requestAnimationFrame(animate);
    }
  }

  window.addEventListener('mouseup', endDrag);
  carousel.addEventListener('touchend', endDrag);
  carousel.addEventListener('touchcancel', endDrag);

  animate(performance.now());
};

const initializeCountdown = () => {
  const timer = document.getElementById('timer');

  function updateTimer() {
    const now = new Date();
    const target = new Date();
    target.setHours(24, 0, 0, 0);
    if (now > target) {
      target.setDate(target.getDate() + 1);
    }
    const diff = target - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    timer.textContent = `${hours}h ${minutes}m ${seconds}s`;
  }

  updateTimer();
  setInterval(updateTimer, 1000);
};

const initializeLinkedInPosts = () => {
  const linkedInPosts = [
    {
      name: "Priyanka Sharma",
      title: "CA Finalist at Grasim Industries Ltd.",
      avatar: "https://www.mystudentclub.com/assets/priyanka-sharma.png",
      content: "Excited to share that I’ve begun my CA Industrial Training at GRASIM INDUSTRIES LIMITED ( ADITYA BIRLA GROUP) 💫\n\nAn important milestone where learning shifts from theory to real business impact. This phase is about responsibility, perspective, and building the mindset required to perform in the corporate world.\n\nGrateful to my mentor CA Padam Bhansali for their guidance and trust 🤝 their support has been instrumental in reaching this step.\n\nLooking ahead with focus, confidence, and a strong intent to learn and deliver ✨",
      reactions: 216,
      linkedinUrl: "https://www.linkedin.com/in/priyanka-sharma-s6/"
    },
    {
      name: "Khushi Gandhi",
      title: "CA Finalist at Morgan Stanley",
      avatar: "https://www.mystudentclub.com/assets/khushi.jpg",
      content: "✨ Sometimes, you know exactly where you want to begin - and where you want to stay ✨\n\nI'm happy to share that I've joined Morgan Stanley as an Industrial Trainee in the Financial control group - Product Control Department 🌟\n\nWhile many around me went through multiple interviews and acceptance cycles, my journey was quite the opposite. When the opportunity at Morgan Stanley opened up, it became the first interview I appeared for, and I genuinely hoped it would also be my last. Grateful that it turned out to be exactly that 💫\n\nI'm sincerely thankful to CA Padam Bhansali and My Student Club for their guidance and reassurance, especially during the Interview and acceptance phase 😇",
      reactions: 691,
      linkedinUrl: "https://www.linkedin.com/in/khushi-gandhi-40a37a242/"
    },
    {
      name: "Tamanna Gaur",
      title: "CA Industrial Trainee at HCL Technologies",
      avatar: "https://www.mystudentclub.com/assets/tamanna-gaur.jpg",
      content: "Excited to share that I've started my journey as a CA Industrial Trainee at HCL Technologies✨\n\nGrateful to Lakshya Bansal for genuinely helping me through the process.\n\nAlso thankful to CA Padam Bhansali for the guidance and help that made this step possible.\n\nLooking forward to learning and growing in this new phase🤍💫",
      reactions: 161,
      linkedinUrl: "https://www.linkedin.com/in/tamanna-gaur/"
    },
    {
      name: "Rupesh Machha",
      title: "CA Industrial Trainee at Cipla",
      avatar: "https://www.mystudentclub.com/assets/rupesh-machha.jpg",
      content: "I'm pleased to share that I've joined Cipla as a CA Industrial Trainee in the Business Finance Department.\n\nLooking forward to strengthening my finance skill set while sharpening my soft skills and interpersonal capabilities through real-world exposure.\n\nGrateful for the opportunity. Onward and upward.\n\nA Special Mention To CA Padam Bhansali for pushing me to give my best of the efforts. It Won't Have Been Possible Without Him.",
      reactions: 784,
      linkedinUrl: "https://www.linkedin.com/in/ca-rupesh-machha-/"
    },
    {
      name: "Siddhant Pandey",
      title: "CA Industrial Trainee at UBS",
      avatar: "https://www.mystudentclub.com/assets/sidhant-pandey.jpg",
      content: "Excited to share that I've begun a new chapter at UBS as an Industrial Trainee in the Liquidity and Funding domain. This opportunity represents a meaningful step in my professional journey.\n\nI'm grateful for the chance to learn in a global, fast-paced environment and to work alongside experienced professionals who bring deep expertise to the table.\n\nA special note of thanks to CA Padam Bhansali, whose constant guidance and support throughout my IT hunt made this journey possible.",
      reactions: 330,
      linkedinUrl: "https://www.linkedin.com/in/siddhant-pandeyy/"
    },
    {
      name: "Sanyam Khatter",
      title: "CA Industrial Trainee at CARS24",
      avatar: "https://www.mystudentclub.com/assets/sanyam-khatter.png",
      content: "Kicking off the New Year with an exciting new professional journey.\n\nI'm pleased to share that I have joined CARS24 as a CA Industrial Trainee. This marks an important step in my CA journey, and I'm looking forward to gaining hands-on exposure in a fast-paced, tech-driven environment.\n\nAfter completing a valuable one-year Articleship at BDO India, I'm eager to apply the learning gained while further developing my understanding of finance operations, business processes, and decision-making at scale.\n\nSpecial thanks to CA Padam Bhansali for the guidance and support during this transition — truly appreciated.\n\nGrateful for the opportunity and looking forward to learning, contributing, and growing along the way.\n\nThankful to everyone who has guided and supported me throughout this journey.",
      reactions: 360,
      linkedinUrl: "https://www.linkedin.com/in/sanyam-khatter/"
    },
    {
      name: "Surbhi Priya",
      title: "CA Industrial Trainee at Kotak Mahindra Bank",
      avatar: "https://www.mystudentclub.com/assets/surbhi-priya.png",
      content: "I am delighted to share an important milestone in my professional journey — I have joined Kotak Mahindra Bank as an Industrial Trainee.\n\nI would like to express my sincere gratitude to Rahul ranjan Sir and Priyank sinha Sir for giving me this valuable opportunity and for placing their trust in me. I am also thankful to Lekhram Vishwakarma for ensuring a smooth and seamless onboarding experience.\n\nI extend my heartfelt thanks to MGC Global Risk Advisory LLP and KB Chandna & Co. for providing me with a strong professional foundation and valuable exposure during my articleship, which has played a crucial role in shaping my learning and growth.\n\nI am deeply grateful to My Student Club and CA Padam Bhansali for their continuous guidance, encouragement, and unwavering support throughout this journey.\n\nAnother special thanks to my friend and senior Shivam for all the encouragement and support to uplift me throughout the process.",
      reactions: 232,
      linkedinUrl: "https://www.linkedin.com/in/surbhipriya1/"
    },
    {
      name: "Vedang Sawant",
      title: "CA Industrial Trainee at Flipkart",
      avatar: "https://www.mystudentclub.com/assets/vedang.jpg",
      content: "I am excited to announce the beginning of my Industrial Training journey with Flipkart!\n\nThis opportunity has been made possible by the continuous support and guidance from Pratik Verma, Sidddharth Awasthi, and Shivaang Mishra. Thank you for believing in me and assisting me throughout this process.\n\nI would also like to express my gratitude to CA Padam Bhansali for his unwavering support, mentorship, and motivation at every step. Your guidance has really made a significant impact.\n\nAs I embark on this new role, I look forward to a year filled with learning, growth, meaningful challenges, creative problem-solving, and engaging brainstorming sessions. I am eager to learn, contribute, and grow in this dynamic environment.",
      reactions: 383,
      linkedinUrl: "https://www.linkedin.com/in/vedangsawant/"
    }
  ];

  const carousel = document.getElementById('linkedinCarousel');

  if (!carousel) return;

  const getCardWidth = () => {
    if (window.innerWidth < 480) return 304;
    if (window.innerWidth < 768) return 324;
    return 384;
  };

  linkedInPosts.forEach(post => {
    const card = document.createElement('div');
    card.className = 'linkedin-card';
    card.innerHTML = `
      <div class="linkedin-card-header">
        <img src="${post.avatar}" alt="${post.name}" class="linkedin-avatar" loading="lazy" decoding="async" onerror="this.src='https://via.placeholder.com/48'">
        <div class="linkedin-user-info">
          <p class="linkedin-user-name">${post.name}</p>
          <p class="linkedin-user-title">${post.title}</p>
        </div>
      </div>
      <div class="linkedin-card-content">
        ${post.content.replace(/\n/g, '<br>')}
      </div>
      <div class="linkedin-reactions">
        <div class="linkedin-reaction-icons">
          <span class="linkedin-reaction-icon like">👍</span>
          <span class="linkedin-reaction-icon celebrate">🎉</span>
          <span class="linkedin-reaction-icon love">❤️</span>
        </div>
        <span>${post.reactions}</span>
      </div>
      <div class="linkedin-actions">
        <button class="linkedin-action-btn" onclick="window.open('${post.linkedinUrl}', '_blank')">
          <svg viewBox="0 0 24 24"><path d="M19.46 11l-3.91-3.91a7 7 0 01-1.69-2.74l-.49-1.47A2.76 2.76 0 0010.76 1 2.75 2.75 0 008 3.74v1.12a9.19 9.19 0 00.46 2.85L8.89 9H4.12A2.12 2.12 0 002 11.12a2.16 2.16 0 00.92 1.76A2.11 2.11 0 002 14.62a2.14 2.14 0 001.28 2 2 2 0 00-.28 1 2.12 2.12 0 002 2.12v.14A2.12 2.12 0 007.12 22h7.49a8.08 8.08 0 003.58-.84l.31-.16H21V11zM19 19h-1l-.73.37a6.14 6.14 0 01-2.69.63H7.72a1 1 0 01-.72-.31.38.38 0 010-.06l.35-.34-.34-.34a.38.38 0 010-.06 1 1 0 01.72-.31.75.75 0 000-1.5 1 1 0 01-.72-.31.38.38 0 010-.06l.35-.34-.34-.34a.38.38 0 010-.06 1 1 0 01.72-.31.75.75 0 000-1.5A1.12 1.12 0 017 12.62a.38.38 0 010-.06l.35-.34-.35-.34A1.13 1.13 0 018.12 10H9a.75.75 0 00.71-.51l-.53-1.59a7.66 7.66 0 01-.38-2.37V3.74a1.25 1.25 0 011.26-1.24 1.26 1.26 0 011.19.89l.49 1.47a8.48 8.48 0 002.06 3.33L17.71 12H19z"/></svg>
          Like
        </button>
        <button class="linkedin-action-btn" onclick="window.open('${post.linkedinUrl}', '_blank')">
          <svg viewBox="0 0 24 24"><path d="M7 9h10v1H7zm0 3h7v1H7zm16-8v13c0 1.1-.9 2-2 2H7l-5 5V4c0-1.1.9-2 2-2h17c1.1 0 2 .9 2 2zm-2 0H4v14l2-2h15V4z"/></svg>
          Comment
        </button>
        <button class="linkedin-action-btn" onclick="window.open('${post.linkedinUrl}', '_blank')">
          <svg viewBox="0 0 24 24"><path d="M21 3L3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z"/></svg>
          Share
        </button>
      </div>
    `;
    carousel.appendChild(card);
  });

  const cards = [...carousel.children];
  cards.forEach(card => {
    const clone = card.cloneNode(true);
    carousel.appendChild(clone);
  });

  let position = 0;
  let speed = 2;
  let animationId;
  let lastTime = 0;
  let onScreen = true;

  function animate(currentTime) {
    // Below 768px the marquee stays fully stopped, regardless of which
    // path (drag release, intersection, init) tried to resume it.
    if (!onScreen || window.innerWidth <= 768) {
      animationId = null;
      return;
    }
    if (!lastTime) lastTime = currentTime;
    const delta = currentTime - lastTime;

    position -= speed * (delta / 16);
    if (position <= -(getCardWidth() * cards.length)) {
      position = 0;
    }
    carousel.style.transform = `translateX(${position}px)`;

    lastTime = currentTime;
    animationId = requestAnimationFrame(animate);
  }

  let dragging = false;
  let startX = 0;
  let dragStartPosition = 0;

  // Pause the marquee while it's off-screen so its per-frame transform work
  // doesn't compete with scrolling (noticeable on mobile devices).
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      onScreen = entries[0].isIntersecting;
      if (onScreen && !dragging && animationId === null) {
        lastTime = 0;
        animationId = requestAnimationFrame(animate);
      }
    }).observe(carousel);
  }

  carousel.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.pageX - carousel.offsetLeft;
    dragStartPosition = position;
    carousel.style.cursor = 'grabbing';
    cancelAnimationFrame(animationId);
  });

  carousel.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    e.preventDefault();
    const x = e.pageX - carousel.offsetLeft;
    const walk = (x - startX) * 1.5;
    position = dragStartPosition + walk;
    carousel.style.transform = `translateX(${position}px)`;
  });

  function endDrag() {
    dragging = false;
    carousel.style.cursor = 'grab';
    lastTime = 0;
    animate(performance.now());
  }

  carousel.addEventListener('mouseup', endDrag);
  carousel.addEventListener('mouseleave', endDrag);

  animate(performance.now());
};

const initializeBenefitsCarousel = () => { };

const initializeStudentStories = () => { };

const initializeTestimonials = () => {
  const testimonials = [
    {
      text: "The MSC IT Program has been a game-changer in my journey to find CA Industrial Training. It made things super convenient by having all vacancies from platforms like Naukri, LinkedIn, and many others in one place. The batch gave students like me special attention, with priority support for IT placements. We had interactive sessions with professionals from different industries, helping me understand how each industry works and choose the best fit for myself. From CV making to mock interviews, everything was covered under one roof with valuable feedback that helped me improve. I’m truly grateful to Padam and the entire MSC team for their incredible work in helping students like us get placed.\n\nI’d highly recommend the MSC IT Program to anyone serious about pursuing Industry Training!",
      image: "https://mystudentclub.pages.dev/assets/t1.jpg"
    },
    {
      text: "The sessions were very helpful covering even the minute details.\n\nAll the tricks shared by you..as well as guidance session from guest speakers were like a cherry on the cake!!!\n\nTonnes of Thanks for the mock interview & your inputs on the CV & Cover letter!!!!\n\nAlso I really appreciate that you were always available to guide me for the profiles I was offered by various companies.",
      image: "https://mystudentclub.pages.dev/assets/t2.jpg"
    },
    {
      text: "Hi everyone I'm Pragesh one of the student who enrolled under My student club Industrial Training Program and that too in the first batch and i'm happy to share that I've been selected by HDFC bank for IT in the ECG department. Being said that it as a step taken by me without thinking anything because i didn't had much idea about MSC at that time but trust me the kind of lectures that ere conducted by Padam during the 10-12 days period having different people each time sharing different strategies and their story made it all worth it . And the kind of support that was given after the batch by Padam made it clear ho much efforts he is trying to put behind each and every person enrolled under the batch reaching them out on call on regular basis made…",
      image: "https://mystudentclub.pages.dev/assets/t3.jpg"
    },
    {
      text: "Thanks a lot Padam for your help throughout!😇\nI would like to appreciate the way you were available to us giving guidance even on our silly doubts.\nMy students club team is really doing a great job, helping students from preparing resume, cold mailing, building connections, interview preparation to getting into industrial training!!!🥳\nThank you once again!😊",
      image: "https://mystudentclub.pages.dev/assets/t4.jpg"
    },
    {
      text: "I would like to add one more thing\nInitially I was very nervous whether i would be able to get industrial training or not\nBut after attending your sessions and talking to you over call, I was confident enough that i would get one!😊",
      image: "https://mystudentclub.pages.dev/assets/t5.jpg"
    },
    {
      text: "Hey Padam, Thanks a lot for the MSC IT Program. My resume has been shortlisted at Flipkart, Atomberg, Morris Garages, FTI Consulting and AP Moller Maersk. All the credit goes to the resume review done by you. Coming from a small-size firm in Ranchi, I had nearly zero hopes for landing IT, but after receiving such response, I feel absolutely overwhelmed. Thanks a ton!",
      image: "https://mystudentclub.pages.dev/assets/t6.jpg"
    },
    {
      text: "The MSC IT Program by My Student Club lived upto its name. The resume and cover letter sessions were top-notch, and the one-on-one review of resume provided a personal touch which most masterclasses don't.\n\nThe curated list of hiring companies and mass mailing strategy helped me land three offers before choosing Signify. Plus, interactive sessions with industry experts who have been in the same position as us in the past provided invaluable career insights beyond just industrial training.\n\nHuge thanks to My Student Club for this incredible initiative and special mention to CA Padam Bhansali for his dedication to the CA student community.",
      image: "https://mystudentclub.pages.dev/assets/t7.jpg"
    },
    {
      text: "Good Noon Padam!\n\nThank you so much for your support and guidance on this journey!\n\nWill share this in LinkedIn and our group once I got my offer letter, the process is going...on yesterday I submitted the AC form.\n\nForever grateful to you and MSC team✨\n\nOne of my Best decisions is joining the MSC IT program💯",
      image: "https://mystudentclub.pages.dev/assets/t8.jpg"
    },
    {
      text: "A transformative experience with MSC IT Program! The comprehensive training, personalized guidance, and strategic approach made my Industrial Training journey seamless. Highly recommended for CA students seeking quality industrial training opportunities!",
      image: "https://mystudentclub.pages.dev/assets/t9.jpeg"
    },
    {
      text: "My journey with MSC IT Program was nothing short of amazing. The program's holistic approach, expert mentorship, and extensive network helped me secure an incredible industrial training opportunity. The mock interviews, CV optimization, and industry insights were invaluable. Thank you, MSC, for turning my career aspirations into reality!",
      image: "https://mystudentclub.pages.dev/assets/t10.jpeg"
    },
    {
      text: "MSC IT Program exceeded all my expectations! The personalized guidance, comprehensive training, and strategic placement support were game-changers in my professional journey. I'm grateful for the invaluable insights and opportunities that helped me secure my dream industrial training.",
      image: "https://mystudentclub.pages.dev/assets/t11.jpeg"
    },
    {
      text: "The MSC IT Program is a true career catalyst. From resume building to interview preparation, every aspect was meticulously designed to help students like me succeed. The mentorship and networking opportunities were instrumental in landing my ideal industrial training role.",
      image: "https://mystudentclub.pages.dev/assets/t12.jpeg"
    },
    {
      text: "I was struggling to find the right industrial training opportunity until I joined the MSC IT Program. The comprehensive approach, expert guidance, and extensive support system transformed my career trajectory. Highly recommend this program to every CA student!",
      image: "https://mystudentclub.pages.dev/assets/t13.jpeg"
    },
    {
      text: "I was blown away by the level of personalized attention and the real-world insights provided through the program. Highly recommended!",
      image: "https://mystudentclub.pages.dev/assets/t14.jpeg"
    },
    {
      text: "The program not only prepared me for interviews but also helped me build a strong professional network. Truly transformative experience.",
      image: "https://mystudentclub.pages.dev/assets/t15.jpeg"
    }
  ];

  const testimonialsContainer = document.querySelector('.testimonials-container');
  const testimonialsContent = document.querySelector('.testimonials-content');
  const prevButton = document.querySelector('.prev-button');
  const nextButton = document.querySelector('.next-button');

  let currentIndex = 0;
  const autoScrollInterval = 5000;
  let autoScrollTimer;

  function updateTestimonials() {
    testimonialsContent.style.transform = `translateX(-${currentIndex * 100}%)`;
  }

  function showNextTestimonial() {
    currentIndex = (currentIndex + 1) % testimonials.length;
    updateTestimonials();
  }

  function showPrevTestimonial() {
    currentIndex = (currentIndex - 1 + testimonials.length) % testimonials.length;
    updateTestimonials();
  }

  testimonials.forEach(testimonial => {
    const testimonialElement = document.createElement('div');
    testimonialElement.className = 'testimonial';
    testimonialElement.innerHTML = `
      <div class="mobile-frame">
        <div class="mobile-notch"></div>
        <img src="${testimonial.image}" alt="Testimonial" class="testimonial-image">
      </div>
    `;
    testimonialsContent.appendChild(testimonialElement);
  });

  prevButton.addEventListener('click', () => {
    showPrevTestimonial();
    clearInterval(autoScrollTimer);
    startAutoScroll();
  });

  nextButton.addEventListener('click', () => {
    showNextTestimonial();
    clearInterval(autoScrollTimer);
    startAutoScroll();
  });

  function startAutoScroll() {
    autoScrollTimer = setInterval(showNextTestimonial, autoScrollInterval);
  }

  startAutoScroll();
};

const initializeCertificate = () => {
  const certificate = document.querySelector('.certificate-frame');
  const container = document.querySelector('.certificate-container') || document.querySelector('.certified-preview-frame');

  if (certificate && container) {
    let rect = null;
    let rafId = null;
    let lastEvent = null;

    container.addEventListener('mouseenter', () => {
      rect = container.getBoundingClientRect();
      if (certificate.classList.contains('rotated')) {
        certificate.style.transition = 'transform 0.08s ease-out';
      }
    });

    container.addEventListener('mousemove', e => {
      if (!certificate.classList.contains('rotated')) return;
      lastEvent = e;
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!rect || !lastEvent) return;
        const x = lastEvent.clientX - rect.left - rect.width / 2;
        const y = lastEvent.clientY - rect.top - rect.height / 2;

        const factorX = 18;
        const factorY = 24;

        const baseRotateY = -18;
        const baseRotateX = 6;
        const baseRotateZ = -1;

        certificate.style.transform = `
          rotateY(${baseRotateY + (x / factorX)}deg)
          rotateX(${baseRotateX + (-y / factorY)}deg)
          rotateZ(${baseRotateZ}deg)
          translateZ(15px)
        `;
      });
    });

    container.addEventListener('mouseleave', () => {
      rect = null;
      if (certificate.classList.contains('rotated')) {
        // Smooth spring animation when snapping back
        certificate.style.transition = 'transform 1.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        certificate.style.transform = 'rotateY(-18deg) rotateX(6deg) rotateZ(-1deg)';
      }
    });
  }
};

// The success-stories section has a full-size looping Lottie background;
// keep it paused whenever it's off-screen so it doesn't eat frames while
// the user scrolls the rest of the page.
const initializeLottiePause = () => {
  const player = document.querySelector('.section-bg lottie-player');
  if (!player || !('IntersectionObserver' in window)) return;

  new IntersectionObserver(entries => {
    if (typeof player.play !== 'function') return;
    if (entries[0].isIntersecting) {
      player.play();
    } else {
      player.pause();
    }
  }).observe(player);
};

function safe(fn, label) {
  try {
    fn();
  } catch (e) {
    console.error(`${label} failed`, e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  safe(initializeLinkedInPosts, 'linkedinPosts');
  safe(initializeTestimonials, 'testimonials');
  safe(initializeCarousel, 'carousel');
  safe(initializeCountdown, 'count-down');
  safe(initializeCertificate, 'certificate');
  safe(initializeLottiePause, 'lottie-pause');

  AOS.init({
    duration: 600,
    once: true,
    // Scroll-reveal animations make scrolling feel heavy on phones —
    // disable them below 769px. Desktop/tablet keeps them unchanged.
    disable: () => window.innerWidth < 769
  });
});

const resizeObserver = new ResizeObserver(entries => {
  for (let entry of entries) {
    const width = entry.contentRect.width;
  }
});
resizeObserver.observe(document.body);