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

const resourcesMenuItem = document.querySelector('.menu-item.has-submenu');
const resourcesSubmenu = resourcesMenuItem.querySelector('.submenu');

resourcesMenuItem.addEventListener('click', (e) => {
  e.preventDefault(); // Prevent default link behavior if it's an <a> tag
  resourcesSubmenu.classList.toggle('submenu-active');
});

function showModal(job) { 
  modalContent.innerHTML = `
    <h2 class="modal-company" style="color:#003399;">${job.Company}</h2>
    <p class="job-location"><svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
    </svg>${job.Location}</p>
    ${job.Salary ? `<p class="job-salary"><svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>₹${job.Salary}</p>` : ''}
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
  `; modal.style.display = 'flex'; document.body.style.overflow = 'hidden' }
window.closeModal = function (e) { if (e.target === modal || e.target.classList.contains('modal-close')) { modal.style.display = 'none'; document.body.style.overflow = 'auto' } }
function getApplicationLink(id) { if (isValidUrl(id)) return id; let emails = id.split(/,|\s/).filter(e => e); let email = emails[0]; let subject = ""; if (currentTable === "Industrial Training Job Portal") subject = "Application for CA Industrial Training (Ref - My Student Club)"; else if (currentTable === "Articleship Jobs") subject = "Application for Articleship (Ref - My Student Club)"; else if (currentTable === "Fresher Jobs") subject = "Application for Role of CA Fresher in your Organization (Ref - My Student Club)"; else if (currentTable === "Semi Qualified Jobs") subject = "Application for Semi Qualified Roles in your Organization (Ref - My Student Club)"; return `mailto:${email}?subject=${encodeURIComponent(subject)}` }
let currentTable = 'Industrial Training Job Portal';
const footerTabs = document.querySelectorAll('.footer-tab');
const opportunitiesText = document.getElementById('opportunitiesText');
function updateOpportunitiesTextDisplay(table) { if (table === "Industrial Training Job Portal" || table === "Articleship Jobs") { opportunitiesText.style.display = 'block' } else { opportunitiesText.style.display = 'none' } }
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
    fetchJobs(searchInput.value, locationSearchInput.value, salaryFilter.value, categoryFilter.value);
    updateOpportunitiesTextDisplay(currentTable);
    loadBanners(); 
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
async function fetchJobs(search = '', loc = '', salary = '', category = '') {
  if (isFetching) return; isFetching = true; loader.style.display = 'block'; loadMoreButton.disabled = true;
  try {
    let query = supabaseClient.from(currentTable).select('*', { count: 'exact' });
    if (search) { let pattern = `%${search}%`; query = query.or(`Company.ilike.${pattern},Location.ilike.${pattern},Description.ilike.${pattern}`) }
    if (loc) { let pattern = `%${loc}%`; query = query.ilike('Location', pattern) }
    if (salary) {
      if (salary.includes('+')) {
        let min = Number(salary.replace('+', '')); query = query.gte('Salary', min);
      } else if (salary.includes('-')) {
        let [min, max] = salary.split('-').map(Number); query = query.gte('Salary', min).lte('Salary', max);
      }
    }
    if (category) query = query.eq('Category', category);
    query = query.range(page * limit, (page + 1) * limit - 1);
    const { data, error } = await query;
    if (error) { jobsContainer.textContent = 'Failed to load jobs. Please try again.'; return }
    if (data && data.length > 0) {
      data.forEach(job => {
        let card = document.createElement('article');
        card.className = 'job-card';
        card.onclick = () => showModal(job);
        card.innerHTML = `
          <div class="job-info">
            <h2 class="job-company">${highlightSearchTerm(job.Company, search) || 'Company Name N/A'}</h2>
            <div class="job-meta">
              <span class="job-tag location-tag">
                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                ${highlightSearchTerm(job.Location, search) || 'Location N/A'}
              </span>
              ${job.Salary ? `<span class="job-tag salary-tag">
                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>₹${job.Salary}
              </span>` : ''}
            </div>
          </div>
          <div class="job-actions">
            <button class="view-details-btn">View Details</button>
          </div>
        `;
        jobsContainer.appendChild(card);
      });
      page++; hasMoreData = data.length === limit; loadMoreButton.style.display = hasMoreData ? 'block' : 'none';
    } else { hasMoreData = false; loadMoreButton.style.display = 'none'; if (page === 0) jobsContainer.textContent = 'No jobs found.' }
  } catch (e) { jobsContainer.textContent = 'Failed to load jobs. Please check your connection.' }
  finally { isFetching = false; loader.style.display = 'none'; loadMoreButton.disabled = false }
}
function isValidUrl(s) { try { new URL(s); return true } catch (_) { return false } }
let lastScrollY = 0;
const header = document.querySelector('.floating-header');
function handleScroll() { let cur = window.scrollY; if (cur > lastScrollY && cur > 100) header.classList.add('header-hidden'); else header.classList.remove('header-hidden'); lastScrollY = cur }
function highlightSearchTerm(txt, term) { if (!term || !txt) return txt; let regex = new RegExp(`(${term.split(/\s+/).join('|')})`, 'gi'); return txt.replace(regex, '<span class="highlight">$&</span>') }
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
  const session = await checkAuth(); updateHeaderAuth(session); await loadBanners(); populateSalaryFilter(currentTable); fetchJobs(); fetchCategories(); updateOpportunitiesTextDisplay(currentTable)
});
export async function checkAuth() { const { data: { session } } = await supabaseClient.auth.getSession(); return session }
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
window.handleLogout = async () => { await supabaseClient.auth.signOut(); window.location.reload() }
export { showModal, getApplicationLink };
searchInput.addEventListener('input', (e) => { clearTimeout(timeout); timeout = setTimeout(() => { page = 0; jobsContainer.innerHTML = ''; hasMoreData = true; loadMoreButton.style.display = 'none'; fetchJobs(e.target.value, locationSearchInput.value, salaryFilter.value, categoryFilter.value) }, 300) });
locationSearchInput.addEventListener('input', (e) => { clearTimeout(timeout); timeout = setTimeout(() => { page = 0; jobsContainer.innerHTML = ''; hasMoreData = true; loadMoreButton.style.display = 'none'; fetchJobs(searchInput.value, e.target.value, salaryFilter.value, categoryFilter.value) }, 300) });
      <option value="Auditing">Auditing</option>
      <option value="Costing">Costing</option>
      <option value="Finance">Finance</option>
      <option value="Taxation">Taxation</option>
    `;
  } catch (e) { }
}