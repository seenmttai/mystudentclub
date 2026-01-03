const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

const profileForm = document.getElementById('profile-form');
const loadingOverlay = document.getElementById('loading-overlay');
const saveBtn = profileForm.querySelector('.save-profile-btn');
let currentUser = null;

// generalized selectors for file handling
const fileConfig = {
    resume: {
        input: document.getElementById('resume'),
        dropZone: document.querySelector('.file-drop-zone'), // Keeps initial selector for backward compat logic if needed, but better to use specific ID if possible. 
        // HTML update used class .file-drop-zone for resume, and id #cover-letter-drop-zone for CL.
        // Let's grab them specifically.
        dropZone: document.getElementById('resume').closest('.file-drop-zone'),
        displayArea: document.getElementById('resume-display-area'),
        filenameEl: document.getElementById('resume-filename'),
        uploadArea: document.getElementById('resume-upload-area'),
        storageKeyText: 'userCVText',
        storageKeyName: 'userCVFileName'
    },
    cover_letter: {
        input: document.getElementById('cover_letter'),
        dropZone: document.getElementById('cover-letter-drop-zone'),
        displayArea: document.getElementById('cover-letter-display-area'),
        filenameEl: document.getElementById('cover-letter-filename'),
        uploadArea: document.getElementById('cover-letter-upload-area'),
        storageKeyText: 'userCoverLetterText',
        storageKeyName: 'userCoverLetterFileName'
    }
};


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
        loadingOverlay.style.display = 'flex';
    } else {
        loadingOverlay.style.display = 'none';
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
            localStorage.setItem('userProfileData', JSON.stringify(data.profile));
        } else {
            const localProfile = localStorage.getItem('userProfileData');
            if (localProfile) populateForm(JSON.parse(localProfile));
        }

        // Restore cached files
        ['resume', 'cover_letter'].forEach(type => {
            const cachedName = localStorage.getItem(fileConfig[type].storageKeyName);
            if (cachedName) {
                showFileDisplay(type, cachedName);
            }
        });

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
            // Skip file inputs in main loop, handled via localStorage cache
            if (key === 'resume' || key === 'cover_letter') continue;

            const field = profileForm.elements[key];
            if (field) {
                field.value = profileData[key];
            }
        }
    }
}

function showFileDisplay(type, filename) {
    const config = fileConfig[type];
    if (!config) return;

    config.filenameEl.textContent = filename;
    config.displayArea.style.display = 'block';
    config.uploadArea.style.display = 'none';
}

function hideFileDisplay(type) {
    const config = fileConfig[type];
    if (!config) return;

    config.filenameEl.textContent = '';
    config.displayArea.style.display = 'none';
    config.uploadArea.style.display = 'block';

    localStorage.removeItem(config.storageKeyText);
    localStorage.removeItem(config.storageKeyName);
    config.input.value = '';
}

async function handleFile(file, type) {
    if (!file) return;
    const config = fileConfig[type];
    if (!config) return;

    showLoading(true, `Processing ${type.replace('_', ' ')}...`);
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

        localStorage.setItem(config.storageKeyText, textContent);
        localStorage.setItem(config.storageKeyName, file.name);
        showFileDisplay(type, file.name);
    } catch (error) {
        console.error("Error processing file:", error);
        alert(`Could not process your ${type.replace('_', ' ')}. Please try a different file.`);
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

    // Remove file objects from direct profile data (stored in localStorage/jsonb separate keys if we wanted, but logic says just skip)
    delete profileData.resume;
    delete profileData.cover_letter;

    // Note: We are NOT saving the full text to the profile JSONB here, logic implies it relies on localStorage for the session/AI usage.
    // If we wanted to save it to DB, we would add it here. The prompt implies "data shared with companies", usually implies DB.
    // But original code didn't save resume text to DB profileData, only to localStorage. I will stick to that pattern unless asked.
    // Wait, the prompt said "Data will be shared". If it's in localStorage, it's NOT shared with valid backend.
    // The original code `localStorage.setItem('userProfileData', JSON.stringify(profileData))` and then `supabaseClient.from('profiles').upsert`.
    // The `profileData` from `formData` usually contains the filename from file input if not deleted? No, file input value is fake path.
    // The original code DELETED `profileData.resume`. So resume text *never went to DB profile JSON*.
    // Attempting to change this behavior might be out of scope or dangerous if text is huge.
    // I will stick to original behavior: files are local-cached for "AI features" (which presumably run client-side or check local storage).

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
            window.location.href = decodeURIComponent(redirectUrl);
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

        // Setup listeners for both Resume and Cover Letter
        ['resume', 'cover_letter'].forEach(type => {
            const config = fileConfig[type];
            if (!config) return; // safety

            if (config.input) {
                config.input.addEventListener('change', (e) => handleFile(e.target.files[0], type));
            }

            if (config.dropZone) {
                config.dropZone.addEventListener('click', () => config.input.click());

                ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                    config.dropZone.addEventListener(eventName, (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (['dragenter', 'dragover'].includes(eventName)) {
                            config.dropZone.classList.add('hover');
                        } else {
                            config.dropZone.classList.remove('hover');
                        }
                    }, false);
                });

                config.dropZone.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0], type));
            }
        });

        // Event delegation for remove buttons
        document.body.addEventListener('click', (e) => {
            const btn = e.target.closest('.remove-file-btn');
            if (btn) {
                const targetType = btn.getAttribute('data-target');
                if (targetType) hideFileDisplay(targetType);
            }
        });

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