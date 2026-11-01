#!/usr/bin/env node
/**
 * Written test practice: rebuild the paper list the page reads (articleship-program/written-test/papers/index.json)
 * from the paper files in that folder. The page lists exactly what index.json lists, so a new paper is:
 *   1. drop <id>.json into articleship-program/written-test/papers/ (the content build publishes it compact);
 *   2. node scripts/articleship-written-test-papers.js          (validates every paper, rewrites index.json);
 *   3. node --test                                               (tests/articleship-written-test.test.cjs checks it).
 * No code change. `--check` only reports (exit 1 when index.json is stale or a paper does not validate).
 * The rows match the content build's build_web.py: the same fields in the same order, rev = first 10 hex characters of
 * the SHA-256 of the file's text, sorted by order then id.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PAPERS = path.join(ROOT, 'articleship-program', 'written-test', 'papers');
const Core = require(path.join(ROOT, 'articleship-program', 'written-test', 'js', 'written-test-core.js'));
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function revOf(text) {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 10);
}

/** { index, errors } for a papers folder: every <id>.json except index.json, validated. */
function buildIndex(dir) {
    const folder = dir || PAPERS;
    const errors = [];
    const entries = [];
    const files = fs.readdirSync(folder).filter(f => f.endsWith('.json') && f !== 'index.json').sort();
    for (const file of files) {
        const id = file.slice(0, -5);
        if (!ID.test(id)) { errors.push(file + ': the file name is not a paper id (such as screening-2.json)'); continue; }
        if (/^fixture/.test(id)) { errors.push(file + ': fixture papers never go on the page'); continue; }
        const text = fs.readFileSync(path.join(folder, file), 'utf8');
        let paper;
        try { paper = JSON.parse(text); } catch (error) { errors.push(file + ': not valid JSON (' + error.message + ')'); continue; }
        const problems = Core.validatePaper(paper);
        if (problems.length) { errors.push(file + ': ' + problems.slice(0, 5).join('; ')); continue; }
        if (paper.id !== id) { errors.push(file + ': its "id" is "' + paper.id + '"; the file must be named ' + paper.id + '.json'); continue; }
        entries.push(Core.manifestEntry(paper, revOf(text)));
    }
    entries.sort((a, b) => (a.order - b.order) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { index: { papers: entries }, errors };
}

function format(index) {
    return JSON.stringify(index, null, 1) + '\n';
}

function main(argv) {
    const check = argv.includes('--check');
    const dirArg = argv.find(a => a !== '--check');
    const dir = dirArg ? path.resolve(dirArg) : PAPERS;
    const { index, errors } = buildIndex(dir);
    if (errors.length) {
        errors.forEach(e => console.error('ERROR ' + e));
        console.error('index.json not ' + (check ? 'checked' : 'written') + ': fix the paper(s) above');
        return 1;
    }
    const file = path.join(dir, 'index.json');
    const want = format(index);
    const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (check) {
        if (have !== want) {
            console.error('index.json is stale: run node scripts/articleship-written-test-papers.js');
            return 1;
        }
        console.log('index.json lists ' + index.papers.length + ' paper(s): ' + index.papers.map(p => p.id).join(', '));
        return 0;
    }
    if (have !== want) fs.writeFileSync(file, want);
    console.log('index.json lists ' + index.papers.length + ' paper(s):');
    index.papers.forEach(p => console.log('  ' + String(p.order).padStart(3) + '  ' + p.id.padEnd(14) + String(p.questions).padStart(4) + ' questions  rev ' + p.rev));
    return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { PAPERS, buildIndex, format, revOf };
