/*
 * Job page SEO helpers, shared by:
 *   - the static job page builder (jobs-builder, Astro + Node scripts)
 *   - the portal (scripts/portal3.js, in the browser)
 *   - the 404 page (404.html, in the browser)
 *
 * Plain script on purpose: it sets globalThis.MSCJobSeo (and module.exports
 * under CommonJS), so it loads the same way as a browser <script>, an ES-module
 * side-effect import, a Node require() and inside Astro/Vite.
 *
 * URL format (no ".html"; Cloudflare Pages 308-redirects ".html" away):
 *   /jobs/<category>/<company>-hiring-<role>[-<domain>]-<city>-<id>
 *   /jobs/industrial/canon-india-hiring-ca-industrial-trainee-business-finance-gurugram-10634
 * The id stays as the last segment so every URL is unique and the portal can
 * find the job from the URL alone. Semi-qualified ids are UUIDs, so only their
 * first 8 hex characters are used.
 */
(function (root) {
    'use strict';

    var DOMAIN = 'https://www.mystudentclub.com';
    var JOB_EXPIRATION_DAYS = 15;

    var TABLE_TO_CATEGORY = {
        'Industrial Training Job Portal': 'industrial',
        'Fresher Jobs': 'fresher',
        'Semi Qualified Jobs': 'semi-qualified',
        'Articleship Jobs': 'articleship'
    };

    var CATEGORY_TO_TABLE = {
        'industrial': 'Industrial Training Job Portal',
        'fresher': 'Fresher Jobs',
        'semi-qualified': 'Semi Qualified Jobs',
        'semi': 'Semi Qualified Jobs',
        'articleship': 'Articleship Jobs'
    };

    // Portal page that lists each category (and opens a job with ?id=&type=).
    var CATEGORY_PORTAL = {
        'industrial': '/',
        'fresher': '/ca-fresher-jobs',
        'semi-qualified': '/semi-qualified-ca-jobs',
        'articleship': '/ca-articleship-opportunities'
    };

    var CATEGORY_LABEL = {
        'industrial': 'CA Industrial Training Jobs',
        'fresher': 'CA Fresher Jobs',
        'semi-qualified': 'Semi Qualified CA Jobs',
        'articleship': 'CA Articleship Vacancies'
    };

    // Words people search for: "CA industrial trainee", "CA articleship", ...
    var ROLE_TITLE = {
        'industrial': 'CA Industrial Trainee',
        'fresher': 'CA Fresher',
        'semi-qualified': 'Semi Qualified CA',
        'articleship': 'CA Articleship Trainee'
    };

    var VAGUE_DOMAINS = ['', 'other', 'others', 'general', 'na', 'n/a', 'none', 'misc', 'miscellaneous', 'any'];

    // Indian cities (and spellings) -> canonical name + state. Longest aliases are matched first.
    var CITIES = [
        ['Navi Mumbai', 'Maharashtra', ['navi mumbai']],
        ['Mumbai', 'Maharashtra', ['mumbai', 'bombay']],
        ['Thane', 'Maharashtra', ['thane']],
        ['Pune', 'Maharashtra', ['pune']],
        ['Nagpur', 'Maharashtra', ['nagpur']],
        ['Nashik', 'Maharashtra', ['nashik', 'nasik']],
        ['Aurangabad', 'Maharashtra', ['aurangabad']],
        ['New Delhi', 'Delhi', ['new delhi']],
        ['Delhi', 'Delhi', ['delhi ncr', 'delhi']],
        ['Gurugram', 'Haryana', ['gurugram', 'gurgaon']],
        ['Faridabad', 'Haryana', ['faridabad']],
        ['Greater Noida', 'Uttar Pradesh', ['greater noida']],
        ['Noida', 'Uttar Pradesh', ['noida']],
        ['Ghaziabad', 'Uttar Pradesh', ['ghaziabad']],
        ['Lucknow', 'Uttar Pradesh', ['lucknow']],
        ['Kanpur', 'Uttar Pradesh', ['kanpur']],
        ['Varanasi', 'Uttar Pradesh', ['varanasi']],
        ['Bengaluru', 'Karnataka', ['bengaluru', 'bangalore']],
        ['Mysuru', 'Karnataka', ['mysuru', 'mysore']],
        ['Mangaluru', 'Karnataka', ['mangaluru', 'mangalore']],
        ['Udupi', 'Karnataka', ['udupi']],
        ['Hyderabad', 'Telangana', ['hyderabad', 'secunderabad']],
        ['Chennai', 'Tamil Nadu', ['chennai', 'madras']],
        ['Coimbatore', 'Tamil Nadu', ['coimbatore']],
        ['Madurai', 'Tamil Nadu', ['madurai']],
        ['Kolkata', 'West Bengal', ['kolkata', 'calcutta']],
        ['Ahmedabad', 'Gujarat', ['ahmedabad']],
        ['Gandhinagar', 'Gujarat', ['gandhinagar']],
        ['Vadodara', 'Gujarat', ['vadodara', 'baroda']],
        ['Surat', 'Gujarat', ['surat']],
        ['Rajkot', 'Gujarat', ['rajkot']],
        ['Vapi', 'Gujarat', ['vapi']],
        ['Jaipur', 'Rajasthan', ['jaipur']],
        ['Udaipur', 'Rajasthan', ['udaipur']],
        ['Jodhpur', 'Rajasthan', ['jodhpur']],
        ['Indore', 'Madhya Pradesh', ['indore']],
        ['Bhopal', 'Madhya Pradesh', ['bhopal']],
        ['Chandigarh', 'Chandigarh', ['chandigarh']],
        ['Mohali', 'Punjab', ['mohali']],
        ['Ludhiana', 'Punjab', ['ludhiana']],
        ['Kochi', 'Kerala', ['kochi', 'cochin', 'ernakulam']],
        ['Thiruvananthapuram', 'Kerala', ['thiruvananthapuram', 'trivandrum']],
        ['Bhubaneswar', 'Odisha', ['bhubaneswar']],
        ['Patna', 'Bihar', ['patna']],
        ['Raipur', 'Chhattisgarh', ['raipur']],
        ['Ranchi', 'Jharkhand', ['ranchi']],
        ['Guwahati', 'Assam', ['guwahati']],
        ['Visakhapatnam', 'Andhra Pradesh', ['visakhapatnam', 'vizag']],
        ['Vijayawada', 'Andhra Pradesh', ['vijayawada']],
        ['Dehradun', 'Uttarakhand', ['dehradun']],
        ['Goa', 'Goa', ['goa', 'panaji']]
    ];

    var STATES = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
        'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
        'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
        'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh'];

    // Places outside India that show up in job locations -> ISO country code.
    var FOREIGN = [
        ['Dubai', 'AE', ['dubai']], ['Abu Dhabi', 'AE', ['abu dhabi']], ['', 'AE', ['uae', 'united arab emirates']],
        ['Singapore', 'SG', ['singapore']], ['Hong Kong', 'HK', ['hong kong']], ['London', 'GB', ['london']],
        ['', 'GB', ['united kingdom']], ['', 'US', ['united states', 'usa']], ['Doha', 'QA', ['doha', 'qatar']],
        ['Riyadh', 'SA', ['riyadh', 'saudi arabia']], ['Muscat', 'OM', ['muscat', 'oman']],
        ['', 'BH', ['bahrain']], ['', 'KW', ['kuwait']], ['Kathmandu', 'NP', ['kathmandu', 'nepal']]
    ];

    function slugify(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .normalize('NFKD').replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/['\u2019]/g, '')
            .replace(/&/g, ' ')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    // Cut a slug to at most `max` characters on a word (hyphen) boundary.
    function clip(slug, max) {
        if (slug.length <= max) return slug;
        var cut = slug.slice(0, max + 1);
        var lastHyphen = cut.lastIndexOf('-');
        cut = lastHyphen > 0 ? cut.slice(0, lastHyphen) : slug.slice(0, max);
        return cut.replace(/-+$/, '');
    }

    function companySlug(company) {
        var slug = slugify(company || '');
        // Legal suffixes add length but no search value.
        slug = slug.replace(/(-(private|pvt|limited|ltd|llp|inc|co|corp|corporation|company))+$/, '')
            .replace(/-(and|the|of)$/, '');
        return clip(slug, 45);
    }

    function categoryFromTable(tableName) {
        return TABLE_TO_CATEGORY[tableName] || 'industrial';
    }

    function isVague(value) {
        return VAGUE_DOMAINS.indexOf(String(value || '').trim().toLowerCase()) !== -1;
    }

    // The job's specialisation ("Business Finance", "Statutory Audit"), or '' when it's "Other".
    function jobDomain(job) {
        var candidates = [job && job.Category, job && job['Primary Domain']];
        for (var i = 0; i < candidates.length; i++) {
            var value = candidates[i];
            if (value && !isVague(value)) return String(value).trim();
        }
        return '';
    }

    function roleBase(job, category) {
        if (category === 'fresher' && /experienced/i.test(String(job && job.Experience || ''))) {
            return 'Chartered Accountant';
        }
        return ROLE_TITLE[category] || 'Chartered Accountant';
    }

    // Job title for Google for Jobs and the page heading: "CA Industrial Trainee - Business Finance".
    function jobTitle(job, category) {
        var base = roleBase(job, category);
        var domain = jobDomain(job);
        return domain ? base + ' - ' + domain : base;
    }

    function shortJobId(id) {
        var value = String(id === null || id === undefined ? '' : id).trim().toLowerCase();
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(value)) return value.slice(0, 8);
        return slugify(value);
    }

    function aliasRegex(alias) {
        return new RegExp('(^|[^a-z])' + alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[^a-z]|$)');
    }

    // Parse a free-text location ("Chakala, Andheri, Mumbai", "Pune / Bengaluru", "Pan India")
    // into places: [{ city, region, country }]. Also reports remote and pan-India jobs.
    function parseLocation(location) {
        var raw = String(location || '');
        var text = ' ' + raw.toLowerCase().replace(/\s+/g, ' ') + ' ';
        var found = [];

        function scan(list, defaultCountry) {
            var aliases = [];
            list.forEach(function (entry) {
                entry[2].forEach(function (alias) { aliases.push({ alias: alias, entry: entry }); });
            });
            aliases.sort(function (a, b) { return b.alias.length - a.alias.length; });
            aliases.forEach(function (item) {
                var re = aliasRegex(item.alias);
                var match = re.exec(text);
                if (!match) return;
                var index = match.index + match[1].length;
                found.push({
                    index: index,
                    city: item.entry[0],
                    region: defaultCountry === 'IN' ? item.entry[1] : '',
                    country: defaultCountry === 'IN' ? 'IN' : item.entry[1]
                });
                // Blank the match so "mumbai" inside "navi mumbai" is not counted twice.
                text = text.slice(0, index) + ' '.repeat(item.alias.length) + text.slice(index + item.alias.length);
            });
        }

        scan(CITIES, 'IN');
        scan(FOREIGN, 'XX');
        found.sort(function (a, b) { return a.index - b.index; });

        var places = [];
        var seen = {};
        found.forEach(function (place) {
            var key = place.city + '|' + place.country;
            if (seen[key]) return;
            seen[key] = true;
            places.push({ city: place.city, region: place.region, country: place.country });
        });
        // "Dubai, UAE": the country-only match adds nothing once a city in it was found.
        places = places.filter(function (place) {
            return place.city || !places.some(function (other) { return other.city && other.country === place.country; });
        });

        var lower = raw.toLowerCase();
        var remote = /\b(remote|work from home|wfh)\b/.test(lower);
        var panIndia = /\b(pan[\s-]?india|anywhere in india|multiple locations|all india)\b/.test(lower);

        if (!places.length) {
            // Unknown town: use the first part as the city and look for a state in the rest.
            var parts = raw.split(/[,/|;]/).map(function (p) { return p.replace(/\(.*?\)/g, '').trim(); }).filter(Boolean);
            var region = '';
            parts.forEach(function (part) {
                STATES.forEach(function (state) {
                    if (!region && part.toLowerCase() === state.toLowerCase()) region = state;
                });
            });
            var first = parts[0] || '';
            var firstLower = first.toLowerCase();
            var isCountryOrVague = firstLower === 'india' || isVague(first) || remote || panIndia ||
                firstLower === region.toLowerCase();
            if (first && !isCountryOrVague) {
                places.push({ city: first, region: region, country: 'IN' });
            } else if (region) {
                places.push({ city: '', region: region, country: 'IN' });
            }
        }

        return { places: places, remote: remote, panIndia: panIndia };
    }

    function locationSlug(location) {
        var parsed = parseLocation(location);
        if (parsed.places.length && parsed.places[0].city) return slugify(parsed.places[0].city);
        if (parsed.places.length && parsed.places[0].region) return slugify(parsed.places[0].region);
        if (parsed.remote) return 'remote';
        return 'india';
    }

    // "<company>-hiring-<role>[-<domain>]-<city>-<id>"
    function jobSlug(job, category) {
        job = job || {};
        var parts = [];
        var company = companySlug(job.Company);
        if (company) parts.push(company, 'hiring');
        parts.push(slugify(roleBase(job, category)));
        var domain = clip(slugify(jobDomain(job)), 30);
        if (domain) parts.push(domain);
        parts.push(locationSlug(job.Location));
        var id = shortJobId(job.id);
        if (id) parts.push(id);
        return parts.filter(Boolean).join('-').replace(/-{2,}/g, '-');
    }

    function jobPath(job, category) {
        return '/jobs/' + category + '/' + jobSlug(job, category);
    }

    function jobUrl(job, category) {
        return DOMAIN + jobPath(job, category);
    }

    // Link for "Share this job". Job pages are built every 3 hours, so a job posted in the
    // last few hours may have no page yet: those keep the job.html link (portal popup, with
    // a WhatsApp preview) instead of a URL that would answer 404 for now.
    var PAGE_BUILD_LAG_MS = 6 * 60 * 60 * 1000;
    function shareUrl(job, category, now) {
        var posted = new Date(job && job.Created_At);
        var age = (now ? new Date(now) : new Date()).getTime() - posted.getTime();
        if (Number.isFinite(age) && age >= PAGE_BUILD_LAG_MS) return jobUrl(job, category);
        return DOMAIN + '/job.html?id=' + encodeURIComponent(job && job.id) + '&type=' + encodeURIComponent(category);
    }

    // Read the job id back out of a job page path (old or new format). Used by the 404 page.
    function parseJobPath(pathname) {
        var match = /^\/jobs\/(industrial|fresher|semi-qualified|articleship)\/([^/?#]+?)(?:\.html)?\/?$/.exec(String(pathname || ''));
        if (!match) return null;
        var category = match[1];
        var slug = match[2].toLowerCase();
        var id = '';
        var uuid = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(slug);
        if (uuid) {
            id = uuid[1];
        } else if (category === 'semi-qualified') {
            var shortUuid = /(?:^|-)([0-9a-f]{8})$/.exec(slug);
            id = shortUuid ? shortUuid[1] : '';
        } else {
            var numeric = /(?:^|-)(\d+)$/.exec(slug);
            id = numeric ? numeric[1] : '';
        }
        return id ? { category: category, id: id } : null;
    }

    // Emails, links and phone numbers stay hidden on public pages. Same rule as the portal
    // popup, plus numbers written with spaces or dashes ("98765 43210", "+91-98765-43210",
    // "022 2345 6789") and "www." links, because these pages are public and indexed.
    function maskContacts(text) {
        if (!text) return '';
        return String(text).trim()
            .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '[email protected]')
            .replace(/https?:\/\/[^\s)]+/gi, '[link protected]')
            .replace(/\bwww\.[^\s)]+/gi, '[link protected]')
            .replace(/\+?\d[\d\s().-]{8,}\d/g, function (match) {
                return match.replace(/\D/g, '').length >= 10 ? '[phone protected]' : match;
            });
    }

    // Salary as Google wants it, or null when we can't tell.
    function parseSalary(job, category) {
        var sources = [job && job.Salary, job && job['Stipend Range'], job && job['CTC Range']];
        for (var i = 0; i < sources.length; i++) {
            var source = sources[i];
            if (source === null || source === undefined || source === '') continue;
            var text = String(source);
            var numbers = (text.match(/\d[\d,]*(?:\.\d+)?/g) || [])
                .map(function (n) { return parseFloat(n.replace(/,/g, '')); })
                .filter(function (n) { return n > 0; });
            if (!numbers.length || numbers.length > 2) continue;
            // Two numbers only count as a range when written as one ("25,000 - 30,000", "8 to 10 LPA").
            if (numbers.length === 2 && !/\d\s*(?:-|–|to)\s*(?:rs\.?|₹|inr)?\s*\d/i.test(text)) continue;
            var multiplier = /\b(lpa|lakhs?|lacs?|l\.p\.a)\b/i.test(text) ? 100000 : 1;
            numbers = numbers.map(function (n) { return Math.round(n * multiplier); });
            var unit;
            if (/(month|\bpm\b|p\.m\.?)/i.test(text)) unit = 'MONTH';
            else if (multiplier > 1 || /(annum|per year|\byear|\bp\.?a\b|\bctc\b)/i.test(text)) unit = 'YEAR';
            else if (category === 'industrial' || category === 'articleship') unit = 'MONTH';
            else unit = Math.max.apply(null, numbers) >= 100000 ? 'YEAR' : 'MONTH';
            var min = Math.min.apply(null, numbers);
            var max = Math.max.apply(null, numbers);
            if (unit === 'MONTH' && max < 1000) continue; // "5" or "10" is not a monthly stipend
            if (unit === 'YEAR' && max < 50000) continue;
            var value = { '@type': 'QuantitativeValue', unitText: unit };
            if (min === max) value.value = min; else { value.minValue = min; value.maxValue = max; }
            return { '@type': 'MonetaryAmount', currency: 'INR', value: value };
        }
        return null;
    }

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Masked description as simple HTML (the same text the page shows).
    function descriptionHtml(description) {
        var masked = maskContacts(description);
        if (!masked) return '';
        return escapeHtml(masked)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    }

    function addDays(iso, days) {
        var date = new Date(iso);
        date.setUTCDate(date.getUTCDate() + days);
        return date.toISOString();
    }

    function toIso(value) {
        var date = value ? new Date(value) : null;
        return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
    }

    // schema.org JobPosting for Google for Jobs.
    // https://developers.google.com/search/docs/appearance/structured-data/job-posting
    function jobPostingJsonLd(job, category) {
        job = job || {};
        var datePosted = toIso(job.Created_At) || new Date().toISOString();
        var location = parseLocation(job.Location);
        var company = String(job.Company || '').trim() || 'Confidential';
        var description = descriptionHtml(job.Description) ||
            escapeHtml(jobTitle(job, category) + ' opening at ' + company + (job.Location ? ' in ' + job.Location : '') + '.');

        var data = {
            '@context': 'https://schema.org/',
            '@type': 'JobPosting',
            title: jobTitle(job, category),
            description: description,
            identifier: { '@type': 'PropertyValue', name: 'My Student Club', value: String(job.id) },
            url: jobUrl(job, category),
            datePosted: datePosted,
            validThrough: addDays(datePosted, JOB_EXPIRATION_DAYS),
            employmentType: (category === 'industrial' || category === 'articleship') ? 'INTERN' : 'FULL_TIME',
            hiringOrganization: { '@type': 'Organization', name: company },
            directApply: false
        };

        var industry = job['Industry Type'] || job['Firm Type'];
        if (industry && !isVague(industry)) data.industry = String(industry);

        if (category === 'industrial' || category === 'articleship' ||
            (category === 'fresher' && !/experienced/i.test(String(job.Experience || '')))) {
            data.experienceRequirements = 'no requirements';
        }

        if (location.places.length) {
            var places = location.places.map(function (place) {
                var address = { '@type': 'PostalAddress', addressCountry: place.country };
                if (place.city) address.addressLocality = place.city;
                if (place.region) address.addressRegion = place.region;
                var pin = /\b\d{6}\b/.exec(String(job.Location || ''));
                if (pin && place.country === 'IN' && location.places.length === 1) address.postalCode = pin[0];
                return { '@type': 'Place', address: address };
            });
            data.jobLocation = places.length === 1 ? places[0] : places;
        }
        if (location.remote) {
            data.jobLocationType = 'TELECOMMUTE';
            data.applicantLocationRequirements = { '@type': 'Country', name: 'India' };
        }
        if (!data.jobLocation && !data.jobLocationType) {
            // Pan-India or unknown town: Google still needs a place, so give the country.
            data.jobLocation = { '@type': 'Place', address: { '@type': 'PostalAddress', addressCountry: 'IN' } };
        }

        var salary = parseSalary(job, category);
        if (salary) data.baseSalary = salary;

        return data;
    }

    var api = {
        DOMAIN: DOMAIN,
        JOB_EXPIRATION_DAYS: JOB_EXPIRATION_DAYS,
        TABLE_TO_CATEGORY: TABLE_TO_CATEGORY,
        CATEGORY_TO_TABLE: CATEGORY_TO_TABLE,
        CATEGORY_PORTAL: CATEGORY_PORTAL,
        CATEGORY_LABEL: CATEGORY_LABEL,
        slugify: slugify,
        categoryFromTable: categoryFromTable,
        jobDomain: jobDomain,
        jobTitle: jobTitle,
        shortJobId: shortJobId,
        parseLocation: parseLocation,
        jobSlug: jobSlug,
        jobPath: jobPath,
        jobUrl: jobUrl,
        shareUrl: shareUrl,
        parseJobPath: parseJobPath,
        maskContacts: maskContacts,
        parseSalary: parseSalary,
        descriptionHtml: descriptionHtml,
        jobPostingJsonLd: jobPostingJsonLd
    };

    root.MSCJobSeo = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
