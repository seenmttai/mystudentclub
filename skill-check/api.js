import { state } from './state.js';
import { logError } from './logger.js';

/**
 * Calls the worker to generate questions
 */
export async function generateQuestions(topics) {
    try {
        const response = await fetch(state.workerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mode: 'generateQuestions',
                topics
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (e) {
        logError(e, 'generateQuestions');
        throw e;
    }
}

/**
 * Calls the worker to grade the exam
 */
export async function gradeExam(questions, userAnswers) {
    try {
        const response = await fetch(state.workerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mode: 'gradeExam',
                questions,
                userAnswers
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (e) {
        logError(e, 'gradeExam');
        throw e;
    }
}
