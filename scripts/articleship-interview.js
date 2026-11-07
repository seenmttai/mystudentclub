(function (root, factory) {
    const articleshipInterview = factory();
    if (typeof module === 'object' && module.exports) module.exports = articleshipInterview;
    else root.MSCArticleshipInterview = articleshipInterview;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    const ROLE = 'CA Articleship';

    function normalizeConfig(config) {
        return config.positionApplied === ROLE
            ? { ...config, experienceLevel: 'Fresher' }
            : config;
    }

    function getInstructions(config) {
        if (config.positionApplied !== ROLE) return '';
        return `
                    ARTICLESHIP INTERVIEW:
                    - The candidate has cleared CA Intermediate and is applying for their first articleship. Do not assume prior articleship, client work or employment.
                    - Ask one short question at a time. Cover their introduction, why they chose articleship and this firm, their CV, and the selected domain.
                    - Test CA Intermediate concepts with simple practical scenarios. Calibrate every difficulty level to an incoming article assistant.
                    - Use only details actually present in the CV. If no CV is supplied, ask about their education, skills and activities instead of inventing experience.
                    - Include a question about willingness to learn, a question about teamwork, and a situation involving an error or an ethical concern.
                    - When the candidate does not know, allow an honest response and move on. Do not demand knowledge gained only through client assignments.
                    - Keep the interview professional. End with specific feedback on technical basics, clarity, honesty and two answers they can improve.`;
    }

    return Object.freeze({ ROLE, normalizeConfig, getInstructions });
});
