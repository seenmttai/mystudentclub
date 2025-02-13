const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey, {
  global: { headers: { 'apikey': supabaseKey } }
});

const jobsContainer = document.getElementById('jobs');
const loader = document.getElementById('loader');
const modal = document.getElementById('modal');
const modalContent = document.getElementById('modal-content');
const searchInput = document.getElementById('searchInput');
const locationSearchInput = document.getElementById('locationSearchInput');
const salaryFilter = document.getElementById('salaryFilter');
const loadMoreButton = document.getElementById('loadMore');

let isFetching = false;
let page = 0;
const limit = 12;
let timeout = null;
let hasMoreData = true;

const menuButton = document.getElementById('menuButton');
const expandedMenu = document.getElementById('expandedMenu');
const prevSlide = document.getElementById('prevSlide');
const nextSlide = document.getElementById('nextSlide');

menuButton.addEventListener('click', () => {
  expandedMenu.classList.toggle('active');
});

const menuCloseBtn = document.getElementById('menuCloseBtn');

menuCloseBtn.addEventListener('click', () => {
  expandedMenu.classList.remove('active');
});

let currentSlide = 0;
let slides = [];
let totalSlides = 0;

function showSlide(index) {
  if (!slides || slides.length === 0) {
    console.error("Slides array is not properly initialized or is empty.");
    return;
  }
  slides.forEach(slide => slide.classList.remove('active'));
  currentSlide = (index + totalSlides) % totalSlides;
  if (slides[currentSlide]) {
    slides[currentSlide].classList.add('active');
  } else {
    console.error("currentSlide index is out of bounds:", currentSlide, "totalSlides:", totalSlides, "slides:", slides);
  }
}

prevSlide.addEventListener('click', () => {
  showSlide(currentSlide - 1);
});

nextSlide.addEventListener('click', () => {
  showSlide(currentSlide + 1);
});

document.addEventListener('click', (event) => {
  if (!expandedMenu.contains(event.target) &&
      !menuButton.contains(event.target) &&
      expandedMenu.classList.contains('active')) {
    expandedMenu.classList.remove('active');
  }
});

function showModal(job, table) {
  const isArticleship = table === 'Articleship Jobs';
  let companyName, jobLocation, jobSalary, jobDescription, jobApplication, jobAddress;
  if(!isArticleship){
    companyName = job.company || 'Company Name N/A';
    jobLocation = job.location || 'Location N/A';
    jobSalary = job.salary;
    jobDescription = job.description || 'N/A';
    jobApplication = job.application;
  } else {
    console.log("Articleship Job Object:", job);
    companyName = job.Name || 'Company Name N/A';
    jobAddress = job.Address || 'Location N/A';
    jobApplication = job.Application || 'N/A';
    jobDescription = job.Description || 'N/A';
    jobSalary = null; 
  }

  modalContent.innerHTML = `
    <h2 class="modal-company job-box">${companyName}</h2>
    ${jobSalary && !isArticleship ? `<p class="job-location job-box">${jobLocation}</p>` : ''}
    ${jobSalary && !isArticleship ? `<p class="job-salary job-box">Stipend: ₹${jobSalary}</p>` : ''}
    ${isArticleship ? `<p class="job-location job-box">${jobAddress}</p>` : ''}
    <section class="modal-section job-box">
      <h3>Job Details</h3>
      <dl class="job-details-list">
        <li>
          <dt>Description</dt>
          <dd class="modal-description-text">${jobDescription}</dd>
        </li>
      </dl>
    </section>
    <div class="modal-section">
      <h3>Apply Now</h3>
      ${jobApplication ? `<a href="${getApplicationLink(jobApplication, isArticleship)}" class="apply-btn" ${isValidUrl(jobApplication) ? 'target="_blank"' : ''}>Apply</a>` : 'Contact details are in description'}
    </div>
  `;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

window.closeModal = function(event) {
  if (event.target === modal || event.target.classList.contains('modal-close')) {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
  }
}

function getApplicationLink(jobApplication, isArticleship) {
  if (isValidUrl(jobApplication)) {
    return jobApplication;
  } else {
    const subject = 'Applying for job, reference- My Student Club';
    if (isArticleship) {
      const emailRegex = /[\w.-]+@[\w.-]+\.\w+/;
      const firstEmailMatch = jobApplication.match(emailRegex);
      const firstEmail = firstEmailMatch ? firstEmailMatch[0] : null;
      if (firstEmail) {
        return `mailto:${firstEmail}?subject=${encodeURIComponent(subject)}`;
      } else {
        return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(jobApplication)}`; 
      }
    } else {
      return `mailto:${jobApplication}?subject=${encodeURIComponent(subject)}`;
    }
  }
}

let currentTable = 'Industrial Training Job Portal';

const footerTabs = document.querySelectorAll('.footer-tab');

footerTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    footerTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    currentTable = tab.dataset.table;

    page = 0;
    jobsContainer.innerHTML = '';
    hasMoreData = true;
    loadMoreButton.style.display = 'none';
    fetchJobs(searchInput.value, locationSearchInput.value, salaryFilter.value);
  });
});

async function fetchJobs(searchTerm = '', locationSearch = '', salary = '') {
  if (isFetching) return;
  isFetching = true;
  loader.style.display = 'block';
  loadMoreButton.disabled = true;
  try {
    let query = supabaseClient
      .from(currentTable)
      .select('*', { count: 'exact' });

    if (searchTerm) {
      const searchPattern = `%${searchTerm}%`;
      query = query.or(`company.ilike.${searchPattern},location.ilike.${searchPattern},description.ilike.${searchPattern}`);
    }
    if (locationSearch) {
      const locationPattern = `%${locationSearch}%`;
      query = query.ilike('location', locationPattern);
    }
    if (salary) {
      if (salary === '40000+') {
        query = query.gte('salary', 40000);
      } else {
        const [min, max] = salary.split('-').map(Number);
        query = query.gte('salary', min).lte('salary', max);
      }
    }
    query = query.range(page * limit, (page + 1) * limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching jobs:', error.message);
      jobsContainer.textContent = 'Failed to load jobs. Please try again later.';
      return;
    }

    if (data && data.length > 0) {
      data.forEach(job => {
        const jobCard = document.createElement('article');
        jobCard.className = 'job-card';
        jobCard.onclick = () => showModal(job, currentTable);
        let jobCardContent = `
          <div class="job-info">
            <h2 class="job-company">${highlightSearchTerm(job.company, searchTerm) || 'Company Name N/A'}</h2>
            <div class="job-meta">
              <span class="job-tag location-tag">
                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                </svg>
                ${highlightSearchTerm(job.location, searchTerm) || 'Location N/A'}
              </span>`
              + (job.salary && currentTable !== 'Articleship Jobs' ? `
                <span class="job-tag salary-tag">
                  <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  ₹${job.salary}
                </span>` : '') +
              `
            </div>
          </div>
          <div class="job-actions">
            <button class="view-details-btn">View Details</button>
          </div>
        `;
        jobCard.innerHTML = jobCardContent;
        jobsContainer.appendChild(jobCard);
      });
      page++;
      hasMoreData = data.length === limit;
      loadMoreButton.style.display = hasMoreData ? 'block' : 'none';
    } else {
      hasMoreData = false;
      loadMoreButton.style.display = 'none';
      if (page === 0) {
        jobsContainer.textContent = 'No jobs found.';
      }
    }
  } catch (fetchError) {
    console.error('Error during fetch:', fetchError);
    jobsContainer.textContent = 'Failed to load jobs. Please check your connection and try again.';
  } finally {
    isFetching = false;
    loader.style.display = 'none';
    loadMoreButton.disabled = false;
  }
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

let lastScrollY = 0;
const header = document.querySelector('.floating-header');

function handleScroll() {
  const currentScrollY = window.scrollY;

  if (currentScrollY > lastScrollY && currentScrollY > 100) {

    header.classList.add('header-hidden');
  } else {

    header.classList.remove('header-hidden');
  }
  lastScrollY = currentScrollY;
}

function highlightSearchTerm(text, searchTerm) {
  if (!searchTerm || !text) return text;
  const regex = new RegExp(`(${searchTerm.split(/\s+/).join('|')})`, 'gi');
  return text.replace(regex, '<span class="highlight">$&</span>');
}

async function loadBanners() {
  try {
    const { data: banners, error } = await supabaseClient
      .from('Banners')
      .select('Image, Hyperlink');

    if (error) {
      console.error('Error fetching banners:', error);
      return;
    }

    const carousel = document.querySelector('.carousel');
    const navButtons = carousel.querySelectorAll('.carousel-nav');
    carousel.innerHTML = '';
    navButtons.forEach(button => carousel.appendChild(button));

    banners.forEach((banner, index) => {
      const item = document.createElement('a');
      item.href = banner.Hyperlink;
      item.className = `carousel-item ${index === 0 ? 'active' : ''}`;
      item.target = "_blank";

      const img = document.createElement('img');
      img.src = banner.Image;
      img.alt = `Banner ${index + 1}`;

      item.appendChild(img);
      carousel.appendChild(item);
    });

    slides = document.querySelectorAll('.carousel-item');
    totalSlides = slides.length;
    currentSlide = 0;

    if (totalSlides > 0) {
      showSlide(0);
      setInterval(() => showSlide(currentSlide + 1), 5000);
    }
  } catch (error) {
    console.error('Error in loadBanners:', error);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await checkAuth();
  updateHeaderAuth(session);
  await loadBanners();
  fetchJobs();
});

export async function checkAuth() {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  return session;
}

export function updateHeaderAuth(session) {
  const authButtons = document.querySelector('.auth-buttons');

  if (session) {
    const userEmail = session.user.email;
    const userInitial = userEmail.charAt(0).toUpperCase();

    authButtons.innerHTML = `
      <div class="user-profile-container">
        <div class="user-icon-wrapper">
          <div class="user-icon" data-email="${userEmail}">
            ${userInitial}
          </div>
          <div class="user-hover-card">
            <div class="user-hover-content">
              <p class="user-email">${userEmail}</p>
              <button onclick="handleLogout()" class="logout-btn">Logout</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const styleTag = document.createElement('style');
    styleTag.textContent = `
      .user-profile-container {
        position: relative;
      }

      .user-icon-wrapper {
        position: relative;
      }

      .user-icon {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background-color: #4f46e5;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .user-icon:hover {
        transform: scale(1.1);
        box-shadow: 0 4px 10px rgba(0,0,0,0.1);
      }

      .user-hover-card {
        visibility: hidden;
        opacity: 0;
        position: absolute;
        top: 100%;
        right: 0;
        background: white;
        border-radius: 10px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        padding: 1rem;
        width: 250px;
        margin-top: 10px;
        z-index: 10;
        transition: all 0.3s ease;
        transform: translateY(-10px);
      }

      .user-icon-wrapper:hover .user-hover-card {
        visibility: visible;
        opacity: 1;
        transform: translateY(0);
      }

      .user-hover-content {
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      .user-email {
        font-size: 0.9rem;
        color: #4a5568;
        margin-bottom: 0.75rem;
        text-align: center;
        word-break: break-all;
      }

      .logout-btn {
        background-color: #4f46e5;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 8px;
        font-size: 0.9rem;
        cursor: pointer;
        transition: background-color 0.2s ease;
      }

      .logout-btn:hover {
        background-color: #4338ca;
      }
    `;
    document.head.appendChild(styleTag);
  } else {
    authButtons.innerHTML = `
      <a href="/login" class="auth-icon-btn">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </a>
    `;
  }
}

window.handleLogout = async function() {
  await supabaseClient.auth.signOut();
  window.location.reload();
}

export { showModal, getApplicationLink };

searchInput.addEventListener('input', (e) => {
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    page = 0;
    jobsContainer.innerHTML = '';
    hasMoreData = true;
    loadMoreButton.style.display = 'none';
    fetchJobs(e.target.value, locationSearchInput.value, salaryFilter.value);
  }, 300);
});

locationSearchInput.addEventListener('input', (e) => {
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    page = 0;
    jobsContainer.innerHTML = '';
    hasMoreData = true;
    loadMoreButton.style.display = 'none';
    fetchJobs(searchInput.value, e.target.value, salaryFilter.value);
  }, 300);
});

salaryFilter.addEventListener('change', () => {
  page = 0;
  jobsContainer.innerHTML = '';
  hasMoreData = true;
  loadMoreButton.style.display = 'none';
  fetchJobs(searchInput.value, locationSearchInput.value, salaryFilter.value);
});

loadMoreButton.addEventListener('click', () => {
  fetchJobs(searchInput.value, locationSearchInput.value, salaryFilter.value);
});

window.addEventListener('scroll', handleScroll);