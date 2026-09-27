/* Keep each page's original header and controls; add the requested links in place. */
(function () {
  'use strict';
  if (window.self !== window.top || window.MSCNativeNavigation) return;
  window.MSCNativeNavigation = true;
  const groups = [
    ['Free Resources', [['Industrial Training', '/ca-industrial-training-resources'], ['Articleship', '/articleship-resources'], ['CA Fresher', '/ca-fresher-training-resources'], ['Semi-Qualified CA', '/semi-qualified-ca-resources']]],
    ['Tools', [['CV Builder', '/cv-builder/'], ['CV Reviewer', '/cv-reviewer/'], ['AI Interview Bot', '/ai-interview']]],
    ['Programs', [['MSC Industrial Training Program', '/ca-industrial-training-program/'], ['MSC Articleship Program', '/articleship-program/'], ['MSC CA Fresher Program', '/msc-ca-fresher-program/']]]
  ];
  const menus = [];
  const make = (tag, className, text) => { const node=document.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node; };
  function link(label,url,className) {const node=make('a',className,label);node.href=url;return node;}
  function group(label, links, desktop) {
    const node=make('details','msc-native-group');
    const summary=make('summary',desktop ? 'dv2-nav-link msc-native-link' : 'menu-item msc-native-link',label);
    summary.append(make('span','msc-native-chevron','⌄'));
    const items=make('div','msc-native-dropdown');
    links.forEach(([name,url])=>items.append(link(name,url,'msc-native-item')));
    node.append(summary,items);return node;
  }
  function navigation(desktop=false, nativeAccount=false) {
    const nav=make('nav',desktop ? 'msc-native-nav msc-native-desktop' : 'msc-native-nav msc-native-drawer');
    nav.setAttribute('aria-label','Main navigation');
    const cls=desktop ? 'dv2-nav-link msc-native-link' : 'menu-item msc-native-link';
    nav.append(link('Jobs','/',cls));
    groups.forEach(([name,items])=>nav.append(group(name,items,desktop)));
    nav.append(link('For Recruiters','https://hire.mystudentclub.com',cls));
    const courses=link('My Courses','/learning-management-system/',cls+' msc-native-member');courses.hidden=true;nav.append(courses);
    if (!desktop || !nativeAccount) {
      const account=group('My Account',[['My Profile','/profile.html'],['My Applications','/history.html'],['Complete Profile','/profile.html?onboarding=1']],desktop);
      account.classList.add('msc-native-member');account.hidden=true;
      const logout=make('button','msc-native-item msc-native-logout','Log out');logout.type='button';
      const error=make('p','msc-native-auth-error');error.setAttribute('role','alert');error.hidden=true;
      account.querySelector('.msc-native-dropdown').append(logout,error);nav.append(account);
      nav.append(link('Sign Up / Login','/login.html',cls+' msc-native-login'));
    }
    menus.push(nav);return nav;
  }
  function compact(host) {
    if(!host)return;
    const details=make('details','msc-native-compact');
    const trigger=make('summary','msc-native-compact-trigger','Menu');
    trigger.append(make('span','msc-native-chevron','⌄'));
    details.append(trigger,navigation());host.append(details);
  }
  function enhance() {
    // These old flags hid native headers and shifted tools down underneath a second bar.
    document.documentElement.classList.remove('msc-shared-navigation');
    document.body.classList.remove('msc-needs-header-space');
    const header=document.querySelector('header.site-header,.floating-header');
    const drawer=document.getElementById('expandedMenu');
    const items=drawer?.querySelector('.menu-items-container,.menu-items');
    if(items) {
      // Preserve original IDs/listeners and all page-specific actions (e.g. review history).
      // Only superseded navigation entries are hidden; the original drawer stays intact.
      const replaced=new Set(['/', '/history', '/learning-management-system', '/cv-reviewer', '/cv-builder', '/ai-interview', '/ca-industrial-training-program', '/articleship-program', '/msc-ca-fresher-program', '/ca-fresher-training-resources', '/ca-industrial-training-resources', '/articleship-resources', '/semi-qualified-ca-resources', '/ca-articleship-opportunities']);
      items.querySelectorAll('a[href]').forEach(anchor=>{
        try {const url=new URL(anchor.href,location.href);const pathname=url.pathname.replace(/\.html$/,'').replace(/\/$/,'')||'/';
          if(url.hostname.replace(/^www\./,'')===location.hostname.replace(/^www\./,'') && replaced.has(pathname))anchor.dataset.mscReplacedNav='true';
        }catch(_){}
      });
      items.querySelectorAll('.menu-item-dropdown').forEach(item=>{
        const title=item.querySelector('button,summary')?.textContent.trim();
        if(title && /^(Free Resources|Programs|Tools)\b/.test(title))item.dataset.mscReplacedNav='true';
      });
      items.querySelectorAll('div.menu-item').forEach(item=>{if(/^(Free Resources|Programs|Tools)$/.test(item.textContent.trim()))item.dataset.mscReplacedNav='true';});
      items.prepend(navigation());
      // The restored resource headers have no legacy inline script. Other pages retain theirs.
      if(document.body.dataset.resourceStage) {
        const open=document.getElementById('menuButton'),close=document.getElementById('menuCloseBtn');
        open?.addEventListener('click',()=>drawer.classList.add('active'));
        close?.addEventListener('click',()=>drawer.classList.remove('active'));
      }
      const trigger=document.getElementById('menuButton');
      if(trigger){trigger.setAttribute('aria-controls','expandedMenu');trigger.setAttribute('aria-label','Open menu');
        const sync=()=>trigger.setAttribute('aria-expanded',String(drawer.classList.contains('active')));
        sync();new MutationObserver(sync).observe(drawer,{attributes:true,attributeFilter:['class']});}
    }
    if(header) {
      const existing=header.querySelector('.dv2-header-nav');
      const nativeAccount=Boolean(header.querySelector('.auth-buttons-container,.auth-icon-btn,.auth-buttons'));
      const desktop=navigation(true,nativeAccount);
      if(existing) {existing.replaceChildren(...desktop.childNodes);existing.classList.add('msc-native-nav','msc-native-desktop');menus[menus.indexOf(desktop)]=existing;}
      else {
        const container=header.querySelector('.header-container')||header;
        const actions=container.querySelector('.nav-actions,.header-actions,.auth-buttons');
        if(actions?.parentElement===container)container.insertBefore(desktop,actions);else container.append(desktop);
      }
    } else if(!document.querySelector('.glass-header')) {
      // Apps without a site header get a small menu in an existing toolbar, never another bar.
      const editor=document.querySelector('.editor-header .brand-row');
      const login=document.querySelector('.auth-container .form-panel');
      const signup=document.querySelector('.signup-header > div');
      const setup=document.querySelector('#setup-screen .setup-header');
      if(editor)compact(editor);else if(login){compact(login);login.querySelector(':scope > .msc-native-compact')?.classList.add('msc-native-login-menu');}
      else if(signup)compact(signup);else if(setup)compact(setup);
    }
    document.addEventListener('click',event=>{
      document.querySelectorAll('.msc-native-group[open],.msc-native-compact[open]').forEach(item=>{if(!item.contains(event.target))item.open=false;});
    });
    document.addEventListener('keydown',event=>{
      if(event.key!=='Escape')return;
      const detail=document.activeElement?.closest('.msc-native-group[open],.msc-native-compact[open]')||document.querySelector('.msc-native-group[open],.msc-native-compact[open]');
      if(detail){detail.open=false;detail.querySelector('summary')?.focus();return;}
      if(drawer?.classList.contains('active')){drawer.classList.remove('active');document.getElementById('menuButton')?.focus();}
    });
    return header;
  }
  function loadScript(src) {return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;document.head.append(script);});}
  async function client() {
    if(window.getSupabaseClient)return window.getSupabaseClient();
    if(window.supabaseClient?.auth)return window.supabaseClient;
    if(!window.supabase?.createClient)await loadScript('/scripts/vendor/supabase.js');
    await loadScript('/scripts/supabase-init.js?v=20260927.9');return window.getSupabaseClient();
  }
  function init() {
    const header=enhance();
    client().then(async sb=>{
      const update=session=>{
        menus.forEach(nav=>{nav.querySelectorAll('.msc-native-member').forEach(item=>item.hidden=!session);nav.querySelectorAll('.msc-native-login').forEach(item=>item.hidden=!!session);});
        if(document.body.dataset.resourceStage){const icon=header?.querySelector('.auth-icon-btn');if(icon){icon.href=session?'/profile.html':'/login.html';icon.setAttribute('aria-label',session?'My Account':'Sign Up / Login');}}
      };
      const {data}=await sb.auth.getSession();update(data.session);sb.auth.onAuthStateChange((event,session)=>update(session));
      menus.forEach(nav=>nav.querySelectorAll('.msc-native-logout').forEach(button=>button.addEventListener('click',async()=>{
        const error=button.nextElementSibling;button.disabled=true;error.hidden=true;
        try{const result=await sb.auth.signOut();if(result.error)throw result.error;update(null);location.assign('/');}
        catch(_){error.textContent='Could not log out. Please try again.';error.hidden=false;}
        finally{button.disabled=false;}
      })));
      window.dispatchEvent(new CustomEvent('msc:auth-ready',{detail:{client:sb}}));
      if(!window.MSCCareerProfile)await loadScript('/scripts/career-profile.js?v=20260927.9');
      window.MSCCareerProfile?.initOnboarding?.();
    }).catch(error=>console.warn('MSC account navigation could not initialize:',error.message));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
