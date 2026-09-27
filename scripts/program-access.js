/** Enrollment access is read from Supabase for a server-verified user, never user_metadata/localStorage. */
(function (global) {
    'use strict';
    const FREE_TEMPLATES = Object.freeze(['bold-modern.html', 'inset-frame.html', 'clean-rule.html']);
    const PROGRAMS = Object.freeze([
        { id: 'industrial-training', course: 'industrial-training-mastery', title: 'MSC Industrial Training Program', url: '/ca-industrial-training-program/' },
        { id: 'ca-fresher', course: 'msc-ca-freshers-program', title: 'MSC CA Fresher Program', url: '/msc-ca-fresher-program/' },
        { id: 'articleship', course: null, title: 'MSC Articleship Program', url: '/articleship-program/' }
    ]);
    function isEligibleCourse(course) {
        const value = String(course || '').trim().toLowerCase();
        return value === 'industrial-training-mastery' || value === 'msc-ca-freshers-program' ||
            /^(?:msc-)?(?:ca-)?articleship(?:-mastery|-program)?$/.test(value);
    }
    function programForStage(stage) {
        return PROGRAMS.find(program => program.id === stage) || null;
    }
    async function getAccess(client) {
        const result = { user: null, loggedIn: false, hasAccess: false, courses: [], error: null };
        try {
            client = client || global.supabaseClient || global.mscSupabase || global.getSupabaseClient?.();
            if (!client) throw new Error('Account verification is unavailable. Please reload and try again.');
            const { data, error } = await client.auth.getUser();
            if (error) {
                if (error.name === 'AuthSessionMissingError') return result;
                throw error;
            }
            result.user = data?.user || null;
            result.loggedIn = Boolean(result.user);
            if (!result.user) return result;
            const response = await client.from('enrollment').select('course').eq('uuid', result.user.id);
            if (response.error) throw response.error;
            result.courses = [...new Set((response.data || []).map(row => row.course).filter(Boolean))];
            result.hasAccess = result.courses.some(isEligibleCourse);
            return result;
        } catch (error) {
            result.error = error;
            return result;
        }
    }
    global.MSCProgramAccess = Object.freeze({ FREE_TEMPLATES, PROGRAMS, getAccess, programForStage, isEligibleCourse });
})(window);
