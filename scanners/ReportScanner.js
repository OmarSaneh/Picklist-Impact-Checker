import { sfFetch } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class ReportScanner extends MetadataScanner {
  get label() { return 'Reports'; }

  async scan(_objName, value) {
    let listData;
    try { listData = await sfFetch(`/services/data/v59.0/analytics/reports?pageSize=50`); } catch { return []; }

    const reports = listData.reports || listData || [];
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
