/* MSC Articleship Program · Written test practice: charts.
 * Draws a paper's chart stimulus ({kind: bar|line|pie, unit, categories, series, stacked?, labels?}) as an SVG
 * string. The test page calls it in the browser; the PDF builder calls it through Node, so a chart looks the
 * same in both. Pure: no DOM, no globals. UMD: window.WrittenTestCharts or require().
 *
 *   WrittenTestCharts.render(chart, {width, fontSize, surface, title, id})
 *     -> {svg, height, needsTable, summary}
 * width / fontSize are in SVG units (the page passes CSS pixels; the PDF passes units that print 12 pt or more).
 * needsTable = some values could not be labelled without collisions: show the data as a table as well.
 * Palette: validated for colour-vision deficiency on white and on the notebook paper (adjacent pairs, the pie's
 * last-to-first pair included). Identity never rests on colour alone: legends, direct labels, marker shapes.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WrittenTestCharts = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PALETTE = ['#0057FF', '#E5487F', '#168048', '#7A5AF0', '#B07A00', '#009E9E'];
  var INK = '#1F2A3D';
  var MUTED = '#5B6474';
  var GRID = 'rgba(6,21,47,0.14)';
  var AXIS = 'rgba(6,21,47,0.45)';
  var FONT = 'Nunito, system-ui, sans-serif';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function r1(x) { return Math.round(x * 10) / 10; }

  /* Indian digit grouping: 125000 -> 1,25,000; decimals kept (up to 2). */
  function fmt(v) {
    if (typeof v !== 'number' || !isFinite(v)) return String(v);
    var neg = v < 0;
    var a = Math.abs(v);
    var s = (Math.round(a * 100) / 100).toString();
    var parts = s.split('.');
    var whole = parts[0];
    if (whole.length > 3) {
      var head = whole.slice(0, -3);
      var tail = whole.slice(-3);
      head = head.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
      whole = head + ',' + tail;
    }
    return (neg ? '−' : '') + whole + (parts[1] ? '.' + parts[1] : '');
  }

  /* Width of a string in Nunito, estimated per character class (em units). Generous on purpose. */
  function textWidth(s, fs) {
    var w = 0;
    String(s).split('').forEach(function (ch) {
      if (/[0-9]/.test(ch)) w += 0.6;
      else if (/[A-Z₹]/.test(ch)) w += 0.7;
      else if (/[mwMW]/.test(ch)) w += 0.85;
      else if (/[iljtf.,:;'’!| ]/.test(ch)) w += 0.3;
      else if (/[a-z]/.test(ch)) w += 0.55;
      else w += 0.6;
    });
    return w * fs;
  }

  function niceStep(span, count) {
    var raw = span / Math.max(count, 1);
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var n = raw / mag;
    var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * mag;
  }

  /* Ticks from lo to hi covering [min, max]; zero included unless the data sit far from it (lines only). */
  function ticks(min, max, count, allowOffZero) {
    var lo = Math.min(0, min);
    var hi = Math.max(0, max);
    if (allowOffZero && min > 0 && (max - min) < 0.45 * max) lo = min - (max - min) * 0.35;
    if (hi === lo) hi = lo + 1;
    var step = niceStep(hi - lo, count);
    lo = Math.floor(lo / step + 1e-9) * step;
    hi = Math.ceil(hi / step - 1e-9) * step;
    if (allowOffZero && lo < 0 && min >= 0) lo = 0;
    var out = [];
    for (var v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return { lo: lo, hi: hi, step: step, list: out };
  }

  function text(x, y, s, fs, o) {
    o = o || {};
    return '<text x="' + r1(x) + '" y="' + r1(y) + '" font-size="' + r1(fs) + '"' +
      (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') +
      ' fill="' + (o.fill || INK) + '"' + (o.weight ? ' font-weight="' + o.weight + '"' : '') +
      (o.transform ? ' transform="' + o.transform + '"' : '') + '>' + esc(s) + '</text>';
  }

  /* A bar with a 4-unit rounded data end and a square base. Vertical: base at y0, end at y1. */
  function barPath(x, w, y0, y1, horizontal) {
    var rad = Math.min(4, w / 2, Math.abs(y1 - y0));
    if (!horizontal) {
      var up = y1 < y0;
      var e = y1;
      if (up) {
        return 'M' + r1(x) + ',' + r1(y0) + 'V' + r1(e + rad) + 'Q' + r1(x) + ',' + r1(e) + ' ' + r1(x + rad) + ',' + r1(e) +
          'H' + r1(x + w - rad) + 'Q' + r1(x + w) + ',' + r1(e) + ' ' + r1(x + w) + ',' + r1(e + rad) + 'V' + r1(y0) + 'Z';
      }
      return 'M' + r1(x) + ',' + r1(y0) + 'V' + r1(e - rad) + 'Q' + r1(x) + ',' + r1(e) + ' ' + r1(x + rad) + ',' + r1(e) +
        'H' + r1(x + w - rad) + 'Q' + r1(x + w) + ',' + r1(e) + ' ' + r1(x + w) + ',' + r1(e - rad) + 'V' + r1(y0) + 'Z';
    }
    // horizontal: x = top edge, w = thickness, y0 = base x, y1 = end x
    var right = y1 > y0;
    var t = x;
    var b = x + w;
    if (right) {
      return 'M' + r1(y0) + ',' + r1(t) + 'H' + r1(y1 - rad) + 'Q' + r1(y1) + ',' + r1(t) + ' ' + r1(y1) + ',' + r1(t + rad) +
        'V' + r1(b - rad) + 'Q' + r1(y1) + ',' + r1(b) + ' ' + r1(y1 - rad) + ',' + r1(b) + 'H' + r1(y0) + 'Z';
    }
    return 'M' + r1(y0) + ',' + r1(t) + 'H' + r1(y1 + rad) + 'Q' + r1(y1) + ',' + r1(t) + ' ' + r1(y1) + ',' + r1(t + rad) +
      'V' + r1(b - rad) + 'Q' + r1(y1) + ',' + r1(b) + ' ' + r1(y1 + rad) + ',' + r1(b) + 'H' + r1(y0) + 'Z';
  }

  function marker(shape, x, y, color, surface, rad) {
    var ring = ' stroke="' + surface + '" stroke-width="2"';
    if (shape === 1) return '<rect x="' + r1(x - rad) + '" y="' + r1(y - rad) + '" width="' + r1(2 * rad) + '" height="' + r1(2 * rad) + '" fill="' + color + '"' + ring + '/>';
    if (shape === 2) return '<polygon points="' + r1(x) + ',' + r1(y - rad * 1.25) + ' ' + r1(x + rad * 1.15) + ',' + r1(y + rad * 0.85) + ' ' + r1(x - rad * 1.15) + ',' + r1(y + rad * 0.85) + '" fill="' + color + '"' + ring + '/>';
    if (shape === 3) return '<polygon points="' + r1(x) + ',' + r1(y - rad * 1.3) + ' ' + r1(x + rad * 1.3) + ',' + r1(y) + ' ' + r1(x) + ',' + r1(y + rad * 1.3) + ' ' + r1(x - rad * 1.3) + ',' + r1(y) + '" fill="' + color + '"' + ring + '/>';
    return '<circle cx="' + r1(x) + '" cy="' + r1(y) + '" r="' + r1(rad) + '" fill="' + color + '"' + ring + '/>';
  }

  /* Legend: swatch + name, wrapping into rows. kind: 'bar' (rounded square), 'line' (line + marker). */
  function legend(series, kind, x0, y0, width, fs, surface) {
    var items = series.map(function (s, i) {
      return { name: s.name, color: PALETTE[i % PALETTE.length], i: i, w: fs * 1.6 + textWidth(s.name, fs) + fs * 1.2 };
    });
    var rows = [[]];
    var used = 0;
    items.forEach(function (it) {
      if (used + it.w > width && rows[rows.length - 1].length) { rows.push([]); used = 0; }
      rows[rows.length - 1].push(it);
      used += it.w;
    });
    var out = '';
    var lh = fs * 1.5;
    rows.forEach(function (row, ri) {
      var x = x0;
      var y = y0 + ri * lh + fs * 0.9;
      row.forEach(function (it) {
        if (kind === 'line') {
          out += '<line x1="' + r1(x) + '" y1="' + r1(y - fs * 0.32) + '" x2="' + r1(x + fs * 1.2) + '" y2="' + r1(y - fs * 0.32) + '" stroke="' + it.color + '" stroke-width="2" stroke-linecap="round"/>';
          out += marker(it.i % 4, x + fs * 0.6, y - fs * 0.32, it.color, surface, fs * 0.26);
        } else {
          out += '<rect x="' + r1(x) + '" y="' + r1(y - fs * 0.78) + '" width="' + r1(fs * 0.9) + '" height="' + r1(fs * 0.9) + '" rx="' + r1(fs * 0.18) + '" fill="' + it.color + '"/>';
        }
        out += text(x + fs * 1.6, y, it.name, fs, { fill: INK });
        x += it.w;
      });
    });
    return { svg: out, height: rows.length * lh + fs * 0.3 };
  }

  function wrap2(label, maxW, fs) {
    if (textWidth(label, fs) <= maxW) return [label];
    var words = String(label).split(' ');
    if (words.length < 2) return null;
    for (var k = words.length - 1; k > 0; k--) {
      var a = words.slice(0, k).join(' ');
      var b = words.slice(k).join(' ');
      if (textWidth(a, fs) <= maxW && textWidth(b, fs) <= maxW) return [a, b];
    }
    return null;
  }

  function summaryOf(chart, title) {
    var head = (title ? title + '. ' : '') + ({ bar: 'Bar chart', line: 'Line chart', pie: 'Pie chart' }[chart.kind] || 'Chart') +
      (chart.unit ? ', ' + chart.unit : '') + '. ';
    var body = chart.categories.map(function (c, i) {
      return c + ': ' + chart.series.map(function (s) {
        return (chart.series.length > 1 ? s.name + ' ' : '') + fmt(s.values[i]);
      }).join(', ');
    }).join('; ');
    return head + body + '.';
  }

  // ------------------------------------------------------------------ bar
  function bar(chart, o) {
    var W = o.width;
    var fs = o.fontSize;
    var cats = chart.categories;
    var series = chart.series;
    var stacked = !!chart.stacked;
    var showValues = chart.labels !== 'none';
    var nS = stacked ? 1 : series.length;
    var gap = 2;
    var maxBar = Math.max(24, fs * 1.6);
    var all = [];
    series.forEach(function (s) { all = all.concat(s.values); });
    var totals = cats.map(function (_, i) { return series.reduce(function (a, s) { return a + s.values[i]; }, 0); });
    var vmin = stacked ? 0 : Math.min.apply(null, all);
    var vmax = stacked ? Math.max.apply(null, totals) : Math.max.apply(null, all);
    var tk = ticks(vmin, vmax, 5, false);
    var tickW = Math.max.apply(null, tk.list.map(function (t) { return textWidth(fmt(t), fs * 0.9); }));
    var leg = series.length > 1 ? legend(series, 'bar', 0, 0, W, fs, o.surface) : { svg: '', height: 0 };
    var unitH = chart.unit ? fs * 1.5 : fs * 0.4;
    var padL = tickW + fs * 0.7;
    var padR = fs * 0.5;
    var plotW = W - padL - padR;
    var groupW = plotW / cats.length;
    var inner = groupW * (nS > 1 ? 0.8 : 0.62);
    var bw = Math.min(maxBar, (inner - gap * (nS - 1)) / nS);
    var valueLabels = [];
    var labelFits = true;
    if (showValues) {
      cats.forEach(function (_, i) {
        if (stacked) {
          if (textWidth(fmt(totals[i]), fs * 0.9) > groupW - 4) labelFits = false;
        } else {
          series.forEach(function (s) {
            if (textWidth(fmt(s.values[i]), fs * 0.9) > bw + gap + (nS === 1 ? groupW - bw - 4 : 0)) labelFits = false;
          });
        }
      });
    }
    var catLines = cats.map(function (c) { return wrap2(c, groupW - 4, fs * 0.9); });
    var vertical = bw >= Math.max(10, fs * 0.6) && labelFits && catLines.every(function (l) { return l; }) &&
      !(o.horizontal === true);
    if (!vertical) return hbar(chart, o, tk, leg, unitH, totals);

    var lines = Math.max.apply(null, catLines.map(function (l) { return l.length; }));
    var top = leg.height + unitH + (showValues ? fs * 1.3 : fs * 0.5);
    var plotH = o.plotRatio ? W * o.plotRatio : Math.max(fs * 9, Math.min(W * 0.5, fs * 17));
    var bottom = fs * 0.6 + lines * fs * 1.15 + fs * 0.4;
    var H = top + plotH + bottom;
    var y = function (v) { return top + plotH - (v - tk.lo) / (tk.hi - tk.lo) * plotH; };
    var out = [];
    var needsTable = false;
    out.push(leg.svg);
    if (chart.unit) out.push(text(0, leg.height + fs * 1.0, chart.unit, fs * 0.9, { fill: MUTED, weight: 600 }));
    tk.list.forEach(function (t) {
      out.push('<line x1="' + r1(padL) + '" y1="' + r1(y(t)) + '" x2="' + r1(W - padR) + '" y2="' + r1(y(t)) + '" stroke="' + (t === 0 ? AXIS : GRID) + '" stroke-width="1"/>');
      out.push(text(padL - fs * 0.4, y(t) + fs * 0.32, fmt(t), fs * 0.9, { anchor: 'end', fill: MUTED }));
    });
    cats.forEach(function (c, i) {
      var gx = padL + i * groupW;
      var cx = gx + groupW / 2;
      var span = nS * bw + gap * (nS - 1);
      if (stacked) {
        var acc = 0;
        series.forEach(function (s, si) {
          var v = s.values[i];
          if (v <= 0) return;
          var y0 = y(acc);
          var y1 = y(acc + v) + (si > 0 ? 0 : 0);
          var isTop = series.slice(si + 1).every(function (t) { return t.values[i] <= 0; });
          var segTop = y1;
          var segBase = y0 - (acc > 0 ? gap : 0);
          var d = isTop ? barPath(cx - bw / 2, bw, segBase, segTop, false) :
            'M' + r1(cx - bw / 2) + ',' + r1(segBase) + 'V' + r1(segTop) + 'H' + r1(cx + bw / 2) + 'V' + r1(segBase) + 'Z';
          out.push('<path d="' + d + '" fill="' + PALETTE[si % PALETTE.length] + '"><title>' + esc(c + ', ' + s.name + ': ' + fmt(v)) + '</title></path>');
          if (showValues) {
            var lab = fmt(v);
            if (segBase - segTop >= fs * 1.25 && textWidth(lab, fs * 0.85) <= bw - 4) {
              out.push(text(cx, (segBase + segTop) / 2 + fs * 0.3, lab, fs * 0.85, { anchor: 'middle', fill: '#FFFFFF', weight: 700 }));
            } else {
              needsTable = true;
            }
          }
          acc += v;
        });
        if (showValues) out.push(text(cx, y(totals[i]) - fs * 0.35, fmt(totals[i]), fs * 0.9, { anchor: 'middle', weight: 700 }));
      } else {
        series.forEach(function (s, si) {
          var v = s.values[i];
          var x = cx - span / 2 + si * (bw + gap);
          var d = barPath(x, bw, y(0), y(v), false);
          out.push('<path d="' + d + '" fill="' + PALETTE[si % PALETTE.length] + '"><title>' + esc(c + (series.length > 1 ? ', ' + s.name : '') + ': ' + fmt(v)) + '</title></path>');
          if (showValues) {
            var ly = v >= 0 ? y(v) - fs * 0.35 : y(v) + fs * 1.0;
            out.push(text(x + bw / 2, ly, fmt(v), fs * 0.9, { anchor: 'middle', weight: 700 }));
          }
        });
      }
      catLines[i].forEach(function (ln, li) {
        out.push(text(cx, top + plotH + fs * 1.15 + li * fs * 1.15, ln, fs * 0.9, { anchor: 'middle', fill: INK }));
      });
    });
    return { svg: wrapSvg(out.join(''), W, H, o), height: H, needsTable: needsTable };
  }

  function hbar(chart, o, tk, leg, unitH, totals) {
    var W = o.width;
    var fs = o.fontSize;
    var cats = chart.categories;
    var series = chart.series;
    var stacked = !!chart.stacked;
    var showValues = chart.labels !== 'none';
    var nS = stacked ? 1 : series.length;
    var gap = 2;
    var bt = Math.min(Math.max(16, fs * 1.15), 24 * Math.max(1, fs / 14));
    var maxLabel = W * 0.36;
    var catLines = cats.map(function (c) { return wrap2(c, maxLabel, fs * 0.9) || [c]; });
    var labelW = Math.min(maxLabel, Math.max.apply(null, catLines.map(function (l) {
      return Math.max.apply(null, l.map(function (s) { return textWidth(s, fs * 0.9); }));
    })));
    var vals = [];
    series.forEach(function (s) { vals = vals.concat(s.values); });
    var valW = showValues ? Math.max.apply(null, (stacked ? totals : vals).map(function (v) { return textWidth(fmt(v), fs * 0.9); })) + fs * 0.5 : fs * 0.5;
    var padL = labelW + fs * 0.7;
    var plotW = W - padL - valW;
    var top = leg.height + unitH + fs * 0.2;
    var rowH = nS * bt + gap * (nS - 1);
    var rowGap = fs * 0.9;
    var plotH = cats.length * rowH + (cats.length - 1) * rowGap + fs * 0.8;
    var H = top + plotH + fs * 1.6;
    var x = function (v) { return padL + (v - tk.lo) / (tk.hi - tk.lo) * plotW; };
    var out = [];
    var needsTable = false;
    out.push(leg.svg);
    if (chart.unit) out.push(text(0, leg.height + fs * 1.0, chart.unit, fs * 0.9, { fill: MUTED, weight: 600 }));
    tk.list.forEach(function (t) {
      out.push('<line x1="' + r1(x(t)) + '" y1="' + r1(top) + '" x2="' + r1(x(t)) + '" y2="' + r1(top + plotH) + '" stroke="' + (t === 0 ? AXIS : GRID) + '" stroke-width="1"/>');
      out.push(text(x(t), top + plotH + fs * 1.2, fmt(t), fs * 0.85, { anchor: 'middle', fill: MUTED }));
    });
    cats.forEach(function (c, i) {
      var ry = top + fs * 0.4 + i * (rowH + rowGap);
      var ls = catLines[i];
      ls.forEach(function (ln, li) {
        out.push(text(padL - fs * 0.5, ry + rowH / 2 + fs * 0.32 + (li - (ls.length - 1) / 2) * fs * 1.1, ln, fs * 0.9, { anchor: 'end' }));
      });
      if (stacked) {
        var acc = 0;
        series.forEach(function (s, si) {
          var v = s.values[i];
          if (v <= 0) return;
          var isLast = series.slice(si + 1).every(function (t) { return t.values[i] <= 0; });
          var x0 = x(acc) + (acc > 0 ? gap : 0);
          var x1 = x(acc + v);
          var d = isLast ? barPath(ry, bt, x0, x1, true) :
            'M' + r1(x0) + ',' + r1(ry) + 'H' + r1(x1) + 'V' + r1(ry + bt) + 'H' + r1(x0) + 'Z';
          out.push('<path d="' + d + '" fill="' + PALETTE[si % PALETTE.length] + '"><title>' + esc(c + ', ' + s.name + ': ' + fmt(v)) + '</title></path>');
          if (showValues) {
            var lab = fmt(v);
            if (x1 - x0 >= textWidth(lab, fs * 0.85) + 6) out.push(text((x0 + x1) / 2, ry + bt / 2 + fs * 0.3, lab, fs * 0.85, { anchor: 'middle', fill: '#FFFFFF', weight: 700 }));
            else needsTable = true;
          }
          acc += v;
        });
        if (showValues) out.push(text(x(totals[i]) + fs * 0.35, ry + bt / 2 + fs * 0.32, fmt(totals[i]), fs * 0.9, { weight: 700 }));
      } else {
        series.forEach(function (s, si) {
          var v = s.values[i];
          var by = ry + si * (bt + gap);
          out.push('<path d="' + barPath(by, bt, x(0), x(v), true) + '" fill="' + PALETTE[si % PALETTE.length] + '"><title>' + esc(c + (series.length > 1 ? ', ' + s.name : '') + ': ' + fmt(v)) + '</title></path>');
          if (showValues) {
            if (v >= 0) out.push(text(x(v) + fs * 0.35, by + bt / 2 + fs * 0.32, fmt(v), fs * 0.9, { weight: 700 }));
            else out.push(text(x(v) - fs * 0.35, by + bt / 2 + fs * 0.32, fmt(v), fs * 0.9, { anchor: 'end', weight: 700 }));
          }
        });
      }
    });
    return { svg: wrapSvg(out.join(''), W, H, o), height: H, needsTable: needsTable };
  }

  // ------------------------------------------------------------------ line
  function line(chart, o) {
    var W = o.width;
    var fs = o.fontSize;
    var cats = chart.categories;
    var series = chart.series;
    var showValues = chart.labels !== 'none';
    var all = [];
    series.forEach(function (s) { all = all.concat(s.values); });
    var tk = ticks(Math.min.apply(null, all), Math.max.apply(null, all), 5, true);
    var tickW = Math.max.apply(null, tk.list.map(function (t) { return textWidth(fmt(t), fs * 0.9); }));
    var leg = series.length > 1 ? legend(series, 'line', 0, 0, W, fs, o.surface) : { svg: '', height: 0 };
    var unitH = chart.unit ? fs * 1.5 : fs * 0.4;
    var padL = tickW + fs * 0.7;
    var maxVal = Math.max.apply(null, all.map(function (v) { return textWidth(fmt(v), fs * 0.85); }));
    var maxCat = Math.max.apply(null, cats.map(function (c) { return textWidth(c, fs * 0.9); }));
    var firstCat = textWidth(cats[0], fs * 0.9);
    var lastCat = textWidth(cats[cats.length - 1], fs * 0.9);
    // points sit inside the plot, so the first and last labels never touch the axis or the edge
    var insetL = Math.max(fs * 1.2, maxVal / 2 + fs * 0.4, firstCat / 2 + 2);
    var insetR = Math.max(fs * 1.2, maxVal / 2 + fs * 0.2, lastCat / 2 + 2);
    var step = (W - padL - insetL - insetR) / Math.max(cats.length - 1, 1);
    var rotate = maxCat > step - 6 && cats.length > 1;
    if (rotate) {
      insetL = Math.max(insetL, firstCat * 0.8 - padL + 4);
      insetR = Math.max(fs * 1.2, maxVal / 2 + fs * 0.2);
      step = (W - padL - insetL - insetR) / Math.max(cats.length - 1, 1);
    }
    var padR = 0;
    var x = function (i) { return cats.length === 1 ? (padL + W) / 2 : padL + insetL + i * step; };
    var top = leg.height + unitH + fs * 1.3;
    var plotH = o.plotRatio ? W * o.plotRatio : Math.max(fs * 9, Math.min(W * 0.48, fs * 16));
    var bottom = rotate ? maxCat * 0.62 + fs * 1.4 : fs * 1.9;
    var H = top + plotH + bottom;
    var y = function (v) { return top + plotH - (v - tk.lo) / (tk.hi - tk.lo) * plotH; };
    var out = [];
    out.push(leg.svg);
    if (chart.unit) out.push(text(0, leg.height + fs * 1.0, chart.unit, fs * 0.9, { fill: MUTED, weight: 600 }));
    tk.list.forEach(function (t) {
      out.push('<line x1="' + r1(padL) + '" y1="' + r1(y(t)) + '" x2="' + r1(W - padR) + '" y2="' + r1(y(t)) + '" stroke="' + (t === tk.lo ? AXIS : GRID) + '" stroke-width="1"/>');
      out.push(text(padL - fs * 0.4, y(t) + fs * 0.32, fmt(t), fs * 0.9, { anchor: 'end', fill: MUTED }));
    });
    cats.forEach(function (c, i) {
      if (rotate) out.push(text(x(i), top + plotH + fs * 1.1, c, fs * 0.9, { anchor: 'end', transform: 'rotate(-38 ' + r1(x(i)) + ' ' + r1(top + plotH + fs * 1.1) + ')' }));
      else out.push(text(x(i), top + plotH + fs * 1.35, c, fs * 0.9, { anchor: 'middle' }));
    });
    var labels = [];
    series.forEach(function (s, si) {
      var col = PALETTE[si % PALETTE.length];
      var pts = s.values.map(function (v, i) { return r1(x(i)) + ',' + r1(y(v)); }).join(' ');
      out.push('<polyline points="' + pts + '" fill="none" stroke="' + col + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>');
    });
    series.forEach(function (s, si) {
      var col = PALETTE[si % PALETTE.length];
      s.values.forEach(function (v, i) {
        out.push('<g>' + marker(si % 4, x(i), y(v), col, o.surface, Math.max(4.5, fs * 0.3)) + '<title>' + esc(cats[i] + (series.length > 1 ? ', ' + s.name : '') + ': ' + fmt(v)) + '</title></g>');
        if (showValues) {
          var others = series.map(function (t) { return t.values[i]; });
          var below = series.length > 1 && v === Math.min.apply(null, others) && others.filter(function (t) { return t === v; }).length === 1;
          if (series.length === 1) {
            var prev = i > 0 ? s.values[i - 1] : null;
            var next = i < s.values.length - 1 ? s.values[i + 1] : null;
            below = prev !== null && next !== null && v < prev && v < next && y(v) + fs * 1.6 < top + plotH;
          }
          var ly = below ? y(v) + fs * 1.45 : y(v) - fs * 0.65;
          var lw = textWidth(fmt(v), fs * 0.85);
          labels.push({ x: x(i) - lw / 2, y: ly - fs * 0.8, w: lw, h: fs * 0.95, s: text(x(i), ly, fmt(v), fs * 0.85, { anchor: 'middle', weight: 700 }) });
        }
      });
    });
    var collide = false;
    for (var a = 0; a < labels.length && !collide; a++) {
      for (var b = a + 1; b < labels.length; b++) {
        var A = labels[a];
        var B = labels[b];
        if (A.x < B.x + B.w + 2 && B.x < A.x + A.w + 2 && A.y < B.y + B.h && B.y < A.y + A.h) { collide = true; break; }
      }
    }
    if (!collide) labels.forEach(function (l) { out.push(l.s); });
    return { svg: wrapSvg(out.join(''), W, H, o), height: H, needsTable: showValues && collide };
  }

  // ------------------------------------------------------------------ pie
  function pie(chart, o) {
    var W = o.width;
    var fs = o.fontSize;
    var cats = chart.categories;
    var vals = chart.series[0].values;
    var total = vals.reduce(function (a, b) { return a + b; }, 0);
    var mode = chart.labels || 'value';
    var unitH = chart.unit ? fs * 1.6 : fs * 0.4;
    var pct = function (v) {
      var p = v / total * 100;
      return (Math.abs(p - Math.round(p)) < 0.05 ? String(Math.round(p)) : p.toFixed(1)) + '%';
    };
    var lab = cats.map(function (c, i) {
      var v = vals[i];
      if (mode === 'none') return [c];
      if (mode === 'percent') return [c, pct(v)];
      if (mode === 'both') return [c, fmt(v) + ' (' + pct(v) + ')'];
      return [c, fmt(v)];
    });
    var lw = Math.max.apply(null, lab.map(function (l) { return Math.max(textWidth(l[0], fs * 0.9), l[1] ? textWidth(l[1], fs * 0.9) : 0); }));
    var lead = fs * 1.4;
    var r = Math.min((W - 2 * (lw + lead + fs * 0.4)) / 2, fs * (o.pieRadius || 7.5));
    var listMode = r < fs * 3.6;
    if (listMode) r = Math.min(W * 0.32, fs * 6);
    var cx = W / 2;
    var lineH = fs * 1.05;
    var blockH = (mode === 'none' ? 1 : 2) * lineH;
    var out = [];
    if (chart.unit) out.push(text(0, fs * 1.0, chart.unit, fs * 0.9, { fill: MUTED, weight: 600 }));
    // slice geometry: start at 12 o'clock, clockwise, in data order
    var a0 = -Math.PI / 2;
    var slices = vals.map(function (v, i) {
      var a1 = a0 + (v / total) * Math.PI * 2;
      var s = { i: i, a0: a0, a1: a1, mid: (a0 + a1) / 2, v: v };
      a0 = a1;
      return s;
    });
    // labels: two columns, spread so they never overlap
    var left = [];
    var right = [];
    slices.forEach(function (s) {
      if (s.v <= 0) return;
      (Math.cos(s.mid) >= 0 ? right : left).push(s);
    });
    var cyGuess = unitH + Math.max(r, blockH) + fs * 0.6;
    function place(col) {
      col.forEach(function (s) { s.ly = cyGuess + Math.sin(s.mid) * (r + lead * 0.6); });
      col.sort(function (p, q) { return p.ly - q.ly; });
      for (var k = 1; k < col.length; k++) {
        if (col[k].ly - col[k - 1].ly < blockH + fs * 0.25) col[k].ly = col[k - 1].ly + blockH + fs * 0.25;
      }
    }
    var cy = cyGuess;
    var H;
    if (!listMode) {
      place(left);
      place(right);
      var minY = Math.min.apply(null, left.concat(right).map(function (s) { return s.ly - lineH; }).concat([cy - r]));
      var shift = Math.max(0, unitH + fs * 0.4 - minY);
      cy += shift;
      left.concat(right).forEach(function (s) { s.ly += shift; });
      var maxY = Math.max.apply(null, left.concat(right).map(function (s) { return s.ly + blockH; }).concat([cy + r]));
      H = maxY + fs * 0.8;
    } else {
      H = cy + r + fs * 1.2 + cats.length * fs * 1.5;
    }
    slices.forEach(function (s) {
      if (s.v <= 0) return;
      var col = PALETTE[s.i % PALETTE.length];
      var d;
      if (s.a1 - s.a0 >= Math.PI * 2 - 1e-9) {
        d = 'M' + r1(cx - r) + ',' + r1(cy) + 'A' + r1(r) + ',' + r1(r) + ' 0 1 1 ' + r1(cx + r) + ',' + r1(cy) + 'A' + r1(r) + ',' + r1(r) + ' 0 1 1 ' + r1(cx - r) + ',' + r1(cy) + 'Z';
      } else {
        var large = s.a1 - s.a0 > Math.PI ? 1 : 0;
        d = 'M' + r1(cx) + ',' + r1(cy) + 'L' + r1(cx + r * Math.cos(s.a0)) + ',' + r1(cy + r * Math.sin(s.a0)) +
          'A' + r1(r) + ',' + r1(r) + ' 0 ' + large + ' 1 ' + r1(cx + r * Math.cos(s.a1)) + ',' + r1(cy + r * Math.sin(s.a1)) + 'Z';
      }
      out.push('<path d="' + d + '" fill="' + col + '" stroke="' + o.surface + '" stroke-width="2" stroke-linejoin="round"><title>' + esc(cats[s.i] + ': ' + fmt(s.v) + ' (' + pct(s.v) + ')') + '</title></path>');
    });
    if (!listMode) {
      [[left, -1], [right, 1]].forEach(function (pair) {
        pair[0].forEach(function (s) {
          var ex = cx + Math.cos(s.mid) * r;
          var ey = cy + Math.sin(s.mid) * r;
          var kx = cx + pair[1] * (r + lead * 0.7);
          var tx = cx + pair[1] * (r + lead);
          var ty = s.ly;
          out.push('<polyline points="' + r1(ex) + ',' + r1(ey) + ' ' + r1(kx) + ',' + r1(ty - fs * 0.3) + ' ' + r1(tx - pair[1] * fs * 0.25) + ',' + r1(ty - fs * 0.3) + '" fill="none" stroke="' + AXIS + '" stroke-width="1"/>');
          var anchor = pair[1] > 0 ? 'start' : 'end';
          var l = lab[s.i];
          out.push(text(tx, ty, l[0], fs * 0.9, { anchor: anchor, weight: 600 }));
          if (l[1]) out.push(text(tx, ty + lineH, l[1], fs * 0.9, { anchor: anchor, weight: 700 }));
        });
      });
    } else {
      var ky = cy + r + fs * 1.6;
      cats.forEach(function (c, i) {
        var yy = ky + i * fs * 1.5;
        out.push('<rect x="' + r1(fs * 0.2) + '" y="' + r1(yy - fs * 0.78) + '" width="' + r1(fs * 0.9) + '" height="' + r1(fs * 0.9) + '" rx="' + r1(fs * 0.18) + '" fill="' + PALETTE[i % PALETTE.length] + '"/>');
        out.push(text(fs * 1.6, yy, lab[i].join('  '), fs * 0.9, { weight: 600 }));
      });
    }
    return { svg: wrapSvg(out.join(''), W, H, o), height: H, needsTable: false };
  }

  function wrapSvg(body, W, H, o) {
    var id = o.id ? ' id="' + esc(o.id) + '"' : '';
    var label = o.summary ? ' role="img" aria-label="' + esc(o.summary) + '"' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg"' + id + ' class="wt-chart" viewBox="0 0 ' + r1(W) + ' ' + r1(H) + '" width="' + r1(W) + '" height="' + r1(H) + '"' + label +
      ' font-family="' + FONT + '">' + body + '</svg>';
  }

  function render(chart, opts) {
    var o = {
      width: 620, fontSize: 16, surface: '#FFFFFF', title: '', id: '', horizontal: false
    };
    Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
    var summary = summaryOf(chart, o.title);
    o.summary = summary;
    var res = chart.kind === 'line' ? line(chart, o) : chart.kind === 'pie' ? pie(chart, o) : bar(chart, o);
    res.summary = summary;
    return res;
  }

  /* The chart's numbers as a table: {columns, rows} (the page's "Show as table" and the PDF fallback). */
  function table(chart) {
    if (chart.kind === 'pie') {
      var total = chart.series[0].values.reduce(function (a, b) { return a + b; }, 0);
      return {
        columns: ['', chart.unit ? chart.series[0].name + ' (' + chart.unit + ')' : chart.series[0].name],
        rows: chart.categories.map(function (c, i) { return [c, fmt(chart.series[0].values[i])]; }),
        total: fmt(total)
      };
    }
    return {
      columns: [''].concat(chart.series.map(function (s) { return s.name + (chart.unit && chart.series.length === 1 ? ' (' + chart.unit + ')' : ''); })),
      rows: chart.categories.map(function (c, i) { return [c].concat(chart.series.map(function (s) { return fmt(s.values[i]); })); })
    };
  }

  /* Sizes the two callers use. PDF: the chart fills the 164 mm text column, so 600 units = 465 pt and the
   * smallest label (0.85 em of 19) prints at 12.5 pt. Page: CSS pixels of the box it sits in. */
  var PDF = { width: 600, fontSize: 19, surface: '#FFF8EC', plotRatio: 0.34, pieRadius: 5.6 };
  var WEB = { fontSize: 15, surface: '#FFFFFF' };

  return { render: render, table: table, fmt: fmt, ticks: ticks, textWidth: textWidth, PALETTE: PALETTE, PDF: PDF, WEB: WEB };
}));
