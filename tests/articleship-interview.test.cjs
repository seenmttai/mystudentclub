const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const articleship = require('../scripts/articleship-interview.js');

test('articleship requests always describe a new article assistant', () => {
    const original = { positionApplied: 'CA Articleship', experienceLevel: 'Senior', interviewDomain: 'Direct Tax' };
    const normalized = articleship.normalizeConfig(original);
    assert.equal(normalized.experienceLevel, 'Fresher');
    assert.equal(normalized.interviewDomain, 'Direct Tax');
    assert.equal(original.experienceLevel, 'Senior');
    const prompt = articleship.getInstructions(normalized);
    assert.match(prompt, /cleared CA Intermediate/);
    assert.match(prompt, /Do not assume prior articleship/);
    assert.match(prompt, /one short question at a time/);
    assert.match(prompt, /If no CV is supplied/);
    assert.match(prompt, /honest response/);
});

test('other roles retain their existing configuration and prompt', () => {
    for (const positionApplied of ['Industrial Trainee', 'CA Fresher', 'Other Finance Role']) {
        const config = { positionApplied, experienceLevel: 'Senior' };
        assert.equal(articleship.normalizeConfig(config), config);
        assert.equal(articleship.getInstructions(config), '');
    }
});

test('programme link selects articleship and leaving it restores other-role defaults', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'ai-interview.html'), 'utf8');
    const start = html.indexOf("        const posSelect = document.getElementById('positionApplied');");
    const end = html.indexOf('\n        // CV Upload Preview', start);
    assert.ok(start !== -1 && end > start);
    const fields = {
        positionApplied: { value: 'Industrial Trainee', addEventListener(type, handler) { this.onChange = handler; } },
        'exp-group': { hidden: false, classList: { toggle(name, value) { fields['exp-group'].hidden = value; } } },
        companyType: { value: 'Corporate' },
        interviewDomain: { value: 'FP&A / Corporate Finance' }
    };
    vm.runInNewContext(html.slice(start, end), {
        document: { getElementById: id => fields[id] },
        window: { MSCArticleshipInterview: articleship, location: { search: '?mode=articleship' } },
        URLSearchParams
    });
    assert.equal(fields.positionApplied.value, 'CA Articleship');
    assert.equal(fields['exp-group'].hidden, true);
    assert.equal(fields.companyType.value, 'Mid-Size');
    assert.equal(fields.interviewDomain.value, 'Statutory Audit');
    fields.positionApplied.value = 'Industrial Trainee';
    fields.positionApplied.onChange();
    assert.equal(fields['exp-group'].hidden, false);
    assert.equal(fields.companyType.value, 'Corporate');
    assert.equal(fields.interviewDomain.value, 'FP&A / Corporate Finance');
});
