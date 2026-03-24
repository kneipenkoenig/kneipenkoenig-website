// Cloudflare Worker: Analytics Proxy für Der Kneipenkönig Admin
// Free-Plan: max 1 Tag pro Query → wir splitten in Tages-Abfragen

export default {
  async fetch(request, env) {
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
    const days = Math.min(parseInt(url.searchParams.get('days') || '7', 10), 90);

    const CF_API_TOKEN = env.CF_API_TOKEN;
    const CF_ZONE_ID = env.CF_ZONE_ID;

    if (!CF_API_TOKEN || !CF_ZONE_ID) {
      return jsonResp({ error: 'CF_API_TOKEN oder CF_ZONE_ID nicht konfiguriert' }, 500);
    }

    try {
      const now = new Date();
      // Tages-Ranges für aktuelle Periode
      const curRanges = buildDayRanges(now, days);
      // Tages-Ranges für Vorperiode
      const prevRanges = buildDayRanges(new Date(now - days * 86400000), days);

      // Alle Tages-Abfragen parallel (Summary + TopPages für aktuelle, Summary für Vorperiode)
      const curSummaryPromises = curRanges.map(r =>
        cfQueryDay(CF_API_TOKEN, CF_ZONE_ID, r.start, r.end, 'summary')
      );
      const prevSummaryPromises = prevRanges.map(r =>
        cfQueryDay(CF_API_TOKEN, CF_ZONE_ID, r.start, r.end, 'summary')
      );
      const curTopPagesPromises = curRanges.map(r =>
        cfQueryDay(CF_API_TOKEN, CF_ZONE_ID, r.start, r.end, 'topPages')
      );

      const [curSummaries, prevSummaries, curTopPages] = await Promise.all([
        Promise.all(curSummaryPromises),
        Promise.all(prevSummaryPromises),
        Promise.all(curTopPagesPromises),
      ]);

      // Aggregiere Summary
      const current = aggregateSummary(curSummaries);
      const previous = aggregateSummary(prevSummaries);

      // Timeline aus täglichen Summaries
      const timeline = curSummaries.map((s, i) => ({
        label: curRanges[i].start.split('T')[0],
        count: s.pageviews,
      }));

      // Aggregiere Top Pages
      const pageMap = {};
      for (const dayPages of curTopPages) {
        for (const p of dayPages) {
          pageMap[p.path] = (pageMap[p.path] || 0) + p.count;
        }
      }
      const topPages = Object.entries(pageMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([path, count]) => ({ path, count }));

      return jsonResp({ current, previous, timeline, topPages });

    } catch (e) {
      return jsonResp({ error: e.message }, 500);
    }
  },
};

function buildDayRanges(endDate, days) {
  const ranges = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = new Date(endDate);
    start.setUTCDate(start.getUTCDate() - i - 1);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    ranges.push({
      start: start.toISOString(),
      end: end.toISOString(),
    });
  }
  return ranges;
}

async function cfQueryDay(token, zoneId, start, end, type) {
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
  } else if (type === 'topPages') {
    query = `{
      viewer {
        zones(filter: {zoneTag: "${zoneId}"}) {
          httpRequestsAdaptiveGroups(
            filter: {datetime_geq: "${start}", datetime_lt: "${end}", clientRequestHTTPHost: "kneipenkoenig.de"}
            limit: 50
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
  } else if (type === 'topPages') {
    const map = {};
    for (const g of groups) {
      const p = g.dimensions?.clientRequestPath || '/';
      map[p] = (map[p] || 0) + g.count;
    }
    return Object.entries(map).map(([path, count]) => ({ path, count }));
  }
}

function aggregateSummary(summaries) {
  let pageviews = 0, bandwidth = 0, visitors = 0;
  for (const s of summaries) {
    pageviews += s.pageviews || 0;
    bandwidth += s.bandwidth || 0;
    visitors += s.visitors || 0;
  }
  return { pageviews, bandwidth, visitors };
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
