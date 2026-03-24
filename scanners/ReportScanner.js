import { sfFetch } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class ReportScanner extends MetadataScanner {
  get label() { return 'Reports'; }

  async scan(_objName, value) {
    const reports = [];
    let url = `/services/data/v59.0/analytics/reports`;
    try {
      while (url) {
        const data = await sfFetch(url);
        const page = Array.isArray(data) ? data : (data.reports || []);
        reports.push(...page);
        url = Array.isArray(data) ? null : (data.nextPageUrl || null);
      }
    } catch { return []; }
    const results = [];

    for (const report of reports) {
      try {
        const describe = await sfFetch(`/services/data/v59.0/analytics/reports/${report.id}/describe`);
        const filters = describe.reportMetadata?.reportFilters || [];
        const matchingFilters = filters.filter(f =>
          (f.value || '').split(',').map(v => v.trim()).includes(value)
        );
        if (matchingFilters.length > 0) {
          results.push({
            id: report.id,
            name: report.name,
            snippets: matchingFilters.slice(0, 3).map(f => `${f.column} ${f.operator} ${f.value}`),
            linkType: 'Report',
          });
        }
      } catch { /* skip */ }
    }

    return results;
  }
}
