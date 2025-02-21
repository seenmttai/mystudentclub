const generateData = () => {
  const students = Array.from({ length: 35 }, (_, i) => ({
    name: `Student ${i + 1}`,
    course: "MSC IT Guarantee Program",
    linkedin: "https://linkedin.com/in/example",
    image: `mystudentclub.pages.dev/assets/studentImage${i + 1}`
  }));

  const companies = Array.from({ length: 35 }, (_, i) => ({
    name: `Company ${i + 1}`,
    image: `mystudentclub.pages.dev/assets/companyImage${i + 1}`
  }));

  return { students, companies };
};

const initializeCarousel = () => {
  const { students } = generateData();
  const carousel = document.getElementById('studentCarousel');

  const getCardWidth = () => {
    return window.innerWidth < 768 ? 250 : 300;
  };

  students.forEach(student => {
    const card = document.createElement('div');
    card.className = 'student-card';
    card.innerHTML = `
      <div class="student-image"></div>
      <h3>${student.name}</h3>
      <p>${student.course}</p>
      <a href="${student.linkedin}" class="linkedin-button" target="_blank">
        <svg class="linkedin-icon" viewBox="0 0 24 24">
          <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.16 1.29V8h-2.14v10.5H9.28v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.16 1.29V8H3v10.5h2.14v-5.3a3.26 3.26 0 0 0 3.26-3.26c.85 0 1.84.52 2.16 1.29V8h2.14v10.5h2.14m4-3.5c0 2.17-1.77 3.93-3.94 3.93a3.96 3.96 0 0 1-3.94-3.93c0-2.17 1.77-3.93 3.94-3.93a3.96 3.96 0 0 1 3.94 3.93"/>
        </svg>
        Profile
      </a>
    `;
    carousel.appendChild(card);
  });

  const cards = [...carousel.children];
  cards.forEach(card => {
    const clone = card.cloneNode(true);
    carousel.appendChild(clone);
  });

  let position = 0;
  let speed = 1;
  let animationId;

  function animate() {
    position -= speed;
    if (position <= -(getCardWidth() * cards.length)) {
      position = 0;
    }
    carousel.style.transform = `translateX(${position}px)`;
    animationId = requestAnimationFrame(animate);
  }

  carousel.addEventListener('mouseenter', () => {
    cancelAnimationFrame(animationId);
  });

  carousel.addEventListener('mouseleave', () => {
    animate();
  });

  window.addEventListener('resize', () => {
    position = 0;
    carousel.style.transform = `translateX(${position}px)`;
  });

  animate();
};

const initializeCountdown = () => {
  const timer = document.getElementById('timer');

  function updateTimer() {
    const now = new Date();
    const target = new Date();
    target.setHours(24, 0, 0, 0); // 12 AM (midnight)

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

const initializeBenefitsCarousel = () => {
  const benefits = [
    "Access to 100+ Exclusive Vacancies",
    "Personal CV Evaluation by Founder",
    "10 Day Masterclass on CV Preparation to Placement",
    "Get Referrals in Top Organizations",
    "Multiple Mock Interviews",
    "1000+ HR Mail IDs List",
    "MSC LMS - Videos of Trainees from Top Orgs",
    "Personal Mentor",
    "Regular One-One Call with Founder"
  ];

  const carousel = document.getElementById('benefitsCarousel');

  benefits.forEach(benefit => {
    const card = document.createElement('div');
    card.className = 'benefit-card';
    card.textContent = benefit;
    carousel.appendChild(card);
  });

  const cards = [...carousel.children];
  cards.forEach(card => {
    const clone = card.cloneNode(true);
    carousel.appendChild(clone);
  });

  let position = 0;
  let speed = 1;
  let animationId;

  function animate() {
    position -= speed;
    if (position <= -(300 * cards.length)) {
      position = 0;
    }
    carousel.style.transform = `translateX(${position}px)`;
    animationId = requestAnimationFrame(animate);
  }

  carousel.addEventListener('mouseenter', () => {
    cancelAnimationFrame(animationId);
  });

  carousel.addEventListener('mouseleave', () => {
    animate();
  });

  window.addEventListener('resize', () => {
    position = 0;
    carousel.style.transform = `translateX(${position}px)`;
  });

  let touchStart = 0;
  let touchPosition = 0;

  carousel.addEventListener('touchstart', (e) => {
    touchStart = e.touches[0].clientX;
    cancelAnimationFrame(animationId);
  });

  carousel.addEventListener('touchmove', (e) => {
    touchPosition = e.touches[0].clientX;
    const diff = touchPosition - touchStart;
    carousel.style.transform = `translateX(${position + diff}px)`;
  });

  carousel.addEventListener('touchend', () => {
    animate();
  });

  animate();
};

document.addEventListener('DOMContentLoaded', () => {
  try {
    initializeCarousel();
    initializeCountdown();
    initializeBenefitsCarousel();
  } catch (error) {
    console.error('Initialization error:', error);
  }
});

const resizeObserver = new ResizeObserver(entries => {
  for (let entry of entries) {
    const width = entry.contentRect.width;
  }
});

resizeObserver.observe(document.body);