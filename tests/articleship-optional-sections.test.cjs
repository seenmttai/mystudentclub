const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '..', 'articleship-program', 'app.js'), 'utf8');

function loadSection(name, nextName, html = '') {
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  const { window } = dom;
  const intervals = [];
  window.setInterval = (callback, delay) => {
    intervals.push({ callback, delay });
    return intervals.length;
  };
  window.clearInterval = () => {};
  const start = source.indexOf(`const ${name} =`);
  const end = source.indexOf(`const ${nextName} =`, start);
  assert(start >= 0 && end > start, 'initializer should be available');
  window.eval(`${source.slice(start, end)}\nwindow.initializeSection = ${name};`);
  return { window, document: window.document, intervals };
}

test('absent optional countdown and testimonial sections do not throw or start timers', () => {
  for (const [name, next] of [
    ['initializeCountdown', 'initializeLinkedInPosts'],
    ['initializeTestimonials', 'initializeCertificate'],
  ]) {
    const section = loadSection(name, next);
    assert.doesNotThrow(() => section.window.initializeSection());
    assert.equal(section.intervals.length, 0);
    section.window.close();
  }
});

test('present countdown renders immediately and schedules one update per second', () => {
  const section = loadSection('initializeCountdown', 'initializeLinkedInPosts', '<span id="timer"></span>');
  section.window.initializeSection();
  assert.match(section.document.querySelector('#timer').textContent, /^\d+h \d+m \d+s$/);
  assert.equal(section.intervals.length, 1);
  assert.equal(section.intervals[0].delay, 1000);
  assert.doesNotThrow(() => section.intervals[0].callback());
  section.window.close();
});

test('testimonials work with optional navigation buttons and retain next/previous behavior', () => {
  const section = loadSection('initializeTestimonials', 'initializeCertificate', `
    <div class="testimonials-container"><div class="testimonials-content"></div></div>
    <button class="prev-button">Previous</button><button class="next-button">Next</button>`);
  section.window.initializeSection();
  const content = section.document.querySelector('.testimonials-content');
  assert(content.children.length > 1);
  section.document.querySelector('.next-button').click();
  assert.equal(content.style.transform, 'translateX(-100%)');
  section.document.querySelector('.prev-button').click();
  assert.equal(content.style.transform, 'translateX(-0%)');
  section.window.close();

  const withoutControls = loadSection('initializeTestimonials', 'initializeCertificate',
    '<div class="testimonials-container"><div class="testimonials-content"></div></div>');
  assert.doesNotThrow(() => withoutControls.window.initializeSection());
  assert(withoutControls.document.querySelector('.testimonials-content').children.length > 1);
  assert.equal(withoutControls.intervals.length, 1);
  withoutControls.window.close();
});
