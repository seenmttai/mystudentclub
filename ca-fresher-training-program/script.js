const generateData = () => {
  const baseURL = "https://www.mystudentclub.com/assets/";

  const allAvailableStudents = [
    { name: "Vedang Sawant", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/vedangsawant/", image: baseURL + "vedang.jpg", company: "Flipkart" },
    { name: "Gaurav Jaat", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/gauravjaat/", image: baseURL + "gaurav.jpg", company: "DE Shaw" },
    { name: "Kanchan Kulhria", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/kanchankulhria/", image: baseURL + "kanchan.jpg", company: "Amazon" },
    { name: "Anisha Joshi", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/anishajoshi76/", image: baseURL + "joshi.jpg", company: "Godrej Agrovet" },
    { name: "Khushi Gandhi", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/khushi-gandhi-40a37a242/", image: baseURL + "khushi.jpg", company: "Morgan Stanley" },
    { name: "Rohit Varma", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/rohit-varma-0bb4792b8/?utm_source=share&utm_campaign=share_via&utm_content=profile&utm_medium=android_app", image: baseURL + "varma.jpg", company: "Cummins" },
    { name: "Ishaan Isham", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/ishaanisham/", image: baseURL + "ishaan.jpg", company: "UBS" },
    { name: "Simran Singh", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/simransingh-ca-aspirant/", image: baseURL + "simran.jpg", company: "Amazon" },
    { name: "Ananya Gupta", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/ananyagupta-ca", image: baseURL + "ananya.jpg", company: "Amazon" },
    { name: "Virali Doshi", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/virali-doshi1905", image: baseURL + "virali.jpg", company: "Deutsche Bank" },
    { name: "Anisha Mehta", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/anisha-mehta1/", image: baseURL + "anisha_mehta.jpeg", company: "Adani" },
    { name: "Aarushi Agarwal", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/aarushi-agarwal003/", image: baseURL + "Aarushi.jpeg", company: "Mizuho Bank" },
    { name: "Vindhya Gupta", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/vindhya-gupta/", image: baseURL + "vindhya.jpeg", company: "Hindustan Times" },
    { name: "Vishal Sharma", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/vishal-sharma057/", image: baseURL + "vishal.jpeg", company: "Bajaj Finance" },
    { name: "Chery Lunia", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/cheryluniya/", image: baseURL + "Chery.jpeg", company: "Goldman Sachs" },
    { name: "Prabhjyot Singh", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/prabhjyotsinghca/", image: baseURL + "prabhjyot.jpeg", company: "Unilever" },
    { name: "Chandini Meher", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/chandini-meher/", image: baseURL + "Chandini.jpeg", company: "HDFC Bank" },
    { name: "Kirti Yadav", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/kirtiyadav07/", image: baseURL + "Kirti.jpeg", company: "DLF" },
    { name: "Raunaq Verma", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/raunaqverma17662/", image: baseURL + "Raunaq.jpeg", company: "HDFC Bank" },
    { name: "Kavin S", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/s-kavin/", image: baseURL + "Kavin.jpeg", company: "Ashok Leyland" },
    { name: "Aishwarya Lakshmi", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/aishwary0406/", image: baseURL + "aishwarye.jpeg", company: "Flipkart" },
    { name: "Shreya Jain", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/shreya-jain03/", image: baseURL + "Shreya.jpeg", company: "ONGC" },
    { name: "Sakshi Suryavanshi", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/sakshiasuryavanshi/", image: baseURL + "sakshi.jpeg", company: "ZF" },
    { name: "Deepanshu Jain", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/deepanshu-jain-23078822a/", image: baseURL + "deepanshu.jpeg", company: "Henkel" },
    { name: "Chandra Lekha", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/chandralekhauckoo", image: baseURL + "Chandra.jpeg", company: "ITC" },
    { name: "Sakshi Sipholya", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/sakshisipolya/", image: baseURL + "sipholya.jpeg", company: "Deutsche Bank" },
    { name: "Rahul Koli", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/rahulkoli15/", image: baseURL + "koli.jpeg", company: "Morgan Stanley" },
    { name: "Anisha Shah", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/anisha-shah25/", image: baseURL + "Anisha.jpeg", company: "UBS" },
    { name: "Arbaz Jakate", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/arbaz-jakate/", image: baseURL + "Arbaz.jpeg", company: "Mondelez" },
    { name: "Monisha Agrawala", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/monisha-agrawala-/", image: baseURL + "monisha.jpeg", company: "Goldman Sachs" },
    { name: "Hari Karnati", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/hari-karnati", image: baseURL + "karnati.jpeg", company: "Amazon" },
    { name: "Devang Sinsinwar", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/devang-sinsinwar/", image: baseURL + "devang.jpeg", company: "Intel" },
    { name: "Viddhi S Mittal", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/viddhismittal/", image: baseURL + "viddhi.jpg", company: "Amazon" },
    { name: "Priya Jain", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/priyaaajain/", image: baseURL + "Priya.jpg", company: "Amazon" },
    { name: "Charu Kewalramani", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/charu-kewalramani-40a55930b/", image: baseURL + "Charu.jpg", company: "DE Shaw" },
    { name: "Pooja Kedia", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/pooja-kedia-2578a1214/", image: baseURL + "Pooja.jpg", company: "HSBC" },
    { name: "Piyu Jain", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/piyujain/", image: baseURL + "Piyu.jpg", company: "Reliance" },
    { name: "Diksha Borse", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/diksha-borse/", image: baseURL + "Diksha.jpg", company: "Amazon" },
    { name: "Dev Mundra", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/devmundra2003/", image: baseURL + "Dev.jpg", company: "UBS" },
    { name: "Anisha Nagwani", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/anisha-nagwani/?miniProfileUrn=urn%3Ali%3Afs_miniProfile%3AACoAADnKIpwBe0wAQbMcCPwAxAPt5utUANKgoA", image: baseURL + "nagwani.jpg", company: "Barclays" },
    { name: "Sajal Mittal", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/sajalmittal15/", image: baseURL + "sajal.jpg", company: "PepsiCo" },
    { name: "Abhishek Puranik", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/abhishek-puranik221b/", image: baseURL + "Abhishek-Puranik.jpg", company: "BPCL" },
    { name: "NSR Varma", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/varmansr/", image: baseURL + "NSR-Varma.jpg", company: "Alivira" },
    { name: "Harsh Yadav", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/fcaharshyadav/", image: baseURL + "Harsh-Yadav.jpg", company: "Avery Dennison" },
    { name: "Nandana Krishnadas", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/nandana-krishnadas-120247318/", image: baseURL + "Nandana.jpg", company: "Amazon" },
    { name: "Muskan Chawla", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/muskan-chawla-b994152a9/", image: baseURL + "Muskan-Chawla.jpg", company: "Whitewater Advisory" },
    { name: "P Hritish Kumar", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/hritishkumar/", image: baseURL + "Hritish.jpg", company: "DLF" },
    { name: "Aakanksha Lolge", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/aakankshalolge/", image: baseURL + "Aakanksha-Lolge.jpg", company: "BPCL" },
    { name: "Harinee Selvam", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/harinee-selvam-a03416204/", image: baseURL + "Harinee-Selvam.jpg", company: "Flipkart" },
    { name: "Pratik Ulhas Naik", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/naik-pratik/", image: baseURL + "Pratik-Naik-Protiviti.jpg", company: "Protiviti" },
    { name: "Stephen DCosta", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/stephensn6/", image: baseURL + "Stephen.jpg", company: "UBS" },
    { name: "Khushi Tejani", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/khushitejani/", image: baseURL + "Khushi-Tejani-BPCL.jpg", company: "BPCL" },
    { name: "Yash Nema", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/yash-nema18/", image: baseURL + "Yash-Nema.jpg", company: "Amazon" },
    { name: "Prathmesh Randive", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/prathmesh-randive/", image: baseURL + "Prathmesh-Randive.jpg", company: "UBS" },
    { name: "Vivek Vardan", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/vivek-vardhan-9a05982a1/", image: baseURL + "Vivek-Vardhan.jpg", company: "UBS" },
    { name: "Vishal Jangid", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/vishall-jangid/", image: baseURL + "Vishal-Jangid.jpg", company: "PPG Asian Paints" },
    { name: "Swayam Atal", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/swayamatal/", image: baseURL + "Swayam-Atal.jpg", company: "Amazon" },
    { name: "Siddhant Naithani", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/siddhantnaithani999/", image: baseURL + "Siddhant-Naithani.jpg", company: "Signify" },
    { name: "Sanjana Sivakali", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/sanjanasivakali/", image: baseURL + "Sanjana-Sivakali.jpg", company: "Ashok Leyland" },
    { name: "Shiv Pratap Singh", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/shiv-pratap-singh-52b721222/", image: baseURL + "Shiv-Pratap-Singh.jpg", company: "1MG" },
    { name: "Aditi Tagalpallewar", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/aditi-tagalpallewar/", image: baseURL + "Aditi-Tagalwellakar.jpg", company: "UBS" },
    { name: "Shubham Kumar", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/shubham-kumar-ca10/", image: baseURL + "kumar.jpg", company: "Reliance" },
    { name: "Kamini Jha", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/jha-kamini/", image: baseURL + "kamini.jpg", company: "HSBC" },
    { name: "Arjun Vasistha", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/arjun-vasistha/", image: baseURL + "vasistha.jpg", company: "Unilever" },
    { name: "Tanya Bhojwani", course: "CA Fresher Training Program", linkedin: "https://www.linkedin.com/in/tanya-bhojwani/", image: baseURL + "bhojwani.jpg", company: "Hindalco Eternia" }
  ];


  const prioritizedStudentsOrder = [
    { name: "Vedang Sawant", company: "Flipkart" },
    { name: "Gaurav Jaat", company: "DE Shaw" },
    { name: "Kanchan Kulhria", company: "Amazon" },
    { name: "Anisha Joshi", company: "Godrej Agrovet" },
    { name: "Khushi Gandhi", company: "Morgan Stanley" },
    { name: "Rohit Varma", company: "Cummins" },
    { name: "Ishaan Isham", company: "UBS" },
    { name: "Simran Singh", company: "Amazon" },
    { name: "Ananya Gupta", company: "Amazon" },
    { name: "Virali Doshi", company: "Deutsche Bank" },
    { name: "Viddhi S Mittal", company: "Amazon" },
    { name: "Priya Jain", company: "Amazon" },
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



const initializeLinkedInPosts = () => {
  const linkedInPosts = [
    {
      name: "Vedang Sawant",
      title: "CA Fresher at Flipkart",
      avatar: "https://www.mystudentclub.com/assets/vedang.jpg",
      content: "Thrilled to share that I've started my Industrial Training at Flipkart! 🚀\n\nA huge thanks to CA Padam Bhansali and the MSC team for their incredible guidance throughout my placement journey. The CA Industrial Training Program truly transformed my approach to interviews and helped me land my dream opportunity.",
      reactions: 289,
      linkedinUrl: "https://www.linkedin.com/in/vedangsawant/"
    },
    {
      name: "Khushi Gandhi",
      title: "CA Fresher at Morgan Stanley",
      avatar: "https://www.mystudentclub.com/assets/khushi.jpg",
      content: "Excited to announce that I've joined Morgan Stanley for my Industrial Training! ✨\n\nThis wouldn't have been possible without the structured guidance from MSC. The mock interviews and CV review sessions were game-changers. Forever grateful to CA Padam Bhansali for this opportunity!",
      reactions: 356,
      linkedinUrl: "https://www.linkedin.com/in/khushi-gandhi-40a37a242/"
    },
    {
      name: "Gaurav Jaat",
      title: "CA Fresher at DE Shaw",
      avatar: "https://www.mystudentclub.com/assets/gaurav.jpg",
      content: "Happy to share that I've started my Industrial Training journey at DE Shaw! 🎯\n\nThe MSC CA Industrial Training Program was instrumental in preparing me for this role. The exclusive job listings and personalized mentorship made all the difference. Thank you MSC team!",
      reactions: 412,
      linkedinUrl: "https://www.linkedin.com/in/gauravjaat/"
    },
    {
      name: "Kanchan Kulhria",
      title: "CA Fresher at Amazon",
      avatar: "https://www.mystudentclub.com/assets/kanchan.jpg",
      content: "Delighted to share that I've joined Amazon for my Industrial Training! 🌟\n\nThe MSC IT Program provided me with all the tools I needed - from resume optimization to interview preparation. The personalized mentorship from CA Padam Bhansali was invaluable!",
      reactions: 324,
      linkedinUrl: "https://www.linkedin.com/in/kanchankulhria/"
    },
    {
      name: "Ishaan Isham",
      title: "CA Fresher at UBS",
      avatar: "https://www.mystudentclub.com/assets/ishaan.jpg",
      content: "Excited to announce that I've started my Industrial Training at UBS! 💼\n\nThe structured approach of MSC's program helped me crack interviews at top companies. The mock interviews and industry insights were exactly what I needed. Thank you MSC team!",
      reactions: 278,
      linkedinUrl: "https://www.linkedin.com/in/ishaanisham/"
    },
    {
      name: "Virali Doshi",
      title: "CA Fresher at Deutsche Bank",
      avatar: "https://www.mystudentclub.com/assets/virali.jpg",
      content: "Happy to share that I've joined Deutsche Bank for my Industrial Training! 🎉\n\nThe MSC CA Industrial Training Program was a game-changer in my placement journey. The CV review sessions and exclusive job listings made the process so much smoother!",
      reactions: 345,
      linkedinUrl: "https://www.linkedin.com/in/virali-doshi1905"
    },
    {
      name: "Chery Lunia",
      title: "CA Fresher at Goldman Sachs",
      avatar: "https://www.mystudentclub.com/assets/Chery.jpeg",
      content: "Thrilled to announce that I've started my Industrial Training at Goldman Sachs! ✨\n\nGrateful to MSC and CA Padam Bhansali for their incredible support throughout. The program's comprehensive approach to placement preparation truly made a difference!",
      reactions: 398,
      linkedinUrl: "https://www.linkedin.com/in/cheryluniya/"
    },
    {
      name: "Dev Mundra",
      title: "CA Fresher at UBS",
      avatar: "https://www.mystudentclub.com/assets/Dev.jpg",
      content: "Excited to share that I've joined UBS for my Industrial Training! 🚀\n\nThe MSC IT Program exceeded all my expectations. From personal CV reviews to mock interviews, every aspect was designed to help students succeed. Highly recommend!",
      reactions: 267,
      linkedinUrl: "https://www.linkedin.com/in/devmundra2003/"
    },
    {
      name: "Priya Jain",
      title: "CA Fresher at Amazon",
      avatar: "https://www.mystudentclub.com/assets/Priya.jpg",
      content: "Happy to announce that I've started my Industrial Training journey at Amazon! 🌟\n\nThe MSC program's personalized mentorship and comprehensive preparation resources helped me land my dream role. Forever grateful to the MSC team!",
      reactions: 312,
      linkedinUrl: "https://www.linkedin.com/in/priyaaajain/"
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

function initializeParallax() {
  const layers = document.querySelectorAll('.layer');
  if (!layers.length) return;
  const move = (x = 0, y = 0) => layers.forEach(el => {
    const d = parseFloat(el.dataset.depth || 0.05);
    el.style.transform = `translate3d(${x * d}px, ${y * d}px, 0)`;
  });
  window.addEventListener('mousemove', e => {
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    move((e.clientX - cx) * 0.04, (e.clientY - cy) * 0.06);
  });
  window.addEventListener('scroll', () => {
    const y = window.scrollY * 0.08; layers.forEach(el => {
      const d = parseFloat(el.dataset.depth || 0.05);
      el.style.transform = `translate3d(0, ${y * d}px, 0)`;
    });
  }, { passive: true });
}

function adjustDaysGrid() {

}

function initializeCurriculumCenter() {

}



document.addEventListener('DOMContentLoaded', () => {
  safe(initializeLinkedInPosts, 'linkedinPosts');
  safe(initializeCarousel, 'carousel');
  safe(initializeCertificate, 'certificate');

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