import { state } from './state.js';
import { renderTopicSelection, renderQuiz, renderResults } from './render.js';
import { generateQuestions, gradeExam } from './api.js';
import { logError } from './logger.js';

// UI Utilities
const loader = document.getElementById('loader-overlay');
const loaderText = document.getElementById('loader-text');
const status = document.getElementById('status-indicator');

let timerInterval = null;
let elapsedSeconds = 0;

function toggleLoader(show, text = "Processing...") {
    if (!loader || !loaderText) return;
    loaderText.innerText = text;
    if (show) {
        loader.classList.remove('hidden');
    } else {
        loader.classList.add('hidden');
    }
}

function setStatus(text) {
    if (status) status.textContent = text;
}

function formatTime(totalSeconds) {
    const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const s = String(totalSeconds % 60).padStart(2, '0');
    return `${m}:${s}`;
}

function startTimer() {
    const timerEl = document.getElementById('timer');
    if (!timerEl) return;

    if (timerInterval) clearInterval(timerInterval);
    elapsedSeconds = 0;
    timerEl.textContent = formatTime(elapsedSeconds);

    timerInterval = setInterval(() => {
        elapsedSeconds += 1;
        timerEl.textContent = formatTime(elapsedSeconds);
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// Initial render
state.currentPhase = 'selection';
renderTopicSelection();
setStatus('Ready');

// Event Delegation for Dynamic Content
document.getElementById('app-container').addEventListener('click', async (e) => {
    const target = e.target.closest('button, .topic-btn');
    if (!target) return;

    // 1. Toggle Topic Selection
    if (target.classList.contains('topic-btn')) {
        const topic = target.dataset.topic;
        const indicator = target.querySelector('.checkbox-indicator');

        if (state.selectedTopics.includes(topic)) {
            state.selectedTopics = state.selectedTopics.filter(t => t !== topic);
            target.classList.remove('selected');
            if (indicator) {
                indicator.innerHTML = '';
            }
        } else {
            state.selectedTopics.push(topic);
            target.classList.add('selected');
            if (indicator) {
                indicator.innerHTML = `<svg width="16" height="16" fill="none" stroke="white" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4 11-11" /></svg>`;
            }
        }
        return;
    }

    // 2. Start Assessment
    if (target.id === 'start-btn') {
        try {
            const customInput = document.getElementById('custom-topic');
            const customTopic = customInput ? customInput.value.trim() : '';
            state.customTopic = customTopic;

            const topics = [...state.selectedTopics];
            if (customTopic) topics.push(customTopic);

            if (!topics.length) {
                setStatus('Select or enter at least one topic');
                alert('Please select or enter at least one topic');
                return;
            }

            toggleLoader(true, 'Generating questions...');
            setStatus('Preparing your assessment...');

            const data = await generateQuestions(topics);
            if (!data || !Array.isArray(data.questions) || data.questions.length === 0) {
                throw new Error('No questions received from server');
            }

            state.questions = data.questions;
            state.userAnswers = {};
            state.currentPhase = 'quiz';

            renderQuiz();
            startTimer();
            setStatus('Answer the questions and submit when ready');
        } catch (err) {
            logError(err, 'start-assessment');
            alert('Sorry, something went wrong while generating questions. Please try again.');
            setStatus('Error generating questions');
        } finally {
            toggleLoader(false);
        }
        return;
    }

    // 3. Submit Assessment
    if (target.id === 'submit-exam') {
        try {
            if (!state.questions || !state.questions.length) return;

            toggleLoader(true, 'Evaluating your answers...');
            setStatus('Submitting your responses...');
            stopTimer();

            // Collect answers
            const answers = {};
            state.questions.forEach(q => {
                const name = `q-${q.id}`;
                if (q.type === 'mcq' || q.type === 'boolean') {
                    const chosen = document.querySelector(`input[name="${name}"]:checked`);
                    answers[q.id] = chosen ? chosen.value : '';
                } else {
                    const textArea = document.querySelector(`textarea[name="${name}"]`);
                    answers[q.id] = textArea ? textArea.value.trim() : '';
                }
            });
            state.userAnswers = answers;

            const results = await gradeExam(state.questions, state.userAnswers);
            if (!results || typeof results.total_score === 'undefined') {
                throw new Error('Invalid results from server');
            }

            state.results = results;
            state.currentPhase = 'results';
            renderResults();
            setStatus('Review your performance breakdown');
        } catch (err) {
            logError(err, 'submit-exam');
            alert('Sorry, something went wrong while grading. Please try again.');
            setStatus('Error grading assessment');
        } finally {
            toggleLoader(false);
        }
        return;
    }

    // 4. Restart
    if (target.id === 'restart-btn') {
        stopTimer();
        state.selectedTopics = [];
        state.customTopic = '';
        state.questions = [];
        state.userAnswers = {};
        state.results = null;
        state.currentPhase = 'selection';

        renderTopicSelection();
        setStatus('Ready');
        return;
    }
});
