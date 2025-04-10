import { updateHeaderAuth } from './portal.js';

const supabaseClient = supabase.createClient('https://izsggdtdiacxdsjjncdq.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0');

window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (session) {
    window.location.href = '/';
  }

  const menuButton = document.getElementById('menuButton');
  const expandedMenu = document.getElementById('expandedMenu');
  const menuCloseBtn = document.getElementById('menuCloseBtn');

  menuButton.addEventListener('click', () => { 
    expandedMenu.classList.toggle('active') 
  });

  menuCloseBtn.addEventListener('click', () => { 
    expandedMenu.classList.remove('active') 
  });

  document.addEventListener('click', (e) => { 
    if (!expandedMenu.contains(e.target) && !menuButton.contains(e.target) && expandedMenu.classList.contains('active')) {
      expandedMenu.classList.remove('active') 
    }
  });

  const resourcesBtn = document.getElementById('resourcesDropdownBtn');
  const resourcesDropdown = document.getElementById('resourcesDropdown');
  const dropdownIcon = resourcesBtn.querySelector('.dropdown-icon');

  resourcesBtn.addEventListener('click', (e) => {
    e.preventDefault();
    resourcesDropdown.classList.toggle('active');
    dropdownIcon.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!resourcesBtn.contains(e.target) && !resourcesDropdown.contains(e.target)) {
      resourcesDropdown.classList.remove('active');
      dropdownIcon.classList.remove('open');
    }
  });
});

const loginForm = document.getElementById('login-form');
const errorMessage = document.getElementById('error-message');
const loginButton = loginForm.querySelector('.login-btn');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  loginButton.classList.add('loading');
  errorMessage.classList.remove('show');

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) {
      throw error;
    }

    window.location.href = '/';

  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.classList.add('show');
    loginButton.classList.remove('loading');
  }
});