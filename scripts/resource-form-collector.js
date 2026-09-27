/** Resource access uses the shared intake, scoped to the current account and category. */
(function (global) {
  'use strict';
  let careerReady;
  function loadCareerProfile() {
    if (global.MSCCareerProfile) return Promise.resolve(global.MSCCareerProfile);
    if (!careerReady) careerReady = new Promise((resolve,reject) => {
      const script=document.createElement('script');script.src='/scripts/career-profile.js';
      script.onload=()=>resolve(global.MSCCareerProfile);script.onerror=()=>reject(new Error('Unable to load the form. Please reload and try again.'));
      document.head.appendChild(script);
    });
    return careerReady;
  }
  class ResourceFormCollector {
    constructor(programType) { this.programType=programType;this.attachEventListeners(); }
    static detectProgramType() {
      const declaredStage=document.body?.dataset.resourceStage;
      if(['industrial-training','ca-fresher','articleship','semi-qualified'].includes(declaredStage))return declaredStage;
      const path=location.pathname.toLowerCase();
      if(path.includes('semi-qualified'))return 'semi-qualified';
      if(path.includes('industrial-training'))return 'industrial-training';
      if(path.includes('articleship'))return 'articleship';
      if(path.includes('fresher'))return 'ca-fresher';
      return 'ca-fresher';
    }
    async checkAndAccess(title,url,successCallback) {
      try {
        const career=await loadCareerProfile();
        if(await career.ensureForResource(this.programType,title,url)) { await successCallback();return true; }
      } catch(error) {
        this.showError(error.message || 'Unable to access this resource. Please try again.');
      }
      return false;
    }
    showError(message) {
      let notice=document.getElementById('resource-access-error');
      if(!notice) {notice=document.createElement('p');notice.id='resource-access-error';notice.setAttribute('role','alert');notice.style.cssText='position:fixed;bottom:90px;left:50%;transform:translateX(-50%);max-width:90vw;padding:16px 22px;background:#fff1f2;color:#9f1239;border:1px solid #fecdd3;border-radius:10px;z-index:20001';document.body.appendChild(notice);}
      notice.textContent=message;
      setTimeout(()=>notice.remove(),10000);
    }
    attachEventListeners() {
      document.addEventListener('click',event=>{
        const link=event.target.closest('a[href]');
        if(!link || link.dataset.noIntercept==='true' || link.closest('[data-premium="true"]') || !this.isResourceLink(link.href))return;
        event.preventDefault();
        const title=link.closest('.resource-card')?.querySelector('.resource-title,h3')?.textContent?.trim() || link.title || link.textContent.trim() || 'Resource';
        this.checkAndAccess(title,link.href,()=>this.openResource(link.href,link.hasAttribute('download'),link.download));
      });
    }
    isResourceLink(url) {
      try { const target=new URL(url,location.origin);return /(^|\.)(drive\.google\.com|docs\.google\.com|dropbox\.com|onedrive\.com)$/.test(target.hostname) || /\.(pdf|docx?|xlsx?|pptx?)$/i.test(target.pathname); } catch(_) {return false;}
    }
    showForm(title,url,link,isDownload=false) {return this.checkAndAccess(title,url,()=>this.openResource(url,isDownload,link?.download));}
    openResource(url,forceDownload=false,filename='') {
      if(!url)return;
      if(forceDownload){
        const link=document.createElement('a');link.href=url;
        let name=filename || new URL(url,location.origin).pathname.split('/').pop() || 'Resource';
        try{name=decodeURIComponent(name);}catch(_){}
        link.download=name;link.dataset.noIntercept='true';link.hidden=true;document.body.appendChild(link);link.click();link.remove();return;
      }
      const path=new URL(url,location.origin).pathname;
      const target=/\.pdf$/i.test(path)?`/ca-resource/index.html?pdf=${encodeURIComponent(url)}`:url;
      global.open(target,'_blank','noopener,noreferrer');
    }
  }
  global.ResourceFormCollector=ResourceFormCollector;
  const init=()=>{global.resourceFormCollector=new ResourceFormCollector(ResourceFormCollector.detectProgramType());};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
