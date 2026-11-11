/* Ported from the content build's Package C (written-test/tests/charts.test.js): run with node --test from the repo root. */
/* Unit tests for js/written-test-charts.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Charts = require('../articleship-program/written-test/js/written-test-charts.js');

const paper = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'written-test', 'fixture-all.json'), 'utf8'));
const charts = paper.stimuli.filter((s) => s.type === 'chart');

function labels(svg) { return [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]); }

test('every fixture chart renders at phone and print sizes with every value labelled', () => {
  for (const st of charts) {
    for (const size of [{ width: 358, fontSize: 14 }, { width: 620, fontSize: 16 }]) {
      const r = Charts.render(st.chart, { ...size, title: st.title });
      assert.match(r.svg, /^<svg [^>]*viewBox="0 0 [\d.]+ [\d.]+"/);
      assert.ok(!/NaN|undefined|Infinity/.test(r.svg), st.id + ' has no broken numbers');
      assert.ok(r.height > 100 && r.height < 900, st.id + ' height ' + r.height);
      const text = labels(r.svg);
      for (const s of st.chart.series) for (const v of s.values) assert.ok(text.includes(Charts.fmt(v)), `${st.id}: ${v} labelled`);
      for (const c of st.chart.categories) assert.ok(text.some((t) => t.includes(c)), `${st.id}: ${c} labelled`);
      assert.equal(r.needsTable, false);
      assert.ok(r.summary.includes(st.chart.categories[0]));
    }
  }
});

test('the 12 pt rule: print-size text is at least 12 pt when the chart fills the 164 mm column', () => {
  const ptPerUnit = (164 / 25.4 * 72) / Charts.PDF.width;
  for (const st of charts) {
    const r = Charts.render(st.chart, Charts.PDF);
    const sizes = [...r.svg.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
    assert.ok(Math.min(...sizes) * ptPerUnit >= 11.9, st.id + ' smallest ' + Math.min(...sizes) * ptPerUnit);
  }
});

test('two or more series get a legend; one series does not', () => {
  const bar = Charts.render(charts[0].chart, { width: 358, fontSize: 14 });
  assert.ok(labels(bar.svg).includes('2024–25') && labels(bar.svg).includes('2025–26'));
  const line = Charts.render(charts[1].chart, { width: 358, fontSize: 14 });
  assert.ok(!labels(line.svg).includes('Cash'));
});

test('crowded labels fall back to a table rather than overlapping', () => {
  const stacked = { kind: 'bar', stacked: true, unit: '₹ lakh', categories: ['Q1', 'Q2'],
    series: [{ name: 'Audit', values: [40, 45] }, { name: 'Tax', values: [20, 1] }] };
  assert.equal(Charts.render(stacked, { width: 358, fontSize: 14 }).needsTable, true);
  const t = Charts.table(stacked);
  assert.deepEqual(t.columns, ['', 'Audit', 'Tax']);
  assert.deepEqual(t.rows, [['Q1', '40', '20'], ['Q2', '45', '1']]);
});

test('long category names switch a bar chart to horizontal bars', () => {
  const ch = { kind: 'bar', categories: ['Northern region office', 'Southern region office', 'Western', 'Eastern'],
    series: [{ name: 'A', values: [1200, 950, 1430, 800] }, { name: 'B', values: [1320, 1010, 1390, 905] }] };
  const r = Charts.render(ch, { width: 358, fontSize: 14 });
  assert.ok(labels(r.svg).includes('1,320'));
  assert.ok(/text-anchor="end"[^>]*>Western</.test(r.svg), 'categories are row labels');
});

test('pie labels: value, percent, both or names only', () => {
  const pie = charts.find((s) => s.chart.kind === 'pie').chart;
  assert.ok(labels(Charts.render(pie, { width: 620, fontSize: 16 }).svg).includes('8'));
  assert.ok(!labels(Charts.render(pie, { width: 620, fontSize: 16 }).svg).includes('20%'));
  assert.ok(labels(Charts.render({ ...pie, labels: 'percent' }, { width: 620, fontSize: 16 }).svg).includes('20%'));
  assert.ok(labels(Charts.render({ ...pie, labels: 'both' }, { width: 620, fontSize: 16 }).svg).includes('8 (20%)'));
  assert.ok(!labels(Charts.render({ ...pie, labels: 'none' }, { width: 620, fontSize: 16 }).svg).includes('8'));
});

test('Indian grouping and negative values', () => {
  assert.equal(Charts.fmt(1250000), '12,50,000');
  const r = Charts.render({ kind: 'bar', categories: ['2024', '2025'], series: [{ name: 'Profit', values: [12, -4] }] },
    { width: 358, fontSize: 14 });
  assert.ok(labels(r.svg).includes('−4'));
});

test('a chart drawn shorter for print keeps its axis labels apart (fewer ticks, never stacked)', () => {
  // the y-axis labels: right-aligned text left of the plot, at 0.9 of the font size
  const axis = (svg) => [...svg.matchAll(/<text x="[\d.]+" y="([\d.]+)" font-size="([\d.]+)" text-anchor="end" fill="[^"]*">([^<]*)<\/text>/g)]
    .map((m) => ({ y: Number(m[1]), size: Number(m[2]), text: m[3] }));
  const real = { kind: 'line', unit: '₹ lakh', categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    series: [{ name: 'Collections', values: [16, 11, 21, 12, 15, 10] }] };
  const vertical = charts.map((s) => s.chart).filter((c) => c.kind !== 'pie').concat([real, { ...real, kind: 'bar' }]);
  for (const ch of vertical) {
    for (const plotRatio of [undefined, 0.22, 0.17]) {
      const opts = { ...Charts.PDF, ...(plotRatio ? { plotRatio } : {}) };
      const r = Charts.render(ch, opts);
      const ticks = axis(r.svg);
      if (ticks.length < 2) continue;                       // a horizontal bar chart has its values across the width
      for (let i = 1; i < ticks.length; i++) {
        const gap = Math.abs(ticks[i].y - ticks[i - 1].y);
        assert.ok(gap >= ticks[i].size * 1.5 - 0.01, `${ch.kind} at ${plotRatio || 'full'}: ${ticks[i - 1].text} and ${ticks[i].text} are ${gap} apart`);
      }
      if (!plotRatio) assert.ok(ticks.length >= 4, 'a full-size chart keeps its fuller scale');
    }
  }
  // the shortest print of the line above: 0, 10, 20, 30 rather than six labels in a stack
  assert.deepEqual(axis(Charts.render(real, { ...Charts.PDF, plotRatio: 0.17 }).svg).map((t) => t.text), ['0', '10', '20', '30']);
  assert.equal(Charts.render(real, { ...Charts.PDF, plotRatio: 0.17 }).needsTable, false);
});
