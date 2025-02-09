const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;
let isFetching = false;
let page = 0;
const limit = 12;
let hasMoreData = true;
let currentTable = 'Industrial Training Job Portal';

async function checkAdmin() {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session) {
    showAccessDenied();
    return false;
  }

  currentUser = session.user;
  document.getElementById('admin-content').style.display = 'block';
  return true;
}

function showAccessDenied() {
  document.getElementById('access-denied').style.display = 'flex';
  document.getElementById('admin-content').style.display = 'none';
}

async function loadBanners() {
  try {
    const { data: banners, error } = await supabaseClient.from('Banners').select('*');
    if (error) throw error;

    const bannerEditor = document.getElementById('banner-editor');
    bannerEditor.innerHTML = '';

    banners.forEach(banner => {
      const bannerItem = document.createElement('div');
      bannerItem.className = 'banner-item';
      bannerItem.innerHTML = `
        <input type="text" class="admin-input" value="${banner.Image}" placeholder="Image URL" 
          onchange="updateBanner(${banner.id}, 'Image', this.value)">
        <input type="text" class="admin-input" value="${banner.Hyperlink}" placeholder="Hyperlink" 
          onchange="updateBanner(${banner.id}, 'Hyperlink', this.value)">
        <button class="admin-btn delete-btn" onclick="deleteBanner(${banner.id})">Delete</button>
      `;
      bannerEditor.appendChild(bannerItem);
    });
  } catch (error) {
    console.error('Error loading banners:', error);
    alert('Failed to load banners');
  }
}

window.updateBanner = async function(id, field, value) {
  try {
    const { error } = await supabaseClient
      .from('Banners')
      .update({ [field]: value })
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Failed to update banner:', error);
    alert('Failed to update banner: ' + error.message);
  }
}

window.deleteBanner = async function(id) {
  if (!confirm('Are you sure you want to delete this banner?')) return;

  try {
    const { error } = await supabaseClient
      .from('Banners')
      .delete()
      .eq('id', id);

    if (error) throw error;
    await loadBanners();
  } catch (error) {
    console.error('Failed to delete banner:', error);
    alert('Failed to delete banner: ' + error.message);
  }
}

window.addNewBanner = async function() {
  try {
    const { error } = await supabaseClient
      .from('Banners')
      .insert([{ 
        Image: 'https://example.com/placeholder.jpg',
        Hyperlink: 'https://example.com'
      }]);

    if (error) throw error;
    await loadBanners();
  } catch (error) {
    console.error('Failed to add banner:', error);
    alert('Failed to add banner: ' + error.message);
  }
}

window.showAddJobModal = function() {
  const modal = document.getElementById('job-edit-modal');
  document.getElementById('job-edit-title').textContent = 'Add New Job';
  document.getElementById('job-form').reset();
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

window.closeJobEditModal = function() {
  document.getElementById('job-edit-modal').style.display = 'none';
  document.body.style.overflow = 'auto';
}

async function showEditJobModal(job) {
  const modal = document.getElementById('job-edit-modal');
  const form = document.getElementById('job-form');
  
  form.reset();
  document.getElementById('job-edit-title').textContent = 'Edit Job';
  
  Object.keys(job).forEach(field => {
    const input = form.elements[field];
    if (input) input.value = job[field];
  });
  
  const tableSelect = form.elements['table'];
  if (tableSelect) {
    tableSelect.value = currentTable;
  }
  
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

async function getJobById(id, table) {
  try {
    const { data, error } = await supabaseClient
      .from(table)
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching job:', error);
    alert('Failed to retrieve job details');
    return null;
  }
}

function renderJobCard(job, table) {
  const jobCard = document.createElement('article');
  jobCard.className = 'job-card';
  jobCard.onclick = (e) => {
    if (!e.target.closest('.admin-job-actions')) {
      showModal(job);
    }
  };

  jobCard.innerHTML = `
    <div class="admin-job-actions">
      <button class="admin-btn edit-job-btn" data-job-id="${job.id}" data-job-table="${table}">
        Edit
      </button>
      <button class="admin-btn delete-btn" onclick="deleteJob(${job.id}, '${table}')">
        Delete
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
      </div>
    </div>
  `;

  return jobCard;
}

window.deleteJob = async function(id, table) {
  if (!confirm('Are you sure you want to delete this job?')) return;

  try {
    const { error } = await supabaseClient
      .from(table)
      .delete()
      .eq('id', id);

    if (error) throw error;
    location.reload();
  } catch (error) {
    console.error('Failed to delete job:', error);
    alert('Failed to delete job: ' + error.message);
  }
}

document.getElementById('job-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const jobData = Object.fromEntries(formData.entries());
  const table = jobData.table;
  delete jobData.table;

  if (!jobData.id) {
    delete jobData.id;
  }

  try {
    const isEdit = jobData.id;
    if (isEdit) {
      const id = jobData.id;
      delete jobData.id;
      const { error } = await supabaseClient
        .from(table)
        .update(jobData)
        .eq('id', id);

      if (error) throw error;
    } else {
      const { error } = await supabaseClient
        .from(table)
        .insert([jobData]);

      if (error) throw error;
    }

    closeJobEditModal();
    location.reload();
  } catch (error) {
    console.error('Error saving job:', error);
    alert('Failed to save job: ' + error.message);
  }
});

async function fetchJobs(searchTerm = '', locationSearch = '', salary = '') {
  if (isFetching) return;
  isFetching = true;
  document.getElementById('loader').style.display = 'block';
  document.getElementById('loadMore').disabled = true;
  
  try {
    let query = supabaseClient
      .from(currentTable)
      .select('*', { count: 'exact' });

    if (searchTerm) {
      const searchPattern = `%${searchTerm}%`;
      query = query.or(`Company.ilike.${searchPattern},Location.ilike.${searchPattern},Description.ilike.${searchPattern}`);
    }
    if (locationSearch) {
      query = query.ilike('Location', `%${locationSearch}%`);
    }
    if (salary) {
      if (salary === '40000+') {
        query = query.gte('Salary', 40000);
      } else {
        const [min, max] = salary.split('-').map(Number);
        query = query.gte('Salary', min).lte('Salary', max);
      }
    }

    query = query.range(page * limit, (page + 1) * limit - 1);
    const { data, error, count } = await query;

    if (error) throw error;

    if (data && data.length > 0) {
      data.forEach(job => {
        const jobCard = renderJobCard(job, currentTable);
        document.getElementById('jobs').appendChild(jobCard);
      });

      page++;
      hasMoreData = data.length === limit;
      document.getElementById('loadMore').style.display = hasMoreData ? 'block' : 'none';
    } else {
      hasMoreData = false;
      document.getElementById('loadMore').style.display = 'none';
      if (page === 0) {
        document.getElementById('jobs').textContent = 'No jobs found.';
      }
    }
  } catch (error) {
    console.error('Error fetching jobs:', error);
    document.getElementById('jobs').textContent = 'Failed to load jobs. Please try again later.';
  } finally {
    isFetching = false;
    document.getElementById('loader').style.display = 'none';
    document.getElementById('loadMore').disabled = false;
  }

  document.querySelectorAll('.edit-job-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const jobId = btn.getAttribute('data-job-id');
      const jobTable = btn.getAttribute('data-job-table');
      const job = await getJobById(jobId, jobTable);
      if (job) {
        showEditJobModal(job);
      }
    });
  });
}

const searchInput = document.getElementById('searchInput');
const locationSearchInput = document.getElementById('locationSearchInput');
const salaryFilter = document.getElementById('salaryFilter');
const loadMoreButton = document.getElementById('loadMore');
let timeout = null;

function debounceSearch(fn, delay) {
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  }
}

const handleSearch = debounceSearch(() => {
  page = 0;
  document.getElementById('jobs').innerHTML = '';
  hasMoreData = true;
  loadMoreButton.style.display = 'none';
  fetchJobs(searchInput.value, locationSearchInput.value, salaryFilter.value);
}, 300);

searchInput.addEventListener('input', handleSearch);
locationSearchInput.addEventListener('input', handleSearch);
salaryFilter.addEventListener('change', handleSearch);
loadMoreButton.addEventListener('click', () => {
  fetchJobs(searchInput.value, locationSearchInput.value, salaryFilter.value);
});

document.querySelectorAll('.footer-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.footer-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentTable = tab.dataset.table;
    page = 0;
    document.getElementById('jobs').innerHTML = '';
    hasMoreData = true;
    loadMoreButton.style.display = 'none';
    fetchJobs(searchInput.value, locationSearchInput.value, salaryFilter.value);
  });
});

document.addEventListener('DOMContentLoaded', async () => {
  const isAdmin = await checkAdmin();
  if (isAdmin) {
    await loadBanners();
    await fetchJobs();
  }
});