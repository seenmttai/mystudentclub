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
        <p class="company-info">Placed at: <strong>${student.company}</strong> | Stipend: ₹${student.salary}</p>
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
  
    let dragging = false;
    let startX = 0;
    let dragDiff = 0;
  
    carousel.addEventListener('mousedown', (e) => {
      dragging = true;
      startX = e.clientX;
      dragDiff = 0;
      cancelAnimationFrame(animationId);
    });
  
    carousel.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      dragDiff = e.clientX - startX;
      carousel.style.transform = `translateX(${position + dragDiff}px)`;
    });
  
    carousel.addEventListener('mouseup', (e) => {
      if (!dragging) return;
      position += dragDiff;
      dragging = false;
      dragDiff = 0;
      animate();
    });
  
    carousel.addEventListener('mouseleave', (e) => {
      if (dragging) {
        position += dragDiff;
        dragging = false;
        dragDiff = 0;
        animate();
      }
    });
    carousel.addEventListener('touchstart', (e) => {
      dragging = true;
      startX = e.touches[0].clientX;
      dragDiff = 0;
      cancelAnimationFrame(animationId);
    });
  
    carousel.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      dragDiff = e.touches[0].clientX - startX;
      carousel.style.transform = `translateX(${position + dragDiff}px)`;
    });
  
    carousel.addEventListener('touchend', (e) => {
      if (!dragging) return;
      position += dragDiff;
      dragging = false;
      dragDiff = 0;
      animate();
    });
  
    animate();
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