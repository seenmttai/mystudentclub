// Conduct guardrails for the mobile AI interviewer (ai-interview.html + scripts/interview-conduct.js).
// Covers: end-marker parsing/stripping, profanity strikes (warn → end), non-answer detection, silence strikes,
// the natural "completed" path with its client-side floor, reason copy, and the page wiring.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const conduct = require(path.join(root, 'scripts', 'interview-conduct.js'));
const page = fs.readFileSync(path.join(root, 'ai-interview.html'), 'utf8');

// --- Marker parsing ---

test('parses and strips the misconduct end marker from the spoken text', () => {
    const parsed = conduct.parseEndMarker("I'm ending the interview here. Goodbye. [[END_INTERVIEW:misconduct]]");
    assert.equal(parsed.end, true);
    assert.equal(parsed.reason, 'misconduct');
    assert.equal(parsed.text, "I'm ending the interview here. Goodbye.");
    assert.ok(!/\[\[/.test(parsed.text), 'marker must not reach display or TTS');
});

test('maps unresponsive and completed reasons, tolerates spacing/case, defaults unknown reasons to completed', () => {
    assert.equal(conduct.parseEndMarker('Bye. [[ end_interview : UNRESPONSIVE ]]').reason, 'unresponsive');
    assert.equal(conduct.parseEndMarker('Bye. [[END_INTERVIEW:completed]]').reason, 'completed');
    assert.equal(conduct.parseEndMarker('Bye. [[END_INTERVIEW:complete]]').reason, 'completed');
    assert.equal(conduct.parseEndMarker('Bye. [[END_INTERVIEW]]').reason, 'completed');
    assert.equal(conduct.parseEndMarker('Bye. [[END_INTERVIEW:banana]]').reason, 'completed');
});

test('text without a marker is returned unchanged and does not end', () => {
    const parsed = conduct.parseEndMarker('Tell me about a time you handled conflict.');
    assert.deepEqual(parsed, { text: 'Tell me about a time you handled conflict.', end: false, reason: null });
});

// --- Profanity detector ---

test('detects English and Hinglish abuse, including lightly masked words', () => {
    for (const t of ['this is bullshit', 'You are an asshole', 'tu chutiya hai', 'bhenchod kya bol raha', 'f*ck this interview', 'shut up']) {
        assert.equal(conduct.containsProfanity(t), true, t);
    }
});

test('does not flag ordinary words that merely contain profane substrings', () => {
    for (const t of ['I passed my class assessment', 'We used a bass filter and a cocktail shaker', 'Scunthorpe United', 'I felt nervous and gave a weak answer', 'The shipment was late', '']) {
        assert.equal(conduct.containsProfanity(t), false, t);
    }
});

// --- Non-answer detector ---

test('recognises non-answers and keeps real answers', () => {
    for (const t of ['idk', "I don't know", 'next', 'skip', 'whatever', 'pass', '', 'ok', 'hmm']) {
        assert.equal(conduct.isNonAnswer(t), true, JSON.stringify(t));
    }
    for (const t of ['I worked on a React dashboard for two years', 'No, I have not used Kubernetes but I know Docker', 'Yes, mostly GST filings']) {
        assert.equal(conduct.isNonAnswer(t), false, t);
    }
});

// --- Strike tracker ---

test('first disrespectful turn warns, second ends with misconduct', () => {
    const tracker = conduct.createTracker();
    const first = tracker.recordUserTurn('this is bullshit');
    assert.equal(first.action, 'warn');
    assert.equal(first.reason, 'misconduct');
    assert.equal(first.toast, 'Please keep the conversation respectful.');
    assert.match(first.line, /I'll have to end the interview if this continues\./);

    const calm = tracker.recordUserTurn('Sorry. I built the billing module in Node.');
    assert.equal(calm.action, 'none', 'a normal answer in between does not add a strike');

    const second = tracker.recordUserTurn('shut up, you asshole');
    assert.equal(second.action, 'end');
    assert.equal(second.reason, 'misconduct');
    assert.equal(second.message, 'The interview was ended because of inappropriate language.');
    assert.equal(tracker.state.ended, true);
});

test('a single weak or short answer never warns or ends', () => {
    const tracker = conduct.createTracker();
    assert.equal(tracker.recordUserTurn("I don't know").action, 'none');
    assert.equal(tracker.recordUserTurn('Um, I think it is like a hash map maybe').action, 'none');
    assert.equal(tracker.recordUserTurn('no').action, 'none');
    assert.equal(tracker.state.ended, false);
});

test('three consecutive non-answers warn, a fourth ends as unresponsive, and a real answer resets the streak', () => {
    const tracker = conduct.createTracker();
    assert.equal(tracker.recordUserTurn('idk').action, 'none');
    assert.equal(tracker.recordUserTurn('next').action, 'none');
    const warn = tracker.recordUserTurn('skip');
    assert.equal(warn.action, 'warn');
    assert.equal(warn.reason, 'unresponsive');

    const end = tracker.recordUserTurn('whatever');
    assert.equal(end.action, 'end');
    assert.equal(end.reason, 'unresponsive');
    assert.equal(end.message, 'The interview was ended because there were no responses.');

    const fresh = conduct.createTracker();
    fresh.recordUserTurn('idk');
    fresh.recordUserTurn('next');
    assert.equal(fresh.recordUserTurn('I led a team of three on the audit engagement').action, 'none');
    assert.equal(fresh.state.nonAnswerStreak, 0);
    assert.equal(fresh.recordUserTurn('idk').action, 'none', 'streak restarted from zero');
});

test('silence escalates nudge → warning → end, and a real answer resets it', () => {
    const tracker = conduct.createTracker();
    assert.equal(tracker.recordSilence().action, 'nudge');
    assert.equal(tracker.recordSilence().action, 'warn');
    assert.equal(tracker.recordUserTurn('Sorry, I was muted. I worked at a Big 4 firm.').action, 'none');
    assert.equal(tracker.state.silenceStreak, 0);
    assert.equal(tracker.recordSilence().action, 'nudge');
    assert.equal(tracker.recordSilence().action, 'warn');
    const end = tracker.recordSilence();
    assert.equal(end.action, 'end');
    assert.equal(end.reason, 'unresponsive');
    assert.equal(tracker.recordSilence().action, 'none', 'no further actions after ending');
});

// --- Reason copy ---

test('maps end reasons to neutral end-screen copy', () => {
    assert.equal(conduct.endReasonMessage('misconduct'), 'The interview was ended because of inappropriate language.');
    assert.equal(conduct.endReasonMessage('unresponsive'), 'The interview was ended because there were no responses.');
    assert.equal(conduct.endReasonMessage('completed'), 'Thanks — the interviewer has enough to assess you. Preparing your feedback…');
    assert.equal(conduct.isEarlyEndReason('misconduct'), true);
    assert.equal(conduct.isEarlyEndReason('unresponsive'), true);
    assert.equal(conduct.isEarlyEndReason('completed'), false, 'a completed interview must still get the analysis step');
});

// --- Natural completion + floor ---

test('honours a completed marker once the floor (5 answers and 4 minutes) is met', () => {
    const resolved = conduct.resolveEndMarker('That gives me a clear picture. Thank you for your time today! [[END_INTERVIEW:completed]]', { candidateTurns: 7, elapsedMs: 9 * 60 * 1000 });
    assert.equal(resolved.end, true);
    assert.equal(resolved.reason, 'completed');
    assert.equal(resolved.suppressed, null);
    assert.equal(resolved.text, 'That gives me a clear picture. Thank you for your time today!');
});

test('strips but ignores a premature completed marker so the interview continues', () => {
    const tooFewAnswers = conduct.resolveEndMarker('Thanks, that is all. [[END_INTERVIEW:completed]]', { candidateTurns: 2, elapsedMs: 10 * 60 * 1000 });
    assert.equal(tooFewAnswers.end, false);
    assert.equal(tooFewAnswers.suppressed, 'completed');
    assert.equal(tooFewAnswers.text, 'Thanks, that is all.');

    const tooSoon = conduct.resolveEndMarker('Thanks, that is all. [[END_INTERVIEW:completed]]', { candidateTurns: 6, elapsedMs: 90 * 1000 });
    assert.equal(tooSoon.end, false);
    assert.equal(tooSoon.suppressed, 'completed');

    assert.equal(conduct.meetsCompletionFloor({ candidateTurns: 5, elapsedMs: 4 * 60 * 1000 }), true);
    assert.equal(conduct.meetsCompletionFloor({ candidateTurns: 4, elapsedMs: 4 * 60 * 1000 }), false);
});

test('conduct markers are never floor-gated', () => {
    const early = conduct.resolveEndMarker('I am ending this here. [[END_INTERVIEW:misconduct]]', { candidateTurns: 1, elapsedMs: 5000 });
    assert.equal(early.end, true);
    assert.equal(early.reason, 'misconduct');
});

// --- Prompt policy ---

test('the system prompt section states the warning-then-end policy, leniency, markers and pacing', () => {
    const p = conduct.CONDUCT_PROMPT;
    assert.match(p, /ONE brief in-character warning/);
    assert.match(p, /I'll have to end the interview if this continues\./);
    assert.match(p, /Never warn or end for nervousness/);
    assert.ok(p.includes('[[END_INTERVIEW:misconduct]]'));
    assert.ok(p.includes('[[END_INTERVIEW:unresponsive]]'));
    assert.ok(p.includes('[[END_INTERVIEW:completed]]'));
    assert.match(p, /6-10 substantive exchanges/);
    assert.match(p, /Never conclude after only 1-2 answers/);
});

// --- Page wiring (static checks against ai-interview.html) ---

test('ai-interview.html loads the conduct module and wires the guardrails into the engine', () => {
    assert.ok(page.includes('<script src="scripts/interview-conduct.js"></script>'));
    assert.ok(page.includes('${InterviewConduct.CONDUCT_PROMPT}'), 'conduct policy appended to the system prompt');
    assert.ok(page.includes('InterviewConduct.resolveEndMarker(data.response'), 'marker parsed from the worker response');
    assert.ok(page.includes("if (endMarker.end) {"), 'marker drives the auto-end path');
    assert.ok(page.includes('conductDecision = evaluateCandidateTurn(message)'), 'typed turns are evaluated');
    assert.ok(page.includes('conductDecision = evaluateCandidateTurn(text)'), 'transcribed turns are evaluated');
    assert.ok(page.includes('silenceWatchTimer = setTimeout(handleSilenceTimeout, SILENCE_WATCH_MS)'), 'silence watch armed');
    assert.ok(page.includes('conductTracker = InterviewConduct.createTracker()'), 'tracker reset per interview');
    assert.ok(page.includes('Detailed analysis was skipped because the interview ended early.'), 'early-ended analysis handled');
    assert.ok(page.includes('endedEarly: InterviewConduct.isEarlyEndReason(interviewEndCode)'), 'end reason recorded in the analysis payload');
    assert.ok(!/\balert\(\s*['"`][^'"`]*respect/i.test(page), 'no alert() for conduct notices');
    assert.ok(!page.includes('window.open('), 'no window.open in the WebView page');
});
