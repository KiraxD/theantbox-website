// ============================================================
// THE ANT BOX ERP — charts.js
// ApexCharts wrapper with brand-consistent defaults
// ============================================================

// Brand colors
const BRAND = {
  purple: '#8e43ac',
  purpleLight: 'rgba(142,67,172,0.12)',
  black: '#111111',
  muted: '#666666',
  success: '#31b46b',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
  beige: '#f5f3ec',
  grid: 'rgba(17,17,17,0.06)',
};

const PALETTE = [BRAND.purple, BRAND.success, BRAND.info, BRAND.warning, BRAND.danger, '#6366f1', '#ec4899'];

// Default options shared across all charts
function baseOptions() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    chart: {
      fontFamily: "'DM Sans', -apple-system, sans-serif",
      foreColor: isDark ? '#8b85a0' : BRAND.muted,
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true, speed: 400, easing: 'easeinout' },
      background: 'transparent',
    },
    colors: PALETTE,
    grid: {
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : BRAND.grid,
      strokeDashArray: 4,
      padding: { left: 0, right: 0 },
    },
    tooltip: {
      theme: isDark ? 'dark' : 'light',
      style: { fontSize: '13px', fontFamily: "'DM Sans', sans-serif" },
    },
    legend: {
      fontFamily: "'DM Sans', sans-serif",
      fontSize: '13px',
      markers: { radius: 4 },
    },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2.5 },
    markers: { size: 0, hover: { size: 5 } },
  };
}

// ── Area / Line Chart ─────────────────────────────────────────
export function createAreaChart(elementId, { series, categories, title = '', colors = null } = {}) {
  const base = baseOptions();
  const options = {
    ...base,
    chart: { ...base.chart, type: 'area', height: 260 },
    series,
    xaxis: {
      categories,
      labels: { style: { fontSize: '12px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: { style: { fontSize: '12px' }, formatter: v => Math.round(v) },
    },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.35,
        opacityTo: 0,
        stops: [0, 100],
      },
    },
    colors: colors || PALETTE,
  };

  if (title) {
    options.title = { text: title, style: { fontSize: '14px', fontWeight: '600', color: BRAND.black } };
  }

  const chart = new ApexCharts(document.getElementById(elementId), options);
  chart.render();
  return chart;
}

// ── Bar Chart ─────────────────────────────────────────────────
export function createBarChart(elementId, { series, categories, horizontal = false, colors = null, height = 260 } = {}) {
  const base = baseOptions();
  const options = {
    ...base,
    chart: { ...base.chart, type: 'bar', height },
    series,
    plotOptions: {
      bar: {
        borderRadius: 6,
        columnWidth: '55%',
        horizontal,
      },
    },
    xaxis: {
      categories,
      labels: { style: { fontSize: '12px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: { style: { fontSize: '12px' }, formatter: v => Math.round(v) },
    },
    colors: colors || PALETTE,
  };

  const chart = new ApexCharts(document.getElementById(elementId), options);
  chart.render();
  return chart;
}

// ── Donut / Pie Chart ─────────────────────────────────────────
export function createDonutChart(elementId, { series, labels, colors = null, height = 260 } = {}) {
  const base = baseOptions();
  const options = {
    ...base,
    chart: { ...base.chart, type: 'donut', height },
    series,
    labels,
    colors: colors || PALETTE,
    plotOptions: {
      pie: {
        donut: {
          size: '65%',
          labels: {
            show: true,
            total: {
              show: true,
              label: 'Total',
              fontSize: '13px',
              fontWeight: 600,
              color: BRAND.muted,
            },
          },
        },
      },
    },
    legend: { ...base.legend, position: 'bottom' },
  };

  const chart = new ApexCharts(document.getElementById(elementId), options);
  chart.render();
  return chart;
}

// ── Radial Bar ────────────────────────────────────────────────
export function createRadialChart(elementId, { series, labels, colors = null, height = 200 } = {}) {
  const base = baseOptions();
  const options = {
    ...base,
    chart: { ...base.chart, type: 'radialBar', height },
    series,
    labels,
    colors: colors || PALETTE,
    plotOptions: {
      radialBar: {
        track: { background: base.grid.borderColor },
        dataLabels: {
          name: { fontSize: '13px', color: BRAND.muted },
          value: { fontSize: '16px', fontWeight: '700', color: BRAND.black },
        },
      },
    },
  };

  const chart = new ApexCharts(document.getElementById(elementId), options);
  chart.render();
  return chart;
}

// ── Heatmap (attendance calendar) ────────────────────────────
export function createHeatmap(elementId, { series, colors = null, height = 200 } = {}) {
  const base = baseOptions();
  const options = {
    ...base,
    chart: { ...base.chart, type: 'heatmap', height },
    series,
    colors: colors || [BRAND.success],
    plotOptions: {
      heatmap: {
        radius: 4,
        shadeIntensity: 0.5,
        colorScale: {
          ranges: [
            { from: 0, to: 0, color: base.grid.borderColor, name: 'Absent' },
            { from: 1, to: 1, color: BRAND.success, name: 'Present' },
          ],
        },
      },
    },
    dataLabels: { enabled: false },
    xaxis: { labels: { show: true, style: { fontSize: '11px' } } },
  };

  const chart = new ApexCharts(document.getElementById(elementId), options);
  chart.render();
  return chart;
}

// ── Mini sparkline ────────────────────────────────────────────
export function createSparkline(elementId, { data, color = BRAND.purple, type = 'line' } = {}) {
  const options = {
    chart: {
      type,
      height: 50,
      sparkline: { enabled: true },
      animations: { enabled: true, speed: 400 },
    },
    series: [{ data }],
    stroke: { width: 2, curve: 'smooth' },
    fill: {
      type: 'gradient',
      gradient: { opacityFrom: 0.3, opacityTo: 0 },
    },
    colors: [color],
    tooltip: {
      fixed: { enabled: false },
      x: { show: false },
      y: { formatter: v => v },
      marker: { show: false },
    },
  };

  const chart = new ApexCharts(document.getElementById(elementId), options);
  chart.render();
  return chart;
}

// ── Destroy a chart ───────────────────────────────────────────
export function destroyChart(chart) {
  try { chart?.destroy(); } catch { /* ignore */ }
}

// ── Update chart data ─────────────────────────────────────────
export function updateChart(chart, newSeries) {
  chart?.updateSeries(newSeries);
}
