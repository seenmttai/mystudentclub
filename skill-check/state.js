export const state = {
    selectedTopics: [],
    customTopic: "",
    questions: [],
    userAnswers: {}, // { questionId: answer }
    results: null,
    currentPhase: 'selection', // selection, quiz, results
    workerUrl: 'https://skillcheck.bhansalimanan55.workers.dev'
};

// Pre-defined CA Topics
export const TOPICS = [
    "Financial Reporting",
    "Strategic Financial Management",
    "Advanced Auditing",
    "Corporate & Economic Laws",
    "Direct Tax Laws",
    "Indirect Tax Laws",
    "Costing",
    "Accounting Standards"
];
