/**
 * Resource Form Collector Module
 * Collects student data when resources are accessed
 */

const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
// Configure Supabase client to avoid storage warnings (no auth session needed for anonymous inserts)
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});

class ResourceFormCollector {
    constructor(programType) {
        this.programType = programType; // 'ca-fresher', 'industrial-training', 'articleship'
        this.formSubmitted = new Set(); // Track submitted resources to avoid duplicate prompts
        this.init();
    }

    init() {
        this.createModal();
        this.attachEventListeners();
    }

    /**
     * Detect program type from page URL or title
     */
    static detectProgramType() {
        const path = window.location.pathname.toLowerCase();
        const title = document.title.toLowerCase();
        
        if (path.includes('ca-fresher') || path.includes('fresher-training-resources') || 
            (path.includes('fresher') && !path.includes('semi'))) {
            return 'ca-fresher';
        } else if (path.includes('industrial-training') || path.includes('industrial-training-resources')) {
            return 'industrial-training';
        } else if (path.includes('articleship') || path.includes('articleship-program')) {
            return 'articleship';
        }
        return 'unknown';
    }

    /**
     * Create the modal form HTML
     */
    createModal() {
        const modalHTML = `
            <div id="resourceFormModal" class="resource-form-modal" style="display: none;">
                <div class="resource-form-overlay"></div>
                <div class="resource-form-dialog">
                    <button class="resource-form-close" id="resourceFormClose">&times;</button>
                    <div class="resource-form-header">
                        <h3>Access Resource</h3>
                        <p>Please provide your details to access this resource</p>
                    </div>
                    <form id="resourceForm" class="resource-form">
                        <div class="form-group">
                            <label for="studentName">Full Name <span class="required">*</span></label>
                            <input type="text" id="studentName" name="name" required placeholder="Enter your full name">
                        </div>
                        <div class="form-group">
                            <label for="studentEmail">Email <span class="required">*</span></label>
                            <input type="email" id="studentEmail" name="email" required placeholder="Enter your email">
                        </div>
                        <div class="form-group">
                            <label for="studentPhone">Phone Number <span class="required">*</span></label>
                            <input type="tel" id="studentPhone" name="phone" required placeholder="Enter your phone number" pattern="[0-9]{10}">
                        </div>
                        <div class="form-group">
                            <label for="studentProgram">Program Type</label>
                            <input type="text" id="studentProgram" name="program" readonly value="${this.getProgramDisplayName()}">
                        </div>
                        <div class="form-group">
                            <label for="resourceTitle">Resource</label>
                            <input type="text" id="resourceTitle" name="resource" readonly>
                        </div>
                        <div class="form-actions">
                            <button type="submit" class="btn-submit">Access Resource</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        // Add modal to body if it doesn't exist
        if (!document.getElementById('resourceFormModal')) {
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            this.addModalStyles();
        }
    }

    /**
     * Add CSS styles for the modal
     */
    addModalStyles() {
        if (document.getElementById('resourceFormStyles')) return;

        const styles = `
            <style id="resourceFormStyles">
                .resource-form-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 1rem;
                }
                .resource-form-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(4px);
                }
                .resource-form-dialog {
                    position: relative;
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    max-width: 500px;
                    width: 100%;
                    max-height: 90vh;
                    overflow-y: auto;
                    z-index: 10001;
                    animation: modalSlideIn 0.3s ease-out;
                }
                @keyframes modalSlideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-20px) scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }
                .resource-form-close {
                    position: absolute;
                    top: 1rem;
                    right: 1rem;
                    background: none;
                    border: none;
                    font-size: 2rem;
                    color: #6b7280;
                    cursor: pointer;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 8px;
                    transition: all 0.2s;
                    z-index: 10002;
                }
                .resource-form-close:hover {
                    background: #f3f4f6;
                    color: #1f2937;
                }
                .resource-form-header {
                    padding: 2rem 2rem 1rem;
                    text-align: center;
                    border-bottom: 1px solid #e5e7eb;
                }
                .resource-form-header h3 {
                    margin: 0 0 0.5rem;
                    font-size: 1.5rem;
                    font-weight: 600;
                    color: #1f2937;
                }
                .resource-form-header p {
                    margin: 0;
                    color: #6b7280;
                    font-size: 0.9rem;
                }
                .resource-form {
                    padding: 1.5rem 2rem 2rem;
                }
                .form-group {
                    margin-bottom: 1.25rem;
                }
                .form-group label {
                    display: block;
                    margin-bottom: 0.5rem;
                    font-weight: 500;
                    color: #374151;
                    font-size: 0.9rem;
                }
                .form-group .required {
                    color: #ef4444;
                }
                .form-group input {
                    width: 100%;
                    padding: 0.75rem;
                    border: 2px solid #e5e7eb;
                    border-radius: 8px;
                    font-size: 1rem;
                    transition: all 0.2s;
                    box-sizing: border-box;
                }
                .form-group input:focus {
                    outline: none;
                    border-color: #4f46e5;
                    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
                }
                .form-group input[readonly] {
                    background: #f9fafb;
                    color: #6b7280;
                    cursor: not-allowed;
                }
                .form-actions {
                    margin-top: 1.5rem;
                }
                .btn-submit {
                    width: 100%;
                    padding: 0.875rem 1.5rem;
                    background: #4f46e5;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 1rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .btn-submit:hover {
                    background: #4338ca;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
                }
                .btn-submit:active {
                    transform: translateY(0);
                }
                .btn-submit:disabled {
                    background: #9ca3af;
                    cursor: not-allowed;
                    transform: none;
                }
                @media (max-width: 640px) {
                    .resource-form-dialog {
                        margin: 1rem;
                        max-height: 95vh;
                    }
                    .resource-form-header,
                    .resource-form {
                        padding-left: 1.5rem;
                        padding-right: 1.5rem;
                    }
                }
            </style>
        `;
        document.head.insertAdjacentHTML('beforeend', styles);
    }

    /**
     * Get display name for program type
     */
    getProgramDisplayName() {
        const names = {
            'ca-fresher': 'CA Fresher Training',
            'industrial-training': 'CA Industrial Training',
            'articleship': 'CA Articleship'
        };
        return names[this.programType] || this.programType;
    }

    /**
     * Attach event listeners to resource links
     */
    attachEventListeners() {
        // Use event delegation to handle dynamically added resource links
        document.addEventListener('click', (e) => {
            // Check if clicked element is a resource link
            let resourceLink = e.target.closest('a[href]');
            
            // If clicked element is the link itself, use it directly
            if (!resourceLink && e.target.tagName === 'A') {
                resourceLink = e.target;
            }
            
            // Also check if it's a link within a resource card
            if (!resourceLink) {
                const card = e.target.closest('.resource-card');
                if (card) {
                    resourceLink = card.querySelector('a[href]');
                }
            }
            
            // Check if it's a resource link that should trigger the form
            if (resourceLink && resourceLink.href && this.isResourceLink(resourceLink.href)) {
                const resourceTitle = this.getResourceTitle(resourceLink);
                const resourceUrl = resourceLink.href;

                // Check if we should show the form
                if (!this.formSubmitted.has(resourceUrl)) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showForm(resourceTitle, resourceUrl, resourceLink);
                }
            }
        });

        // Handle form submission
        const form = document.getElementById('resourceForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleSubmit(e));
        }

        // Handle modal close
        const closeBtn = document.getElementById('resourceFormClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideForm());
        }

        // Close on overlay click
        const overlay = document.querySelector('.resource-form-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.hideForm());
        }

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.getElementById('resourceFormModal')?.style.display !== 'none') {
                this.hideForm();
            }
        });
    }

    /**
     * Check if a URL is a resource link (Google Docs, Drive, PDF, local assets, etc.)
     */
    isResourceLink(url) {
        if (!url) return false;
        const lowerUrl = url.toLowerCase();
        // Check for external resource links
        if (lowerUrl.includes('google.com') || 
            lowerUrl.includes('drive.google') || 
            lowerUrl.includes('docs.google') ||
            lowerUrl.includes('dropbox.com') ||
            lowerUrl.includes('onedrive.com')) {
            return true;
        }
        // Check for local asset files (PDF, DOCX, DOC, etc.)
        if (lowerUrl.includes('/assets/') && (
            lowerUrl.endsWith('.pdf') ||
            lowerUrl.endsWith('.docx') ||
            lowerUrl.endsWith('.doc') ||
            lowerUrl.endsWith('.xlsx') ||
            lowerUrl.endsWith('.xls') ||
            lowerUrl.endsWith('.pptx') ||
            lowerUrl.endsWith('.ppt')
        )) {
            return true;
        }
        // Also check for .pdf in any path (not just assets)
        if (lowerUrl.includes('.pdf')) {
            return true;
        }
        return false;
    }

    /**
     * Get resource title from link or parent element
     */
    getResourceTitle(link) {
        // Try to find title in parent card
        const card = link.closest('.resource-card');
        if (card) {
            const titleElement = card.querySelector('.resource-title');
            if (titleElement) {
                return titleElement.textContent.trim();
            }
        }
        // Try to find title attribute
        if (link.title) {
            return link.title;
        }
        // Fallback to link text or URL
        const linkText = link.textContent.trim();
        return linkText || link.href.split('/').pop() || 'Resource';
    }

    /**
     * Show the form modal
     */
    showForm(resourceTitle, resourceUrl, originalLink) {
        const modal = document.getElementById('resourceFormModal');
        const form = document.getElementById('resourceForm');
        const resourceTitleInput = document.getElementById('resourceTitle');
        const programInput = document.getElementById('studentProgram');

        if (!modal || !form) return;

        // Set resource title
        if (resourceTitleInput) {
            resourceTitleInput.value = resourceTitle;
        }

        // Set program type
        if (programInput) {
            programInput.value = this.getProgramDisplayName();
        }

        // Store the original link and URL for later use
        form.dataset.resourceUrl = resourceUrl;
        form.dataset.originalLink = originalLink ? 'true' : 'false';

        // Show modal
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        // Focus on first input
        setTimeout(() => {
            const firstInput = form.querySelector('input[type="text"], input[type="email"]');
            if (firstInput) firstInput.focus();
        }, 100);
    }

    /**
     * Hide the form modal
     */
    hideForm() {
        const modal = document.getElementById('resourceFormModal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    /**
     * Handle form submission
     */
    async handleSubmit(e) {
        e.preventDefault();
        
        const form = e.target;
        const submitBtn = form.querySelector('.btn-submit');
        const formData = new FormData(form);
        
        // Get resource URL from form dataset (not formData)
        const resourceUrl = form.dataset.resourceUrl;
        
        // Validate required data
        if (!resourceUrl) {
            console.error('Resource URL is missing');
            alert('Error: Resource URL is missing. Please try clicking the resource link again.');
            return;
        }

        const name = formData.get('name')?.trim();
        const email = formData.get('email')?.trim();
        const phone = formData.get('phone')?.trim();

        if (!name || !email || !phone) {
            alert('Please fill in all required fields.');
            return;
        }

        const data = {
            name: name,
            email: email,
            phone: phone,
            program_type: this.programType,
            program_display: formData.get('program') || this.getProgramDisplayName(),
            resource_title: formData.get('resource') || 'Unknown Resource',
            resource_url: resourceUrl,
            accessed_at: new Date().toISOString()
        };

        // Disable submit button
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting...';
        }

        try {
            // Save to Supabase
            const { data: insertData, error } = await supabaseClient
                .from('resource_access_logs')
                .insert([data])
                .select();

            if (error) {
                console.error('Error saving resource access:', error);
                // Check if it's a table not found error
                if (error.message && error.message.includes('does not exist')) {
                    console.warn('Table "resource_access_logs" does not exist. Please run the SQL script in Supabase.');
                }
                // Still allow access even if save fails
            } else {
                console.log('Resource access logged successfully:', insertData);
            }

            // Mark as submitted
            this.formSubmitted.add(resourceUrl);

            // Hide form
            this.hideForm();

            // Open the resource
            window.open(resourceUrl, '_blank', 'noopener,noreferrer');

        } catch (error) {
            console.error('Error submitting form:', error);
            // Still allow access even on error
            alert('There was an error saving your information, but you can still access the resource.');
            
            // Mark as submitted to avoid repeated prompts
            this.formSubmitted.add(resourceUrl);
            
            // Hide form and open resource
            this.hideForm();
            window.open(resourceUrl, '_blank', 'noopener,noreferrer');
            
            // Re-enable submit button (though form is hidden)
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Access Resource';
            }
        }
    }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const programType = ResourceFormCollector.detectProgramType();
        window.resourceFormCollector = new ResourceFormCollector(programType);
    });
} else {
    const programType = ResourceFormCollector.detectProgramType();
    window.resourceFormCollector = new ResourceFormCollector(programType);
}
