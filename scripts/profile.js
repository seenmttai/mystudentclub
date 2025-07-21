const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

const profileForm = document.getElementById('profile-form');
const resumeInput = document.getElementById('resume');
const resumeDropZone = document.querySelector('.file-drop-zone');
const resumeDisplayArea = document.getElementById('resume-display-area');
const resumeFilenameEl = document.getElementById('resume-filename');
const removeResumeBtn = document.getElementById('remove-resume-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const saveBtn = profileForm.querySelector('.save-profile-btn');
let currentUser = null;

async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session || !session.user) {
        window.location.href = '/login.html';
        return null;
    }
    currentUser = session.user;
    return session.user;
}

function showLoading(visible, text = "Loading...") {
    if (visible) {
        loadingOverlay.querySelector('p').textContent = text;
        loadingOverlay.classList.add('visible');
    } else {
        loadingOverlay.classList.remove('visible');
    }
}

async function loadProfile() {
    if (!currentUser) return;
    showLoading(true, "Fetching your profile...");

    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('profile')
            .eq('uuid', currentUser.id)
            .single();
        
        if (error && error.code !== 'PGRST116') throw error;

        if (data && data.profile) {
            populateForm(data.profile);
        } else {
            const localProfile = localStorage.getItem('userProfileData');
            if (localProfile) populateForm(JSON.parse(localProfile));
        }

        const cachedResumeName = localStorage.getItem('userCVFileName');
        if (cachedResumeName) {
            showResumeDisplay(cachedResumeName);
        }
    } catch (e) {
        console.error("Error loading profile:", e);
        const localProfile = localStorage.getItem('userProfileData');
        if (localProfile) populateForm(JSON.parse(localProfile));
    } finally {
        showLoading(false);
    }
}

function populateForm(profileData) {
    for (const key in profileData) {
        if (profileData.hasOwnProperty(key)) {
            const field = profileForm.elements[key];
            if (field) {
                field.value = profileData[key];
            }
        }
    }
}

function showResumeDisplay(filename) {
    resumeFilenameEl.textContent = filename;
    resumeDisplayArea.style.display = 'block';
    document.getElementById('resume-upload-area').style.display = 'none';
}

function hideResumeDisplay() {
    resumeFilenameEl.textContent = '';
    resumeDisplayArea.style.display = 'none';
    document.getElementById('resume-upload-area').style.display = 'block';
    localStorage.removeItem('userCVText');
    localStorage.removeItem('userCVFileName');
}

async function handleFile(file) {
    if (!file) return;
    showLoading(true, "Processing resume...");
    try {
        let textContent = '';
        if (file.type === 'application/pdf') {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const text = await page.getTextContent();
                textContent += text.items.map(s => s.str).join(' ');
            }
        } else if (file.type === 'text/plain') {
            textContent = await file.text();
        } else {
            alert('Unsupported file type. Please upload PDF or TXT.');
            return;
        }
        localStorage.setItem('userCVText', textContent);
        localStorage.setItem('userCVFileName', file.name);
        showResumeDisplay(file.name);
    } catch (error) {
        console.error("Error processing file:", error);
        alert('Could not process your resume. Please try a different file.');
    } finally {
        showLoading(false);
    }
}

async function handleSave(e) {
    e.preventDefault();
    if (!localStorage.getItem('userCVText')) {
        alert('Please upload your resume. It is required to use the AI features.');
        return;
    }

    const btnText = saveBtn.querySelector('.btn-text');
    const spinner = saveBtn.querySelector('.fa-spinner');
    const originalText = btnText.textContent;
    btnText.textContent = 'Saving...';
    spinner.style.display = 'inline-block';
    saveBtn.disabled = true;

    const formData = new FormData(profileForm);
    const profileData = Object.fromEntries(formData.entries());
    delete profileData.resume;  

    localStorage.setItem('userProfileData', JSON.stringify(profileData));

    try {
        const { error } = await supabaseClient.from('profiles').upsert({
            uuid: currentUser.id,
            profile: profileData,
            updated_at: new Date().toISOString()
        });
        if (error) throw error;
        alert('Profile saved successfully!');

        const redirectUrl = new URLSearchParams(window.location.search).get('redirect');
        if (redirectUrl) {
            window.location.href = redirectUrl;
        }

    } catch (e) {
        console.error("Error saving profile to database:", e);
        alert('Profile saved to your browser, but failed to sync to the server. You can continue using the site.');
    } finally {
        btnText.textContent = originalText;
        spinner.style.display = 'none';
        saveBtn.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const user = await checkAuth();
    if (user) {
        document.getElementById('email').value = user.email;
        loadProfile();

        resumeInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            resumeDropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });
        ['dragenter', 'dragover'].forEach(eventName => resumeDropZone.classList.add('hover'));
        ['dragleave', 'drop'].forEach(eventName => resumeDropZone.classList.remove('hover'));
        resumeDropZone.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));

        removeResumeBtn.addEventListener('click', hideResumeDisplay);
        profileForm.addEventListener('submit', handleSave);

        const menuButton = document.getElementById('menuButton');
        const expandedMenu = document.getElementById('expandedMenu');
        const menuCloseBtn = document.getElementById('menuCloseBtn');
        const authButtonsContainer = document.querySelector('.auth-buttons-container');

        if (user) {
            let initial = user.email.charAt(0).toUpperCase();
            authButtonsContainer.innerHTML = `<div class="user-profile-container"><div class="user-icon-wrapper"><div class="user-icon" data-email="${user.email}">${initial}</div><div class="user-hover-card"><div class="user-hover-content"><p class="user-email">${user.email}</p><button id="logoutBtn" class="logout-btn">Logout</button></div></div></div></div>`;
            document.getElementById('logoutBtn').addEventListener('click', async () => {
                await supabaseClient.auth.signOut();
                window.location.href = '/login.html';
            });
        }

        menuButton.addEventListener('click', () => expandedMenu.classList.add('active'));
        menuCloseBtn.addEventListener('click', () => expandedMenu.classList.remove('active'));
    }
});