import { state, TOPICS } from './state.js';

const app = document.getElementById('app-container');

export function renderTopicSelection() {
    app.innerHTML = `
        <div class="container fade-in">
            <div class="hero-section">
                <h2 class="main-heading">Select Competency Area</h2>
                <p class="sub-heading">Choose specific modules or enter a custom topic for assessment.</p>
            </div>

            <div class="topic-grid">
                ${TOPICS.map(topic => `
                    <button class="topic-btn" data-topic="${topic}">
                        <div class="topic-btn-content">
                            <span class="topic-name">${topic}</span>
                            <div class="checkbox-indicator"></div>
                        </div>
                    </button>
                `).join('')}
            </div>

            <div class="custom-topic-section">
                <label class="form-label">Custom Topic</label>
                <input 
                    type="text" 
                    id="custom-topic" 
                    class="text-input" 
                    placeholder="e.g. GST Implications on Real Estate"
                >
            </div>

            <button id="start-btn" class="btn btn-primary btn-full">
                Initialize Assessment
            </button>
        </div>
    `;
}

export function renderQuiz() {
    // Group questions by difficulty
    const grouped = {
        Easy: state.questions.filter(q => q.difficulty === 'Easy'),
        Medium: state.questions.filter(q => q.difficulty === 'Medium'),
        Hard: state.questions.filter(q => q.difficulty === 'Hard')
    };

    const renderQuestionCard = (q, index) => {
        let inputHtml = '';

        if (q.type === 'mcq') {
            inputHtml = `
                <div class="options-list">
                    ${q.options.map((opt, idx) => `
                        <label class="option-label">
                            <input type="radio" name="q-${q.id}" value="${opt}">
                            <span class="option-text">${opt}</span>
                        </label>
                    `).join('')}
                </div>
            `;
        } else if (q.type === 'boolean') {
            inputHtml = `
                <div class="options-list">
                    <label class="option-label">
                        <input type="radio" name="q-${q.id}" value="True">
                        <span class="option-text">True</span>
                    </label>
                    <label class="option-label">
                        <input type="radio" name="q-${q.id}" value="False">
                        <span class="option-text">False</span>
                    </label>
                </div>
            `;
        } else {
            inputHtml = `
                <textarea 
                    name="q-${q.id}" 
                    class="text-answer" 
                    placeholder="Type your answer here..."
                ></textarea>
            `;
        }

        return `
            <div class="question-card fade-in">
                <div class="question-header">
                    <span class="difficulty-badge ${q.difficulty.toLowerCase()}">${q.difficulty}</span>
                    <span class="question-number">Q${q.id}</span>
                </div>
                <p class="question-text">${q.text}</p>
                ${inputHtml}
            </div>
        `;
    };

    app.innerHTML = `
        <div class="container" style="padding-bottom: 5rem;">
            <div class="quiz-header">
                <h2 class="quiz-title">Skill Assessment</h2>
                <div class="timer-display">Time: <span id="timer">00:00</span></div>
            </div>

            ${grouped.Easy.length ? `
                <div class="section-divider easy">
                    <h3 class="section-title">Section A: Fundamental</h3>
                </div>
                ${grouped.Easy.map(renderQuestionCard).join('')}
            ` : ''}

            ${grouped.Medium.length ? `
                <div class="section-divider medium">
                    <h3 class="section-title">Section B: Intermediate</h3>
                </div>
                ${grouped.Medium.map(renderQuestionCard).join('')}
            ` : ''}

            ${grouped.Hard.length ? `
                <div class="section-divider hard">
                    <h3 class="section-title">Section C: Advanced</h3>
                </div>
                ${grouped.Hard.map(renderQuestionCard).join('')}
            ` : ''}
        </div>

        <div class="fixed-bottom">
            <div class="container">
                <button id="submit-exam" class="btn btn-primary btn-full">
                    Submit Assessment
                </button>
            </div>
        </div>
    `;
}

export function renderResults() {
    const { total_score, overall_feedback, results } = state.results;

    // Calculate score color
    let scoreColorClass = 'danger';
    if (total_score > 75) scoreColorClass = 'success';
    else if (total_score > 50) scoreColorClass = 'warning';

    const renderResultCard = (res) => {
        const isCorrect = res.is_correct;
        const originalQ = state.questions.find(q => q.id === res.id);

        return `
            <div class="result-card ${isCorrect ? 'correct' : 'incorrect'} fade-in">
                <div class="result-header">
                    <span class="question-number">Q${res.id}</span>
                    <span class="result-score ${isCorrect ? 'correct' : 'incorrect'}">
                        ${res.score}/10 points
                    </span>
                </div>
                <p class="result-question">${originalQ.text}</p>

                <div class="result-section">
                    <div class="result-label">Your Answer:</div>
                    <div class="result-value">${state.userAnswers[res.id] || 'Not Answered'}</div>
                </div>

                <div class="result-section">
                    <div class="result-label">Correct Answer:</div>
                    <div class="correct-answer-box">
                        <div class="result-value">${res.correct_answer}</div>
                    </div>
                </div>

                <div class="result-section">
                    <div class="result-label">Examiner Feedback:</div>
                    <div class="feedback-box ${isCorrect ? 'correct' : 'incorrect'}">
                        ${res.feedback}
                    </div>
                </div>
            </div>
        `;
    };

    app.innerHTML = `
        <div class="container fade-in">
            <div class="results-header">
                <div class="score-display">
                    ${total_score}
                    <span class="score-total">/100</span>
                </div>
                <p class="feedback-text">"${overall_feedback}"</p>
                <button id="restart-btn" class="btn btn-primary">
                    Take Another Test
                </button>
            </div>

            <h3 class="results-breakdown-title">Detailed Breakdown</h3>
            ${results.map(renderResultCard).join('')}
        </div>
    `;
}
