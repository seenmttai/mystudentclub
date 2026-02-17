const supabaseUrl = 'https://api.mystudentclub.com';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

const CLOUDFLARE_WORKER_URL = 'https://auth-check.bhansalimanan55.workers.dev';

const PREDEFINED_LOCATIONS = ["mumbai", "bangalore", "bengaluru", "gurgaon", "gurugram", "pune", "kolkata", "delhi", "new delhi", "noida", "hyderabad", "ahmedabad", "chennai", "jaipur"];
const JOB_TYPE_MAP = { "Industrial Training Job Portal": "industrial", "Fresher Jobs": "fresher", "Semi Qualified Jobs": "semi", "Articleship Jobs": "articleship" };
const PORTAL_NAME_MAP = { "Industrial Training Job Portal": "Industrial Training", "Fresher Jobs": "Fresher", "Semi Qualified Jobs": "Semi Qualified", "Articleship Jobs": "Articleship" };
const PORTAL_LINK_MAP = { "Industrial Training Job Portal": "https://www.mystudentclub.com/", "Fresher Jobs": "https://www.mystudentclub.com/fresher.html", "Semi Qualified Jobs": "https://www.mystudentclub.com/semi-qualified.html", "Articleship Jobs": "https://www.mystudentclub.com/articleship.html" };

let currentSession = null;
let isFetching = false;
let page = 0;
const limit = 12;
let hasMoreData = true;
let currentTable = 'Industrial Training Job Portal';
let categoryData = {};

function normalizeLocation(location) {
    if (!location) return '';
    const lowerLoc = location.toLowerCase().trim();
    if (lowerLoc === 'gurugram') return 'gurgaon';
    if (lowerLoc === 'bengaluru') return 'bangalore';
    if (lowerLoc === 'new delhi') return 'delhi';
    return lowerLoc;
}

function findMatchingLocationKeyword(jobLocation) {
    const normalizedJobLoc = normalizeLocation(jobLocation);
    if (!normalizedJobLoc) return null;
    for (const keyword of PREDEFINED_LOCATIONS) {
        if (normalizedJobLoc.includes(normalizeLocation(keyword))) {
            return normalizeLocation(keyword);
        }
    }
    return null;
}

function generateTopicName(locationKeyword, jobType) {
    if (!locationKeyword || !jobType) return null;
    return `${locationKeyword.toLowerCase().replace(/\s+/g, '-')}-${jobType}`;
}

function truncateDescription(description, wordLimit = 20) {
    if (!description) return '';
    const words = description.split(/\s+/);
    return words.length <= wordLimit ? description : words.slice(0, wordLimit).join(' ') + '...';
}

async function sendNotification(topic, title, description, link, accessToken) {
    if (!topic || !title || !description || !link || !accessToken) return;
    try {
        const response = await fetch(CLOUDFLARE_WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
            body: JSON.stringify({ title, description, link, topic })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            console.error(`Failed to send notification to topic ${topic}:`, result.error || response.statusText);
        } else {
            console.log(`Successfully sent notification request for topic: ${topic}`);
        }
    } catch (error) {
        console.error(`Error sending notification fetch request for topic ${topic}:`, error);
    }
}

async function triggerNotifications(jobData, accessToken) {
    if (!jobData || !accessToken) return;
    const { Company = 'A Company', Location = 'Various Locations', Description = '', table = currentTable } = jobData;
    const portalName = PORTAL_NAME_MAP[table] || 'Job';
    const jobType = JOB_TYPE_MAP[table];
    const link = PORTAL_LINK_MAP[table] || 'https://www.mystudentclub.com/';
    const notificationTitle = `New ${portalName} job in ${Location}: ${Company}`;
    const notificationBody = truncateDescription(Description);
    const matchedLocationKeyword = findMatchingLocationKeyword(Location);
    const specificTopic = generateTopicName(matchedLocationKeyword, jobType);
    if (specificTopic) {
        await sendNotification(specificTopic, notificationTitle, notificationBody, link, accessToken);
    }
    await sendNotification('all', notificationTitle, notificationBody, link, accessToken);
}

function showAccessDenied() {
    document.getElementById('access-denied').style.display = 'flex';
    document.getElementById('admin-content').style.display = 'none';
}

async function checkAdmin() {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error || !session) {
        showAccessDenied();
        throw new Error("User not authenticated.");
    }
    currentSession = session;
    document.getElementById('admin-content').style.display = 'block';
}

async function loadBanners() {
    const { data: banners, error } = await supabaseClient.from('Banners').select('*');
    if (error) throw error;
    const bannerEditor = document.getElementById('banner-editor');
    bannerEditor.innerHTML = '';
    banners.forEach(banner => {
        const bannerItem = document.createElement('div');
        bannerItem.className = 'banner-item';
        bannerItem.innerHTML = `
            <input type="text" class="admin-input" value="${banner.Image || ''}" placeholder="Image URL">
            <input type="text" class="admin-input" value="${banner.Hyperlink || ''}" placeholder="Hyperlink">
            <select class="admin-input type-select">
                <option value="Industrial" ${banner.Type === 'Industrial' ? 'selected' : ''}>Industrial</option>
                <option value="Freshers" ${banner.Type === 'Freshers' ? 'selected' : ''}>Freshers</option>
                <option value="Articleship" ${banner.Type === 'Articleship' ? 'selected' : ''}>Articleship</option>
                <option value="Semi-Qualified" ${banner.Type === 'Semi-Qualified' ? 'selected' : ''}>Semi-Qualified</option>
                <option value="All" ${banner.Type === 'All' ? 'selected' : ''}>All</option>
            </select>
            <div class="banner-actions">
                <button class="icon-btn edit-icon-btn" title="Save Banner"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
                <button class="icon-btn delete-icon-btn" title="Delete Banner"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
            </div>`;
        const [editBtn, deleteBtn] = bannerItem.querySelectorAll('button');
        editBtn.addEventListener('click', () => updateBanner(banner.id, bannerItem));
        deleteBtn.addEventListener('click', () => deleteBanner(banner.id));
        bannerEditor.appendChild(bannerItem);
    });
}

async function updateBanner(id, itemElement) {
    const [imageInput, hyperlinkInput, typeSelect] = itemElement.querySelectorAll('.admin-input, .type-select');
    try {
        const { error } = await supabaseClient.from('Banners').update({ Image: imageInput.value, Hyperlink: hyperlinkInput.value, Type: typeSelect.value }).eq('id', id);
        if (error) throw error;
        alert('Banner updated successfully');
    } catch (error) {
        alert('Failed to update banner: ' + error.message);
    }
}

async function deleteBanner(id) {
    if (!confirm('Are you sure you want to delete this banner?')) return;
    try {
        const { error } = await supabaseClient.from('Banners').delete().eq('id', id);
        if (error) throw error;
        await loadBanners();
    } catch (error) {
        alert('Failed to delete banner: ' + error.message);
    }
}

function addNewBanner() {
    (async () => {
        try {
            const { error } = await supabaseClient.from('Banners').insert([{ Image: 'https://example.com/placeholder.jpg', Hyperlink: 'https://example.com', Type: 'All' }]);
            if (error) throw error;
            await loadBanners();
        } catch (error) {
            alert('Failed to add banner: ' + error.message);
        }
    })();
}

async function fetchCategories() {
    try {
        const response = await fetch('/categories.json');
        if (!response.ok) throw new Error('Network response was not ok');
        categoryData = await response.json();
        updateCategoryOptions(currentTable);
    } catch (error) {
        console.error('Failed to fetch categories:', error);
    }
}

function updateCategoryOptions(table) {
    const categorySelect = document.getElementById('categorySelect');
    categorySelect.innerHTML = '';
    const categories = categoryData[table] || [];
    categories.forEach(category => {
        const option = new Option(category, category);
        categorySelect.add(option);
    });
}

function showModal(job) {
    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = `
        <h2 class="text-2xl font-bold mb-2">${job.Company}</h2>
        <p class="text-gray-600 mb-4">${job.Location}</p>
        ${job.Salary ? `<p class="text-lg font-semibold text-green-600 mb-4">₹${job.Salary}</p>` : ''}
        <div class="mb-4">
            <h3 class="font-bold text-gray-800 mb-2">Description:</h3>
            <div class="text-gray-700 whitespace-pre-line">${job.Description}</div>
        </div>
        <div>
            <h3 class="font-bold text-gray-800 mb-2">Application Details:</h3>
            <p class="text-gray-700">${job['Application ID']}</p>
        </div>
        ${job.connect_link ? `
        <div class="mt-4">
            <h3 class="font-bold text-gray-800 mb-2">Peer Connection:</h3>
            <a href="${job.connect_link}" target="_blank" class="text-blue-600 hover:underline">${job.connect_link}</a>
        </div>` : ''}
    `;
    document.getElementById('modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeModal(event) {
    const modal = document.getElementById('modal');
    if (event.target === modal || event.target.closest('.modal-close')) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

function showAddJobModal() {
    const modal = document.getElementById('job-edit-modal');
    document.getElementById('job-edit-title').textContent = 'Add New Job';
    const form = document.getElementById('job-form');
    form.reset();
    form.elements['id'].value = '';
    const now = new Date();
    form.elements['Created_At'].value = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    form.elements['table'].value = currentTable;
    updateCategoryOptions(currentTable);
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeJobEditModal() {
    document.getElementById('job-edit-modal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

async function showEditJobModal(job) {
    const modal = document.getElementById('job-edit-modal');
    const form = document.getElementById('job-form');
    form.reset();
    document.getElementById('job-edit-title').textContent = 'Edit Job';
    form.elements['table'].value = currentTable;
    updateCategoryOptions(currentTable);
    Object.keys(job).forEach(field => {
        const input = form.elements[field];
        if (input) {
            if (field === 'Created_At' && job[field]) {
                const date = new Date(job[field]);
                input.value = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            } else {
                input.value = job[field];
            }
        }
    });
    form.elements['id'].value = job.id;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

async function getJobById(id, table) {
    try {
        const { data, error } = await supabaseClient.from(table).select('*').eq('id', id).single();
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching job:', error);
        return null;
    }
}

async function deleteJob(id, table) {
    if (!confirm('Are you sure you want to delete this job?')) return;
    try {
        const { error } = await supabaseClient.from(table).delete().eq('id', id);
        if (error) throw error;
        const cardToRemove = document.querySelector(`.job-card[data-job-id='${id}']`);
        if (cardToRemove) {
            cardToRemove.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            cardToRemove.style.opacity = '0';
            cardToRemove.style.transform = 'scale(0.95)';
            setTimeout(() => cardToRemove.remove(), 300);
        }
    } catch (error) {
        alert('Failed to delete job: ' + error.message);
    }
}

function renderJobCard(job, table) {
    const jobCard = document.createElement('article');
    jobCard.className = 'job-card';
    jobCard.dataset.jobId = job.id;
    jobCard.innerHTML = `
        <div class="admin-job-actions">
            <button class="icon-btn edit-icon-btn" data-action="edit" title="Edit Job"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
            <button class="icon-btn delete-icon-btn" data-action="delete" title="Delete Job"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
        </div>
        <div class="job-info">
            <h2 class="job-company">${job.Company || 'N/A'}</h2>
            <div class="job-meta">
                <span class="job-tag location-tag"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>${job.Location || 'N/A'}</span>
                ${job.Salary ? `<span class="job-tag salary-tag"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>₹${job.Salary}</span>` : ''}
            </div>
        </div>`;
    return jobCard;
}

async function fetchJobs(searchTerm = '', locationSearch = '', salary = '') {
    if (isFetching) return;
    isFetching = true;
    const loader = document.getElementById('loader');
    const loadMoreBtn = document.getElementById('loadMore');
    loader.style.display = 'flex';
    loadMoreBtn.disabled = true;
    try {
        let query = supabaseClient.from(currentTable).select('*', { count: 'exact' });
        if (searchTerm) query = query.or(`Company.ilike.%${searchTerm}%,Location.ilike.%${searchTerm}%,Description.ilike.%${searchTerm}%`);
        if (locationSearch) query = query.ilike('Location', `%${locationSearch}%`);
        if (salary) {
            if (salary.endsWith('+')) query = query.gte('Salary', parseInt(salary));
            else { const [min, max] = salary.split('-').map(Number); query = query.gte('Salary', min).lte('Salary', max); }
        }
        query = query.order('Created_At', { ascending: false }).range(page * limit, (page + 1) * limit - 1);
        const { data, error } = await query;
        if (error) throw error;
        const jobsContainer = document.getElementById('jobs');
        if (data && data.length > 0) {
            data.forEach(job => jobsContainer.appendChild(renderJobCard(job, currentTable)));
            page++;
            hasMoreData = data.length === limit;
            loadMoreBtn.style.display = hasMoreData ? 'block' : 'none';
        } else {
            hasMoreData = false;
            loadMoreBtn.style.display = 'none';
            if (page === 0) jobsContainer.textContent = 'No jobs found.';
        }
    } catch (error) {
        document.getElementById('jobs').textContent = 'Failed to load jobs.';
    } finally {
        isFetching = false;
        loader.style.display = 'none';
        loadMoreBtn.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await checkAdmin();
    } catch (error) {
        return;
    }

    const dom = {
        searchInput: document.getElementById('searchInput'),
        locationSearchInput: document.getElementById('locationSearchInput'),
        salaryFilter: document.getElementById('salaryFilter'),
        loadMore: document.getElementById('loadMore'),
        jobForm: document.getElementById('job-form'),
        jobs: document.getElementById('jobs'),
        tableSelect: document.getElementById('tableSelect')
    };

    let debounceTimeout = null;
    const debouncedFetch = () => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            page = 0;
            dom.jobs.innerHTML = '';
            hasMoreData = true;
            fetchJobs(dom.searchInput.value, dom.locationSearchInput.value, dom.salaryFilter.value);
        }, 300);
    };

    dom.searchInput.addEventListener('input', debouncedFetch);
    dom.locationSearchInput.addEventListener('input', debouncedFetch);
    dom.salaryFilter.addEventListener('change', debouncedFetch);
    dom.loadMore.addEventListener('click', () => fetchJobs(dom.searchInput.value, dom.locationSearchInput.value, dom.salaryFilter.value));

    document.querySelectorAll('.footer-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.footer-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentTable = tab.dataset.table;
            debouncedFetch();
        });
    });

    dom.jobForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = e.target.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.classList.add('loading');
        try {
            const formData = new FormData(e.target);
            const jobData = Object.fromEntries(formData.entries());
            const { table, id, ...dataToSave } = jobData;
            if (dataToSave.Salary === '') dataToSave.Salary = null;
            if (dataToSave.connect_link === '') dataToSave.connect_link = null;

            const isEdit = id && id.trim() !== '';
            let savedJob;

            if (isEdit) {
                const { data, error } = await supabaseClient.from(table).update(dataToSave).eq('id', id).select().single();
                if (error) throw error;
                savedJob = data;
            } else {
                const { data, error } = await supabaseClient.from(table).insert([dataToSave]).select().single();
                if (error) throw error;
                savedJob = data;
            }

            closeJobEditModal();

            if (isEdit) {
                const oldCard = dom.jobs.querySelector(`.job-card[data-job-id='${id}']`);
                if (oldCard) {
                    const newCard = renderJobCard(savedJob, table);
                    oldCard.replaceWith(newCard);
                }
            } else {
                if (dom.jobs.textContent === 'No jobs found.') {
                    dom.jobs.innerHTML = '';
                }
                const newCard = renderJobCard(savedJob, table);
                dom.jobs.prepend(newCard);
                if (currentSession?.access_token) {
                    await triggerNotifications({ ...savedJob, table }, currentSession.access_token);
                }
            }
        } catch (error) {
            alert('Failed to save job: ' + error.message);
        } finally {
            submitButton.disabled = false;
            submitButton.classList.remove('loading');
        }
    });

    dom.jobs.addEventListener('click', async (e) => {
        const card = e.target.closest('.job-card');
        if (!card) return;

        const button = e.target.closest('button[data-action]');
        const jobId = card.dataset.jobId;

        if (button) {
            e.stopPropagation();
            const action = button.dataset.action;
            if (action === 'delete') {
                await deleteJob(jobId, currentTable);
            } else if (action === 'edit') {
                const jobDetails = await getJobById(jobId, currentTable);
                if (jobDetails) showEditJobModal(jobDetails);
            }
        } else {
            const job = await getJobById(jobId, currentTable);
            if (job) showModal(job);
        }
    });

    dom.tableSelect.addEventListener('change', (e) => updateCategoryOptions(e.target.value));

    window.addNewBanner = addNewBanner;
    window.showAddJobModal = showAddJobModal;
    window.closeJobEditModal = closeJobEditModal;
    window.closeModal = closeModal;

    try { await loadBanners(); } catch (error) { console.error("Failed to load banners:", error); }
    try { await fetchCategories(); await fetchJobs(); } catch (error) { console.error("Failed to load initial data:", error); }
});