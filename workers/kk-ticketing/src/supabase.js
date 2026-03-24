/**
 * Supabase-Client für Cloudflare Worker (kein SDK, reines fetch)
 */
export function createSupabaseClient(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY;

  async function query(table, { select = '*', filters = [], single = false, order, limit } = {}) {
    let endpoint = `${url}/rest/v1/${table}?select=${encodeURIComponent(select)}`;
    for (const f of filters) {
      endpoint += `&${f}`;
    }
    if (order) endpoint += `&order=${order}`;
    if (limit) endpoint += `&limit=${limit}`;

    const headers = {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    };
    if (single) headers['Accept'] = 'application/vnd.pgrst.object+json';

    const res = await fetch(endpoint, { headers });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase query failed: ${res.status} ${err}`);
    }
    return res.json();
  }

  async function insert(table, data) {
    const res = await fetch(`${url}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase insert failed: ${res.status} ${err}`);
    }
    return res.json();
  }

  async function update(table, filters, data) {
    let endpoint = `${url}/rest/v1/${table}`;
    if (filters.length) endpoint += `?${filters.join('&')}`;

    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase update failed: ${res.status} ${err}`);
    }
    return res.json();
  }

  async function rpc(fn, params = {}) {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase RPC failed: ${res.status} ${err}`);
    }
    return res.json();
  }

  return { query, insert, update, rpc };
}
