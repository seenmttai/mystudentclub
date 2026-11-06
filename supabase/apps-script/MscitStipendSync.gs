/**
 * MSCIT stipend sync (6 Nov 2026).
 *
 * Once a day: reads the "MSCIT Hiring Companies List" tab and sends Company / Location / Stipend to Supabase, which
 * fills the stipend on Industrial Training vacancies posted without one (supabase/migrations/202611060001_*).
 *
 * Setup (once, by an owner of the sheet):
 *   1. Extensions → Apps Script on the sheet (or any project the owner runs), add this file.
 *   2. Project Settings → Script Properties: SUPABASE_SERVICE_ROLE_KEY = the service-role key
 *      (Supabase dashboard → Project Settings → API). Never paste it into this file.
 *   3. Run installDailyTrigger() once and allow the permissions it asks for.
 *   4. Run syncMscitStipends() once by hand and read the log: "list rows N, vacancies filled M".
 *
 * Headers are found by name, so moving columns is fine: a header with "company" (or "organisation"), one with
 * "stipend", and optionally one with "location" or "city".
 */

var MSCIT_STIPEND_SHEET_ID = '1vVVFbHawgCnr01_-eSVQLiSa3TZ9yuB00fgmNPZKZJc';
var MSCIT_STIPEND_TAB_GID = 1309949710;
var MSCIT_SUPABASE_URL = 'https://auth.mystudentclub.com';

function syncMscitStipends() {
  var key = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('Script property SUPABASE_SERVICE_ROLE_KEY is not set');

  var ss = SpreadsheetApp.openById(MSCIT_STIPEND_SHEET_ID);
  var tab = ss.getSheets().filter(function (s) { return s.getSheetId() === MSCIT_STIPEND_TAB_GID; })[0];
  if (!tab) throw new Error('Tab gid ' + MSCIT_STIPEND_TAB_GID + ' not found');

  var values = tab.getDataRange().getDisplayValues();
  // The header row is the first row (within the top 10) that has both a company and a stipend column.
  var head = -1, col = {};
  for (var r = 0; r < Math.min(values.length, 10) && head < 0; r++) {
    var c = { company: -1, stipend: -1, location: -1 };
    values[r].forEach(function (h, i) {
      var t = String(h).toLowerCase();
      if (c.company < 0 && /company|organi[sz]ation|firm name/.test(t) && !/location|city|type|stipend/.test(t)) c.company = i;
      else if (c.stipend < 0 && /stipend/.test(t)) c.stipend = i;
      else if (c.location < 0 && /location|city/.test(t)) c.location = i;
    });
    if (c.company >= 0 && c.stipend >= 0) { head = r; col = c; }
  }
  if (head < 0) throw new Error('No header row with a Company and a Stipend column in the first 10 rows');

  var rows = [];
  for (var i = head + 1; i < values.length; i++) {
    var company = String(values[i][col.company] || '').trim();
    var stipend = String(values[i][col.stipend] || '').trim();
    if (!company || !stipend) continue;
    rows.push({ company: company, stipend: stipend, location: col.location >= 0 ? String(values[i][col.location] || '').trim() : '' });
  }
  if (!rows.length) throw new Error('No rows with both a company and a stipend; nothing sent');

  var res = UrlFetchApp.fetch(MSCIT_SUPABASE_URL + '/rest/v1/rpc/sync_mscit_hiring_stipends', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: key, Authorization: 'Bearer ' + key },
    payload: JSON.stringify({ rows: rows }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('Supabase ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  var out = JSON.parse(res.getContentText());
  Logger.log('list rows ' + out.list_rows + ', vacancies filled ' + out.jobs_filled);
  return out;
}

// Daily at about 11 pm IST, after the day's postings.
function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncMscitStipends') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncMscitStipends').timeBased().everyDays(1).atHour(23).inTimezone('Asia/Kolkata').create();
}
