const generateData = () => {
  const baseURL = "https://www.mystudentclub.com/assets/";

  const allAvailableStudents =[
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

  const prioritizedStudentsOrder =[
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

  const students =[];
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

const getCompanyLogoSVG = (company) => {
  const comp = (company || '').trim().toLowerCase();

  if (comp.includes('amazon')) {
    return `<svg viewBox="0 0 95 28" class="company-logo-svg" fill="none">
      <text x="2" y="19" font-family="'Inter', -apple-system, sans-serif" font-size="18" font-weight="900" fill="#111827" letter-spacing="-0.5px">amazon</text>
      <path d="M12 23 C 32 30, 56 28, 72 21" stroke="#FF9900" stroke-width="2.6" stroke-linecap="round" fill="none"/>
      <polygon points="70,18 78,21 72,25" fill="#FF9900"/>
    </svg>`;
  }
  if (comp.includes('flipkart')) {
    return `<svg viewBox="0 0 100 28" class="company-logo-svg" fill="none">
      <g transform="translate(2, 4)">
        <rect x="0" y="4" width="16" height="15" rx="3" fill="#2874F0"/>
        <path d="M4 4 C4 0 12 0 12 4" stroke="#FFE11B" stroke-width="2" fill="none"/>
        <path d="M7 8 L10 8 M7 11 L10 11 M7 8 L7 15" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round"/>
      </g>
      <text x="23" y="19" font-family="'Inter', -apple-system, sans-serif" font-size="16" font-weight="900" font-style="italic" fill="#2874F0" letter-spacing="-0.3px">Flipkart</text>
      <polygon points="87,7 93,12 87,17" fill="#FFE11B"/>
    </svg>`;
  }
  if (comp.includes('ubs')) {
    return `<svg viewBox="0 0 85 28" class="company-logo-svg" fill="none">
      <g transform="translate(2, 5)" stroke="#111827" stroke-width="1.4" fill="none">
        <circle cx="5" cy="5" r="3.5"/>
        <line x1="8" y1="5" x2="20" y2="5"/>
        <line x1="16" y1="5" x2="16" y2="8"/>
        <line x1="19" y1="5" x2="19" y2="8"/>
        <line x1="5" y1="8" x2="16" y2="15"/>
        <line x1="5" y1="2" x2="16" y2="-5"/>
      </g>
      <text x="28" y="20" font-family="'Inter', sans-serif" font-size="19" font-weight="900" fill="#E60000" letter-spacing="1.2px">UBS</text>
    </svg>`;
  }
  if (comp.includes('deutsche')) {
    return `<svg viewBox="0 0 120 28" class="company-logo-svg" fill="none">
      <rect x="2" y="3" width="22" height="22" rx="3" stroke="#0018A8" stroke-width="2.5" fill="none"/>
      <line x1="6" y1="21" x2="20" y2="7" stroke="#0018A8" stroke-width="2.8" stroke-linecap="round"/>
      <text x="30" y="18" font-family="'Inter', sans-serif" font-size="11.5" font-weight="800" fill="#0018A8" letter-spacing="-0.2px">Deutsche Bank</text>
    </svg>`;
  }
  if (comp.includes('shaw')) {
    return `<svg viewBox="0 0 120 28" class="company-logo-svg" fill="none">
      <text x="2" y="19" font-family="'Georgia', 'Times New Roman', serif" font-size="14.5" font-weight="bold" fill="#002D62" letter-spacing="0.3px">D. E. Shaw &amp; Co.</text>
    </svg>`;
  }
  if (comp.includes('morgan') || comp.includes('stanley')) {
    return `<svg viewBox="0 0 125 28" class="company-logo-svg" fill="none">
      <text x="2" y="19" font-family="'Inter', 'Helvetica Neue', sans-serif" font-size="13" font-weight="800" fill="#111827" letter-spacing="0.2px">Morgan Stanley</text>
    </svg>`;
  }
  if (comp.includes('goldman') || comp.includes('sachs')) {
    return `<svg viewBox="0 0 115 28" class="company-logo-svg" fill="none">
      <rect x="2" y="3" width="22" height="22" rx="3" fill="#7399C6"/>
      <text x="6" y="14" font-family="'Inter', sans-serif" font-size="9" font-weight="900" fill="#FFFFFF">G</text>
      <text x="13" y="21" font-family="'Inter', sans-serif" font-size="9" font-weight="900" fill="#FFFFFF">S</text>
      <text x="29" y="13" font-family="'Georgia', serif" font-size="10.5" font-weight="bold" fill="#111827">Goldman</text>
      <text x="29" y="23" font-family="'Georgia', serif" font-size="10.5" font-weight="bold" fill="#111827">Sachs</text>
    </svg>`;
  }
  if (comp.includes('unilever')) {
    return `<svg viewBox="0 0 95 28" class="company-logo-svg" fill="none">
      <g transform="translate(2, 3)">
        <path d="M4 2 C4 14, 18 14, 18 2 M6 4 C6 12, 16 12, 16 4" stroke="#1F36C7" stroke-width="2" fill="none" stroke-linecap="round"/>
        <circle cx="4" cy="2" r="1.5" fill="#1F36C7"/>
        <circle cx="18" cy="2" r="1.5" fill="#1F36C7"/>
        <circle cx="11" cy="9" r="1.2" fill="#1F36C7"/>
      </g>
      <text x="26" y="19" font-family="'Inter', sans-serif" font-size="15" font-weight="900" fill="#1F36C7" letter-spacing="-0.3px">Unilever</text>
    </svg>`;
  }
  if (comp.includes('hdfc')) {
    return `<svg viewBox="0 0 115 28" class="company-logo-svg" fill="none">
      <g transform="translate(2, 4)">
        <rect x="0" y="0" width="20" height="20" rx="3" fill="#004C8F"/>
        <rect x="4" y="4" width="12" height="12" fill="#FFFFFF"/>
        <rect x="6" y="6" width="8" height="8" fill="#ED232A"/>
      </g>
      <text x="27" y="18" font-family="'Inter', sans-serif" font-size="12" font-weight="900" fill="#004C8F" letter-spacing="0.2px">HDFC BANK</text>
    </svg>`;
  }
  if (comp.includes('barclays')) {
    return `<svg viewBox="0 0 110 28" class="company-logo-svg" fill="none">
      <g transform="translate(2, 4)" fill="#00AEEF">
        <path d="M10 2 L12 6 L18 4 L15 10 L19 13 L14 14 L15 19 L10 16 L5 19 L6 14 L1 13 L5 10 L2 4 L8 6 Z"/>
      </g>
      <text x="25" y="18" font-family="'Inter', sans-serif" font-size="13" font-weight="900" fill="#00395D" letter-spacing="0.8px">BARCLAYS</text>
    </svg>`;
  }
  if (comp.includes('birla') || comp.includes('grasim')) {
    return `<svg viewBox="0 0 130 28" class="company-logo-svg" fill="none">
      <g transform="translate(2, 4)">
        <path d="M2 18 C2 9, 9 2, 18 2 C18 9, 12 18, 2 18 Z" fill="#D32F2F"/>
        <path d="M6 18 C6 11, 11 6, 18 6 C18 11, 14 18, 6 18 Z" fill="#E65100"/>
        <path d="M10 18 C10 13, 14 10, 18 10 C18 14, 15 18, 10 18 Z" fill="#FBC02D"/>
      </g>
      <text x="25" y="13" font-family="'Inter', sans-serif" font-size="9" font-weight="900" fill="#D32F2F" letter-spacing="0.5px">ADITYA BIRLA</text>
      <text x="25" y="22" font-family="'Inter', sans-serif" font-size="7.5" font-weight="700" fill="#64748B" letter-spacing="1px">GROUP</text>
    </svg>`;
  }
  if (comp.includes('itc')) {
    return `<svg viewBox="0 0 85 28" class="company-logo-svg" fill="none">
      <g transform="translate(2, 2)">
        <polygon points="12,1 23,22 1,22" fill="#002E6E" stroke="#002E6E" stroke-width="1"/>
        <text x="12" y="18" font-family="'Georgia', serif" font-size="9.5" font-weight="bold" fill="#FFFFFF" text-anchor="middle">ITC</text>
      </g>
      <text x="28" y="19" font-family="'Georgia', serif" font-size="15" font-weight="bold" fill="#002E6E" letter-spacing="1px">ITC</text>
    </svg>`;
  }
  if (comp.includes('kotak')) {
    return `<svg viewBox="0 0 95 28" class="company-logo-svg" fill="none">
      <g transform="translate(2, 4)">
        <rect x="0" y="0" width="20" height="20" rx="4" fill="#ED1B24"/>
        <path d="M6 10 C4 8, 4 12, 6 10 C8 8, 12 12, 14 10 C16 8, 16 12, 14 10 C12 8, 8 12, 6 10 Z" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" fill="none"/>
      </g>
      <text x="27" y="18" font-family="'Inter', sans-serif" font-size="14.5" font-weight="900" fill="#ED1B24" letter-spacing="-0.3px">kotak</text>
    </svg>`;
  }
  if (comp.includes('cipla')) {
    return `<svg viewBox="0 0 85 28" class="company-logo-svg" fill="none">
      <g transform="translate(2, 5)">
        <circle cx="8" cy="8" r="7" stroke="#003865" stroke-width="2.5" fill="none"/>
        <path d="M8 1 A7 7 0 0 1 15 8 L8 8 Z" fill="#ED1C24"/>
      </g>
      <text x="22" y="19" font-family="'Inter', sans-serif" font-size="16" font-weight="900" fill="#003865" letter-spacing="-0.3px">Cipla</text>
    </svg>`;
  }
  if (comp.includes('hsbc')) {
    return `<svg viewBox="0 0 90 28" class="company-logo-svg" fill="none">
      <g transform="translate(2, 4)">
        <polygon points="10,10 2,2 18,2" fill="#DB0011"/>
        <polygon points="10,10 2,18 18,18" fill="#DB0011"/>
        <polygon points="10,10 2,2 2,18" fill="#DB0011"/>
        <polygon points="10,10 18,2 18,18" fill="#DB0011"/>
      </g>
      <text x="26" y="19" font-family="'Inter', sans-serif" font-size="15" font-weight="900" fill="#111827" letter-spacing="0.5px">HSBC</text>
    </svg>`;
  }
  if (comp.includes('reliance')) {
    return `<svg viewBox="0 0 105 28" class="company-logo-svg" fill="none">
      <g transform="translate(2, 4)">
        <ellipse cx="10" cy="10" rx="9" ry="8" stroke="#004C97" stroke-width="2" fill="none"/>
        <path d="M10 4 C7 7, 7 11, 10 14 C13 11, 13 7, 10 4 Z" fill="#ED1C24"/>
      </g>
      <text x="25" y="18" font-family="'Inter', sans-serif" font-size="14.5" font-weight="900" fill="#004C97" letter-spacing="-0.2px">Reliance</text>
    </svg>`;
  }
  if (comp.includes('cummins')) {
    return `<svg viewBox="0 0 88 26" class="company-logo-svg" fill="none">
      <rect x="2" y="4" width="16" height="16" fill="#D32F2F" rx="2"/>
      <text x="6" y="16" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="12" font-weight="900" fill="#fff">C</text>
      <text x="22" y="17" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="13" font-weight="800" fill="#111827">Cummins</text>
    </svg>`;
  }
  if (comp.includes('bpcl') || comp.includes('bharat petroleum')) {
    return `<svg viewBox="0 0 85 26" class="company-logo-svg" fill="none">
      <circle cx="10" cy="13" r="8" fill="#FFCC00"/>
      <circle cx="10" cy="13" r="4" fill="#003399"/>
      <text x="24" y="18" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="14" font-weight="900" fill="#003399">BPCL</text>
    </svg>`;
  }
  if (comp.includes('pepsico') || comp.includes('pepsi')) {
    return `<svg viewBox="0 0 95 26" class="company-logo-svg" fill="none">
      <circle cx="10" cy="13" r="8" fill="#004B93"/>
      <path d="M3 13 C 7 9, 13 17, 17 13 A 8 8 0 0 0 3 13 Z" fill="#E32934"/>
      <text x="24" y="18" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="13" font-weight="900" fill="#004B93" letter-spacing="0.5px">PEPSICO</text>
    </svg>`;
  }
  if (comp.includes('dlf')) {
    return `<svg viewBox="0 0 70 26" class="company-logo-svg" fill="none">
      <g transform="translate(2, 4)" fill="#003399">
        <polygon points="6,0 12,12 0,12"/>
      </g>
      <text x="18" y="18" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif" font-size="15" font-weight="900" fill="#003399">DLF</text>
    </svg>`;
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
  if (comp.includes('godrej')) {
    return `<svg viewBox="0 0 90 26" class="company-logo-svg" fill="none">
      <text x="2" y="18" font-family="'Brush Script MT', 'Lucida Calligraphy', cursive, sans-serif" font-size="19" font-weight="bold" fill="#0d9488">Godrej</text>
      <text x="48" y="18" font-family="'Inter', sans-serif" font-size="10" font-weight="700" fill="#64748b">Agrovet</text>
    </svg>`;
  }
  if (comp.includes('adani')) {
    return `<svg viewBox="0 0 75 26" class="company-logo-svg" fill="none"><text x="2" y="19" font-family="'Inter', sans-serif" font-size="15" font-weight="900" fill="#205493">adani</text></svg>`;
  }
  if (comp.includes('hindalco') || comp.includes('eternia')) {
    return `<svg viewBox="0 0 95 26" class="company-logo-svg" fill="none"><text x="2" y="18" font-family="'Inter', sans-serif" font-size="13" font-weight="800" fill="#D32F2F">HINDALCO</text></svg>`;
  }

  return `<span style="font-weight:700; color:var(--primary-blue); font-size:13px;">${company}</span>`;
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
        <img src="${student.image}" alt="${student.name}" loading="lazy" decoding="async" onerror="this.onerror=null; this.src='/assets/icon-70x70.png';" />
      </div>
      <h3 class="student-name" title="${student.name}">${student.name}</h3>
      <div class="student-firm-label">Placed at</div>
      <div class="student-company-logo">
        ${getCompanyLogoSVG(student.company)}
      </div>
      ${student.linkedin && student.linkedin !== 'N/A' ? `
      <a href="${student.linkedin}" class="linkedin-pill-btn" target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" class="linkedin-pill-icon" fill="currentColor">
          <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
        </svg>
        <span>View Profile</span>
      </a>` : ''}
    `;
    carousel.appendChild(card);
  });

  // Duplicate cards for seamless continuous scrolling
  const originalCards = [...carousel.children];
  originalCards.forEach(card => {
    const clone = card.cloneNode(true);
    carousel.appendChild(clone);
  });

  const cardWidth = 242; // 224px width + 18px gap
  const halfLength = originalCards.length * cardWidth;

  let position = 0;
  const speed = 1.0;
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
      position += cardWidth * 1.5;
      if (position > 0) {
        position = -halfLength;
      }
      carousel.style.transform = `translateX(${position}px)`;
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      position -= cardWidth * 1.5;
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
    }, { threshold: 0.05 }).observe(carouselContainer);
  }

  carousel.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.pageX - carousel.offsetLeft;
    dragStartPosition = position;
    carousel.style.cursor = 'grabbing';
    if (animationId) cancelAnimationFrame(animationId);
  });

  carousel.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    e.preventDefault();
    const x = e.pageX - carousel.offsetLeft;
    const walk = (x - startX) * 1.5;
    position = dragStartPosition + walk;
    carousel.style.transform = `translateX(${position}px)`;
  });

  carousel.addEventListener('touchstart', (e) => {
    dragging = true;
    startX = e.touches[0].pageX - carousel.offsetLeft;
    dragStartPosition = position;
    if (animationId) cancelAnimationFrame(animationId);
  }, { passive: true });

  carousel.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const x = e.touches[0].pageX - carousel.offsetLeft;
    const walk = (x - startX) * 1.5;
    position = dragStartPosition + walk;
    carousel.style.transform = `translateX(${position}px)`;
  }, { passive: true });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    carousel.style.cursor = 'grab';
    lastTime = 0;
    animationId = requestAnimationFrame(animate);
  }

  carousel.addEventListener('mouseup', endDrag);
  carousel.addEventListener('mouseleave', endDrag);
  carousel.addEventListener('touchend', endDrag);
  carousel.addEventListener('touchcancel', endDrag);

  animationId = requestAnimationFrame(animate);
};



const initializeLinkedInPosts = () => {
  const linkedInPosts = [
    {
      name: "Khushi Gandhi",
      company: "Morgan Stanley",
      role: "CA Finalist",
      avatar: "https://www.mystudentclub.com/assets/khushi.jpg",
      headline: "Joined Morgan Stanley as an Industrial Trainee in the Financial Control Group — Product Control Dept! 🌟",
      highlight: "I'm sincerely thankful to <strong>CA Padam Bhansali & My Student Club</strong> for their guidance and reassurance throughout the interview & acceptance phase! 🥳",
      reactions: 691,
      linkedinUrl: "https://www.linkedin.com/in/khushi-gandhi-40a37a242/"
    },
    {
      name: "Priyanka Sharma",
      company: "Grasim Industries (Aditya Birla)",
      role: "CA Finalist",
      avatar: "https://www.mystudentclub.com/assets/priyanka-sharma.png",
      headline: "Begun my CA Industrial Training at GRASIM INDUSTRIES LIMITED (ADITYA BIRLA GROUP) 💫",
      highlight: "Grateful to my mentor <strong>CA Padam Bhansali</strong> for his guidance and trust 🤝 his support has been truly instrumental in reaching this milestone.",
      reactions: 216,
      linkedinUrl: "https://www.linkedin.com/in/priyanka-sharma-s6/"
    },
    {
      name: "Vedang Sawant",
      company: "Flipkart",
      role: "CA Industrial Trainee",
      avatar: "https://www.mystudentclub.com/assets/vedang.jpg",
      headline: "Excited to announce the beginning of my Industrial Training journey with Flipkart! 🚀",
      highlight: "Special gratitude to <strong>CA Padam Bhansali</strong> for his unwavering mentorship, mock prep, and motivation at every step of this journey.",
      reactions: 383,
      linkedinUrl: "https://www.linkedin.com/in/vedangsawant/"
    },
    {
      name: "Tamanna Gaur",
      company: "HCL Technologies",
      role: "CA Industrial Trainee",
      avatar: "https://www.mystudentclub.com/assets/tamanna-gaur.jpg",
      headline: "Started my journey as a CA Industrial Trainee at HCL Technologies! ✨",
      highlight: "Deeply thankful to <strong>CA Padam Bhansali</strong> for the timely guidance, CV strategy, and mentorship that made this step possible. 🤍💫",
      reactions: 161,
      linkedinUrl: "https://www.linkedin.com/in/tamanna-gaur/"
    },
    {
      name: "Rupesh Machha",
      company: "Cipla",
      role: "CA Industrial Trainee",
      avatar: "https://www.mystudentclub.com/assets/rupesh-machha.jpg",
      headline: "Pleased to share that I've joined Cipla in the Business Finance Department! 📈",
      highlight: "A special mention to <strong>CA Padam Bhansali</strong> for pushing me to give my best efforts. It wouldn't have been possible without MSC mentorship!",
      reactions: 784,
      linkedinUrl: "https://www.linkedin.com/in/ca-rupesh-machha-/"
    },
    {
      name: "Siddhant Pandey",
      company: "UBS",
      role: "CA Industrial Trainee",
      avatar: "https://www.mystudentclub.com/assets/sidhant-pandey.jpg",
      headline: "Begun a new chapter at UBS as an Industrial Trainee in the Liquidity & Funding domain. 🎯",
      highlight: "A special note of thanks to <strong>CA Padam Bhansali</strong>, whose constant guidance and support throughout my hunt made this journey possible.",
      reactions: 330,
      linkedinUrl: "https://www.linkedin.com/in/siddhant-pandeyy/"
    },
    {
      name: "Sanyam Khatter",
      company: "CARS24",
      role: "CA Industrial Trainee",
      avatar: "https://www.mystudentclub.com/assets/sanyam-khatter.png",
      headline: "Joined CARS24 as a CA Industrial Trainee in a fast-paced finance environment! 🏎️",
      highlight: "Special thanks to <strong>CA Padam Bhansali</strong> for the resume strategy and interview guidance during this transition — truly appreciated!",
      reactions: 360,
      linkedinUrl: "https://www.linkedin.com/in/sanyam-khatter/"
    },
    {
      name: "Surbhi Priya",
      company: "Kotak Mahindra Bank",
      role: "CA Industrial Trainee",
      avatar: "https://www.mystudentclub.com/assets/surbhi-priya.png",
      headline: "Delighted to share that I have joined Kotak Mahindra Bank as an Industrial Trainee! 🏦",
      highlight: "Deeply grateful to <strong>My Student Club and CA Padam Bhansali</strong> for continuous guidance, encouragement, and unwavering support throughout.",
      reactions: 232,
      linkedinUrl: "https://www.linkedin.com/in/surbhipriya1/"
    }
  ];

  const carousel = document.getElementById('linkedinCarousel');

  if (!carousel) return;

  const getCardWidth = () => {
    if (window.innerWidth < 480) return 310 + 14;
    if (window.innerWidth < 768) return 330 + 16;
    return 380 + 16;
  };

  const createCardElement = (post) => {
    const card = document.createElement('div');
    card.className = 'linkedin-card';
    card.innerHTML = `
      <div class="linkedin-card-header">
        <div class="linkedin-author">
          <img src="${post.avatar}" alt="${post.name}" class="linkedin-avatar" loading="lazy" decoding="async" onerror="this.src='https://via.placeholder.com/48'">
          <div class="linkedin-user-info">
            <div class="linkedin-user-name-row">
              <span class="linkedin-user-name">${post.name}</span>
              <i class="fab fa-linkedin-in linkedin-in-badge"></i>
            </div>
            <p class="linkedin-user-title">${post.role} • <strong>${post.company}</strong></p>
          </div>
        </div>
      </div>
      <div class="linkedin-card-body">
        <p class="linkedin-post-headline">${post.headline}</p>
        <div class="linkedin-mentor-quote">
          <svg class="quote-icon" viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
            <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/>
          </svg>
          <span>${post.highlight}</span>
        </div>
      </div>
      <div class="linkedin-card-footer">
        <div class="linkedin-reactions">
          <div class="linkedin-reaction-icons">
            <span class="linkedin-reaction-icon like">👍</span>
            <span class="linkedin-reaction-icon celebrate">🎉</span>
            <span class="linkedin-reaction-icon love">❤️</span>
          </div>
          <span>${post.reactions}</span>
        </div>
        <a href="${post.linkedinUrl}" target="_blank" rel="noopener noreferrer" class="linkedin-view-post-link">
          <span>View Post</span>
          <i class="fas fa-external-link-alt" style="font-size: 10px;"></i>
        </a>
      </div>
    `;
    return card;
  };

  linkedInPosts.forEach(post => {
    carousel.appendChild(createCardElement(post));
  });

  const cards = [...carousel.children];
  cards.forEach(card => {
    const clone = card.cloneNode(true);
    carousel.appendChild(clone);
  });

  let position = 0;
  let speed = 0.85;
  let animationId;
  let lastTime = 0;
  let isPaused = false;

  carousel.addEventListener('mouseenter', () => { isPaused = true; });
  carousel.addEventListener('mouseleave', () => { isPaused = false; });

  function animate(currentTime) {
    if (!lastTime) lastTime = currentTime;
    const delta = currentTime - lastTime;

    if (!isPaused && !dragging) {
      position -= speed * (delta / 16);
      if (Math.abs(position) >= (getCardWidth() * cards.length)) {
        position = 0;
      }
      carousel.style.transform = `translateX(${position}px)`;
    }

    lastTime = currentTime;
    animationId = requestAnimationFrame(animate);
  }

  let dragging = false;
  let startX = 0;
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

  carousel.addEventListener('touchstart', (e) => {
    dragging = true;
    startX = e.touches[0].pageX - carousel.offsetLeft;
    dragStartPosition = position;
    cancelAnimationFrame(animationId);
  }, { passive: true });

  carousel.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const x = e.touches[0].pageX - carousel.offsetLeft;
    const walk = (x - startX) * 1.5;
    position = dragStartPosition + walk;
    carousel.style.transform = `translateX(${position}px)`;
  }, { passive: true });

  function endDrag() {
    dragging = false;
    carousel.style.cursor = 'grab';
    lastTime = 0;
    animate(performance.now());
  }

  carousel.addEventListener('mouseup', endDrag);
  carousel.addEventListener('mouseleave', endDrag);
  carousel.addEventListener('touchend', endDrag);
  carousel.addEventListener('touchcancel', endDrag);

  animate(performance.now());
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

        const factorX = 25;
        const factorY = 35;

        const baseRotateY = -14;
        const baseRotateX = 4;
        const baseRotateZ = -1;

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
        certificate.style.transform = 'rotateY(-14deg) rotateX(4deg) rotateZ(-1deg)';
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


const initializeCompaniesTicker = () => {
  const track = document.getElementById('companiesTickerTrack');
  if (!track) return;
  const items = [...track.children];
  items.forEach(item => {
    track.appendChild(item.cloneNode(true));
  });
};

document.addEventListener('DOMContentLoaded', () => {
  safe(initializeLinkedInPosts, 'linkedinPosts');
  safe(initializeCompaniesTicker, 'companiesTicker');
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
