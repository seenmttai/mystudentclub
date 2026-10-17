// Conduct guardrails for the AI interviewer (ai-interview.html).
// Pure, dependency-free helpers so they can be unit-tested in Node and reused in the browser.
// Exposed as window.InterviewConduct in the page and as module.exports under Node.
(function (global) {
    'use strict';

    // --- Machine-readable end marker the model is asked to append: [[END_INTERVIEW:misconduct]] ---
    var END_MARKER_REGEX = /\[\[\s*END_INTERVIEW(?:\s*:\s*([a-z_-]+))?\s*\]\]/gi;
    var KNOWN_REASONS = { misconduct: 'misconduct', unresponsive: 'unresponsive', completed: 'completed', complete: 'completed', done: 'completed' };

    function normalizeReason(reason) {
        var key = String(reason || '').trim().toLowerCase();
        return KNOWN_REASONS[key] || 'completed';
    }

    // Returns { text, end, reason }. `text` has every marker removed so it is never displayed or spoken.
    function parseEndMarker(text) {
        var raw = String(text == null ? '' : text);
        var end = false;
        var reason = null;
        var match;
        END_MARKER_REGEX.lastIndex = 0;
        while ((match = END_MARKER_REGEX.exec(raw)) !== null) {
            end = true;
            // The first marker wins; later duplicates are just stripped.
            if (reason === null) reason = normalizeReason(match[1]);
        }
        var stripped = raw.replace(END_MARKER_REGEX, ' ').replace(/[ \t]{2,}/g, ' ').replace(/\s+([.!?,])/g, '$1').trim();
        return { text: stripped, end: end, reason: end ? reason : null };
    }

    // --- Profanity / slur / harassment detector (English + common Hinglish). Word-boundary based. ---
    // Deliberately conservative: only unambiguous terms, so ordinary words (assess, class, pass, bass) never match.
    var PROFANITY_TERMS = [
        // English profanity / abuse
        'fuck', 'fucking', 'fucked', 'fucker', 'fuckers', 'motherfucker', 'motherfuckers', 'fck', 'fuk',
        'shit', 'shitty', 'bullshit', 'bitch', 'bitches', 'asshole', 'assholes', 'arsehole', 'bastard', 'bastards',
        'dickhead', 'dickheads', 'cunt', 'cunts', 'wanker', 'prick', 'douchebag', 'dumbass', 'jackass',
        // slurs
        'retard', 'retarded', 'faggot', 'fag', 'nigger', 'nigga', 'niggas', 'tranny', 'chink', 'paki',
        // sexual content
        'porn', 'horny', 'blowjob', 'boobs', 'nudes', 'nude pics', 'sexy girl', 'sexy girls', 'suck my', 'sex with you',
        // harassment phrases
        'shut up', 'shut the hell up', 'screw you', 'go to hell', 'kiss my ass', 'kill yourself',
        // Hinglish / Hindi abuse (romanized, common spellings)
        'chutiya', 'chutiye', 'chutiyo', 'chutia', 'chutiyapa', 'madarchod', 'maderchod', 'madarchodh', 'bhenchod', 'behenchod',
        'bhenchodh', 'behnchod', 'bhosdike', 'bhosdi', 'bhosadike', 'bhosda', 'gandu', 'gaandu', 'gaand', 'lund', 'lauda', 'lavda', 'lavde',
        'randi', 'randwa', 'harami', 'haramkhor', 'kamina', 'kamine', 'kutti', 'kuttiya', 'bakchod', 'bakchodi',
        'chodu', 'tatti', 'jhant', 'jhantu', 'bsdk', 'mkc', 'bkl', 'behen ke lode', 'teri maa', 'teri ma ki', 'maa ki chut', 'chut'
    ];

    function escapeRegex(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    var PROFANITY_REGEX = new RegExp(
        '(?:^|[^a-z0-9])(?:' + PROFANITY_TERMS.map(function (t) { return escapeRegex(t).replace(/ /g, '\\s+'); }).join('|') + ')(?![a-z0-9])',
        'i'
    );

    function normalizeText(text) {
        return String(text == null ? '' : text)
            .toLowerCase()
            .replace(/[‘’]/g, "'")
            .replace(/[*#@$!]+(?=[a-z])/g, '') // "f*ck" style masking → "fck" (listed)
            .replace(/\s+/g, ' ')
            .trim();
    }

    function containsProfanity(text) {
        var normalized = normalizeText(text);
        if (!normalized) return false;
        return PROFANITY_REGEX.test(normalized);
    }

    // --- Non-answer detector: "idk", "next", "skip", "whatever", empty, or a bare one-word reply. ---
    var NON_ANSWER_PHRASES = [
        'idk', 'i dont know', 'i do not know', 'dont know', 'do not know', 'dunno', 'no idea', 'not sure',
        'next', 'next question', 'skip', 'skip it', 'skip this', 'pass', 'whatever', 'nothing', 'no comment',
        'i dont care', 'dont care', 'who cares', 'meh', 'nope', 'nah', 'no', 'yes', 'ok', 'okay', 'hmm', 'hm', 'umm', 'um',
        'blah', 'blah blah', 'bored', 'boring', 'this is boring', 'kuch nahi', 'pata nahi', 'nahi pata', 'nahi', 'haan'
    ];
    var NON_ANSWER_SET = {};
    NON_ANSWER_PHRASES.forEach(function (p) { NON_ANSWER_SET[p] = true; });

    function isNonAnswer(text) {
        var normalized = normalizeText(text).replace(/'/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!normalized) return true;
        if (NON_ANSWER_SET[normalized]) return true;
        var words = normalized.split(' ');
        // A single token under 4 letters ("k", "ya", "hmm") is not an answer either.
        if (words.length === 1 && normalized.length <= 3) return true;
        return false;
    }

    // --- Neutral end-reason copy shown on the end screen / toast ---
    var END_REASON_MESSAGES = {
        misconduct: 'The interview was ended because of inappropriate language.',
        unresponsive: 'The interview was ended because there were no responses.',
        completed: 'Thanks — the interviewer has enough to assess you. Preparing your feedback…'
    };

    function endReasonMessage(reason) {
        return END_REASON_MESSAGES[normalizeReason(reason)] || END_REASON_MESSAGES.completed;
    }

    function isEarlyEndReason(reason) {
        var key = normalizeReason(reason);
        return key === 'misconduct' || key === 'unresponsive';
    }

    // --- Spoken lines used when the client (not the model) decides ---
    var LINES = {
        warning: "I'll have to end the interview if this continues.",
        respectToast: 'Please keep the conversation respectful.',
        respondToast: 'Please respond to continue the interview.',
        respectWarning: "Let's keep this professional. I'll have to end the interview if this continues.",
        unresponsiveWarning: "I do need proper answers to continue. I'll have to end the interview if this continues.",
        silenceNudge: "Are you still there? Take your time, but I'll need a response to continue.",
        silenceWarning: "I still haven't heard a response. If there's no answer, I'll have to end the interview.",
        closingMisconduct: "I'm going to end the interview here because of the language used. Thank you for your time.",
        closingUnresponsive: "Since I'm not getting responses, I'll end the interview here. Thank you for your time.",
        continueNote: 'Not enough coverage yet to conclude. Do not end the interview; continue with the next question.'
    };

    // Floor for a model-signalled natural completion: both must be met or the marker is ignored and the interview continues.
    var COMPLETION_FLOOR = { minCandidateTurns: 5, minElapsedMs: 4 * 60 * 1000 };

    function meetsCompletionFloor(context, floor) {
        var f = Object.assign({}, COMPLETION_FLOOR, floor || {});
        var turns = Number(context && context.candidateTurns) || 0;
        var elapsed = Number(context && context.elapsedMs) || 0;
        return turns >= f.minCandidateTurns && elapsed >= f.minElapsedMs;
    }

    // parseEndMarker + completion floor. A premature [[END_INTERVIEW:completed]] is stripped but NOT honoured
    // (result.suppressed = 'completed'); conduct reasons are never floor-gated.
    function resolveEndMarker(text, context, floor) {
        var parsed = parseEndMarker(text);
        if (parsed.end && parsed.reason === 'completed' && !meetsCompletionFloor(context, floor)) {
            return { text: parsed.text, end: false, reason: null, suppressed: 'completed' };
        }
        return { text: parsed.text, end: parsed.end, reason: parsed.reason, suppressed: null };
    }

    var CONDUCT_PROMPT = [
        'CONDUCT POLICY (applies at every difficulty, including Brutal):',
        '- Stay professional and in character at all times.',
        '- If the candidate is disrespectful (abuse, slurs, harassment, sexual remarks) or is clearly wasting time (repeated non-answers like "idk"/"next"/"skip", trolling, refusing to engage with the interview), give ONE brief in-character warning that ends with: "I\'ll have to end the interview if this continues."',
        '- If it happens again after the warning, end the interview with one short, polite closing line.',
        '- Never warn or end for nervousness, weak or incomplete answers, accents, grammar, or a single short or unclear reply. Be lenient; only clear, repeated misconduct counts.',
        '- When you end the interview for conduct reasons, append exactly one marker as the LAST thing in your reply: [[END_INTERVIEW:misconduct]] for disrespect, or [[END_INTERVIEW:unresponsive]] for time-wasting/no engagement. Do not use the marker anywhere else and do not explain it.',
        '',
        'PACING AND COVERAGE:',
        '- Track what you have covered: introduction/background, 2-3 technical or domain questions appropriate to the target role, 1-2 behavioural/situational questions, and 1 closing question (for example motivation or questions for us).',
        '- Ask one question at a time. Do not keep asking questions just to fill time.',
        '- Once you have covered that ground AND have a confident assessment of the candidate\'s level (strong, average or weak) - typically after about 6-10 substantive exchanges - wrap up gracefully: brief closing remarks, thank the candidate, and append [[END_INTERVIEW:completed]] as the LAST thing in that reply.',
        '- Never conclude after only 1-2 answers. If the answers are mixed and you need more evidence, keep going with further questions.'
    ].join('\n');

    var DEFAULT_THRESHOLDS = {
        profanityWarnAt: 1,
        profanityEndAt: 2,
        nonAnswerWarnAt: 3,
        nonAnswerEndAt: 4,
        silenceNudgeAt: 1,
        silenceWarnAt: 2,
        silenceEndAt: 3
    };

    // Deterministic strike tracker. One instance per interview session.
    function createTracker(options) {
        var t = Object.assign({}, DEFAULT_THRESHOLDS, options || {});
        var state = {
            profanityStrikes: 0,
            nonAnswerStreak: 0,
            silenceStreak: 0,
            unresponsiveWarned: false,
            respectWarned: false,
            ended: false,
            endReason: null
        };

        function endWith(reason, line) {
            state.ended = true;
            state.endReason = reason;
            return { action: 'end', reason: reason, line: line, message: endReasonMessage(reason) };
        }

        function recordUserTurn(text) {
            if (state.ended) return { action: 'none', reason: state.endReason };
            var profane = containsProfanity(text);
            var nonAnswer = !profane && isNonAnswer(text);

            if (profane) {
                state.profanityStrikes += 1;
                if (state.profanityStrikes >= t.profanityEndAt) {
                    return endWith('misconduct', LINES.closingMisconduct);
                }
                if (state.profanityStrikes >= t.profanityWarnAt) {
                    state.respectWarned = true;
                    return { action: 'warn', reason: 'misconduct', line: LINES.respectWarning, toast: LINES.respectToast };
                }
                return { action: 'none', reason: null };
            }

            if (nonAnswer) {
                state.nonAnswerStreak += 1;
                if (state.unresponsiveWarned && state.nonAnswerStreak >= t.nonAnswerEndAt) {
                    return endWith('unresponsive', LINES.closingUnresponsive);
                }
                if (!state.unresponsiveWarned && state.nonAnswerStreak >= t.nonAnswerWarnAt) {
                    state.unresponsiveWarned = true;
                    return { action: 'warn', reason: 'unresponsive', line: LINES.unresponsiveWarning, toast: LINES.respectToast };
                }
                return { action: 'none', reason: null };
            }

            // A real answer resets the unresponsive track (but not profanity strikes).
            state.nonAnswerStreak = 0;
            state.silenceStreak = 0;
            state.unresponsiveWarned = false;
            return { action: 'none', reason: null };
        }

        // Called when the listening window expired with no candidate turn.
        function recordSilence() {
            if (state.ended) return { action: 'none', reason: state.endReason };
            state.silenceStreak += 1;
            if (state.silenceStreak >= t.silenceEndAt) {
                return endWith('unresponsive', LINES.closingUnresponsive);
            }
            if (state.silenceStreak >= t.silenceWarnAt) {
                state.unresponsiveWarned = true;
                return { action: 'warn', reason: 'unresponsive', line: LINES.silenceWarning };
            }
            if (state.silenceStreak >= t.silenceNudgeAt) {
                return { action: 'nudge', reason: 'unresponsive', line: LINES.silenceNudge };
            }
            return { action: 'none', reason: null };
        }

        function reset() {
            state.profanityStrikes = 0;
            state.nonAnswerStreak = 0;
            state.silenceStreak = 0;
            state.unresponsiveWarned = false;
            state.respectWarned = false;
            state.ended = false;
            state.endReason = null;
        }

        return {
            recordUserTurn: recordUserTurn,
            recordSilence: recordSilence,
            reset: reset,
            get state() { return Object.assign({}, state); },
            thresholds: t
        };
    }

    // Text shown by the model that already contains a warning or closing, so the client does not double up.
    function aiTextAlreadyWarns(text) {
        var n = normalizeText(text);
        return /end (the|this|our) interview|ending (the|this|our) interview|wrap(ping)? (this|it) up here|keep (this|it) (professional|respectful)/.test(n);
    }

    // Model-facing note injected after a client-side strike so the model warns in-character.
    function buildModelNote(decision) {
        if (!decision || decision.action === 'none') return '';
        var what = decision.reason === 'misconduct'
            ? 'The candidate\'s last message contained inappropriate or disrespectful language.'
            : 'The candidate has given several consecutive non-answers.';
        if (decision.action === 'end') {
            return what + ' The interview has been ended by the system for this reason.';
        }
        return what + ' Issue one brief in-character warning that ends with "I\'ll have to end the interview if this continues." Then continue the interview normally. Do not end the interview unless it happens again.';
    }

    var api = {
        END_MARKER_REGEX: END_MARKER_REGEX,
        PROFANITY_TERMS: PROFANITY_TERMS,
        NON_ANSWER_PHRASES: NON_ANSWER_PHRASES,
        LINES: LINES,
        CONDUCT_PROMPT: CONDUCT_PROMPT,
        DEFAULT_THRESHOLDS: DEFAULT_THRESHOLDS,
        parseEndMarker: parseEndMarker,
        normalizeReason: normalizeReason,
        containsProfanity: containsProfanity,
        isNonAnswer: isNonAnswer,
        endReasonMessage: endReasonMessage,
        isEarlyEndReason: isEarlyEndReason,
        COMPLETION_FLOOR: COMPLETION_FLOOR,
        meetsCompletionFloor: meetsCompletionFloor,
        resolveEndMarker: resolveEndMarker,
        aiTextAlreadyWarns: aiTextAlreadyWarns,
        buildModelNote: buildModelNote,
        createTracker: createTracker
    };

    global.InterviewConduct = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
