import { getDaysAgo } from './date-utils.js';

const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey, { global: { headers: { 'apikey': supabaseKey } } });
const jobsContainer = document.getElementById('jobs');
const loader = document.getElementById('loader');
const modal = document.getElementById('modal');
const modalContent = document.getElementById('modal-content');
const searchInput = document.getElementById('searchInput');
const locationSearchInput = document.getElementById('locationSearchInput');
const salaryFilter = document.getElementById('salaryFilter');
const categoryFilter = document.getElementById('categoryFilter');
const loadMoreButton = document.getElementById('loadMore');
let isFetching = false;
let page = 0;
const limit = 12;
let timeout = null;
let hasMoreData = true;
const menuButton = document.getElementById('menuButton');
const expandedMenu = document.getElementById('expandedMenu');
menuButton.addEventListener('click', () => { expandedMenu.classList.toggle('active') });
const menuCloseBtn = document.getElementById('menuCloseBtn');
menuCloseBtn.addEventListener('click', () => { expandedMenu.classList.remove('active') });
let currentSlide = 0, slides = [], totalSlides = 0;
function showSlide(i) { if (!slides || slides.length === 0) return; slides.forEach(s => s.classList.remove('active')); currentSlide = (i + totalSlides) % totalSlides; slides[currentSlide].classList.add('active') }
document.addEventListener('click', (e) => { if (!expandedMenu.contains(e.target) && !menuButton.contains(e.target) && expandedMenu.classList.contains('active')) expandedMenu.classList.remove('active') });

function renderJobCard(job, table) {
  const jobCard = document.createElement('article');
  jobCard.className = 'job-card';
  jobCard.onclick = (e) => {
    if (!e.target.closest('.admin-job-actions')) {
      showModal(job);
    }
  };

  let postedInfo = '';
  if (job.Created_At) {
    const daysAgo = getDaysAgo(job.Created_At);
    postedInfo = `<span class="job-tag time-tag">
      <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      Posted ${daysAgo}
    </span>`;
  }

  jobCard.innerHTML = `
    <div class="admin-job-actions">
      <button class="icon-btn edit-icon-btn" data-job-id="${job.id}" data-job-table="${table}" title="Edit Job">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
        </svg>
      </button>
      <button class="icon-btn delete-icon-btn" onclick="deleteJob(${job.id}, '${table}')" title="Delete Job">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
      </button>
    </div>
    <div class="job-info">
      <h2 class="job-company">${job.Company || 'Company Name N/A'}</h2>
      <div class="job-meta">
        <span class="job-tag location-tag">
          <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
          </svg>
          ${job.Location || 'Location N/A'}
        </span>
        ${job.Salary ? `
          <span class="job-tag salary-tag">
            <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            ₹${job.Salary}
          </span>
        ` : ''}
        ${postedInfo}
      </div>
    </div>
  `;

  return jobCard;
}

function showModal(job) { 
  let postedInfo = '';
  if (job.Created_At) {
    const daysAgo = getDaysAgo(job.Created_At);
    postedInfo = `<p class="job-posted"><svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>Posted ${daysAgo}</p>`;
  }

  modalContent.innerHTML = `
    <h2 class="modal-company" style="color:#003399;">${job.Company}</h2>
    <p class="job-location"><svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
    </svg>${job.Location}</p>
    ${job.Salary ? `<p class="job-salary"><svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>₹${job.Salary}</p>` : ''}
    ${postedInfo}
    <section class="modal-section">
      <h3><svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>Job Details</h3>
      <dl class="job-details-list">
        <li><dd class="modal-description-text">${job.Description || 'N/A'}</dd></li>
      </dl>
    </section>
    <section class="modal-section">
      <h3><svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/>
      </svg>Apply Now</h3>
      ${job['Application ID'] ? `<a href="${getApplicationLink(job['Application ID'])}" class="apply-btn" ${isValidUrl(job['Application ID']) ? 'target="_blank"' : ''}>
        <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/>
        </svg>Apply</a>` : 'Contact details are in description'}
    </section>
  `; modal.style.display = 'flex'; document.body.style.overflow = 'hidden' 
}

window.closeModal = function(event) {
  if (event && (event.target === modal || event.target.classList.contains('modal-close'))) {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
  }
}

function getApplicationLink(id) { 
  if (isValidUrl(id)) return id; 
  let emails = id.split(/,|\s/).filter(e => e); 
  let email = emails[0]; 
  let subject = ""; 
  if (currentTable === "Industrial Training Job Portal") subject = "Application for CA Industrial Training (Ref - My Student Club)"; 
  else if (currentTable === "Articleship Jobs") subject = "Application for Articleship (Ref - My Student Club)"; 
  else if (currentTable === "Fresher Jobs") subject = "Application for Role of CA Fresher in your Organization (Ref - My Student Club)"; 
  else if (currentTable === "Semi Qualified Jobs") subject = "Application for Semi Qualified Roles in your Organization (Ref - My Student Club)"; 
  return `mailto:${email}?subject=${encodeURIComponent(subject)}` 
}

let currentTable = 'Industrial Training Job Portal';
const footerTabs = document.querySelectorAll('.footer-tab');
const opportunitiesText = document.getElementById('opportunitiesText');
function updateOpportunitiesTextDisplay(table) { 
  if (table === "Industrial Training Job Portal" || table === "Articleship Jobs") { 
    opportunitiesText.style.display = 'block' 
  } else { 
    opportunitiesText.style.display = 'none' 
  } 
}
footerTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    footerTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentTable = tab.dataset.table;
    populateSalaryFilter(currentTable);
    page = 0;
    jobsContainer.innerHTML = '';
    hasMoreData = true;
    loadMoreButton.style.display = 'none';
    fetchJobs(); 
    updateOpportunitiesTextDisplay(currentTable);
    loadBanners(); 
    fetchCategories();
  });
});

function populateSalaryFilter(table) {
  salaryFilter.innerHTML = '';
  let options = [];
  if (table === "Articleship Jobs") {
    options = [{ value: '', text: 'Any Stipend' }, { value: '0-5000', text: 'Below ₹5,000' }, { value: '5000-10000', text: '₹5,000 - ₹10,000' }, { value: '10000-15000', text: '₹10,000 - ₹15,000' }, { value: '15000+', text: '₹15,000+' }];
  }
  else if (table === "Industrial Training Job Portal") {
    options = [{ value: '', text: 'Any Stipend' }, { value: '10000-20000', text: '₹10,000 - ₹20,000' }, { value: '20000-40000', text: '₹20,000 - ₹40,000' }, { value: '40000+', text: '₹40,000+' }];
  }
  else if (table === "Semi Qualified Jobs") {
    options = [{ value: '', text: 'Any Salary' }, { value: '0-25000', text: 'Below ₹25,000' }, { value: '25000-35000', text: '₹25,000 - ₹35,000' }, { value: '35000-50000', text: '₹35,000 - ₹50,000' }, { value: '50000+', text: 'Above ₹50,000' }];
  }
  else if (table === "Fresher Jobs") {
    options = [{ value: '', text: 'Any Salary' }, { value: '0-12', text: 'Less than 12 LPA' }, { value: '12-18', text: '12-18 LPA' }, { value: '18+', text: 'More than 18 LPA' }];
  }
  options.forEach(opt => {
    let o = document.createElement('option');
    o.value = opt.value; o.text = opt.text;
    salaryFilter.appendChild(o);
  });
}

async function fetchJobs() {
  if (isFetching) return;
  isFetching = true;
  loader.style.display = 'block';
  loadMoreButton.disabled = true;

  try {
    let query = supabaseClient.from(currentTable).select('*', { count: 'exact' });

    const searchTerm = searchInput.value.trim();
    if (searchTerm) {
      const searchPattern = `%${searchTerm}%`;
      query = query.or(`Company.ilike.${searchPattern},Location.ilike.${searchPattern},Description.ilike.${searchPattern}`);
    }

    const locationSearch = locationSearchInput.value.trim();
    if (locationSearch) {
      query = query.ilike('Location', `%${locationSearch}%`);
    }

    const salary = salaryFilter.value;
    if (salary) {
      if (salary.endsWith('+')) {
        const minValue = parseInt(salary.replace('+', ''));
        query = query.gte('Salary', minValue);
      } else if (salary.includes('-')) {
        const [min, max] = salary.split('-').map(Number);
        query = query.gte('Salary', min).lte('Salary', max);
      }
    }

    const category = categoryFilter.value;
    if (category) {
      query = query.ilike('Category', `%${category}%`);
    }

    query = query.order('Created_At', { ascending: false });

    query = query.range(page * limit, (page + 1) * limit - 1);
    const { data, error } = await query;

    if (error) { 
      jobsContainer.textContent = 'Failed to load jobs. Please try again.'; 
      return 
    }

    if (data && data.length > 0) {
      data.forEach(job => {
        let card = renderJobCard(job, currentTable);
        jobsContainer.appendChild(card);
      });
      page++; 
      hasMoreData = data.length === limit; 
      loadMoreButton.style.display = hasMoreData ? 'block' : 'none';
    } else { 
      hasMoreData = false; 
      loadMoreButton.style.display = 'none'; 
      if (page === 0) jobsContainer.textContent = 'No jobs found.' 
    }
  } catch (e) { 
    jobsContainer.textContent = 'Failed to load jobs. Please check your connection.' 
  } finally { 
    isFetching = false; 
    loader.style.display = 'none'; 
    loadMoreButton.disabled = false 
  }
}

function isValidUrl(s) { 
  try { 
    new URL(s); 
    return true 
  } catch (_) { 
    return false 
  } 
}

async function fetchCategories() {
  try {
    categoryFilter.innerHTML = `<option value="">All Categories</option>`;

    if (currentTable === "Industrial Training Job Portal") {
      categoryFilter.innerHTML += `
        <option value="Accounting">Accounting</option>
        <option value="Auditing">Auditing</option>
        <option value="Costing">Costing</option>
        <option value="Finance">Finance</option>
        <option value="Taxation">Taxation</option>
      `;
    } else if (currentTable === "Fresher Jobs") {
      categoryFilter.innerHTML += `
        <option value="Accounting">Accounting</option>
        <option value="Audit">Audit</option>
        <option value="Consultancy">Consultancy</option>
        <option value="Controllership">Controllership</option>
        <option value="Direct Taxation">Direct Taxation</option>
        <option value="Equity Research">Equity Research</option>
        <option value="Finance">Finance</option>
        <option value="Investment Banking">Investment Banking</option>
        <option value="Private Equity">Private Equity</option>
      `;
    } else if (currentTable === "Semi Qualified Jobs") {
      categoryFilter.innerHTML += `
        <option value="Consultancy">Consultancy</option>
        <option value="Controllership">Controllership</option>
        <option value="Direct Taxation">Direct Taxation</option>
        <option value="Finance">Finance</option>
        <option value="Indirect Taxation">Indirect Taxation</option>
        <option value="Internal Audit">Internal Audit</option>
        <option value="Investment Banking">Investment Banking</option>
        <option value="Private Equity">Private Equity</option>
        <option value="Statutory Audit">Statutory Audit</option>
      `;
    } else if (currentTable === "Articleship Jobs") {
      categoryFilter.innerHTML += `
        <option value="Accounting">Accounting</option>
        <option value="Auditing">Auditing</option>
        <option value="Costing">Costing</option>
        <option value="Finance">Finance</option>
        <option value="Taxation">Taxation</option>
      `;
    }
  } catch (e) { }
}

let lastScrollY = 0;
const header = document.querySelector('.floating-header');
function handleScroll() { 
  let cur = window.scrollY; 
  if (cur > lastScrollY && cur > 100) header.classList.add('header-hidden'); 
  else header.classList.remove('header-hidden'); 
  lastScrollY = cur 
}

async function loadBanners() {
  try {
    const { data: banners, error } = await supabaseClient.from('Banners').select('Image, Hyperlink, Type');
    if (error) return;

    const carousel = document.querySelector('.carousel');
    carousel.innerHTML = '';

    const relevantBanners = banners.filter(banner => {
      let currentType = currentTable === "Semi Qualified Jobs" ? "Semi-Qualified" :
                       currentTable === "Fresher Jobs" ? "Freshers" :
                       currentTable.split(' ')[0]; 

      return banner.Type === 'All' || banner.Type === currentType;
    });

    const bannerSection = document.querySelector('.banner-section');
    if (relevantBanners.length === 0) {
      bannerSection.style.display = 'none';
      document.querySelector('main.container').classList.add('no-banner');
      return;
    } else {
      bannerSection.style.display = 'block';
      document.querySelector('main.container').classList.remove('no-banner');
    }

    relevantBanners.forEach((banner, i) => {
      const a = document.createElement('a');
      a.href = banner.Hyperlink;
      a.className = `carousel-item ${i === 0 ? 'active' : ''}`;
      a.target = "_blank";
      const img = document.createElement('img');
      img.src = banner.Image;
      img.alt = `Banner ${i + 1}`;
      a.appendChild(img); 
      carousel.appendChild(a);
    });

    slides = document.querySelectorAll('.carousel-item');
    totalSlides = slides.length;
    currentSlide = 0;
    if (totalSlides > 0) { 
      showSlide(0); 
      setInterval(() => showSlide(currentSlide + 1), 5000);
    }
  } catch (e) { }
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await checkAuth(); 
  updateHeaderAuth(session); 
  await loadBanners(); 
  populateSalaryFilter(currentTable); 
  fetchJobs(); 
  fetchCategories(); 
  updateOpportunitiesTextDisplay(currentTable);

  const resourcesBtn = document.getElementById('resourcesDropdownBtn');
  const resourcesDropdown = document.getElementById('resourcesDropdown');
  const dropdownIcon = resourcesBtn.querySelector('.dropdown-icon');

  resourcesBtn.addEventListener('click', (e) => {
    e.preventDefault();
    resourcesDropdown.classList.toggle('active');
    dropdownIcon.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!resourcesBtn.contains(e.target) && !resourcesDropdown.contains(e.target)) {
      resourcesDropdown.classList.remove('active');
      dropdownIcon.classList.remove('open');
    }
  });
});

async function checkAuth() { 
  const { data: { session } } = await supabaseClient.auth.getSession(); 
  return session 
}

export function updateHeaderAuth(session) {
  const authButtons = document.querySelector('.auth-buttons');
  if (session) {
    let email = session.user.email, initial = email.charAt(0).toUpperCase();
    authButtons.innerHTML = `<div class="user-profile-container">
      <div class="user-icon-wrapper">
        <div class="user-icon" data-email="${email}">${initial}</div>
        <div class="user-hover-card">
          <div class="user-hover-content">
            <p class="user-email">${email}</p>
            <button onclick="handleLogout()" class="logout-btn">Logout</button>
          </div>
        </div>
      </div>
    </div>`;
  } else {
    authButtons.innerHTML = `<a href="/login" class="auth-icon-btn">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a9 9 0 00-7 7h14a9 9 0 00-7-7z"/>
      </svg>
    </a>`;
  }
}

window.handleLogout = async () => { 
  await supabaseClient.auth.signOut(); 
  window.location.reload() 
}

export { showModal, getApplicationLink };

window.showAddJobModal = function() {
  const modal = document.getElementById('job-edit-modal');
  document.getElementById('job-edit-title').textContent = 'Add New Job';
  document.getElementById('job-form').reset();

  const now = new Date();
  const localDatetime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000))
    .toISOString()
    .slice(0, 16);
  document.querySelector('input[name="Created_At"]').value = localDatetime;

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

searchInput.addEventListener('input', (e) => { 
  clearTimeout(timeout); 
  timeout = setTimeout(() => { 
    page = 0; 
    jobsContainer.innerHTML = ''; 
    hasMoreData = true; 
    loadMoreButton.style.display = 'none'; 
    fetchJobs() 
  }, 300) 
});

locationSearchInput.addEventListener('input', (e) => { 
  clearTimeout(timeout); 
  timeout = setTimeout(() => { 
    page = 0; 
    jobsContainer.innerHTML = ''; 
    hasMoreData = true; 
    loadMoreButton.style.display = 'none'; 
    fetchJobs() 
  }, 300) 
});

salaryFilter.addEventListener('change', () => { 
  page = 0; 
  jobsContainer.innerHTML = ''; 
  hasMoreData = true; 
  loadMoreButton.style.display = 'none'; 
  fetchJobs() 
});

categoryFilter.addEventListener('change', () => { 
  page = 0; 
  jobsContainer.innerHTML = ''; 
  hasMoreData = true; 
  loadMoreButton.style.display = 'none'; 
  fetchJobs() 
});

loadMoreButton.addEventListener('click', () => { 
  fetchJobs() 
});

window.addEventListener('scroll', handleScroll);