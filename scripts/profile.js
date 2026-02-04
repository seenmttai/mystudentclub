const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
pdfjsLib.GlobalWorkerOptions.workerSrc = '/scripts/vendor/pdf.worker.min.js';
const WORKER_URL = 'https://storer.bhansalimanan55.workers.dev';

const profileForm = document.getElementById('profile-form');
const loadingOverlay = document.getElementById('loading-overlay');
const saveBtn = profileForm.querySelector('.save-profile-btn');
let currentUser = null;

const fileConfig = {
    resume: {
        input: document.getElementById('resume'),
        dropZone: document.getElementById('resume').closest('.file-drop-zone'),
        displayArea: document.getElementById('resume-display-area'),
        filenameEl: document.getElementById('resume-filename'),
        uploadArea: document.getElementById('resume-upload-area'),
        storageKeyText: 'userCVText',
        storageKeyName: 'userCVFileName',
        storageKeyImages: 'userCVImages'
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

        ['resume', 'cover_letter'].forEach(type => {
            const config = fileConfig[type];
            if (type === 'resume') {
                const cachedImages = localStorage.getItem(config.storageKeyImages);
                const cachedName = localStorage.getItem(config.storageKeyName);
                if (cachedImages && cachedName) {
                    showFileDisplay(type, cachedName);
                }
            } else {
                const cachedName = localStorage.getItem(config.storageKeyName);
                if (cachedName) {
                    showFileDisplay(type, cachedName);
                }
            }
        });

    } catch (e) {
        console.error(e);
        const localProfile = localStorage.getItem('userProfileData');
        if (localProfile) populateForm(JSON.parse(localProfile));
    } finally {
        showLoading(false);
    }
}

function populateForm(profileData) {
    for (const key in profileData) {
        if (profileData.hasOwnProperty(key)) {
            if (key === 'resume' || key === 'cover_letter') continue;

            const field = profileForm.elements[key];
            if (field) {
                field.value = profileData[key];
            }
        }
    }

    const domainOtherInput = document.getElementById('articleship_domain_other');
    if (domainOtherInput && profileData.articleship_domain === 'Other') {
        domainOtherInput.style.display = 'block';
    }

    const jobPref = document.getElementById('job_preference');
    if (jobPref) {
        jobPref.dispatchEvent(new Event('change'));
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
    if (config.storageKeyImages) {
        localStorage.removeItem(config.storageKeyImages);
    }
    config.input.value = '';
}

async function handleFile(file, type) {
    if (!file) return;
    const config = fileConfig[type];
    if (!config) return;

    showLoading(true, `Processing ${type.replace('_', ' ')}...`);
    try {
        let textContent = '';
        let images = [];

        if (type === 'cover_letter' && file.type !== 'application/pdf') {
            alert('Please upload your Cover Letter in PDF format only.');
            return;
        }

        if (file.type === 'application/pdf') {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const text = await page.getTextContent();
                textContent += text.items.map(s => s.str).join(' ');
            }

            if (type === 'resume') {
                showLoading(true, "Converting resume to images...");
                images = await convertPdfToImages(pdf);

                if (images.length > 0) {
                    try {
                        localStorage.setItem(config.storageKeyImages, JSON.stringify(images));
                    } catch (e) {
                        alert('Resume is too large. Please reupload your resume.');
                    }

                    showLoading(true, "Validating and Autofilling details...");
                    const extractResult = await extractProfileData(images, textContent);

                    if (extractResult && extractResult.is_valid === false) {
                        alert(extractResult.message);
                        hideFileDisplay('resume');
                        return;
                    } else if (extractResult && extractResult.data) {
                        populateForm(extractResult.data);
                        alert('Profile auto-filled from your resume! Please review the details.');
                    }
                }
            }
        } else if (file.type === 'text/plain') {
            textContent = await file.text();
            if (type === 'resume') {
                localStorage.setItem(config.storageKeyImages, JSON.stringify([]));
                showLoading(true, "Validating and Autofilling details...");
                const extractResult = await extractProfileData([], textContent);

                if (extractResult && extractResult.is_valid === false) {
                    alert(extractResult.message);
                    hideFileDisplay('resume');
                    return;
                } else if (extractResult && extractResult.data) {
                    populateForm(extractResult.data);
                    alert('Profile auto-filled from your resume! Please review the details.');
                }
            }
        } else {
            alert('Unsupported file type. Please upload PDF or TXT.');
            return;
        }

        localStorage.setItem(config.storageKeyText, textContent);
        localStorage.setItem(config.storageKeyName, file.name);
        showFileDisplay(type, file.name);
    } catch (error) {
        console.error(error);
        alert(`Could not process your ${type.replace('_', ' ')}. Please try a different file.`);
    } finally {
        showLoading(false);
    }
}

async function convertPdfToImages(pdf) {
    const images = [];
    try {
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;
            const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
            images.push(base64);
        }
    } catch (e) {
        console.error(e);
    }
    return images;
}

async function extractProfileData(images, text) {
    if (!currentUser) return null;

    try {
        const payload = {
            user_id: currentUser.id,
            images: images,
            pdf_text: text
        };

        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) return null;

        const data = await response.json();

        if (data.ok && data.is_cv === false) {
            return { is_valid: false, message: data.message };
        }

        if (data.ok && data.response) {
            const parsed = parseGeminiJson(data.response);
            if (parsed.is_valid_cv === false) {
                return { is_valid: false, message: "The uploaded file does not appear to be a valid Resume/CV." };
            }
            return { is_valid: true, data: parsed };
        }
    } catch (e) {
        console.error(e);
    }
    return null;
}

function setCloudSyncFlag() {
    localStorage.setItem('cv_cloud_synced', 'true');
    document.cookie = "cv_cloud_synced=true; max-age=31536000; path=/";
}

function parseGeminiJson(text) {
    try {
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        return null;
    }
}

async function handleSave(e) {
    e.preventDefault();
    if (!localStorage.getItem('userCVImages')) {
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
    delete profileData.cover_letter;

    const ocrText = localStorage.getItem('userCVText') || "";

    localStorage.setItem('userProfileData', JSON.stringify(profileData));

    try {
        const { error } = await supabaseClient.from('profiles').upsert({
            uuid: currentUser.id,
            profile: profileData,
            ocr_cv: ocrText,
            updated_at: new Date().toISOString()
        });

        if (error) throw error;
        setCloudSyncFlag();
        alert('Profile saved successfully!');

        const redirectUrl = new URLSearchParams(window.location.search).get('redirect');
        if (redirectUrl) {
            window.location.href = decodeURIComponent(redirectUrl);
        }

    } catch (e) {
        console.error(e);
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

        const jobPreferenceSelect = document.getElementById('job_preference');
        const joiningDateGroup = document.getElementById('earliest_joining_date_group');
        const articleshipCompletionGroup = document.getElementById('articleship_completion_date_group');

        function handleJobPreferenceChange() {
            const value = jobPreferenceSelect.value;
            if (joiningDateGroup) joiningDateGroup.style.display = 'none';
            if (articleshipCompletionGroup) articleshipCompletionGroup.style.display = 'none';

            if (value === 'industrial') {
                if (articleshipCompletionGroup) articleshipCompletionGroup.style.display = 'block';
            } else if (['articleship', 'fresher_fresher', 'fresher_experienced', 'semi_fresher', 'semi_experienced'].includes(value)) {
                if (joiningDateGroup) joiningDateGroup.style.display = 'block';
            }
        }

        if (jobPreferenceSelect) {
            jobPreferenceSelect.addEventListener('change', handleJobPreferenceChange);
        }

        loadProfile();

        const domainSelect = document.getElementById('articleship_domain');
        const domainOtherInput = document.getElementById('articleship_domain_other');
        if (domainSelect && domainOtherInput) {
            domainSelect.addEventListener('change', () => {
                domainOtherInput.style.display = domainSelect.value === 'Other' ? 'block' : 'none';
                if (domainSelect.value !== 'Other') {
                    domainOtherInput.value = '';
                }
            });
        }

        ['resume', 'cover_letter'].forEach(type => {
            const config = fileConfig[type];
            if (!config) return;

            if (config.input) {
                config.input.addEventListener('change', (e) => handleFile(e.target.files[0], type));
            }

            if (config.dropZone) {
                config.dropZone.addEventListener('click', (e) => {
                    if (e.target !== config.input) {
                        config.input.click();
                    }
                });

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
            let displayName = user.email;
            try {
                const profileData = JSON.parse(localStorage.getItem('userProfileData') || '{}');
                if (profileData.name && profileData.name.trim()) {
                    displayName = profileData.name.trim();
                }
            } catch (e) { }
            let initial = displayName.charAt(0).toUpperCase();
            authButtonsContainer.innerHTML = `<div class="user-profile-container"><div class="user-icon-wrapper"><div class="user-icon" data-email="${user.email}">${initial}</div><div class="user-hover-card"><div class="user-hover-content"><p class="user-email">${displayName}</p><a href="/profile.html" class="profile-link-btn">Edit Profile</a><button id="logoutBtn" class="logout-btn">Logout</button></div></div></div></div>`;

            const userIconWrapper = authButtonsContainer.querySelector('.user-icon-wrapper');
            const userHoverCard = authButtonsContainer.querySelector('.user-hover-card');
            if (userIconWrapper && userHoverCard) {
                userIconWrapper.addEventListener('click', (event) => {
                    event.stopPropagation();
                    userHoverCard.classList.toggle('show');
                });
            }

            document.getElementById('logoutBtn').addEventListener('click', async () => {
                await supabaseClient.auth.signOut();
                localStorage.clear();
                window.location.href = '/login.html';
            });
        }

        menuButton.addEventListener('click', () => expandedMenu.classList.add('active'));
        menuCloseBtn.addEventListener('click', () => expandedMenu.classList.remove('active'));
    }
});