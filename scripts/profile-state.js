(function (global) {
    'use strict';

    const PROFILE_CACHE_KEY = 'userProfileData';
    const PROFILE_CACHE_OWNER_KEY = 'userProfileDataUserId';
    const ONBOARDING_DISMISSED_KEY = 'msc_profile_onboarding_dismissed';

    function clean(value) {
        return typeof value === 'string' ? value.trim() : value;
    }

    function hasValue(value) {
        if (Array.isArray(value)) return value.length > 0;
        if (value && typeof value === 'object') return Object.keys(value).length > 0;
        return value !== null && value !== undefined && String(value).trim() !== '';
    }

    function safeRead(key) {
        try {
            return global.localStorage.getItem(key);
        } catch (_) {
            return null;
        }
    }

    function safeWrite(key, value) {
        try {
            global.localStorage.setItem(key, value);
        } catch (_) {
            // Profile loading must remain usable when browser storage is unavailable.
        }
    }

    function getSignupProfileSeed(user) {
        const metadata = user?.user_metadata || {};
        const firstName = clean(metadata.first_name || metadata.firstName || '');
        const lastName = clean(metadata.last_name || metadata.lastName || '');
        const fullName = clean(metadata.full_name || metadata.fullName || metadata.name || '');
        const name = fullName || [firstName, lastName].filter(Boolean).join(' ');
        const seed = {};

        if (clean(user?.email)) seed.email = clean(user.email);
        if (name) seed.name = name;
        return seed;
    }

    function mergeAuthSignupValues(profile, user) {
        const merged = { ...(profile || {}) };
        const seed = getSignupProfileSeed(user);
        const seededFields = [];

        Object.entries(seed).forEach(([key, value]) => {
            // Auth email is authoritative because the profile email field is
            // read-only. Other signup values only fill genuinely empty fields.
            if (key === 'email') {
                if (clean(merged[key]) !== value) {
                    merged[key] = value;
                    seededFields.push(key);
                }
                return;
            }
            if (!hasValue(merged[key])) {
                merged[key] = value;
                seededFields.push(key);
            }
        });

        return {
            profile: merged,
            seed,
            seededFields,
            changed: seededFields.length > 0
        };
    }

    function prepareUserCache(userId) {
        if (!userId) return;
        const owner = safeRead(PROFILE_CACHE_OWNER_KEY);
        if (owner && owner !== userId) {
            try {
                global.localStorage.removeItem(PROFILE_CACHE_KEY);
                global.localStorage.removeItem(PROFILE_CACHE_OWNER_KEY);
            } catch (_) { }
        }
    }

    function cacheProfile(profile, userId) {
        if (!profile || !userId) return;
        safeWrite(PROFILE_CACHE_KEY, JSON.stringify(profile));
        safeWrite(PROFILE_CACHE_OWNER_KEY, userId);
    }

    function readCachedProfile(userId) {
        prepareUserCache(userId);
        const raw = safeRead(PROFILE_CACHE_KEY);
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (_) {
            return null;
        }
    }

    function setOnboardingDismissed(email) {
        const normalizedEmail = clean(email)?.toLowerCase();
        if (!normalizedEmail) return;
        safeWrite(ONBOARDING_DISMISSED_KEY, JSON.stringify({ email: normalizedEmail, dismissedAt: new Date().toISOString() }));
    }

    function wasOnboardingDismissed(email) {
        const normalizedEmail = clean(email)?.toLowerCase();
        if (!normalizedEmail) return false;
        try {
            const value = JSON.parse(safeRead(ONBOARDING_DISMISSED_KEY) || 'null');
            return value?.email === normalizedEmail;
        } catch (_) {
            return false;
        }
    }

    async function hydrateProfileFromSupabase(client, user) {
        if (!client || !user?.id) return { data: null, profile: null, seededFields: [], changed: false };
        prepareUserCache(user.id);

        const { data, error } = await client
            .from('profiles')
            .select('profile, ocr_cv, updated_at, looking_for, articleship_1yr_end_date, ca_inter_attempt, ca_final_attempt, years_of_experience')
            .eq('uuid', user.id)
            .maybeSingle();

        if (error) throw error;

        const merged = mergeAuthSignupValues(data?.profile || {}, user);
        let record = data || null;

        if (merged.changed) {
            const upsertData = {
                uuid: user.id,
                profile: merged.profile,
                updated_at: new Date().toISOString()
            };
            if (data?.ocr_cv !== undefined) upsertData.ocr_cv = data.ocr_cv;
            if (data?.looking_for !== undefined) upsertData.looking_for = data.looking_for;

            const { data: saved, error: saveError } = await client
                .from('profiles')
                .upsert(upsertData)
                .select('profile, ocr_cv, updated_at, looking_for, articleship_1yr_end_date, ca_inter_attempt, ca_final_attempt, years_of_experience')
                .maybeSingle();
            if (saveError) throw saveError;
            record = saved || { ...upsertData };
        }

        const profile = merged.profile;
        cacheProfile(profile, user.id);
        return { data: record, profile, seededFields: merged.seededFields, changed: merged.changed };
    }

    global.MSCProfileState = {
        PROFILE_CACHE_KEY,
        PROFILE_CACHE_OWNER_KEY,
        getSignupProfileSeed,
        mergeAuthSignupValues,
        hasValue,
        prepareUserCache,
        cacheProfile,
        readCachedProfile,
        setOnboardingDismissed,
        wasOnboardingDismissed,
        hydrateProfileFromSupabase
    };
})(window);
