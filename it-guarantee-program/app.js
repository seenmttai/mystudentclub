const generateData = () => {
  const baseURL = "https://www.mystudentclub.com/assets/";

  const allAvailableStudents = [
    { name: "Simran Singh", course: "MSC IT Guarantee Program", linkedin: "N/A", image: baseURL + "simran.jpg", company: "Amazon" },
    { name: "Virali Doshi", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/virali-doshi1905", image: baseURL + "virali.jpg", company: "Deutsche Bank" },
    { name: "Anisha Mehta", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/anisha-mehta1/", image: baseURL + "anisha_mehta.jpeg", company: "Adani" },
    { name: "Aarushi Agarwal", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/aarushi-agarwal003/", image: baseURL + "Aarushi.jpeg", company: "Mizuho Bank" },
    { name: "Vindhya Gupta", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/vindhya-gupta/", image: baseURL + "vindhya.jpeg", company: "Hindustan Times" },
    { name: "Vishal Sharma", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/vishal-sharma057/", image: baseURL + "vishal.jpeg", company: "Bajaj Finance" },
    { name: "Chery Lunia", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/cheryluniya/", image: baseURL + "Chery.jpeg", company: "Goldman Sachs" },
    { name: "Prabhjyot Singh", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/prabhjyotsinghca/", image: baseURL + "prabhjyot.jpeg", company: "Unilever" },
    { name: "Chandini Meher", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/chandini-meher/", image: baseURL + "Chandini.jpeg", company: "HDFC Bank" },
    { name: "Kirti Yadav", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/kirtiyadav07/", image: baseURL + "Kirti.jpeg", company: "DLF" },
    { name: "Raunaq Verma", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/raunaqverma17662/", image: baseURL + "Raunaq.jpeg", company: "HDFC Bank" },
    { name: "Kavin S", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/s-kavin/", image: baseURL + "Kavin.jpeg", company: "Ashok Leyland" },
    { name: "Aishwarya Lakshmi", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/aishwary0406/", image: baseURL + "aishwarye.jpeg", company: "Flipkart" },
    { name: "Shreya Jain", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/shreya-jain03/", image: baseURL + "Shreya.jpeg", company: "ONGC" },
    { name: "Sakshi Suryavanshi", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/sakshiasuryavanshi/", image: baseURL + "sakshi.jpeg", company: "ZF" },
    { name: "Deepanshu Jain", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/deepanshu-jain-23078822a/", image: baseURL + "deepanshu.jpeg", company: "Henkel" },
    { name: "Chandra Lekha", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/chandralekhauckoo", image: baseURL + "Chandra.jpeg", company: "ITC" },
    { name: "Sakshi Sipholya", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/sakshisipolya/", image: baseURL + "sipholya.jpeg", company: "Deutsche Bank" },
    { name: "Rahul Koli", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/rahulkoli15/", image: baseURL + "koli.jpeg", company: "Morgan Stanley" },
    { name: "Anisha Shah", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/anisha-shah25/", image: baseURL + "Anisha.jpeg", company: "UBS" },
    { name: "Arbaz Jakate", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/arbaz-jakate/", image: baseURL + "Arbaz.jpeg", company: "Mondelez" },
    { name: "Monisha Agrawala", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/monisha-agrawala-/", image: baseURL + "monisha.jpeg", company: "Goldman Sachs" },
    { name: "Hari Karnati", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/hari-karnati", image: baseURL + "karnati.jpeg", company: "Amazon" },
    { name: "Devang Sinsinwar", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/devang-sinsinwar/", image: baseURL + "devang.jpeg", company: "Intel" },
    { name: "Viddhi S Mittal", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/viddhismittal/", image: baseURL + "vasistha.jpg", company: "Amazon" },
    { name: "Priya Jain", course: "MSC IT Guarantee Program", linkedin: "N/A", image: baseURL + "kamini.jpg", company: "Amazon" },
    { name: "Aitullah Nabi", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/aitullahnabi/", image: baseURL + "bhojwani.jpg", company: "Amazon" },
    { name: "Charu Kewalramani", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/charu-kewalramani-40a55930b/", image: baseURL + "Charu.jpg", company: "DE Shaw" },
    { name: "Pooja Kedia", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/pooja-kedia-2578a1214/", image: baseURL + "Pooja.jpg", company: "HSBC" },
    { name: "Piyu Jain", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/piyujain/", image: baseURL + "Piyu.jpg", company: "Reliance" },
    { name: "Diksha Borse", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/diksha-borse/", image: baseURL + "Diksha.jpg", company: "Amazon" },
    { name: "Dev Mundra", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/devmundra2003/", image: baseURL + "Dev.jpg", company: "UBS" },
    { name: "Anisha Nagwani", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/anisha-nagwani/?miniProfileUrn=urn%3Ali%3Afs_miniProfile%3AACoAADnKIpwBe0wAQbMcCPwAxAPt5utUANKgoA", image: baseURL + "nagwani.jpg", company: "Barclays" },
    { name: "Sajal Mittal", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/sajalmittal15/", image: baseURL + "sajal.jpg", company: "PepsiCo" },
    { name: "Abhishek Puranik", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/abhishek-puranik221b/", image: baseURL + "Abhishek-Puranik.jpg", company: "BPCL" },
    { name: "NSR Varma", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/varmansr/", image: baseURL + "NSR-Varma.jpg", company: "Alivira" },
    { name: "Harsh Yadav", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/fcaharshyadav/", image: baseURL + "Harsh-Yadav.jpg", company: "Avery Dennison" },
    { name: "Nandana Krishnadas", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/nandana-krishnadas-120247318/", image: baseURL + "Nandana.jpg", company: "Amazon" },
    { name: "Muskan Chawla", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/muskan-chawla-b994152a9/", image: baseURL + "Muskan-Chawla.jpg", company: "Whitewater Advisory" },
    { name: "P Hritish Kumar", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/hritishkumar/", image: baseURL + "Hritish.jpg", company: "DLF" },
    { name: "Aakanksha Lolge", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/aakankshalolge/", image: baseURL + "Aakanksha-Lolge.jpg", company: "BPCL" },
    { name: "Harinee Selvam", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/harinee-selvam-a03416204/", image: baseURL + "Harinee-Selvam.jpg", company: "Flipkart" },
    { name: "Pratik Ulhas Naik", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/naik-pratik/", image: baseURL + "Pratik-Naik-Protiviti.jpg", company: "Protiviti" },
    { name: "Stephen DCosta", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/stephensn6/", image: baseURL + "Stephen.jpg", company: "UBS" },
    { name: "Khushi Tejani", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/khushitejani/", image: baseURL + "Khushi-Tejani-BPCL.jpg", company: "BPCL" },
    { name: "Yash Nema", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/yash-nema18/", image: baseURL + "Yash-Nema.jpg", company: "Amazon" },
    { name: "Prathmesh Randive", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/prathmesh-randive/", image: baseURL + "Prathmesh-Randive.jpg", company: "UBS" },
    { name: "Vivek Vardan", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/vivek-vardhan-9a05982a1/", image: baseURL + "Vivek-Vardhan.jpg", company: "UBS" },
    { name: "Vishal Jangid", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/vishall-jangid/", image: baseURL + "Vishal-Jangid.jpg", company: "PPG Asian Paints" },
    { name: "Swayam Atal", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/swayamatal/", image: baseURL + "Swayam-Atal.jpg", company: "Amazon" },
    { name: "Siddhant Naithani", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/siddhantnaithani999/", image: baseURL + "Siddhant-Naithani.jpg", company: "Signify" },
    { name: "Sanjana Sivakali", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/sanjanasivakali/", image: baseURL + "Sanjana-Sivakali.jpg", company: "Ashok Leyland" },
    { name: "Shiv Pratap Singh", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/shiv-pratap-singh-52b721222/", image: baseURL + "Shiv-Pratap-Singh.jpg", company: "1MG" },
    { name: "Aditi Tagalpallewar", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/aditi-tagalpallewar/", image: baseURL + "Aditi-Tagalwellakar.jpg", company: "UBS" },
    { name: "Shubham Kumar", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/shubham-kumar-ca10/", image: baseURL + "kumar.jpg", company: "Reliance" },
    { name: "Kamini Jha", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/jha-kamini/", image: baseURL + "kamini.jpg", company: "HSBC" },
    { name: "Arjun Vasistha", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/arjun-vasistha/", image: baseURL + "vasistha.jpg", company: "Unilever" },
    { name: "Tanya Bhojwani", course: "MSC IT Guarantee Program", linkedin: "https://www.linkedin.com/in/tanya-bhojwani/", image: baseURL + "bhojwani.jpg", company: "Hindalco Eternia" }
  ];


  const prioritizedStudentsOrder = [
    { name: "Simran Singh", company: "Amazon" },
    { name: "Virali Doshi", company: "Deutsche Bank" },
    { name: "Viddhi S Mittal", company: "Amazon" },
    { name: "Priya Jain", company: "Amazon" },
    { name: "Aitullah Nabi", company: "Amazon" },
    { name: "Charu Kewalramani", company: "DE Shaw" },
    { name: "Pooja Kedia", company: "HSBC" },
    { name: "Piyu Jain", company: "Reliance" },
    { name: "Diksha Borse", company: "Amazon" },
    { name: "Dev Mundra", company: "UBS" },
    { name: "Anisha Nagwani", company: "Barclays" },
    { name: "Sajal Mittal", company: "PepsiCo" },
    { name: "shubham Kumar", company: "Reliance" },
    { name: "kamini Jha", company: "HSBC" },
    { name: "Arjun Vasistha", company: "Unilever" },
    { name: "Tanya Bhojwani", company: "Hindalco Eternia" },
  ];

  const students = [];
  const addedStudentKeys = new Set(); 

  prioritizedStudentsOrder.forEach(pStudent => {
    const foundStudent = allAvailableStudents.find(
      s => s.name === pStudent.name && s.company === pStudent.company
    );
    if (foundStudent) {
      const key = foundStudent.name + foundStudent.company;
      if (!addedStudentKeys.has(key)) {
        students.push(foundStudent);
        addedStudentKeys.add(key);
      }
    }
  });

  allAvailableStudents.forEach(student => {
    const key = student.name + student.company;
    if (!addedStudentKeys.has(key)) {
      students.push(student);
      addedStudentKeys.add(key);
    }
  });

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
        <img src="${student.image}" alt="${student.name}" loading="lazy" />
      </div>
      <h3>${student.name}</h3>
      <p>${student.course}</p>
      <p class="company-info">Placed at:<br><strong>${student.company}</strong></p>
      ${student.linkedin && student.linkedin !== 'N/A' ? `<a href="${student.linkedin}" class="linkedin-button" target="_blank">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="linkedin-icon">
          <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
        </svg>
        View Profile
      </a>` : ''}
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
      if (position <= -(getCardWidth() * cards.length / 2)) { 
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
  const timerEl = document.getElementById('timer');
  if (!timerEl) return;

  const targetDate = new Date('2025-08-17T23:59:00');

  function updateTimer() {
    const now = new Date();
    const diff = targetDate - now;

    if (diff <= 0) {
      timerEl.textContent = "00h 00m 00s";
      clearInterval(timerInterval); 
      return;
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    timerEl.textContent = `${String(days).padStart(2, '0')}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }

  updateTimer();
  const timerInterval = setInterval(updateTimer, 1000);
};

const initializeTestimonials = () => {
  const testimonials = [
    {
      text: "The MSC IT Program has been a game-changer in my journey to find CA Industrial Training. It made things super convenient by having all vacancies from platforms like Naukri, LinkedIn, and many others in one place. The batch gave students like me special attention, with priority support for IT placements. We had interactive sessions with professionals from different industries, helping me understand how each industry works and choose the best fit for myself. From CV making to mock interviews, everything was covered under one roof with valuable feedback that helped me improve. I'm truly grateful to Padam and the entire MSC team for their incredible work in helping students like us get placed.\n\nI'd highly recommend the MSC IT Program to anyone serious about pursuing Industry Training!",
      image: "https://mystudentclub.pages.dev/assets/t1.jpg"
    },
    {
      text: "The sessions were very helpful covering even the minute details.\n\nAll the tricks shared by you..as well as guidance session from guest speakers were like a cherry on the cake!!!\n\nTonnes of Thanks for the mock interview & your inputs on the CV & Cover letter!!!!\n\nAlso I really appreciate that you were always available to guide me for the profiles I was offered by various companies.",
      image: "https://mystudentclub.pages.dev/assets/t2.jpg"
    },
    {
      text: "Hi everyone I'm Pragesh one of the student who enrolled under My student club Industrial Training Guarantee Program and that too in the first batch and i'm happy to share that I've been selected by HDFC bank for IT in the ECG department. Being said that it as a step taken by me without thinking anything because i didn't had much idea about MSC at that time but trust me the kind of lectures that ere conducted by Padam during the 10-12 days period having different people each time sharing different strategies and their story made it all worth it . And the kind of support that was given after the batch by Padam made it clear ho much efforts he is trying to put behind each and every person enrolled under the batch reaching them out on call on regular basis made…",
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
      text: "Hey Padam, Thanks a lot for the MSC IT Guarantee program. My resume has been shortlisted at Flipkart, Atomberg, Morris Garages, FTI Consulting and AP Moller Maersk. All the credit goes to the resume review done by you. Coming from a small-size firm in Ranchi, I had nearly zero hopes for landing IT, but after receiving such response, I feel absolutely overwhelmed. Thanks a ton!",
      image: "https://mystudentclub.pages.dev/assets/t6.jpg"
    },
    {
      text: "The MSC IT Guarantee Program by My Student Club lived upto its name. The resume and cover letter sessions were top-notch, and the one-on-one review of resume provided a personal touch which most masterclasses don't.\n\nThe curated list of hiring companies and mass mailing strategy helped me land three offers before choosing Signify. Plus, interactive sessions with industry experts who have been in the same position as us in the past provided invaluable career insights beyond just industrial training.\n\nHuge thanks to My Student Club for this incredible initiative and special mention to CA Padam Bhansali for his dedication to the CA student community.",
      image: "https://mystudentclub.pages.dev/assets/t7.jpg"
    },
    {
      text: "Good Noon Padam!\n\nThank you so much for your support and guidance on this journey!\n\nWill share this in LinkedIn and our group once I got my offer letter, the process is going...on yesterday I submitted the AC form.\n\nForever grateful to you and MSC team✨\n\nOne of my Best decisions is joining the MSC IT guarantee program💯",
      image: "https://mystudentclub.pages.dev/assets/t8.jpg"
    },
    {
      text: "A transformative experience with MSC IT Guarantee Program! The comprehensive training, personalized guidance, and strategic approach made my Industrial Training journey seamless. Highly recommended for CA students seeking quality industrial training opportunities!",
      image: "https://mystudentclub.pages.dev/assets/t9.jpeg"
    },
    {
      text: "My journey with MSC IT Guarantee Program was nothing short of amazing. The program's holistic approach, expert mentorship, and extensive network helped me secure an incredible industrial training opportunity. The mock interviews, CV optimization, and industry insights were invaluable. Thank you, MSC, for turning my career aspirations into reality!",
      image: "https://mystudentclub.pages.dev/assets/t10.jpeg"
    },
    {
      text: "MSC IT Guarantee Program exceeded all my expectations! The personalized guidance, comprehensive training, and strategic placement support were game-changers in my professional journey. I'm grateful for the invaluable insights and opportunities that helped me secure my dream industrial training.",
      image: "https://mystudentclub.pages.dev/assets/t11.jpeg"
    },
    {
      text: "The MSC IT Guarantee Program is a true career catalyst. From resume building to interview preparation, every aspect was meticulously designed to help students like me succeed. The mentorship and networking opportunities were instrumental in landing my ideal industrial training role.",
      image: "https://mystudentclub.pages.dev/assets/t12.jpeg"
    },
    {
      text: "I was struggling to find the right industrial training opportunity until I joined the MSC IT Guarantee Program. The comprehensive approach, expert guidance, and extensive support system transformed my career trajectory. Highly recommend this program to every CA student!",
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

function initializeParallax(){
  const layers = document.querySelectorAll('.layer');
  if(!layers.length) return;
  const move = (x=0,y=0)=>layers.forEach(el=>{
    const d = parseFloat(el.dataset.depth||0.05);
    el.style.transform = `translate3d(${x*d}px, ${y*d}px, 0)`;
  });
  window.addEventListener('mousemove', e=>{
    const cx = window.innerWidth/2, cy = window.innerHeight/2;
    move((e.clientX-cx)*0.04, (e.clientY-cy)*0.06);
  });
  window.addEventListener('scroll', ()=>{
    const y = window.scrollY*0.08; layers.forEach(el=>{
      const d = parseFloat(el.dataset.depth||0.05);
      el.style.transform = `translate3d(0, ${y*d}px, 0)`;
    });
  }, {passive:true});
}

function adjustDaysGrid() {

}

function initializeCurriculumCenter() {

}

document.addEventListener('DOMContentLoaded', () => {
  safe(initializeTestimonials, 'testimonials');
  safe(initializeCarousel, 'carousel');
  safe(initializeCertificate, 'certificate');
  safe(initializeCountdown, 'countdown');
  safe(initializeParallax, 'parallax');
  AOS.init({
    duration: 1000,
    once: true
  });
});

function safe(fn, label) {
  try {
    fn();
  } catch (e) {
    console.error(`${label} failed`, e);
  }
}

const resizeObserver = new ResizeObserver(entries => {
  for (let entry of entries) {
    const width = entry.contentRect.width;
    const carousel = document.getElementById('studentCarousel');
  }
});
resizeObserver.observe(document.body);