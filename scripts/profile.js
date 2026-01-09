const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
const WORKER_URL = 'https://profill.bhansalimanan55.workers.dev';

const profileForm = document.getElementById('profile-form');
const loadingOverlay = document.getElementById('loading-overlay');
const saveBtn = profileForm.querySelector('.save-profile-btn');
let currentUser = null;

const fileConfig = {
    resume: {
        input: document.getElementById('resume'),
        dropZone: document.querySelector('.file-drop-zone'),
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
            // For resume, require images to be cached (not just filename)
            // For cover letter, filename is sufficient
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
            // Load PDF document
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            // Extract Text (still used for cover letter)
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const text = await page.getTextContent();
                textContent += text.items.map(s => s.str).join(' ');
            }

            // Extract Images (for Resume)
            if (type === 'resume') {
                showLoading(true, "Converting resume to images...");
                images = await convertPdfToImages(pdf);

                // Cache images to localStorage for AI Apply
                if (images.length > 0) {
                    try {
                        localStorage.setItem(config.storageKeyImages, JSON.stringify(images));
                    } catch (e) {
                        console.error("Error caching images (localStorage quota):", e);
                        alert('Resume is too large to cache. AI Apply may not work correctly.');
                    }

                    // Autofill profile from resume
                    showLoading(true, "Autofilling details using AI...");
                    const extractedData = await extractProfileData(images, textContent);
                    if (extractedData) {
                        populateForm(extractedData);
                        alert('Profile auto-filled from your resume! Please review the details.');
                    }
                }
            }
        } else if (file.type === 'text/plain') {
            textContent = await file.text();
            if (type === 'resume') {
                // For text files, we can't convert to images, so just store empty array
                localStorage.setItem(config.storageKeyImages, JSON.stringify([]));
                showLoading(true, "Autofilling details using AI...");
                const extractedData = await extractProfileData([], textContent);
                if (extractedData) {
                    populateForm(extractedData);
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
        console.error("Error processing file:", error);
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
            // Get base64 without prefix
            const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
            images.push(base64);
        }
    } catch (e) {
        console.error("Error converting PDF to images", e);
    }
    return images;
}

async function extractProfileData(images, text) {
    try {
        const payload = {
            images: images,
            pdf_text: text,
            domain: "Finance & Accounting", // default
            specialization: "Accountant" // default
        };

        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.warn("Worker API returned error:", response.status);
            return null;
        }

        const data = await response.json();
        if (data.ok && data.response) {
            return parseGeminiJson(data.response);
        }
    } catch (e) {
        console.error("Error calling worker:", e);
    }
    return null;
}

function parseGeminiJson(text) {
    try {
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("Failed to parse JSON from AI response", e);
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