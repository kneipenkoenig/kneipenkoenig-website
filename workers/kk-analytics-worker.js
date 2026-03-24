// Cloudflare Worker: Analytics Proxy für Der Kneipenkönig Admin
// Deployment: Cloudflare Dashboard → Workers & Pages → Create → "Start with Hello World"
//             → Code einfügen → Deploy
// Danach: Settings → Variables → CF_API_TOKEN und CF_ZONE_ID als Secrets hinzufügen

export default {
  async fetch(request, env) {
    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '7', 10);

    const CF_API_TOKEN = env.CF_API_TOKEN;
    const CF_ZONE_ID = env.CF_ZONE_ID;

    if (!CF_API_TOKEN || !CF_ZONE_ID) {
      return jsonResp({ error: 'CF_API_TOKEN oder CF_ZONE_ID nicht konfiguriert' }, 500);
    }

    const now = new Date();
    const curEnd = now.toISOString();
    const curStart = new Date(now - days * 86400000).toISOString();
    const prevEnd = curStart;
    const prevStart = new Date(now - days * 2 * 86400000).toISOString();

    try {
      // Parallel: aktuelle Periode, Vorperiode, Timeline, Top Pages
      const [curData, prevData, timelineData, topPagesData] = await Promise.all([
        cfQuery(CF_API_TOKEN, CF_ZONE_ID, curStart, curEnd, 'summary'),
        cfQuery(CF_API_TOKEN, CF_ZONE_ID, prevStart, prevEnd, 'summary'),
        cfQuery(CF_API_TOKEN, CF_ZONE_ID, curStart, curEnd, 'timeline', days),
        cfQuery(CF_API_TOKEN, CF_ZONE_ID, curStart, curEnd, 'topPages'),
      ]);

      return jsonResp({
        current: curData,
        previous: prevData,
        timeline: timelineData,
        topPages: topPagesData,
      });

    } catch (e) {
      return jsonResp({ error: e.message }, 500);
    }
  },
};

async function cfQuery(token, zoneId, start, end, type, days) {
  const endpoint = 'https://api.cloudflare.com/client/v4/graphql';

  let query;
  if (type === 'summary') {
    query = `{
      viewer {
        zones(filter: {zoneTag: "${zoneId}"}) {
          httpRequestsAdaptiveGroups(
            filter: {datetime_geq: "${start}", datetime_lt: "${end}", clientRequestHTTPHost: "kneipenkoenig.de"}
            limit: 1
          ) {
            count
            sum { edgeResponseBytes visits }
          }
        }
      }
    }`;
  } else if (type === 'timeline') {
    const dimension = days <= 1 ? 'datetimeHour' : 'date';
    query = `{
      viewer {
        zones(filter: {zoneTag: "${zoneId}"}) {
          httpRequestsAdaptiveGroups(
            filter: {datetime_geq: "${start}", datetime_lt: "${end}", clientRequestHTTPHost: "kneipenkoenig.de"}
            limit: 500
            orderBy: [${dimension}_ASC]
          ) {
            count
            dimensions { ${dimension} }
          }
        }
      }
    }`;
  } else if (type === 'topPages') {
    query = `{
      viewer {
        zones(filter: {zoneTag: "${zoneId}"}) {
          httpRequestsAdaptiveGroups(
            filter: {datetime_geq: "${start}", datetime_lt: "${end}", clientRequestHTTPHost: "kneipenkoenig.de"}
            limit: 20
            orderBy: [count_DESC]
          ) {
            count
            dimensions { clientRequestPath }
          }
        }
      }
    }`;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);

  const groups = json.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];

  if (type === 'summary') {
    let pageviews = 0, bandwidth = 0, visitors = 0;
    for (const g of groups) {
      pageviews += g.count;
      bandwidth += g.sum?.edgeResponseBytes || 0;
      visitors += g.sum?.visits || 0;
    }
    return { pageviews, bandwidth, visitors };
  } else if (type === 'timeline') {
    return groups.map(g => ({
      label: g.dimensions?.datetimeHour || g.dimensions?.date || '',
      count: g.count,
    }));
  } else if (type === 'topPages') {
    // Aggregiere gleiche Pfade
    const map = {};
    for (const g of groups) {
      const p = g.dimensions?.clientRequestPath || '/';
      map[p] = (map[p] || 0) + g.count;
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([path, count]) => ({ path, count }));
  }
}

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
