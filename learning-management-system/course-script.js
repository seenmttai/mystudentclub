document.addEventListener('DOMContentLoaded', () => {
    const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
    const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;

    let state = {
        menuActive: false, sidebarActive: false, courseSlug: null, user: null, isEnrolled: false,
        course: { title: '', description: '', thumbnail: '', progress: 0 }, courseSections: [],
        currentVideoId: null, activeTab: 'overview', comments: [],
        errorLogCount: 0,
        videoStartTimes: {},
        currentResource: null, previewType: null, isViewerVisible: false, pdfDoc: null,
        pdfCurrentPage: 1, pdfTotalPages: 1, isFullscreen: false, isPlaying: false,
        retryCount: 0, maxRetries: 5,
        plyrPlayer: null
    };

    const courses = {
        'industrial-training-mastery': {
            title: 'CA Industrial Training Program',
            description: 'Master industrial training requirements for CA candidates with real-world case studies.',
            thumbnail: 'https://mystudentclub.com/assets/courseimg-industrial.png'
        },
        'msc-ca-freshers-program': {
            title: 'MSC CA Freshers Program',
            description: 'A comprehensive program for CA freshers to kickstart their career.',
            thumbnail: 'https://mystudentclub.com/assets/courseimg-fresher.png'
        }
    };

    const DOMElements = {
        app: document.getElementById('app'),
        hamburgerMenu: document.getElementById('hamburger-menu'),
        navLinks: document.getElementById('nav-links'),
        userDisplayName: document.getElementById('user-display-name'),
        profileDropdown: document.getElementById('profile-dropdown'),
        profileDropdownName: document.getElementById('profile-dropdown-name'),
        profileDropdownEmail: document.getElementById('profile-dropdown-email'),
        logoutButton: document.getElementById('logout-button'),
        enrollmentModal: document.getElementById('enrollment-modal'),
        enrollCourseThumbnail: document.getElementById('enroll-course-thumbnail'),
        enrollCourseTitle: document.getElementById('enroll-course-title'),
        enrollRedirectBtn: document.getElementById('enroll-redirect-btn'),
        loadingEnrollmentScreen: document.getElementById('loading-enrollment-screen'),
        coursePageContent: document.getElementById('course-page-content'),
        courseHeaderBanner: document.getElementById('course-header-banner'),
        courseTitle: document.getElementById('course-title'),
        courseDescription: document.getElementById('course-description'),
        totalVideosMeta: document.getElementById('total-videos-meta'),
        totalVideosCount: document.getElementById('total-videos-count'),
        loadingVideosMeta: document.getElementById('loading-videos-meta'),
        courseProgressMeta: document.getElementById('course-progress-meta'),
        courseSidebar: document.getElementById('course-sidebar'),
        sidebarCloseBtn: document.getElementById('sidebar-close-btn'),
        sidebarProgressBar: document.getElementById('sidebar-progress-bar'),
        sidebarProgressText: document.getElementById('sidebar-progress-text'),
        courseModulesContainer: document.getElementById('course-modules-container'),
        loadingVideosSidebar: document.getElementById('loading-videos-sidebar'),
        sidebarToggleBtn: document.getElementById('sidebar-toggle-btn'),
        videoSectionContainer: document.getElementById('video-section-container'),
        noVideoSelectedPlaceholder: document.getElementById('no-video-selected-placeholder'),
        videoPlayerContainer: document.getElementById('video-player-container'),
        videoPlayer: document.getElementById('video-player'),
        videoLoadingOverlay: document.getElementById('video-loading-overlay'),
        noVideoMessagePlayer: document.getElementById('no-video-message-player'),
        prevVideoBtn: document.getElementById('prev-video-btn'),
        nextVideoBtn: document.getElementById('next-video-btn'),
        videoCounter: document.getElementById('video-counter'),
        prevVideoBtn: document.getElementById('prev-video-btn'),
        nextVideoBtn: document.getElementById('next-video-btn'),
        videoCounter: document.getElementById('video-counter'),
        courseTabsContainer: document.getElementById('course-tabs-container'),
        tabContents: {
            overview: document.getElementById('tab-content-overview'),
            resources: document.getElementById('tab-content-resources'),
            discussion: document.getElementById('tab-content-discussion'),
            report: document.getElementById('tab-content-report')
        },
        newCommentInput: document.getElementById('new-comment-input'),
        postCommentBtn: document.getElementById('post-comment-btn'),
        commentsLoader: document.getElementById('comments-loader'),
        commentListContainer: document.getElementById('comment-list-container'),
        reportDescriptionInput: document.getElementById('report-description-input'),
        submitReportBtn: document.getElementById('submit-report-btn'),
        resourceViewerModal: document.getElementById('resource-viewer-modal'),
        viewerContent: document.getElementById('viewer-content'),
        resourceViewerTitle: document.getElementById('resource-viewer-title'),
        viewerFullscreenBtn: document.getElementById('viewer-fullscreen-btn'),
        viewerCloseBtn: document.getElementById('viewer-close-btn'),
        viewerLoadingScreen: document.getElementById('viewer-loading-screen'),
        pdfViewerContainer: document.getElementById('pdf-viewer-container'),
        csvViewerContainer: document.getElementById('csv-viewer-container'),
        pdfCanvas: document.getElementById('pdf-canvas'),
        pdfPrevPage: document.getElementById('pdf-prev-page'),
        pdfNextPage: document.getElementById('pdf-next-page'),
        pdfPageInfo: document.getElementById('pdf-page-info'),
        viewerDownloadBtn: document.getElementById('viewer-download-btn'),
        iframeViewerContainer: document.getElementById('iframe-viewer-container'),
        resourceIframe: document.getElementById('resource-iframe'),
        footer: document.getElementById('footer'),
        noDownloadPopup: document.getElementById('no-download-popup'),
        closeNoDownloadBtn: document.getElementById('close-no-download-btn')
    };

    const getResourceIcon = (type) => {
        const iconMap = {
            pdf: 'fas fa-file-pdf', image: 'fas fa-file-image', doc: 'fas fa-file-word',
            docx: 'fas fa-file-word', txt: 'fas fa-file-alt', external_link: 'fas fa-external-link-alt',
            video: 'fas fa-file-video', archive: 'fas fa-file-archive', spreadsheet: 'fas fa-file-excel',
            xlsx: 'fas fa-file-excel', csv: 'fas fa-file-csv'
        };
        return iconMap[type ? type.toLowerCase() : ''] || 'fas fa-file';
    };

    const updateLearningStreak = () => {
        const today = new Date().toDateString();
        const lastActivity = localStorage.getItem('lastLearningActivity');
        if (lastActivity !== today) {
            localStorage.setItem('lastLearningActivity', today);
            const currentStreak = parseInt(localStorage.getItem('learningStreak') || '0');
            localStorage.setItem('learningStreak', (currentStreak + 1).toString());
        }
    };

    const findVideoById = (videoId) => {
        for (const section of state.courseSections) {
            const foundVideo = section.videos.find(v => v.id === videoId);
            if (foundVideo) return foundVideo;
        }
        return null;
    };

    const updateCourseProgress = () => {
        let totalCount = 0;
        let completedCount = 0;
        state.courseSections.forEach(section => {
            section.videos.forEach(video => {
                totalCount++;
                if (video.completed) completedCount++;
            });
        });
        const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
        state.course.progress = progress;
        DOMElements.courseProgressMeta.textContent = `${progress}% Complete`;
        DOMElements.sidebarProgressText.textContent = `${progress}% Complete`;
        DOMElements.sidebarProgressBar.style.width = `${progress}%`;
    };

    const saveVideoProgress = () => {
        const completedVideos = {};
        state.courseSections.forEach(section => {
            section.videos.forEach(video => {
                if (video.completed) {
                    completedVideos[video.id] = true;
                }
            });
        });
        const existingData = localStorage.getItem(`courseVideos_${state.courseSlug}`);
        let mergedData = {};
        if (existingData) {
            try {
                mergedData = JSON.parse(existingData);
            } catch (e) { }
        }
        const newData = { ...mergedData, ...completedVideos };
        localStorage.setItem(`courseVideos_${state.courseSlug}`, JSON.stringify(newData));
    };

    const markVideoCompleted = () => {
        if (!state.currentVideoId) return;
        const videoToMark = findVideoById(state.currentVideoId);
        if (videoToMark && !videoToMark.completed) {
            videoToMark.completed = true;
            saveVideoProgress();
            updateCourseProgress();
            updateLearningStreak();
            renderCourseModules();
        }
    };

    const renderCourseModules = () => {
        DOMElements.courseModulesContainer.innerHTML = '';
        if (state.courseSections.length === 0) {
            DOMElements.courseModulesContainer.innerHTML = `
                <div class="empty-content">
                    <i class="fas fa-video-slash"></i>
                    <p>No content available for this course yet.</p>
                </div>`;
            return;
        }

        state.courseSections.forEach((day, dayIndex) => {
            const isDayCompleted = day.videos.every(v => v.completed);
            const isDaySelected = day.videos.some(v => v.id === state.currentVideoId);
            const moduleDiv = document.createElement('div');
            moduleDiv.className = 'course-module';

            let resourcesHTML = '';
            if (day.mainVideo && day.mainVideo.resources.length > 0) {
                const groups = {};
                day.mainVideo.resources.forEach(res => {
                    const groupKey = res.group || 'General Resources';
                    if (!groups[groupKey]) groups[groupKey] = [];
                    groups[groupKey].push(res);
                });

                for (const groupName in groups) {
                    if (groupName !== 'General Resources') {
                        resourcesHTML += `<h5 class="sidebar-resource-group-title">${groupName}</h5>`;
                    }
                    groups[groupName].forEach(resource => {
                        resourcesHTML += `
                            <div class="resource-item-sidebar" data-resource='${JSON.stringify(resource).replace(/'/g, "&apos;")}'>
                                <span class="resource-icon-sidebar"><i class="${getResourceIcon(resource.type)}"></i></span>
                                <span class="resource-title-sidebar">${resource.title}</span>
                            </div>`;
                    });
                }
            }

            moduleDiv.innerHTML = `
                <div class="module-header ${isDaySelected ? 'active' : ''} ${isDayCompleted ? 'completed' : ''}" data-video-id="${day.mainVideo.id}">
                    <div class="module-title-container">
                        <i class="fas ${isDayCompleted ? 'fa-check-circle' : 'fa-play-circle'}"></i>
                        <h4>${day.title}</h4>
                    </div>
                    <div class="module-info" data-day-index="${dayIndex}">
                        ${day.mainVideo && day.mainVideo.resources.length > 0 ? `<span>${day.mainVideo.resources.length} Resource${day.mainVideo.resources.length !== 1 ? 's' : ''}</span>` : ''}
                        <i class="fas ${day.expanded ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
                    </div>
                </div>
                <div class="module-content ${day.expanded ? 'expanded' : ''}">
                    <div class="sidebar-resource-list">${resourcesHTML}</div>
                </div>
            `;
            DOMElements.courseModulesContainer.appendChild(moduleDiv);
        });

        DOMElements.courseModulesContainer.querySelectorAll('.module-header').forEach(el => {
            el.addEventListener('click', (e) => {
                selectVideo(parseInt(el.dataset.videoId));
            });
        });

        DOMElements.courseModulesContainer.querySelectorAll('.module-info').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const dayIndex = parseInt(el.dataset.dayIndex);
                state.courseSections[dayIndex].expanded = !state.courseSections[dayIndex].expanded;
                renderCourseModules();
            });
        });

        DOMElements.courseModulesContainer.querySelectorAll('.resource-item-sidebar').forEach(el => {
            el.addEventListener('click', () => handleResourceClick(JSON.parse(el.dataset.resource)));
        });
    };

    const loadVideoProgress = () => {
        const savedVideos = localStorage.getItem(`courseVideos_${state.courseSlug}`);
        if (savedVideos) {
            try {
                const completedVideos = JSON.parse(savedVideos);
                state.courseSections.forEach(section => {
                    section.videos.forEach(video => {
                        if (completedVideos[video.id] === true) video.completed = true;
                    });
                });
            } catch (e) { console.error("Error parsing progress", e); }
        }
        updateCourseProgress();
        const lastVideoId = localStorage.getItem(`lastVideoId_${state.courseSlug}`);
        if (lastVideoId && findVideoById(parseInt(lastVideoId))) {
            selectVideo(parseInt(lastVideoId));
        } else if (state.courseSections.length > 0 && state.courseSections[0].videos.length > 0) {
            selectVideo(state.courseSections[0].videos[0].id);
        }
    };

    const logFrontendError = async (message, stack, source) => {
        if (state.errorLogCount >= 6) return;
        state.errorLogCount++;

        const contextData = JSON.stringify({
            course: state.courseSlug,
            videoId: state.currentVideoId,
            screen: `${window.screen.width}x${window.screen.height}`
        });

        try {
            await supabase
                .from('frontend_errors')
                .insert({
                    user_id: state.user ? state.user.id : null,
                    error_message: `Source: ${source} | Message: ${message || 'Unknown Error'} | Context: ${contextData}`,
                    stack_trace: stack || 'No Stack Trace',
                    url: window.location.href,
                    user_agent: navigator.userAgent
                });
        } catch (e) {
            console.error('Error logging to Supabase:', e);
        }
    };

    const loadCourseVideos = async () => {
        DOMElements.loadingVideosMeta.style.display = 'flex';
        DOMElements.loadingVideosSidebar.style.display = 'block';
        try {
            const { data: videoMetadata, error: metadataError } = await supabase
                .from('videos').select('video_number, title, description, day_number, resources')
                .eq('course', state.courseSlug).order('day_number', { ascending: true })
                .order('video_number', { ascending: true });

            if (metadataError) throw metadataError;

            const videosByDay = {};
            if (videoMetadata && videoMetadata.length > 0) {
                for (const meta of videoMetadata) {
                    try {
                        const { data: rpcData, error: rpcError } = await supabase.rpc('get_video_link', {
                            course_name_param: state.courseSlug,
                            video_number_param: meta.video_number
                        });

                        const day = meta.day_number || 1;
                        if (!videosByDay[day]) videosByDay[day] = [];
                        videosByDay[day].push({
                            id: meta.video_number, fileName: rpcData || null,
                            title: meta.title || `Content for Day ${day}`,
                            description: meta.description || '', resources: meta.resources || [], completed: false
                        });
                    } catch (err) { }
                }
            }

            state.courseSections = Object.keys(videosByDay).map(dayNum => {
                const dayVideos = videosByDay[dayNum];
                const mainVideo = dayVideos[0] || {};
                return {
                    day_number: parseInt(dayNum), title: mainVideo.title || `Day ${dayNum}`,
                    expanded: parseInt(dayNum) === 1, videos: dayVideos, mainVideo: mainVideo
                };
            }).sort((a, b) => a.day_number - b.day_number);

            const totalVideos = videoMetadata ? videoMetadata.length : 0;
            if (totalVideos > 0) {
                DOMElements.totalVideosCount.textContent = `${totalVideos} Sessions`;
                DOMElements.totalVideosMeta.style.display = 'flex';
            }
            loadVideoProgress();
            renderCourseModules();
        } catch (error) {
            logFrontendError(error.message, error.stack, 'loadCourseVideos');
        } finally {
            DOMElements.loadingVideosMeta.style.display = 'none';
            DOMElements.loadingVideosSidebar.style.display = 'none';
        }
    };

    const checkEnrollment = async () => {
        try {
            const { data: enrollments, error } = await supabase
                .from('enrollment').select('course').eq('uuid', state.user.id).eq('course', state.courseSlug);
            if (error || !enrollments || enrollments.length === 0) {
                state.isEnrolled = false;
                DOMElements.enrollmentModal.style.display = 'flex';
            } else {
                state.isEnrolled = true;
                DOMElements.coursePageContent.style.display = 'block';
                DOMElements.footer.style.display = 'block';
                await loadCourseVideos();
                checkAndShowCVPopup();
            }
        } catch (error) {
            state.isEnrolled = false;
            DOMElements.enrollmentModal.style.display = 'flex';
        } finally {
            DOMElements.loadingEnrollmentScreen.style.display = 'none';
        }
    };

    const checkAndShowCVPopup = () => {
        if (state.courseSlug !== 'industrial-training-mastery') return;
        const dismissedKey = `cvReviewPopupDismissed_${state.courseSlug}`;
        const isDismissed = localStorage.getItem(dismissedKey);
        if (!isDismissed) {
            const cvPopup = document.getElementById('cv-review-popup');
            if (cvPopup) {
                setTimeout(() => {
                    cvPopup.classList.add('active');
                }, 1000);
            }
        }
    };

    const dismissCVPopup = () => {
        const cvPopup = document.getElementById('cv-review-popup');
        if (cvPopup) {
            cvPopup.classList.remove('active');
            const dismissedKey = `cvReviewPopupDismissed_${state.courseSlug}`;
            localStorage.setItem(dismissedKey, 'true');
        }
    };

    const checkAuth = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
            state.user = session.user;
            DOMElements.userDisplayName.textContent = session.user.user_metadata?.first_name || session.user.email.split('@')[0];
            DOMElements.profileDropdownName.textContent = session.user.user_metadata?.full_name || session.user.email.split('@')[0];
            DOMElements.profileDropdownEmail.textContent = session.user.email;
            await checkEnrollment();
        } else {
            window.location.href = 'https://www.mystudentclub.com/login.html';
        }
    };

    const fetchComments = async () => {
        if (!state.currentVideoId) return;
        DOMElements.commentsLoader.style.display = 'block';
        DOMElements.commentListContainer.innerHTML = '';
        try {
            const { data, error } = await supabase.from('video_comments').select('*')
                .eq('course_slug', state.courseSlug).eq('video_id', state.currentVideoId.toString())
                .order('created_at', { ascending: false });

            if (error) throw error;
            state.comments = data || [];
            if (state.comments.length === 0) {
                DOMElements.commentListContainer.innerHTML = `<div style="color: #64748b; font-style: italic;">No comments yet. Be the first to start the discussion!</div>`;
            } else {
                state.comments.forEach(comment => {
                    const commentEl = document.createElement('div');
                    commentEl.className = 'comment-item';
                    commentEl.innerHTML = `
                        <div class="comment-header">
                            <span class="comment-author">${comment.user_email.split('@')[0]}</span>
                            <span class="comment-date">${new Date(comment.created_at).toLocaleDateString()}</span>
                        </div>
                        <div class="comment-body">${comment.content}</div>`;
                    DOMElements.commentListContainer.appendChild(commentEl);
                });
            }
        } catch (error) {
            console.error('Error fetching comments:', error);
        } finally {
            DOMElements.commentsLoader.style.display = 'none';
        }
    };

    const selectVideo = (videoId) => {
        state.retryCount = 0;
        DOMElements.videoLoadingOverlay.style.display = 'flex';
        state.currentVideoId = videoId;

        DOMElements.noVideoSelectedPlaceholder.style.display = 'none';
        DOMElements.videoSectionContainer.style.display = 'block';

        const currentVideo = findVideoById(videoId);

        if (currentVideo && currentVideo.fileName) {
            DOMElements.videoPlayerContainer.style.display = 'block';
            DOMElements.noVideoMessagePlayer.style.display = 'none';
            DOMElements.videoPlayer.src = `https://advertisement.bhansalimanan55.workers.dev/stream/${encodeURIComponent(currentVideo.fileName)}`;
            DOMElements.videoPlayer.load();
        } else {
            DOMElements.videoPlayerContainer.style.display = 'none';
            DOMElements.noVideoMessagePlayer.style.display = 'block';
        }

        setActiveTab('overview');
        renderTabsAndContent();

        if (window.innerWidth < 768) {
            DOMElements.courseSidebar.classList.remove('active');
        }
        localStorage.setItem(`lastVideoId_${state.courseSlug}`, videoId);
        fetchComments();
        updateNavButtons();
        updateVideoCounter();
        renderCourseModules();
    };

    const renderTabsAndContent = () => {
        const currentVideo = findVideoById(state.currentVideoId);
        if (!currentVideo) return;

        DOMElements.courseTabsContainer.innerHTML = '';
        const tabs = ['overview', 'resources', 'discussion', 'report'];
        tabs.forEach(tabId => {
            const btn = document.createElement('button');
            btn.className = 'tab-btn';
            btn.textContent = tabId === 'report' ? 'Report an Issue' : tabId.charAt(0).toUpperCase() + tabId.slice(1);
            btn.dataset.tab = tabId;

            if (tabId === 'resources' && (!currentVideo.resources || currentVideo.resources.length === 0)) {
                return;
            }

            if (tabId === state.activeTab) {
                btn.classList.add('active');
            }
            btn.addEventListener('click', () => setActiveTab(tabId));
            DOMElements.courseTabsContainer.appendChild(btn);
        });

        DOMElements.tabContents.overview.innerHTML = currentVideo.description ? `<h3>Summary</h3><p>${currentVideo.description.replace(/\n/g, '<br>')}</p>` : '<p>No description available for this session.</p>';

        DOMElements.tabContents.resources.innerHTML = '';
        if (currentVideo.resources && currentVideo.resources.length > 0) {
            const groups = {};
            currentVideo.resources.forEach(res => {
                const groupKey = res.group || 'General Resources';
                if (!groups[groupKey]) groups[groupKey] = [];
                groups[groupKey].push(res);
            });

            let resourcesHTML = '';
            for (const groupName in groups) {
                resourcesHTML += `<div class="resource-group">`;
                if (groupName !== 'General Resources' || Object.keys(groups).length > 1) {
                    resourcesHTML += `<h4 class="resource-group-title">${groupName}</h4>`;
                }
                resourcesHTML += `<ul class="resource-list">`;
                groups[groupName].forEach(resource => {
                    resourcesHTML += `
                        <li class="resource-item">
                            <span class="resource-icon"><i class="${getResourceIcon(resource.type)}"></i></span>
                            <span class="resource-title">${resource.title}</span>
                            <div class="resource-actions">
                                <button class="resource-btn resource-btn-view" data-resource='${JSON.stringify(resource).replace(/'/g, "&apos;")}'><i class="fas fa-eye"></i> View</button>
                                ${resource.download_storage_path && resource.download_storage_path !== 'None' ?
                            `<button class="resource-btn resource-btn-download" data-resource='${JSON.stringify(resource).replace(/'/g, "&apos;")}'><i class="fas fa-download"></i> Download</button>` :
                            `<span class="resource-btn resource-btn-download disabled"><i class="fas fa-download"></i> Download</span>`
                        }
                            </div>
                        </li>`;
                });
                resourcesHTML += `</ul></div>`;
            }
            DOMElements.tabContents.resources.innerHTML = resourcesHTML;

            DOMElements.tabContents.resources.querySelectorAll('.resource-btn-view').forEach(btn => {
                btn.addEventListener('click', () => handleResourceClick(JSON.parse(btn.dataset.resource)));
            });
            DOMElements.tabContents.resources.querySelectorAll('.resource-btn-download').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    downloadResource(JSON.parse(btn.dataset.resource));
                });
            });
        }
    };

    const setActiveTab = (tabId) => {
        state.activeTab = tabId;
        DOMElements.courseTabsContainer.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        Object.keys(DOMElements.tabContents).forEach(key => {
            DOMElements.tabContents[key].style.display = key === tabId ? 'block' : 'none';
        });
    };

    const getAdjacentVideo = (direction) => {
        if (!state.currentVideoId) return null;
        const allVideos = state.courseSections.map(section => section.videos[0]).filter(Boolean);
        const currentIndex = allVideos.findIndex(video => video.id === state.currentVideoId);
        if (currentIndex === -1) return null;
        if (direction === 'previous' && currentIndex > 0) return allVideos[currentIndex - 1];
        if (direction === 'next' && currentIndex < allVideos.length - 1) return allVideos[currentIndex + 1];
        return null;
    };

    const updateNavButtons = () => {
        DOMElements.prevVideoBtn.disabled = getAdjacentVideo('previous') === null;
        DOMElements.nextVideoBtn.disabled = getAdjacentVideo('next') === null;
    };

    const updateVideoCounter = () => {
        if (!state.currentVideoId) {
            DOMElements.videoCounter.textContent = '';
            return;
        }
        const section = state.courseSections.find(s => s.videos.some(v => v.id === state.currentVideoId));
        if (section) {
            DOMElements.videoCounter.textContent = `Day ${section.day_number} of ${state.courseSections.length}`;
        }
    };

    const handleResourceClick = async (resource) => {
        // Define all sheets that should open in the embedded viewer
        const specialSheetUrls = [
            'https://docs.google.com/spreadsheets/d/1NcACOrX0PsQCQ3P4b80EvGsI1fFxW8wlC-6y258HE-Y/edit?gid=1269177841#gid=1269177841',
            'https://docs.google.com/spreadsheets/d/1vVVFbHawgCnr01_-eSVQLiSa3TZ9yuB00fgmNPZKZJc/edit?gid=1309949710#gid=1309949710'
        ];

        if (specialSheetUrls.includes(resource.url)) {
            await openResourceViewer(resource, 'iframe');
            return;
        }

        if (resource.type === 'external_link' && resource.url) {
            window.open(resource.url, '_blank');
            return;
        }
        if (resource.view_storage_path && resource.view_storage_path !== 'None') {
            const path = resource.view_storage_path.toLowerCase();
            if (path.endsWith('.csv')) await openResourceViewer(resource, 'csv');
            else await openResourceViewer(resource, 'pdf');
            return;
        }
        downloadResource(resource);
    };

    const downloadResource = async (resource) => {
        const path = resource.download_storage_path;
        if (!path || path === 'None') {
            DOMElements.noDownloadPopup.classList.add('active');
            return;
        }
        try {
            const { data, error } = await supabase.storage.from('industrial-training-mastery-resources').createSignedUrl(path, 300);
            if (error) throw error;
            const response = await fetch(data.signedUrl);
            if (!response.ok) throw new Error('Network response was not ok.');
            const blob = await response.blob();
            const filename = path.split('/').pop() || 'download';
            if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === 'function') {
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = function () {
                    const base64Content = reader.result.split(',')[1];
                    window.flutter_inappwebview.callHandler('blobToBase64Handler', base64Content, filename)
                        .then(result => console.log("Saved to app"))
                        .catch(err => {
                            console.error("App save failed:", err);
                            alert("The app could not save the file to your device storage.");
                        });
                };
            } else {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = filename;
                document.body.appendChild(a); a.click();
                window.URL.revokeObjectURL(url); a.remove();
            }
        } catch (err) {
            console.error('Download error:', err);
            alert('Could not download the file. Please try again.');
        }
    };

    const openResourceViewer = async (resource, type) => {
        state.pdfDoc = null; state.csvData = null; state.pdfCurrentPage = 1; state.pdfTotalPages = 1;
        const ctx = DOMElements.pdfCanvas.getContext('2d');
        ctx.clearRect(0, 0, DOMElements.pdfCanvas.width, DOMElements.pdfCanvas.height);

        DOMElements.viewerLoadingScreen.style.display = 'flex';
        DOMElements.resourceViewerModal.classList.add('visible');
        state.currentResource = resource;
        state.previewType = type;
        DOMElements.resourceViewerTitle.textContent = resource.title;

        DOMElements.pdfViewerContainer.style.display = 'none';
        DOMElements.csvViewerContainer.style.display = 'none';
        DOMElements.iframeViewerContainer.style.display = 'none';

        DOMElements.resourceViewerModal.querySelector('.resource-viewer-controls').style.display = type === 'iframe' ? 'none' : 'flex';

        try {
            if (type === 'iframe') {
                const matches = resource.url.match(/\/d\/([a-zA-Z0-9-_]+)/);
                const sheetId = matches ? matches[1] : '';
                const gidMatch = resource.url.match(/[#&]gid=([0-9]+)/);
                const gid = gidMatch ? gidMatch[1] : '';

                if (sheetId) {
                    let embedUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/pubhtml?widget=true&headers=false&chrome=false`;
                    if (gid) {
                        embedUrl += `&gid=${gid}&single=true`;
                    }
                    DOMElements.resourceIframe.src = embedUrl;
                    DOMElements.iframeViewerContainer.style.display = 'block';
                    DOMElements.viewerLoadingScreen.style.display = 'none';
                } else {
                    alert("Invalid Sheet URL");
                    closeResourceViewer();
                }
                return;
            }

            const { data, error } = await supabase.storage.from('industrial-training-mastery-resources').createSignedUrl(resource.view_storage_path, 300);
            if (error) throw error;
            const response = await fetch(`https://pdf-proxy-viewer.bhansalimanan55.workers.dev/?url=${encodeURIComponent(data.signedUrl)}`);
            if (!response.ok) throw new Error(`Failed to fetch from proxy: ${response.status}`);

            if (type === 'pdf') {
                const pdfData = await response.arrayBuffer();
                state.pdfDoc = await pdfjsLib.getDocument(pdfData).promise;
                state.pdfTotalPages = state.pdfDoc.numPages;
                DOMElements.pdfViewerContainer.style.display = 'block';
                await renderPdfPage(1);
            } else if (type === 'csv') {
                const csvText = await response.text();
                Papa.parse(csvText, {
                    skipEmptyLines: true,
                    complete: function (results) {
                        const data = results.data;
                        const table = DOMElements.csvViewerContainer.querySelector('table');
                        table.innerHTML = '';

                        if (data.length === 0) {
                            table.innerHTML = '<tbody><tr><td style="text-align:center; padding: 2rem;">No data found in CSV</td></tr></tbody>';
                            return;
                        }

                        const thead = document.createElement('thead');
                        const headerRow = document.createElement('tr');
                        data[0].forEach(cell => {
                            const th = document.createElement('th');
                            th.textContent = cell;
                            headerRow.appendChild(th);
                        });
                        thead.appendChild(headerRow);
                        table.appendChild(thead);

                        const tbody = document.createElement('tbody');
                        for (let i = 1; i < data.length; i++) {
                            const row = document.createElement('tr');
                            data[i].forEach(cell => {
                                const td = document.createElement('td');
                                td.textContent = cell;
                                td.title = cell;
                                row.appendChild(td);
                            });
                            tbody.appendChild(row);
                        }
                        table.appendChild(tbody);
                    },
                    error: function (err) {
                        console.error("CSV Parse Error:", err);
                        const table = DOMElements.csvViewerContainer.querySelector('table');
                        table.innerHTML = '<tbody><tr><td style="color:red; padding:1rem;">Error parsing CSV file.</td></tr></tbody>';
                    }
                });

                DOMElements.csvViewerContainer.style.display = 'block';
            }
        } catch (err) {
            alert("Could not load the resource for viewing.");
            closeResourceViewer();
        } finally {
            DOMElements.viewerLoadingScreen.style.display = 'none';
        }
    };

    const renderPdfPage = async (num) => {
        if (!state.pdfDoc) return;
        state.pdfCurrentPage = num;
        const page = await state.pdfDoc.getPage(num);
        const canvas = DOMElements.pdfCanvas;
        const ctx = canvas.getContext('2d');
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        drawWatermark(canvas, ctx);

        DOMElements.pdfPageInfo.textContent = `Page ${state.pdfCurrentPage} of ${state.pdfTotalPages}`;
        DOMElements.pdfPrevPage.disabled = state.pdfCurrentPage <= 1;
        DOMElements.pdfNextPage.disabled = state.pdfCurrentPage >= state.pdfTotalPages;
    };

    const drawWatermark = (canvas, ctx) => {
        const watermarkText = state.user ? state.user.email : 'MyStudentClub';
        ctx.font = '20px Arial'; ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const x_step = 250, y_step = 150;
        ctx.save();
        for (let y = y_step / 2; y < canvas.height; y += y_step) {
            for (let x = x_step / 2; x < canvas.width; x += x_step) {
                ctx.save(); ctx.translate(x, y); ctx.rotate(-Math.PI / 4);
                ctx.fillText(watermarkText, 0, 0); ctx.restore();
            }
        }
        ctx.restore();
    };

    const closeResourceViewer = () => {
        if (state.isFullscreen) toggleFullscreen();
        DOMElements.resourceViewerModal.classList.remove('visible');
        DOMElements.resourceIframe.src = 'about:blank';
        DOMElements.resourceViewerModal.querySelector('.resource-viewer-controls').style.display = 'flex';
        state.pdfDoc = null; state.currentResource = null; state.previewType = null;
    };

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            DOMElements.viewerContent.requestFullscreen().catch(err => {
                alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        } else {
            document.exitFullscreen();
        }
    };

    const formatTime = (timeInSeconds) => {
        if (isNaN(timeInSeconds)) return '00:00';
        const time = Math.max(0, timeInSeconds);
        const hours = Math.floor(time / 3600);
        const minutes = Math.floor((time % 3600) / 60).toString().padStart(2, '0');
        const seconds = Math.floor(time % 60).toString().padStart(2, '0');
        return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
    };

    const attemptReload = () => {
        if (state.retryCount < state.maxRetries) {
            state.retryCount++;
            const delay = Math.pow(2, state.retryCount) * 1000;
            setTimeout(() => {
                DOMElements.videoLoadingOverlay.style.display = 'flex';
                const currentTime = DOMElements.videoPlayer.currentTime;
                DOMElements.videoPlayer.load();
                const p = DOMElements.videoPlayer.play();
                if (p !== undefined) {
                    p.then(() => {
                        DOMElements.videoPlayer.currentTime = currentTime;
                    }).catch(() => { });
                }
            }, delay);
        } else {
            alert("Failed to load the video after multiple attempts. Please check your connection or try again later.");
        }
    };

    const setupEventListeners = () => {
        DOMElements.hamburgerMenu.addEventListener('click', () => DOMElements.navLinks.classList.toggle('active'));
        DOMElements.logoutButton.addEventListener('click', async () => {
            await supabase.auth.signOut();
            window.location.href = 'https://www.mystudentclub.com/login';
        });

        const cvDismissBtn = document.getElementById('cv-popup-dismiss-btn');
        if (cvDismissBtn) {
            cvDismissBtn.addEventListener('click', dismissCVPopup);
        }
        DOMElements.enrollRedirectBtn.addEventListener('click', () => {
            window.location.href = 'https://www.mystudentclub.com/login';
        });
        DOMElements.sidebarToggleBtn.addEventListener('click', () => DOMElements.courseSidebar.classList.add('active'));
        DOMElements.sidebarCloseBtn.addEventListener('click', () => DOMElements.courseSidebar.classList.remove('active'));

        DOMElements.prevVideoBtn.addEventListener('click', () => { const v = getAdjacentVideo('previous'); if (v) selectVideo(v.id); });
        DOMElements.nextVideoBtn.addEventListener('click', () => { const v = getAdjacentVideo('next'); if (v) selectVideo(v.id); });

        DOMElements.postCommentBtn.addEventListener('click', async () => {
            const content = DOMElements.newCommentInput.value.trim();
            if (!content || !state.user) return;
            DOMElements.postCommentBtn.disabled = true; DOMElements.postCommentBtn.textContent = 'Posting...';
            try {
                const { data, error } = await supabase.from('video_comments').insert({
                    course_slug: state.courseSlug, video_id: state.currentVideoId.toString(),
                    user_id: state.user.id, user_email: state.user.email, content: content
                }).select();
                if (error) throw error;
                DOMElements.newCommentInput.value = '';
                await fetchComments();
            } catch (error) {
                alert('Failed to post comment. Please try again.');
            } finally {
                DOMElements.postCommentBtn.disabled = false; DOMElements.postCommentBtn.textContent = 'Post';
            }
        });

        DOMElements.submitReportBtn.addEventListener('click', async () => {
            const description = DOMElements.reportDescriptionInput.value.trim();
            if (!description || !state.user) return;
            DOMElements.submitReportBtn.disabled = true; DOMElements.submitReportBtn.textContent = 'Submitting...';
            try {
                const { error } = await supabase.from('course_reports').insert({
                    user_id: state.user.id, course_slug: state.courseSlug, description, page_url: window.location.href
                });
                if (error) throw error;
                alert('Report submitted successfully. We will look into it.');
                DOMElements.reportDescriptionInput.value = '';
                setActiveTab('overview');
            } catch (error) {
                alert('Failed to submit report.');
            } finally {
                DOMElements.submitReportBtn.disabled = false; DOMElements.submitReportBtn.textContent = 'Submit Report';
            }
        });

        DOMElements.viewerCloseBtn.addEventListener('click', closeResourceViewer);
        DOMElements.viewerFullscreenBtn.addEventListener('click', toggleFullscreen);
        DOMElements.pdfPrevPage.addEventListener('click', () => { if (state.pdfCurrentPage > 1) renderPdfPage(state.pdfCurrentPage - 1); });
        DOMElements.pdfNextPage.addEventListener('click', () => { if (state.pdfCurrentPage < state.pdfTotalPages) renderPdfPage(state.pdfCurrentPage + 1); });
        DOMElements.viewerDownloadBtn.addEventListener('click', () => { if (state.currentResource) downloadResource(state.currentResource) });

        if (DOMElements.closeNoDownloadBtn) {
            DOMElements.closeNoDownloadBtn.addEventListener('click', () => {
                DOMElements.noDownloadPopup.classList.remove('active');
            });
        }

        const video = DOMElements.videoPlayer;

        // Initialize Plyr video player
        state.plyrPlayer = new Plyr(video, {
            controls: ['play-large', 'rewind', 'play', 'fast-forward', 'progress', 'current-time', 'mute', 'volume', 'settings', 'fullscreen'],
            settings: ['speed'],
            speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
            seekTime: 10,
            keyboard: { focused: true, global: true },
            tooltips: { controls: true, seek: true },
            hideControls: true,
            clickToPlay: true, // Enable tap/click to play/pause
            resetOnEnd: false
        });

        // Debounce seeking to prevent 429 errors
        const seekInput = state.plyrPlayer.elements.inputs.seek;
        let seekTimeout;

        if (seekInput) {
            seekInput.addEventListener('input', (e) => {
                // Stop Plyr from updating video immediately
                e.stopImmediatePropagation();

                // 1. Visually update the slider thumb/fill
                const value = e.target.value;
                // Plyr uses CSS variables for the progress fill
                e.target.style.setProperty('--value', `${value}%`);

                // 2. Debounce the actual video seek
                clearTimeout(seekTimeout);
                seekTimeout = setTimeout(() => {
                    const duration = state.plyrPlayer.duration;
                    if (duration) {
                        state.plyrPlayer.currentTime = (value / 100) * duration;
                    }
                }, 700); // Wait 700ms before requesting new frame
            }, { capture: true });
        }

        // Debounce forward/rewind buttons to prevent 429 loops
        const plyrContainer = state.plyrPlayer.elements.container;
        let seekAccumulator = 0;
        let buttonSeekTimeout;

        if (plyrContainer) {
            plyrContainer.addEventListener('click', (e) => {
                // Find if the click target is a rewind/forward button (or inside one)
                const target = e.target.closest('button[data-plyr="rewind"], button[data-plyr="fast-forward"]');

                if (target) {
                    // Prevent Plyr's default handler
                    e.preventDefault();
                    e.stopImmediatePropagation();

                    const isRewind = target.getAttribute('data-plyr') === 'rewind';
                    // Default seek time is 10s as per config
                    const seekStep = 10;

                    seekAccumulator += isRewind ? -seekStep : seekStep;

                    clearTimeout(buttonSeekTimeout);
                    buttonSeekTimeout = setTimeout(() => {
                        if (state.plyrPlayer.duration) {
                            state.plyrPlayer.currentTime = Math.max(0, Math.min(state.plyrPlayer.duration, state.plyrPlayer.currentTime + seekAccumulator));
                        }
                        seekAccumulator = 0;
                    }, 700); // Wait 700ms to accumulate clicks
                    return;
                }
            }, { capture: true });
        }

        // Plyr events for state tracking
        state.plyrPlayer.on('play', () => { state.isPlaying = true; });
        state.plyrPlayer.on('pause', () => { state.isPlaying = false; });
        state.plyrPlayer.on('ended', markVideoCompleted);
        state.plyrPlayer.on('enterfullscreen', () => { state.isFullscreen = true; });
        state.plyrPlayer.on('exitfullscreen', () => { state.isFullscreen = false; });

        // Keep loading overlay logic
        video.addEventListener('loadedmetadata', () => {
            DOMElements.videoLoadingOverlay.style.display = 'none';
            state.retryCount = 0;
            const virtualStartTime = state.videoStartTimes[state.currentVideoId] || 0;
            if (virtualStartTime > 0 && video.currentTime < virtualStartTime) {
                video.currentTime = virtualStartTime;
            }
        });
        video.addEventListener('waiting', () => DOMElements.videoLoadingOverlay.style.display = 'flex');
        video.addEventListener('playing', () => DOMElements.videoLoadingOverlay.style.display = 'none');

        // Error handling with retry
        video.addEventListener('error', () => {
            if (video.error && (video.error.code === 2 || video.error.code === 3 || video.error.code === 4)) {
                DOMElements.videoLoadingOverlay.style.display = 'flex';
                setTimeout(() => { attemptReload(); }, 2000);
            } else {
                DOMElements.videoLoadingOverlay.style.display = 'none';
            }
        });

        window.onerror = (msg, url, line, col, error) => logFrontendError(msg, error ? error.stack : `Line: ${line}, Col: ${col}`, url);
        window.addEventListener('unhandledrejection', (event) => {
            let errorMessage = 'Unhandled Promise Rejection';
            let errorStack = '';
            if (event.reason) {
                errorMessage = event.reason.message || (typeof event.reason === 'string' ? event.reason : JSON.stringify(event.reason));
                errorStack = event.reason.stack || '';
            }
            logFrontendError(errorMessage, errorStack, 'Promise Rejection');
        });
    };

    const init = async () => {
        const urlParams = new URLSearchParams(window.location.search);
        state.courseSlug = urlParams.get('course');
        if (!state.courseSlug || !courses[state.courseSlug]) {
            window.location.href = 'index.html';
            return;
        }
        state.course = { ...courses[state.courseSlug], progress: 0 };

        DOMElements.courseTitle.textContent = state.course.title;
        DOMElements.courseDescription.textContent = state.course.description;
        DOMElements.courseHeaderBanner.style.background = `linear-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.55)), url('${state.course.thumbnail}')`;
        DOMElements.courseHeaderBanner.style.backgroundSize = 'cover';
        DOMElements.courseHeaderBanner.style.backgroundPosition = 'center';

        DOMElements.enrollCourseTitle.textContent = state.course.title;
        DOMElements.enrollCourseThumbnail.src = state.course.thumbnail;

        setupEventListeners();
        await checkAuth();

        supabase.auth.onAuthStateChange(async (_event, session) => {
            if (session && session.user) {
                state.user = session.user;
                DOMElements.userDisplayName.textContent = session.user.user_metadata?.first_name || session.user.email.split('@')[0];
                DOMElements.profileDropdownName.textContent = session.user.user_metadata?.full_name || session.user.email;
                DOMElements.profileDropdownEmail.textContent = session.user.email;
                if (!state.isEnrolled) await checkEnrollment();
            } else {
                window.location.href = 'https://www.mystudentclub.com/login';
            }
        });
    };

    init();
});