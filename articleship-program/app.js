const generateData = () => {
  const baseURL = "https://mystudentclub.pages.dev/assets/";
  const students = [
    {
      name: "Abhishek Puranik",
      course: "MSC IT Program",
      linkedin: "https://www.linkedin.com/in/abhishek-puranik221b/",
      image: baseURL + "Abhishek-Puranik.jpg",
      company: "BPCL"
    },
    {
      name: "NSR Varma",
      course: "MSC IT Program",
      linkedin: "https://www.linkedin.com/in/varmansr/",
      image: baseURL + "NSR-Varma.jpg",
      company: "Alivira"
    },
    {
      name: "Harsh Yadav",
      course: "MSC IT Program",
      linkedin: "https://www.linkedin.com/in/fcaharshyadav/",
      image: baseURL + "Harsh-Yadav.jpg",
      company: "Avery Dennison"
    },
    {
      name: "Nandana Krishnadas",
      course: "MSC IT Program",
      linkedin: "https://www.linkedin.com/in/nandana-krishnadas-120247318/",
      image: baseURL + "Nandana.jpg",
      company: "Amazon"
    },
    {
      name: "Muskan Chawla",
      course: "MSC IT Program",
      linkedin: "https://www.linkedin.com/in/muskan-chawla-b994152a9/",
      image: baseURL + "Muskan-Chawla.jpg",
      company: "Whitewater Advisory"
    },
    {
      name: "P Hritish Kumar",
      course: "MSC IT Program",
      linkedin: "https://www.linkedin.com/in/hritishkumar/",
      image: baseURL + "Hritish.jpg",
      company: "DLF"
    },
    {
      name: "Aakanksha Lolge",
      course: "MSC IT Program",
      linkedin: "https://www.linkedin.com/in/aakankshalolge/",
      image: baseURL + "Aakanksha-Lolge.jpg",
      company: "BPCL"
    },
    {
      name: "Harinee Selvam",
      course: "MSC IT Program",
      linkedin: "https://www.linkedin.com/in/harinee-selvam-a03416204/",
      image: baseURL + "Harinee-Selvam.jpg",
      company: "Flipkart"
    },
    {
      name: "Pratik Ulhas Naik",
      course: "MSC IT Program",
      linkedin: "https://www.linkedin.com/in/naik-pratik/",
      image: baseURL + "Pratik-Naik-Protiviti.jpg",
      company: "Protiviti"
    },
    {
      name: "Stephen DCosta",
      course: "MSC IT Program",
      linkedin: "https://www.linkedin.com/in/stephensn6/",
      image: baseURL + "Stephen.jpg",
      company: "UBS"
    },
    {
      name: "Khushi Tejani",
      course: "MSC IT Program",
      linkedin: "https://www.linkedin.com/in/khushitejani/",
      image: baseURL + "Khushi-Tejani-BPCL.jpg",
      company: "BPCL"
    },
    {
      name: "Yash Nema",
      course: "MSC IT Program",
      linkedin: "https://www.linkedin.com/in/yash-nema18/",
      image: baseURL + "Yash-Nema.jpg",
      company: "Amazon"
    },
    {
      name: "Prathmesh Randive",
      course: "MSC IT Program",
      linkedin: "https://www.linkedin.com/in/prathmesh-randive/",
      image: baseURL + "Prathmesh-Randive.jpg",
      company: "UBS"
    },
    {
      name: "Vivek Vardan",
      course: "MSC IT Program",
      linkedin: "https://www.linkedin.com/in/vivek-vardhan-9a05982a1/",
      image: baseURL + "Vivek-Vardhan.jpg",
      company: "UBS"
    },
    {
      name: "Vishal Jangid",
      course: "MSC IT Program",
      linkedin: "https://www.linkedin.com/in/vishall-jangid/",
      image: baseURL + "Vishal-Jangid.jpg",
      company: "PPG Asian Paints"
    },
    {
      name: "Swayam Atal",
      course: "MSC IT Program",
      linkedin: "https://www.linkedin.com/in/swayamatal/",
      image: baseURL + "Swayam-Atal.jpg",
      company: "Amazon"
    },
    {
      name: "Siddhant Naithani",
      course: "MSC IT Program",
      linkedin: "https://www.linkedin.com/in/siddhantnaithani999/",
      image: baseURL + "Siddhant-Naithani.jpg",
      company: "Signify"
    },
    {
      name: "Sanjana Sivakali",
      course: "MSC IT Program",
      linkedin: "https://www.linkedin.com/in/sanjanasivakali/",
      image: baseURL + "Sanjana-Sivakali.jpg",
      company: "Ashok Leyland"
    },
    {
      name: "Shiv Pratap Singh",
      course: "MSC IT Program",
      linkedin: "https://www.linkedin.com/in/shiv-pratap-singh-52b721222/",
      image: baseURL + "Shiv-Pratap-Singh.jpg",
      company: "1MG"
    },
    {
      name: "Aditi Tagalpallewar",
      course: "MSC IT Program",
      linkedin: "https://www.linkedin.com/in/aditi-tagalpallewar/",
      image: baseURL + "Aditi-Tagalwellakar.jpg",
      company: "UBS"
    }
  ];

  return { students };
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
  let speed = 2;
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

const initializeLinkedInPosts = () => {
  const linkedInPosts = [
    {
      name: "Abhishek Puranik",
      title: "CA Articleship at BPCL",
      avatar: "https://mystudentclub.pages.dev/assets/Abhishek-Puranik.jpg",
      content: "Thrilled to share that I've started my Articleship at BPCL! 🚀\n\nA huge thanks to CA Padam Bhansali and the MSC team for their incredible guidance throughout my placement journey. The MSC Articleship Program truly transformed my approach to interviews!",
      reactions: 245,
      linkedinUrl: "https://www.linkedin.com/in/abhishek-puranik221b/"
    },
    {
      name: "Harinee Selvam",
      title: "CA Articleship at Flipkart",
      avatar: "https://mystudentclub.pages.dev/assets/Harinee-Selvam.jpg",
      content: "Excited to announce that I've joined Flipkart for my Articleship! ✨\n\nThis wouldn't have been possible without the structured guidance from MSC. The mock interviews and CV review sessions were game-changers. Forever grateful to CA Padam Bhansali!",
      reactions: 312,
      linkedinUrl: "https://www.linkedin.com/in/harinee-selvam-a03416204/"
    },
    {
      name: "Stephen DCosta",
      title: "CA Articleship at UBS",
      avatar: "https://mystudentclub.pages.dev/assets/Stephen.jpg",
      content: "Happy to share that I've started my Articleship journey at UBS! 🎯\n\nThe MSC Articleship Program was instrumental in preparing me for this role. The exclusive job listings and personalized mentorship made all the difference. Thank you MSC team!",
      reactions: 287,
      linkedinUrl: "https://www.linkedin.com/in/stephensn6/"
    },
    {
      name: "Yash Nema",
      title: "CA Articleship at Amazon",
      avatar: "https://mystudentclub.pages.dev/assets/Yash-Nema.jpg",
      content: "Delighted to share that I've joined Amazon for my Articleship! 🌟\n\nThe MSC program provided me with all the tools I needed - from resume optimization to interview preparation. The personalized mentorship from CA Padam Bhansali was invaluable!",
      reactions: 298,
      linkedinUrl: "https://www.linkedin.com/in/yash-nema18/"
    },
    {
      name: "Prathmesh Randive",
      title: "CA Articleship at UBS",
      avatar: "https://mystudentclub.pages.dev/assets/Prathmesh-Randive.jpg",
      content: "Excited to announce that I've started my Articleship at UBS! 💼\n\nThe structured approach of MSC's program helped me crack interviews at top firms. The mock interviews and industry insights were exactly what I needed!",
      reactions: 256,
      linkedinUrl: "https://www.linkedin.com/in/prathmesh-randive/"
    },
    {
      name: "Khushi Tejani",
      title: "CA Articleship at BPCL",
      avatar: "https://mystudentclub.pages.dev/assets/Khushi-Tejani-BPCL.jpg",
      content: "Happy to share that I've joined BPCL for my Articleship! 🎉\n\nThe MSC Articleship Program was a game-changer in my placement journey. The CV review sessions and exclusive job listings made the process so much smoother!",
      reactions: 234,
      linkedinUrl: "https://www.linkedin.com/in/khushitejani/"
    },
    {
      name: "Swayam Atal",
      title: "CA Articleship at Amazon",
      avatar: "https://mystudentclub.pages.dev/assets/Swayam-Atal.jpg",
      content: "Thrilled to announce that I've started my Articleship at Amazon! ✨\n\nGrateful to MSC and CA Padam Bhansali for their incredible support throughout. The program's comprehensive approach to placement preparation truly made a difference!",
      reactions: 321,
      linkedinUrl: "https://www.linkedin.com/in/swayamatal/"
    },
    {
      name: "Siddhant Naithani",
      title: "CA Articleship at Signify",
      avatar: "https://mystudentclub.pages.dev/assets/Siddhant-Naithani.jpg",
      content: "Excited to share that I've joined Signify for my Articleship! 🚀\n\nThe MSC program exceeded all my expectations. From personal CV reviews to mock interviews, every aspect was designed to help students succeed!",
      reactions: 267,
      linkedinUrl: "https://www.linkedin.com/in/siddhantnaithani999/"
    },
    {
      name: "Aditi Tagalpallewar",
      title: "CA Articleship at UBS",
      avatar: "https://mystudentclub.pages.dev/assets/Aditi-Tagalwellakar.jpg",
      content: "Happy to announce that I've started my Articleship journey at UBS! 🌟\n\nThe MSC program's personalized mentorship and comprehensive preparation resources helped me land my dream role. Forever grateful to the MSC team!",
      reactions: 289,
      linkedinUrl: "https://www.linkedin.com/in/aditi-tagalpallewar/"
    }
  ];

  const carousel = document.getElementById('linkedinCarousel');
  const prevBtn = document.querySelector('.linkedin-posts .prev-btn');
  const nextBtn = document.querySelector('.linkedin-posts .next-btn');
  
  if (!carousel) return;

  linkedInPosts.forEach(post => {
    const card = document.createElement('div');
    card.className = 'linkedin-card';
    card.innerHTML = `
      <div class="linkedin-card-header">
        <img src="${post.avatar}" alt="${post.name}" class="linkedin-avatar" onerror="this.src='https://via.placeholder.com/48'">
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
        <button class="linkedin-action-btn">
          <svg viewBox="0 0 24 24"><path d="M19.46 11l-3.91-3.91a7 7 0 01-1.69-2.74l-.49-1.47A2.76 2.76 0 0010.76 1 2.75 2.75 0 008 3.74v1.12a9.19 9.19 0 00.46 2.85L8.89 9H4.12A2.12 2.12 0 002 11.12a2.16 2.16 0 00.92 1.76A2.11 2.11 0 002 14.62a2.14 2.14 0 001.28 2 2 2 0 00-.28 1 2.12 2.12 0 002 2.12v.14A2.12 2.12 0 007.12 22h7.49a8.08 8.08 0 003.58-.84l.31-.16H21V11zM19 19h-1l-.73.37a6.14 6.14 0 01-2.69.63H7.72a1 1 0 01-.72-.31.38.38 0 010-.06l.35-.34-.34-.34a.38.38 0 010-.06 1 1 0 01.72-.31.75.75 0 000-1.5 1 1 0 01-.72-.31.38.38 0 010-.06l.35-.34-.34-.34a.38.38 0 010-.06 1 1 0 01.72-.31.75.75 0 000-1.5A1.12 1.12 0 017 12.62a.38.38 0 010-.06l.35-.34-.35-.34A1.13 1.13 0 018.12 10H9a.75.75 0 00.71-.51l-.53-1.59a7.66 7.66 0 01-.38-2.37V3.74a1.25 1.25 0 011.26-1.24 1.26 1.26 0 011.19.89l.49 1.47a8.48 8.48 0 002.06 3.33L17.71 12H19z"/></svg>
          Like
        </button>
        <button class="linkedin-action-btn">
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

  // Navigation
  const scrollAmount = 384; // card width + gap
  
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      carousel.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    });
  }
  
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      carousel.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    });
  }
};

const initializeBenefitsCarousel = () => { };

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
  const container = document.querySelector('.certificate-container');

  if (certificate && container) {
    container.addEventListener('mousemove', e => {
      if (certificate.classList.contains('rotated')) {
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;

        const factorX = 20;
        const factorY = 30;

        const baseRotateY = -30;
        const baseRotateX = 5;
        const baseRotateZ = -2;

        certificate.style.transform = `
          rotateY(${baseRotateY + (x / factorX)}deg)
          rotateX(${baseRotateX + (-y / factorY)}deg)
          rotateZ(${baseRotateZ}deg)
          translateZ(10px)
        `;
      }
    });

    container.addEventListener('mouseleave', () => {
      if (certificate.classList.contains('rotated')) {
        certificate.style.transform = 'rotateY(-30deg) rotateX(5deg) rotateZ(-2deg)';
      }
    });
  }

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

  AOS.init({
    duration: 1000,
    once: true
  });
});

const resizeObserver = new ResizeObserver(entries => {
  for (let entry of entries) {
    const width = entry.contentRect.width;
  }
});
resizeObserver.observe(document.body);