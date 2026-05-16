/**
 * Alpine.js component used by index.html sidebar "AI 学情速览" card.
 * Fetches /api/analysis/class-overview and derives the weakest dimension client-side.
 * Now also fetches 100-point scores from /api/analysis/scores.
 */
function aiOverview() {
  return {
    aiLoading: true,
    aiData: null,
    async load() {
      this.aiLoading = true;
      try {
        const [ovRes, wkRes, scRes] = await Promise.all([
          fetch('/api/analysis/class-overview?class_id=1'),
          fetch('/api/analysis/weakness?class_id=1'),
          fetch('/api/analysis/scores?class_id=1').catch(() => null),
        ]);
        if (!ovRes.ok) throw new Error('HTTP ' + ovRes.status);
        const data = await ovRes.json();
        const weakness = wkRes.ok ? await wkRes.json() : {};

        // Merge new 100-point scores if available
        if (scRes && scRes.ok) {
          const scoreData = await scRes.json();
          data.scoreAvg = scoreData.average || null;
          data.scores = scoreData.scores || [];
        }

        const nameMap = {
          vocabulary: '词汇力',
          writing: '写作力',
          discipline: '纪律性',
          engagement: '参与度',
          progress: '进步度',
        };

        // Use 100-point avg for weakest dimension if available
        const avgSrc = data.scoreAvg || data.avg_radar || {};
        let weakKey = null;
        let weakVal = Infinity;
        for (const [k, v] of Object.entries(avgSrc)) {
          if (typeof v === 'number' && v < weakVal) {
            weakVal = v;
            weakKey = k;
          }
        }
        if (weakKey) {
          data.weakest_dimension = { name: nameMap[weakKey] || weakKey, avg: weakVal };
        }

        // Alert: total unique at-risk students across all dimensions
        const riskSet = new Set();
        Object.values(weakness.at_risk_students || {}).forEach(list => {
          list.forEach(s => riskSet.add(s.name));
        });
        data.alert = {
          weakest_name: weakness.weakest_dimension?.name || '-',
          weakest_avg: weakness.weakest_dimension?.avg || 0,
          risk_count: riskSet.size,
        };

        this.aiData = data;
      } catch (e) {
        console.warn('[aiOverview] load failed:', e);
        this.aiData = null;
      } finally {
        this.aiLoading = false;
      }
    },
  };
}
