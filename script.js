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
const locationFilter = document.getElementById('locationFilter');
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

let currentSlide = 0;
const slides = document.querySelectorAll('.carousel-item');
const totalSlides = slides.length;

function showSlide(index) {
  slides.forEach(slide => slide.classList.remove('active'));
  currentSlide = (index + totalSlides) % totalSlides;
  slides[currentSlide].classList.add('active');
}

prevSlide.addEventListener('click', () => {
  showSlide(currentSlide - 1);
});

nextSlide.addEventListener('click', () => {
  showSlide(currentSlide + 1);
});

showSlide(0);

setInterval(() => showSlide(currentSlide + 1), 5000);

document.addEventListener('click', (event) => {
  if (!expandedMenu.contains(event.target) && !menuButton.contains(event.target)) {
    expandedMenu.classList.remove('active');
  }
});

function showModal(job) {
  modalContent.innerHTML = `
    <h2 class="modal-company job-box">${job.Company}</h2>
    <p class="job-location job-box">${job.Location}</p>
    ${job.Salary ? `<p class="job-salary job-box">Stipend: ₹${job.Salary}</p>` : ''}
    <section class="modal-section job-box">
      <h3>Job Details</h3>
      <dl class="job-details-list">
        <li>
          <dt>Description</dt>
          <dd class="modal-description-text">${job.Description || 'N/A'}</dd>
        </li>
      </dl>
    </section>
    <div class="modal-section">
      <h3>Apply Now</h3>
      ${job['Application ID'] ? `<a href="${getApplicationLink(job['Application ID'])}" class="apply-btn" ${isValidUrl(job['Application ID']) ? 'target="_blank"' : ''}>Apply</a>` : 'Contact details are in description'}
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

function getApplicationLink(applicationId) {
  if (isValidUrl(applicationId)) {
    return applicationId;
  } else {

    const subject = encodeURIComponent("Application for CA Training (Reference- My Student Club)");
    return `mailto:${applicationId}?subject=${subject}`;
  }
}

async function fetchJobs(searchTerm = '', location = '', salary = '') {
  if (isFetching) return;
  isFetching = true;
  loader.style.display = 'block';
  loadMoreButton.disabled = true;
  try {
    let query = supabaseClient
      .from('Industrial Training Job Portal')
      .select('*', { count: 'exact' });

    if (searchTerm) {
      const searchPattern = `%${searchTerm}%`;
      query = query.or(`Company.ilike.${searchPattern},Location.ilike.${searchPattern},Description.ilike.${searchPattern}`);
    }
    if (location) {
      query = query.eq('Location', location);
    }
    if (salary) {
      if (salary === '20000+') {
        query = query.gte('Salary', 20000);
      } else {
        const [min, max] = salary.split('-').map(Number);
        query = query.gte('Salary', min).lte('Salary', max);
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
        jobCard.onclick = () => showModal(job);
        let jobCardContent = `
          <div class="job-info">
            <h2 class="job-company">${highlightSearchTerm(job.Company, searchTerm) || 'Company Name N/A'}</h2>
            <div class="job-meta">
              <span class="job-tag location-tag">
                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                </svg>
                ${highlightSearchTerm(job.Location, searchTerm) || 'Location N/A'}
              </span>
              ${job.Salary ? `
                <span class="job-tag salary-tag">
                  <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  ₹${job.Salary}
                </span>` : ''
              }
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

async function populateLocationFilter() {
  const { data, error } = await supabaseClient
    .from('Industrial Training Job Portal')
    .select('Location')
    .neq('Location', null);
  if (error) {
    console.error('Error fetching locations:', error);
    return;
  }
  const uniqueLocations = new Set();
  data.forEach(job => {
    if (job.Location) {
      uniqueLocations.add(job.Location);
    }
  });
  uniqueLocations.forEach(location => {
    const option = document.createElement('option');
    option.value = location;
    option.textContent = location;
    locationFilter.appendChild(option);
  });
}

searchInput.addEventListener('input', (e) => {
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    page = 0;
    jobsContainer.innerHTML = '';
    hasMoreData = true;
    loadMoreButton.style.display = 'none';
    fetchJobs(e.target.value, locationFilter.value, salaryFilter.value);
  }, 300);
});

locationFilter.addEventListener('change', () => {
  page = 0;
  jobsContainer.innerHTML = '';
  hasMoreData = true;
  loadMoreButton.style.display = 'none';
  fetchJobs(searchInput.value, locationFilter.value, salaryFilter.value);
});

salaryFilter.addEventListener('change', () => {
  page = 0;
  jobsContainer.innerHTML = '';
  hasMoreData = true;
  loadMoreButton.style.display = 'none';
  fetchJobs(searchInput.value, locationFilter.value, salaryFilter.value);
});

loadMoreButton.addEventListener('click', () => {
  fetchJobs(searchInput.value, locationFilter.value, salaryFilter.value);
});

window.addEventListener('scroll', handleScroll);
populateLocationFilter();
fetchJobs();

export { showModal, getApplicationLink };