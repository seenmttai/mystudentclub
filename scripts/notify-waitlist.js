/**
 * Shared Notify Me waitlist helper for the program pages.
 *
 * Uses the join_waitlist() and is_on_waitlist() Supabase functions (SQL: notifiable_waitlist_functions): join_waitlist() adds the
 * student without duplicates (email taken from the login token on the server) and is_on_waitlist()
 * answers yes/no, because the notifiable table itself cannot be read from the browser.
 * Until those functions are installed, join() falls back to the old direct insert.
 */
(function (global) {
  function readDeviceKey() {
    try { return localStorage.getItem('msc_device_key'); } catch (_) { return null; }
  }

  function deviceKey() {
    let key = readDeviceKey();
    if (!key) {
      key = 'dk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
      try { localStorage.setItem('msc_device_key', key); } catch (_) { }
    }
    return key;
  }

  function isMissingFunction(error) {
    return error && (error.code === 'PGRST202' || error.status === 404 || /could not find the function/i.test(error.message || ''));
  }

  // db: a Supabase client. topic: the notifiable topic, e.g. 'ca-fresher'. email: only used by the fallback insert.
  async function join(db, topic, email) {
    if (!db) return;
    const key = deviceKey();
    const { error } = await db.rpc('join_waitlist', { p_topic: topic, p_key: key });
    if (!error) return;
    if (!isMissingFunction(error)) {
      console.error('Waitlist join:', error);
      return;
    }
    const { error: insertError } = await db.from('notifiable').insert({ key, email: email || null, topic });
    if (insertError && insertError.code !== '23505') console.error('Waitlist join:', insertError);
  }

  // True when this device key or the signed-in email is already on the topic's waitlist.
  async function isOn(db, topic) {
    if (!db) return false;
    try {
      const { data, error } = await db.rpc('is_on_waitlist', { p_topic: topic, p_key: readDeviceKey() });
      return !error && data === true;
    } catch (_) {
      return false;
    }
  }

  global.MSCWaitlist = { join, isOn };
})(window);
