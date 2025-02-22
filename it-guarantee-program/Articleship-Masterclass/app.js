const generateData = () => {
  const baseURL = "https://mystudentclub.pages.dev/assets/";
  const students = [
    {
      name: "Nandana Krishnadas",
      course: "MSC IT Guarantee Program",
      linkedin: "https://www.linkedin.com/in/nandana-krishnadas-120247318/",
      image: baseURL + "Nandana.jpg",
      company: "Amazon",
      salary: "70000"
    },
    {
      name: "Abhishek Puranik",
      course: "MSC IT Guarantee Program",
      linkedin: "https://www.linkedin.com/in/abhishek-puranik221b/",
      image: baseURL + "Abhishek-Puranik.jpg",
      company: "BPCL",
      salary: "18000"
    },
    {
      name: "NSR Varma",
      course: "MSC IT Guarantee Program",
      linkedin: "https://www.linkedin.com/in/varmansr/",
      image: baseURL + "NSR-Varma.jpg",
      company: "Alivira",
      salary: "20000"
    },
    {
      name: "Harsh Yadav",
      course: "MSC IT Guarantee Program",
      linkedin: "https://www.linkedin.com/in/fcaharshyadav/",
      image: baseURL + "Harsh-Yadav.jpg",
      company: "Avery Dennison",
      salary: "30000"
    },
    {
      name: "Muskan Chawla",
      course: "MSC IT Guarantee Program",
      linkedin: "https://www.linkedin.com/in/muskan-chawla-b994152a9/",
      image: baseURL + "Muskan-Chawla.jpg",
      company: "Whitewater Advisory",
      salary: "30000"
    },
    {
      name: "P Hritish Kumar",
      course: "MSC IT Guarantee Program",
      linkedin: "https://www.linkedin.com/in/hritishkumar/",
      image: baseURL + "Hritish.jpg",
      company: "DLF",
      salary: "25000"
    },
    {
      name: "Aakanksha Lolge",
      course: "MSC IT Guarantee Program",
      linkedin: "https://www.linkedin.com/in/aakankshalolge/",
      image: baseURL + "Aakanksha-Lolge.jpg",
      company: "BPCL",
      salary: "18000"
    },
    {
      name: "Harinee Selvam",
      course: "MSC IT Guarantee Program",
      linkedin: "https://www.linkedin.com/in/harinee-selvam-a03416204/",
      image: baseURL + "Harinee-Selvam.jpg",
      company: "Flipkart",
      salary: "40200"
    },
    {
      name: "Pratik Ulhas Naik",
      course: "MSC IT Guarantee Program",
      linkedin: "https://www.linkedin.com/in/naik-pratik/",
      image: baseURL + "Pratik-Naik-Protiviti.jpg",
      company: "Protiviti",
      salary: "35000"
    },
    {
      name: "Stephen DCosta",
      course: "MSC IT Guarantee Program",
      linkedin: "https://www.linkedin.com/in/stephensn6/",
      image: baseURL + "Stephen.jpg",
      company: "UBS",
      salary: "60000"
    },
    {
      name: "Khushi Tejani",
      course: "MSC IT Guarantee Program",
      linkedin: "https://www.linkedin.com/in/khushitejani/",
      image: baseURL + "Khushi-Tejani-BPCL.jpg",
      company: "BPCL",
      salary: "18000"
    },
    {
      name: "Yash Nema",
      course: "MSC IT Guarantee Program",
      linkedin: "https://www.linkedin.com/in/yash-nema18/",
      image: baseURL + "Yash-Nema.jpg",
      company: "Amazon",
      salary: "70000"
    },
    {
      name: "Prathmesh Randive",
      course: "MSC IT Guarantee Program",
      linkedin: "https://www.linkedin.com/in/prathmesh-randive/",
      image: baseURL + "Prathmesh-Randive.jpg",
      company: "UBS",
      salary: "60000"
    },
    {
      name: "Vivek Vardan",
      course: "MSC IT Guarantee Program",
      linkedin: "https://www.linkedin.com/in/vivek-vardhan-9a05982a1/",
      image: baseURL + "Vivek-Vardhan.jpg",
      company: "UBS",
      salary: "60000"
    },
    {
      name: "Vishal Jangid",
      course: "MSC IT Guarantee Program",
      linkedin: "https://www.linkedin.com/in/vishall-jangid/",
      image: baseURL + "Vishal-Jangid.jpg",
      company: "UBS",
      salary: "60000"
    },
    {
      name: "Swayam Atal",
      course: "MSC IT Guarantee Program",
      linkedin: "https://www.linkedin.com/in/swayamatal/",
      image: baseURL + "Swayam-Atal.jpg",
      company: "Amazon",
      salary: "70000"
    },
    {
      name: "Siddhant Naithani",
      course: "MSC IT Guarantee Program",
      linkedin: "https://www.linkedin.com/in/siddhantnaithani999/",
      image: baseURL + "Siddhant-Naithani.jpg",
      company: "Signify",
      salary: "30000"
    },
    {
      name: "Sanjana Sivakali",
      course: "MSC IT Guarantee Program",
      linkedin: "https://www.linkedin.com/in/sanjanasivakali/",
      image: baseURL + "Sanjana-Sivakali.jpg",
      company: "Ashok Leyland",
      salary: "25000"
    },
    {
      name: "Shiv Pratap Singh",
      course: "MSC IT Guarantee Program",
      linkedin: "https://www.linkedin.com/in/shiv-pratap-singh-52b721222/",
      image: baseURL + "Shiv-Pratap-Singh.jpg",
      company: "1MG",
      salary: "25000"
    },
    {
      name: "Aditi Tagalpallewar",
      course: "MSC IT Guarantee Program",
      linkedin: "https://www.linkedin.com/in/aditi-tagalpallewar/",
      image: baseURL + "Aditi-Tagalwellakar.jpg",
      company: "UBS",
      salary: "60000"
    }
  ];

  const companies = [];

  return { students, companies };
};

const initializeCarousel = () => {
  const { students } = generateData();
  const carousel = document.getElementById('studentCarousel');

  const getCardWidth = () => (window.innerWidth < 768 ? 250 : 300);

  students.forEach(student => {
    if (!student.image) return;
    const card = document.createElement('div');
    card.className = 'student-card';
    card.innerHTML = `
      <div class="student-image">
        <img src="${student.image}" alt="${student.name}" />
      </div>
      <h3>${student.name}</h3>
      <p>${student.course}</p>
      <p class="company-info">Placed at:<br><strong>${student.company}</strong></p>
      <p class="stipend-info">Stipend:<br><strong>₹${student.salary}</strong></p>
      <a href="${student.linkedin}" class="linkedin-button" target="_blank">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="linkedin-icon">
          <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
        </svg>
        View Profile
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
  let speed = 1.2;
  let animationId;
  let lastTime = 0;

  function animate(currentTime) {
    if (!lastTime) lastTime = currentTime;
    const delta = currentTime - lastTime;
    
    if (true) {
      position -= speed * (delta / 16); 
      if (position <= -(getCardWidth() * cards.length)) {
        position = 0;
      }
      carousel.style.transform = `translateX(${position}px)`;
    }
    
    lastTime = currentTime;
    animationId = requestAnimationFrame(animate);
  }

  let dragging = false;
  let startX = 0;
  let scrollLeft = 0;
  let dragStartPosition = 0;

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

const initializeBenefitsCarousel = () => {};

document.addEventListener('DOMContentLoaded', () => {
  try {
    initializeCarousel();
    initializeCountdown();
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