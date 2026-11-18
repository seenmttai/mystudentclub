/* Automail install page: the values the MSC team sets, once (AUTOMAIL-SETUP.md, step 12).
 * copyLink = the master Sheet's link ending in /copy, e.g. https://docs.google.com/spreadsheets/d/<file ID>/copy
 * (an /edit link or the bare file ID works too: the page turns it into the /copy link).
 * While it is the placeholder, "Make my copy" stays disabled.
 * coldList = true only once the master's self-test prints "Cold mailing list opens" (AUTOMAIL-SETUP step 6) and a copy
 * in the test account has imported cold-list rows (step 7.6; the conditions are in step 12.1): then the page mentions
 * "Add firms from the cold mailing list". Left false, students never read about a button they lack. */
window.MSC_AUTOMAIL_CONFIG = {
  copyLink: 'PASTE-THE-COPY-LINK-HERE',
  coldList: false
};
