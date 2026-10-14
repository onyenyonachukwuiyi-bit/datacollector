// State management
let state = {
  currentView: 'dashboard',
  experiments: [],
  currentExperiment: null,
  currentExperimentDetail: null,
  observations: [],
  analyticsData: null,
  dashboardChartInstance: null,
  treatmentChartInstance: null
};

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Lucide icons
  if (window.lucide) lucide.createIcons();

  // Set today's date in form
  const dateInput = document.getElementById('form-date');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  // Register service worker if available
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.error);
  }

  await loadExperiments();
  await loadActiveExperiment();
  await loadObservations();
  await runStatisticalAnalysis();
});

// ==========================================
// NAVIGATION & ROUTING
// ==========================================
function navigate(viewName) {
  state.currentView = viewName;
  const sections = ['dashboard', 'experiments', 'plot-layout', 'ai-camera', 'data-entry', 'data-browser', 'analytics', 'export'];

  sections.forEach(sec => {
    const el = document.getElementById(`view-${sec}`);
    if (el) {
      if (sec === viewName) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
  });

  // Update nav buttons styling
  document.querySelectorAll('#nav-links button').forEach(btn => {
    const target = btn.getAttribute('data-view');
    if (target === viewName) {
      btn.className = 'nav-item w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition text-emerald-400 bg-emerald-950/40 border border-emerald-800/50';
    } else {
      btn.className = 'nav-item w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition text-slate-400 hover:text-slate-100 hover:bg-slate-800/60';
    }
  });

  // View specific refreshes
  if (viewName === 'plot-layout') renderPlotGrid();
  if (viewName === 'ai-camera') initAICameraView();
  if (viewName === 'analytics') runStatisticalAnalysis();
  if (viewName === 'data-browser') renderObservationsTable();
  if (viewName === 'dashboard') updateDashboardMetrics();

  if (window.lucide) lucide.createIcons();
}

// ==========================================
// DATA FETCHING & API INTERACTION (OFFLINE RESILIENT)
// ==========================================
async function loadExperiments() {
  try {
    const res = await fetch('/api/experiments');
    if (res.ok) {
      const data = await res.json();
      state.experiments = data;
      localStorage.setItem('agroplot_experiments', JSON.stringify(data));
    } else {
      throw new Error('Server returned ' + res.status);
    }
  } catch (err) {
    console.warn('Operating offline or network issue, reading cached experiments', err);
    const cached = localStorage.getItem('agroplot_experiments');
    if (cached) {
      state.experiments = JSON.parse(cached);
    }
  }

  if (!state.currentExperiment && state.experiments.length > 0) {
    state.currentExperiment = state.experiments[0].id;
  }

  renderExperimentsList();
}

async function loadActiveExperiment() {
  if (!state.currentExperiment && state.experiments.length > 0) {
    state.currentExperiment = state.experiments[0].id;
  }
  if (!state.currentExperiment) return;

  try {
    const res = await fetch(`/api/experiments/${state.currentExperiment}`);
    if (res.ok) {
      const data = await res.json();
      state.currentExperimentDetail = data;
      localStorage.setItem(`agroplot_exp_${state.currentExperiment}`, JSON.stringify(data));
    } else {
      throw new Error('Server returned ' + res.status);
    }
  } catch (err) {
    console.warn('Operating offline, reading cached experiment details', err);
    const cached = localStorage.getItem(`agroplot_exp_${state.currentExperiment}`);
    if (cached) {
      state.currentExperimentDetail = JSON.parse(cached);
    }
  }

  const data = state.currentExperimentDetail;
  if (!data) return;

  // Update active badges
  const titleEl = document.getElementById('active-exp-title');
  if (titleEl) titleEl.innerText = data.name;

  // Populate Target Plot select in Data Entry form
  populatePlotSelect(data.plots);

  // Populate Replications filter in Plot Grid
  populateRepFilter(data.replications);

  updateDashboardMetrics();
  renderPlotGrid();
}

async function loadObservations() {
  if (!state.currentExperiment) return;
  try {
    const res = await fetch(`/api/observations?experiment_id=${state.currentExperiment}`);
    if (res.ok) {
      const data = await res.json();
      state.observations = data;
      localStorage.setItem(`agroplot_obs_${state.currentExperiment}`, JSON.stringify(data));
    } else {
      throw new Error('Server returned ' + res.status);
    }
  } catch (err) {
    console.warn('Operating offline, reading cached observations', err);
    const cached = localStorage.getItem(`agroplot_obs_${state.currentExperiment}`);
    if (cached) {
      state.observations = JSON.parse(cached);
    }
  }

  renderObservationsTable();
  updateDashboardMetrics();
}

// ==========================================
// DASHBOARD VIEW
// ==========================================
function updateDashboardMetrics() {
  const d = state.currentExperimentDetail;
  if (!d) return;

  document.getElementById('stat-total-experiments').innerText = state.experiments.length;
  document.getElementById('stat-total-plots').innerText = d.plots ? d.plots.length : 0;
  document.getElementById('stat-total-obs').innerText = state.observations.length;

  document.getElementById('dash-exp-name').innerText = d.name;
  document.getElementById('dash-exp-desc').innerText = d.description || 'No description provided.';
  document.getElementById('dash-exp-crop').innerText = `${d.crop} (${d.variety || 'N/A'})`;
  document.getElementById('dash-exp-location').innerText = d.location || 'Field Trial Area';
  document.getElementById('dash-exp-season').innerText = d.season || 'Standard Season';
  document.getElementById('dash-exp-reps').innerText = `${d.replications} Replications (${d.design_type})`;
  document.getElementById('dash-design-type').innerText = d.design_type;

  // Calculate yield mean across observations
  const yields = state.observations.map(o => o.grain_yield_kg_ha).filter(y => y != null && !isNaN(y));
  if (yields.length > 0) {
    const sum = yields.reduce((a, b) => a + b, 0);
    const mean = sum / yields.length;
    document.getElementById('stat-mean-yield').innerText = Math.round(mean).toLocaleString();

    // CV
    const variance = yields.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / yields.length;
    const cv = ((Math.sqrt(variance) / mean) * 100).toFixed(1);
    document.getElementById('stat-yield-cv').innerText = `Trial CV: ${cv}%`;
  } else {
    document.getElementById('stat-mean-yield').innerText = 'N/A';
    document.getElementById('stat-yield-cv').innerText = 'No yield records';
  }

  renderDashboardChart();
}

function renderDashboardChart() {
  const ctx = document.getElementById('dashboardChart');
  if (!ctx || !state.currentExperimentDetail) return;

  const treatments = state.currentExperimentDetail.treatments || [];
  const labels = treatments.map(t => `${t.code} (${t.name.split(' ')[0]})`);

  // Calculate average yield and biomass per treatment
  const yieldMeans = treatments.map(t => {
    const obs = state.observations.filter(o => o.treatment_code === t.code && o.grain_yield_kg_ha != null);
    if (!obs.length) return 0;
    return Math.round(obs.reduce((a, b) => a + b.grain_yield_kg_ha, 0) / obs.length);
  });

  const biomassMeans = treatments.map(t => {
    const obs = state.observations.filter(o => o.treatment_code === t.code && o.biomass_kg_ha != null);
    if (!obs.length) return 0;
    return Math.round(obs.reduce((a, b) => a + b.biomass_kg_ha, 0) / obs.length);
  });

  if (state.dashboardChartInstance) {
    state.dashboardChartInstance.destroy();
  }

  state.dashboardChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Grain Yield (kg/ha)',
          data: yieldMeans,
          backgroundColor: '#10b981',
          borderRadius: 6
        },
        {
          label: 'Total Biomass (kg/ha)',
          data: biomassMeans,
          backgroundColor: '#3b82f6',
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#94a3b8', font: { size: 11 } }
        }
      },
      scales: {
        x: {
          grid: { color: '#1e293b' },
          ticks: { color: '#94a3b8' }
        },
        y: {
          grid: { color: '#1e293b' },
          ticks: { color: '#94a3b8' }
        }
      }
    }
  });
}

// ==========================================
// EXPERIMENTS VIEW
// ==========================================
function renderExperimentsList() {
  const container = document.getElementById('experiments-list');
  if (!container) return;

  container.innerHTML = state.experiments.map(exp => `
    <div class="bg-slate-900 border ${exp.id === state.currentExperiment ? 'border-emerald-500/60 shadow-lg shadow-emerald-950/40 ring-1 ring-emerald-500/20' : 'border-slate-800'} p-5 rounded-xl flex flex-col justify-between transition hover:border-slate-700">
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs px-2 py-0.5 rounded bg-slate-800 text-emerald-400 font-semibold border border-slate-700">${exp.design_type}</span>
          <span class="text-xs text-slate-500">${exp.crop}</span>
        </div>
        <h3 class="font-bold text-white text-base leading-snug mb-1">${exp.name}</h3>
        <p class="text-xs text-slate-400 line-clamp-2 mb-4">${exp.description || 'No description provided.'}</p>

        <div class="space-y-1.5 text-xs text-slate-300 border-t border-slate-800/80 pt-3">
          <div class="flex justify-between"><span class="text-slate-500">Replications:</span> <span>${exp.replications}</span></div>
          <div class="flex justify-between"><span class="text-slate-500">Total Plots:</span> <span>${exp.plot_count || 0}</span></div>
          <div class="flex justify-between"><span class="text-slate-500">Observations:</span> <span>${exp.observation_count || 0}</span></div>
        </div>
      </div>

      <div class="pt-4 border-t border-slate-800 mt-4 flex gap-2">
        <button onclick="selectExperiment('${exp.id}')" class="flex-1 py-2 text-xs ${exp.id === state.currentExperiment ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'} rounded-lg font-medium text-center transition">
          ${exp.id === state.currentExperiment ? 'Active Trial' : 'Select Trial'}
        </button>
        <button onclick="deleteExperiment('${exp.id}')" class="p-2 text-xs bg-slate-800/60 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 rounded-lg transition" title="Delete experiment">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

async function selectExperiment(id) {
  state.currentExperiment = id;
  await loadActiveExperiment();
  await loadObservations();
  await runStatisticalAnalysis();
  renderExperimentsList();
  navigate('dashboard');
}

async function deleteExperiment(id) {
  if (!confirm('Are you sure you want to delete this trial? All associated plots and observations will be removed.')) return;
  try {
    await fetch(`/api/experiments/${id}`, { method: 'DELETE' });
    state.currentExperiment = null;
    await loadExperiments();
    await loadActiveExperiment();
    await loadObservations();
  } catch (err) {
    alert('Failed to delete experiment: ' + err.message);
  }
}

// ==========================================
// PLOT GRID & LAYOUT
// ==========================================
function populateRepFilter(replications) {
  const sel = document.getElementById('plot-filter-rep');
  if (!sel) return;
  sel.innerHTML = '<option value="all">All Replications / Blocks</option>';
  for (let i = 1; i <= replications; i++) {
    sel.innerHTML += `<option value="${i}">Replication / Block ${i}</option>`;
  }
}

function renderPlotGrid() {
  const container = document.getElementById('plot-grid');
  const legend = document.getElementById('plot-treatment-legend');
  const d = state.currentExperimentDetail;
  if (!container || !d || !d.plots) return;

  // Render Legend
  if (legend && d.treatments) {
    legend.innerHTML = '<span class="text-slate-400 font-semibold mr-2">Treatments:</span>' +
      d.treatments.map(t => `
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-full" style="background-color: ${t.color}"></span>
          <span class="text-slate-300 font-medium">${t.code}: ${t.name}</span>
        </div>
      `).join('');
  }

  const selectedRep = document.getElementById('plot-filter-rep')?.value || 'all';
  let plots = d.plots;
  if (selectedRep !== 'all') {
    plots = plots.filter(p => p.replication == selectedRep);
  }

  // Group by Replication
  const reps = [...new Set(plots.map(p => p.replication))].sort((a, b) => a - b);

  container.innerHTML = reps.map(rep => {
    const repPlots = plots.filter(p => p.replication === rep);
    return `
      <div class="space-y-2">
        <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <i data-lucide="layers" class="w-3.5 h-3.5 text-emerald-400"></i>
          <span>Replication / Block ${rep}</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
          ${repPlots.map(p => {
            const hasObs = state.observations.some(o => o.plot_id === p.id);
            return `
              <div onclick="selectPlotForEntry('${p.id}', '${p.plot_number}')" 
                class="cursor-pointer bg-slate-950/80 hover:bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-xl p-3 transition flex flex-col justify-between relative overflow-hidden group shadow-sm">
                <div class="absolute top-0 left-0 right-0 h-1.5" style="background-color: ${p.treatment_color || '#10b981'}"></div>
                <div class="flex justify-between items-start mt-1">
                  <span class="font-bold text-sm text-white">#${p.plot_number}</span>
                  <span class="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold" style="background-color: ${p.treatment_color}25; color: ${p.treatment_color}">${p.treatment_code}</span>
                </div>
                <div class="mt-3 text-[11px] text-slate-400 truncate">${p.treatment_name}</div>
                <div class="mt-2 flex items-center justify-between text-[10px]">
                  <span class="${hasObs ? 'text-emerald-400 font-medium' : 'text-slate-600'} flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full ${hasObs ? 'bg-emerald-400' : 'bg-slate-600'}"></span>
                    ${hasObs ? 'Recorded' : 'Empty'}
                  </span>
                  <span class="text-slate-500 font-mono">R${p.replication}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function selectPlotForEntry(plotId, plotNumber) {
  navigate('data-entry');
  const sel = document.getElementById('form-plot-select');
  if (sel) sel.value = plotId;
  const badge = document.getElementById('data-entry-target-plot-badge');
  if (badge) badge.innerText = `Selected Plot #${plotNumber}`;
}

// ==========================================
// DATA ENTRY FORM
// ==========================================
let editingObservationId = null;

function populatePlotSelect(plots) {
  const sel = document.getElementById('form-plot-select');
  if (!sel || !plots) return;
  sel.innerHTML = '<option value="">-- Choose Plot --</option>' +
    plots.map(p => `
      <option value="${p.id}">Plot #${p.plot_number} — ${p.treatment_code} (${p.treatment_name}) [Rep ${p.replication}]</option>
    `).join('');

  sel.onchange = () => {
    const selectedPlotId = sel.value;
    if (!selectedPlotId) return;
    const existing = state.observations.find(o => o.plot_id === selectedPlotId);
    if (existing) {
      loadObservationIntoForm(existing);
    } else {
      resetObservationForm(false);
    }
  };
}

function loadObservationIntoForm(o) {
  editingObservationId = o.id;
  const sel = document.getElementById('form-plot-select');
  if (sel) sel.value = o.plot_id;

  const badge = document.getElementById('data-entry-target-plot-badge');
  if (badge) badge.innerHTML = `<span class="text-amber-400 font-semibold">Editing Plot #${o.plot_number}</span> (Update Mode)`;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = (val !== null && val !== undefined) ? val : '';
  };

  setVal('form-date', o.observation_date);
  setVal('form-stage', o.growth_stage);
  setVal('form-observer', o.observer);

  setVal('in-plant-height', o.plant_height_cm);
  setVal('in-stem-diameter', o.stem_diameter_mm);
  setVal('in-leaf-count', o.leaf_count);
  setVal('canopy_cover_pct', o.canopy_cover_pct);

  setVal('in-chlorophyll', o.chlorophyll_spad);
  setVal('in-lai', o.lai);
  setVal('in-ndvi', o.ndvi);
  setVal('in-photo-rate', o.photosynthesis_rate);
  setVal('in-stomatal', o.stomatal_conductance);
  setVal('in-water-pot', o.leaf_water_potential);

  setVal('in-days-emergence', o.days_to_emergence);
  setVal('in-days-flowering', o.days_to_flowering);
  setVal('in-days-maturity', o.days_to_maturity);
  setVal('in-flowering-date', o.flowering_date);

  setVal('in-yield', o.grain_yield_kg_ha);
  setVal('in-biomass', o.biomass_kg_ha);
  setVal('in-tgw', o.thousand_grain_weight_g);
  setVal('in-harvest-index', o.harvest_index);

  setVal('in-disease-score', o.disease_score_1_9);
  setVal('in-pest-score', o.pest_score_1_9);
  setVal('in-soil-moist', o.soil_moisture_pct);
  setVal('in-soil-temp', o.soil_temp_c);
  setVal('in-notes', o.notes);
}

function resetObservationForm(clearPlot = true) {
  editingObservationId = null;
  const form = document.getElementById('observation-form');
  if (form) form.reset();
  const dateInput = document.getElementById('form-date');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
  const badge = document.getElementById('data-entry-target-plot-badge');
  if (badge) badge.innerText = 'Select a plot below or from the Plot Grid';
  if (!clearPlot) {
    const sel = document.getElementById('form-plot-select');
    if (sel && sel.value) {
      const opt = sel.options[sel.selectedIndex];
      if (badge && opt) badge.innerText = opt.text;
    }
  }
}

async function handleSaveObservation(e) {
  e.preventDefault();
  if (!state.currentExperiment) {
    alert('Please select an active experiment first');
    return;
  }

  const plotId = document.getElementById('form-plot-select').value;
  if (!plotId) {
    alert('Please select a target plot');
    return;
  }

  const getNum = id => {
    const val = document.getElementById(id)?.value;
    return val !== '' && !isNaN(val) ? parseFloat(val) : null;
  };

  const payload = {
    experiment_id: state.currentExperiment,
    plot_id: plotId,
    observation_date: document.getElementById('form-date').value,
    growth_stage: document.getElementById('form-stage').value,
    observer: document.getElementById('form-observer').value,

    // Agronomic
    plant_height_cm: getNum('in-plant-height'),
    stem_diameter_mm: getNum('in-stem-diameter'),
    leaf_count: getNum('in-leaf-count'),
    canopy_cover_pct: getNum('in-canopy-cover'),

    // Physiology
    chlorophyll_spad: getNum('in-chlorophyll'),
    lai: getNum('in-lai'),
    ndvi: getNum('in-ndvi'),
    photosynthesis_rate: getNum('in-photo-rate'),
    stomatal_conductance: getNum('in-stomatal'),
    leaf_water_potential: getNum('in-water-pot'),

    // Phenology
    days_to_emergence: getNum('in-days-emergence'),
    days_to_flowering: getNum('in-days-flowering'),
    days_to_maturity: getNum('in-days-maturity'),
    flowering_date: document.getElementById('in-flowering-date')?.value || null,

    // Yield
    grain_yield_kg_ha: getNum('in-yield'),
    biomass_kg_ha: getNum('in-biomass'),
    thousand_grain_weight_g: getNum('in-tgw'),
    harvest_index: getNum('in-harvest-index'),

    // Biotic / Environment
    disease_score_1_9: getNum('in-disease-score'),
    pest_score_1_9: getNum('in-pest-score'),
    soil_moisture_pct: getNum('in-soil-moist'),
    soil_temp_c: getNum('in-soil-temp'),
    notes: document.getElementById('in-notes').value
  };

  try {
    const isEdit = Boolean(editingObservationId);
    const url = isEdit ? `/api/observations/${editingObservationId}` : '/api/observations';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      alert(isEdit ? 'Observation updated successfully!' : 'Observation saved successfully!');
      resetObservationForm(true);
      await loadObservations();
      await runStatisticalAnalysis();
      navigate('data-browser');
    } else {
      const err = await res.json();
      alert('Error saving observation: ' + err.error);
    }
  } catch (err) {
    alert('Failed to connect to server: ' + err.message);
  }
}

// ==========================================
// DATA BROWSER TABLE
// ==========================================
function renderObservationsTable() {
  const tbody = document.getElementById('observations-tbody');
  const countEl = document.getElementById('table-row-count');
  if (!tbody) return;

  const obs = state.observations;
  countEl.innerText = `${obs.length} observations loaded`;

  if (obs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="p-6 text-center text-slate-500 font-sans">No observations recorded for this trial yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = obs.map(o => `
    <tr class="hover:bg-slate-800/40 transition">
      <td class="p-3 font-bold text-white">#${o.plot_number}</td>
      <td class="p-3">
        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px]" style="background-color: ${o.treatment_color}20; color: ${o.treatment_color}">
          <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${o.treatment_color}"></span>
          ${o.treatment_code}
        </span>
      </td>
      <td class="p-3 text-slate-400">R${o.replication} / B${o.block || o.replication}</td>
      <td class="p-3 text-slate-400">${o.observation_date}</td>
      <td class="p-3 text-slate-200">${o.plant_height_cm ?? '-'}</td>
      <td class="p-3 text-slate-200">${o.chlorophyll_spad ?? '-'}</td>
      <td class="p-3 text-slate-200">${o.ndvi ?? '-'}</td>
      <td class="p-3 text-emerald-400 font-semibold">${o.grain_yield_kg_ha ? Math.round(o.grain_yield_kg_ha).toLocaleString() : '-'}</td>
      <td class="p-3 text-blue-400">${o.biomass_kg_ha ? Math.round(o.biomass_kg_ha).toLocaleString() : '-'}</td>
      <td class="p-3">
        <div class="flex items-center gap-1.5">
          <button onclick="editObservation('${o.id}')" class="text-slate-400 hover:text-emerald-400 p-1 rounded hover:bg-slate-800 transition" title="Edit observation">
            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
          </button>
          <button onclick="deleteObservation('${o.id}')" class="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-slate-800 transition" title="Delete record">
            <i data-lucide="trash" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function editObservation(id) {
  const obs = state.observations.find(o => o.id === id);
  if (!obs) return;
  navigate('data-entry');
  loadObservationIntoForm(obs);
}

function filterObservationsTable() {
  const query = document.getElementById('table-search')?.value.toLowerCase() || '';
  const rows = document.querySelectorAll('#observations-tbody tr');
  rows.forEach(row => {
    const text = row.innerText.toLowerCase();
    row.style.display = text.includes(query) ? '' : 'none';
  });
}

async function deleteObservation(id) {
  if (!confirm('Delete this observation?')) return;
  try {
    await fetch(`/api/observations/${id}`, { method: 'DELETE' });
    await loadObservations();
    await runStatisticalAnalysis();
  } catch (err) {
    alert('Failed to delete observation: ' + err.message);
  }
}

// ==========================================
// STATISTICAL ANALYSIS & ANOVA
// ==========================================
async function runStatisticalAnalysis() {
  if (!state.currentExperiment) return;

  const trait = document.getElementById('analysis-trait-select')?.value || 'grain_yield_kg_ha';

  try {
    const res = await fetch(`/api/analysis/${state.currentExperiment}?trait=${trait}`);
    const data = await res.json();
    state.analyticsData = data;

    renderAnovaResults(data);
    renderTreatmentChart(data);
    renderCorrelationMatrix(data.correlationMatrix);
  } catch (err) {
    console.error('Failed to run analytics:', err);
  }
}

function renderAnovaResults(data) {
  const anova = data.anova;
  const desc = data.overallDescriptive;

  document.getElementById('stat-grand-mean').innerText = desc.mean.toLocaleString();
  document.getElementById('stat-sample-size').innerText = `n = ${desc.count} plots`;
  document.getElementById('stat-cv').innerText = `${anova ? anova.cvPercent : desc.cv}%`;

  if (anova) {
    document.getElementById('stat-f-val').innerText = `F = ${anova.fTreatment || anova.fValue}`;
    const sig = (anova.significantTreatment ?? anova.significant);
    const sigEl = document.getElementById('stat-significance-tag');
    if (sig) {
      sigEl.innerText = `Significant (p < 0.05) *`;
      sigEl.className = 'text-xs font-semibold text-emerald-400';
    } else {
      sigEl.innerText = `Non-Significant (p ≥ 0.05)`;
      sigEl.className = 'text-xs font-semibold text-slate-400';
    }
    document.getElementById('stat-lsd').innerText = anova.cd5 || anova.lsd || 'N/A';
    document.getElementById('anova-model-desc').innerText = anova.design;

    // Render ANOVA Table rows
    const tbody = document.getElementById('anova-tbody');
    tbody.innerHTML = anova.anovaTable.map(row => `
      <tr class="hover:bg-slate-800/40">
        <td class="p-3 font-semibold text-white">${row.source}</td>
        <td class="p-3 text-slate-300">${row.df}</td>
        <td class="p-3 text-slate-300">${row.ss}</td>
        <td class="p-3 text-slate-300">${row.ms}</td>
        <td class="p-3 text-emerald-400 font-bold">${row.f}</td>
        <td class="p-3 text-blue-400">${row.p}</td>
      </tr>
    `).join('');
  }
}

function renderTreatmentChart(data) {
  const ctx = document.getElementById('treatmentMeansChart');
  if (!ctx || !data.treatmentStats) return;

  const labels = Object.keys(data.treatmentStats);
  const means = labels.map(l => data.treatmentStats[l].mean);
  const stdDevs = labels.map(l => data.treatmentStats[l].stdDev);

  if (state.treatmentChartInstance) {
    state.treatmentChartInstance.destroy();
  }

  state.treatmentChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Mean Value',
        data: means,
        backgroundColor: '#10b981',
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8' } },
        y: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8' } }
      }
    }
  });
}

function renderCorrelationMatrix(matrix) {
  const container = document.getElementById('correlation-matrix-container');
  if (!container || !matrix) return;

  const traits = Object.keys(matrix);
  const traitShortLabels = {
    plant_height_cm: 'Height',
    stem_diameter_mm: 'Stem Dia',
    leaf_count: 'Leaves',
    chlorophyll_spad: 'SPAD',
    lai: 'LAI',
    ndvi: 'NDVI',
    grain_yield_kg_ha: 'Yield',
    biomass_kg_ha: 'Biomass',
    soil_moisture_pct: 'Soil Moist'
  };

  let html = `
    <table class="w-full text-center text-[11px] font-mono border-collapse">
      <thead>
        <tr class="border-b border-slate-800 text-slate-400">
          <th class="p-2 text-left font-sans">Trait</th>
          ${traits.map(t => `<th class="p-2">${traitShortLabels[t] || t}</th>`).join('')}
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-800/60">
  `;

  traits.forEach(t1 => {
    html += `<tr><td class="p-2 text-left font-sans font-semibold text-slate-300">${traitShortLabels[t1] || t1}</td>`;
    traits.forEach(t2 => {
      const cell = matrix[t1][t2];
      const r = cell ? cell.r : 0;
      let colorClass = 'text-slate-500';
      if (r >= 0.7) colorClass = 'text-emerald-400 font-bold bg-emerald-950/20';
      else if (r <= -0.7) colorClass = 'text-rose-400 font-bold bg-rose-950/20';
      else if (r > 0.4) colorClass = 'text-emerald-300';
      else if (r < -0.4) colorClass = 'text-rose-300';

      html += `<td class="p-2 ${colorClass}">${r.toFixed(2)}</td>`;
    });
    html += `</tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
}

// ==========================================
// EXPORTING DATA
// ==========================================
function exportDataCSV() {
  if (!state.observations.length) {
    alert('No data to export.');
    return;
  }

  const keys = Object.keys(state.observations[0]);
  let csv = keys.join(',') + '\n';

  state.observations.forEach(o => {
    const row = keys.map(k => {
      let val = o[k] ?? '';
      if (typeof val === 'string' && val.includes(',')) val = `"${val}"`;
      return val;
    }).join(',');
    csv += row + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `AgroPlot_${state.currentExperimentDetail?.name.replace(/\s+/g, '_')}_Observations.csv`;
  a.click();
}

function exportDataJSON() {
  const exportPayload = {
    experiment: state.currentExperimentDetail,
    observations: state.observations,
    exported_at: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `AgroPlot_Trial_Export.json`;
  a.click();
}

function exportRScript() {
  const rScript = `# AgroPlot Analysis Script for R (agricolae / lme4)
# Load necessary libraries
library(agricolae)

# Read exported data
df <- read.csv("AgroPlot_Observations.csv")

# RCBD ANOVA Model for Grain Yield
model <- aov(grain_yield_kg_ha ~ block + treatment_code, data = df)
summary(model)

# Duncan or LSD Post-hoc test
lsd_test <- LSD.test(model, "treatment_code", p.adj="bonferroni", console=TRUE)
plot(lsd_test)
`;

  const blob = new Blob([rScript], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agroplot_analysis.R`;
  a.click();
}

// ==========================================
// MODAL CONTROLS
// ==========================================
function openNewExperimentModal() {
  document.getElementById('modal-experiment')?.classList.remove('hidden');
}

function closeNewExperimentModal() {
  document.getElementById('modal-experiment')?.classList.add('hidden');
}

async function handleCreateExperiment(e) {
  e.preventDefault();
  const trtInput = document.getElementById('modal-exp-treatments').value;
  const treatments = trtInput.split(',').map((t, idx) => ({
    code: `T${idx + 1}`,
    name: t.trim()
  }));

  const payload = {
    name: document.getElementById('modal-exp-name').value,
    crop: document.getElementById('modal-exp-crop').value,
    variety: document.getElementById('modal-exp-variety').value,
    design_type: document.getElementById('modal-exp-design').value,
    replications: parseInt(document.getElementById('modal-exp-reps').value, 10),
    location: document.getElementById('modal-exp-location').value,
    season: document.getElementById('modal-exp-season').value,
    treatments
  };

  try {
    const res = await fetch('/api/experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      closeNewExperimentModal();
      state.currentExperiment = data.id;
      await loadExperiments();
      await loadActiveExperiment();
      await loadObservations();
      navigate('plot-layout');
    } else {
      const err = await res.json();
      alert('Failed to create experiment: ' + err.error);
    }
  } catch (err) {
    alert('Server connection error: ' + err.message);
  }
}

// ==========================================
// AI FIELD CAMERA & VISION CONTROLLERS
// ==========================================
let aiCameraStream = null;
let currentAIExtraction = null;

function initAICameraView() {
  populateCameraPlotSelect();
  // Restore current AI provider in modal inputs
  const prov = localStorage.getItem('agroplot_ai_provider') || 'embedded';
  const key = localStorage.getItem('agroplot_ai_api_key') || '';
  const model = localStorage.getItem('agroplot_ai_model') || 'gemini-1.5-flash';

  const provEl = document.getElementById('ai-cfg-provider');
  const keyEl = document.getElementById('ai-cfg-key');
  const modelEl = document.getElementById('ai-cfg-model');
  const hudModeTag = document.getElementById('hud-mode-tag');

  if (provEl) provEl.value = prov;
  if (keyEl) keyEl.value = key;
  if (modelEl) modelEl.value = model;
  if (hudModeTag) hudModeTag.innerText = prov === 'embedded' ? 'EDGE VISION (OFFLINE)' : `${prov.toUpperCase()} CLOUD AI`;

  toggleAIKeyInput();
}

function populateCameraPlotSelect() {
  const sel = document.getElementById('camera-plot-select');
  if (!sel || !state.currentExperimentDetail) return;
  const plots = state.currentExperimentDetail.plots || [];
  sel.innerHTML = '<option value="">-- Choose Target Plot --</option>' +
    plots.map(p => `
      <option value="${p.id}">Plot #${p.plot_number} — ${p.treatment_code} (${p.treatment_name}) [R${p.replication}]</option>
    `).join('');
}

async function startAICamera() {
  const video = document.getElementById('ai-camera-stream');
  const inactiveState = document.getElementById('camera-inactive-state');
  const previewImg = document.getElementById('ai-camera-preview');

  try {
    const constraints = {
      video: {
        facingMode: { ideal: 'environment' }, // Back camera for field trials
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };
    aiCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    if (video) {
      video.srcObject = aiCameraStream;
      video.classList.remove('hidden');
    }
    if (previewImg) previewImg.classList.add('hidden');
    if (inactiveState) inactiveState.classList.add('hidden');

    const fpsTag = document.getElementById('camera-fps-tag');
    if (fpsTag) fpsTag.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Streaming Live';
  } catch (err) {
    console.warn('Could not access camera device lens:', err);
    alert('Camera permission denied or camera device not detected. You can use "Upload Field Photo" to analyze images from your files/gallery.');
  }
}

function stopAICamera() {
  if (aiCameraStream) {
    aiCameraStream.getTracks().forEach(track => track.stop());
    aiCameraStream = null;
  }
  const video = document.getElementById('ai-camera-stream');
  if (video) video.srcObject = null;
  const fpsTag = document.getElementById('camera-fps-tag');
  if (fpsTag) fpsTag.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-500"></span> Standby';
}

function toggleAICamera() {
  if (aiCameraStream) {
    stopAICamera();
    const inactiveState = document.getElementById('camera-inactive-state');
    if (inactiveState) inactiveState.classList.remove('hidden');
  } else {
    startAICamera();
  }
}

function handleImageFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    stopAICamera();
    const video = document.getElementById('ai-camera-stream');
    const inactiveState = document.getElementById('camera-inactive-state');
    const previewImg = document.getElementById('ai-camera-preview');

    if (video) video.classList.add('hidden');
    if (inactiveState) inactiveState.classList.add('hidden');
    if (previewImg) {
      previewImg.src = event.target.result;
      previewImg.classList.remove('hidden');
    }

    const fpsTag = document.getElementById('camera-fps-tag');
    if (fpsTag) fpsTag.innerHTML = '<span class="w-2 h-2 rounded-full bg-blue-400"></span> Photo Loaded';

    // Auto-analyze uploaded picture
    analyzeStaticImage(previewImg);
  };
  reader.readAsDataURL(file);
}

async function captureAndAnalyzeFrame() {
  const video = document.getElementById('ai-camera-stream');
  const previewImg = document.getElementById('ai-camera-preview');
  const canvas = document.getElementById('ai-camera-canvas');
  const badge = document.getElementById('ai-analysis-status-badge');

  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (badge) {
    badge.innerText = 'Extracting Phenotypes...';
    badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse';
  }

  let base64 = null;

  if (aiCameraStream && video && !video.classList.contains('hidden') && video.videoWidth > 0) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    base64 = canvas.toDataURL('image/jpeg', 0.85);
  } else if (previewImg && !previewImg.classList.contains('hidden') && previewImg.naturalWidth > 0) {
    canvas.width = previewImg.naturalWidth;
    canvas.height = previewImg.naturalHeight;
    ctx.drawImage(previewImg, 0, 0, canvas.width, canvas.height);
    base64 = canvas.toDataURL('image/jpeg', 0.85);
  } else {
    alert('Please start the camera stream or upload a crop photo first.');
    if (badge) badge.innerText = 'Standby';
    return;
  }

  // Step 1: Real-time Edge Pixel Analysis (Instant / 100% Offline)
  const edgeMetrics = await window.AgroAI.analyzeImagePixels(canvas);
  updateAIResultUI(edgeMetrics);

  // Update HUD values
  const hudCanopy = document.getElementById('hud-canopy-val');
  const hudNdvi = document.getElementById('hud-ndvi-val');
  if (hudCanopy) hudCanopy.innerText = `${edgeMetrics.canopy_cover_pct}%`;
  if (hudNdvi) hudNdvi.innerText = `${edgeMetrics.ndvi}`;

  currentAIExtraction = {
    ...edgeMetrics,
    capturedImage: base64
  };

  // Step 2: Check if user enabled Cloud Vision AI (Gemini / OpenAI) for deep diagnostic
  const plotId = document.getElementById('camera-plot-select')?.value;
  let plotInfo = {};
  if (plotId && state.currentExperimentDetail) {
    plotInfo = state.currentExperimentDetail.plots.find(p => p.id === plotId) || {};
  }

  if (window.AgroAI.apiKey && window.AgroAI.apiProvider !== 'embedded') {
    try {
      if (badge) badge.innerText = 'Running Cloud Vision Deep Diagnosis...';
      const crop = state.currentExperimentDetail?.crop || 'Crop Plant';
      const cloudResult = await window.AgroAI.analyzeWithCloudAI(base64, crop, plotInfo);

      // Merge Cloud diagnosis with edge ground-truth
      currentAIExtraction = {
        ...currentAIExtraction,
        ...cloudResult,
        // Retain edge optical NDVI and Canopy unless cloud provides tighter confidence
        canopy_cover_pct: cloudResult.canopy_cover_pct ?? edgeMetrics.canopy_cover_pct,
        ndvi: cloudResult.ndvi ?? edgeMetrics.ndvi,
        chlorophyll_spad: cloudResult.chlorophyll_spad ?? edgeMetrics.chlorophyll_spad,
        lai: cloudResult.lai ?? edgeMetrics.lai,
        disease_score_1_9: cloudResult.disease_score_1_9 ?? edgeMetrics.disease_score_1_9
      };

      updateAIResultUI(currentAIExtraction);
    } catch (err) {
      console.warn('Cloud Vision returned error, using edge vision extraction:', err);
    }
  }

  if (badge) {
    badge.innerText = 'Extraction Complete';
    badge.className = 'px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
  }

  // Enable Commit button
  const commitBtn = document.getElementById('btn-commit-ai');
  if (commitBtn) commitBtn.disabled = false;
}

function analyzeStaticImage(imgEl) {
  setTimeout(() => {
    captureAndAnalyzeFrame();
  }, 300);
}

function updateAIResultUI(metrics) {
  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val !== undefined && val !== null ? val : '--';
  };

  setEl('ai-res-canopy', `${metrics.canopy_cover_pct}%`);
  setEl('ai-res-ndvi', metrics.ndvi);
  setEl('ai-res-spad', metrics.chlorophyll_spad);
  setEl('ai-res-lai', metrics.lai);

  const barCanopy = document.getElementById('ai-bar-canopy');
  if (barCanopy) barCanopy.style.width = `${Math.min(100, metrics.canopy_cover_pct)}%`;

  const barNdvi = document.getElementById('ai-bar-ndvi');
  if (barNdvi) barNdvi.style.width = `${Math.min(100, metrics.ndvi * 100)}%`;

  setEl('ai-res-stage', metrics.growth_stage || 'Vegetative / Canopy Active');
  setEl('ai-res-disease', `Score ${metrics.disease_score_1_9} / 9.0`);
  setEl('ai-res-pathogen', metrics.disease_name || (metrics.disease_score_1_9 <= 2.5 ? 'Normal Foliage' : 'Mild Foliar Chlorosis'));
  setEl('ai-res-height', metrics.plant_height_cm ? `${metrics.plant_height_cm} cm` : 'Calibrated via canopy');

  const notesEl = document.getElementById('ai-res-notes');
  if (notesEl) {
    if (metrics.agronomic_notes) {
      notesEl.innerText = metrics.agronomic_notes;
    } else {
      notesEl.innerText = `Spectral analysis verified canopy coverage at ${metrics.canopy_cover_pct}% with NDVI ${metrics.ndvi}. Foliar necrosis index indicates stress score ${metrics.disease_score_1_9}/9.0.`;
    }
  }
}

async function commitAIObservationToPlot() {
  if (!currentAIExtraction) {
    alert('Please scan an image first.');
    return;
  }

  const plotId = document.getElementById('camera-plot-select')?.value;
  if (!plotId) {
    alert('Please select a target plot from the dropdown above to save this observation.');
    return;
  }

  if (!state.currentExperiment) {
    alert('No active experiment selected.');
    return;
  }

  // Pre-fill observation form and switch or save directly
  const payload = {
    experiment_id: state.currentExperiment,
    plot_id: plotId,
    observation_date: new Date().toISOString().split('T')[0],
    growth_stage: currentAIExtraction.growth_stage || 'AI Canopy Sampled',
    observer: 'AI Field Lens Scanner',

    canopy_cover_pct: currentAIExtraction.canopy_cover_pct,
    ndvi: currentAIExtraction.ndvi,
    lai: currentAIExtraction.lai,
    chlorophyll_spad: currentAIExtraction.chlorophyll_spad,
    disease_score_1_9: currentAIExtraction.disease_score_1_9,
    pest_score_1_9: currentAIExtraction.pest_score_1_9 || null,
    disease_name: currentAIExtraction.disease_name || null,
    pest_name: currentAIExtraction.pest_name || null,
    plant_height_cm: currentAIExtraction.plant_height_cm || null,
    stem_diameter_mm: currentAIExtraction.stem_diameter_mm || null,
    leaf_count: currentAIExtraction.leaf_count || null,
    biomass_kg_ha: currentAIExtraction.biomass_kg_ha || null,
    grain_yield_kg_ha: currentAIExtraction.grain_yield_kg_ha || null,
    notes: `[AI Extracted] ${currentAIExtraction.agronomic_notes || `NDVI ${currentAIExtraction.ndvi}, Canopy ${currentAIExtraction.canopy_cover_pct}%`}`
  };

  try {
    const res = await fetch('/api/observations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      alert(`Plot observation recorded successfully via AI Vision!`);
      await loadObservations();
      await runStatisticalAnalysis();
      navigate('data-browser');
    } else {
      const err = await res.json();
      alert('Error saving AI observation: ' + err.error);
    }
  } catch (err) {
    alert('Server connection error: ' + err.message);
  }
}

// ==========================================
// AI SYNTHESIS REPORT CONTROLLER
// ==========================================
async function generateAITrialSynthesis() {
  if (!state.currentExperimentDetail || !state.analyticsData) {
    alert('Please load an experiment and run statistical analysis first.');
    return;
  }

  const container = document.getElementById('ai-narrative-container');
  const content = document.getElementById('ai-narrative-content');
  const btn = document.getElementById('btn-ai-synthesize');

  if (container) container.classList.remove('hidden');
  if (content) {
    content.innerHTML = '<div class="flex items-center gap-2 text-emerald-400 py-4"><span class="w-3 h-3 rounded-full bg-emerald-400 animate-ping"></span> Generating AI biometrical synthesis and treatment narrative...</div>';
  }
  if (btn) btn.disabled = true;

  try {
    const narrativeMarkdown = await window.AgroAI.generateNarrativeSynthesis(
      state.currentExperimentDetail,
      state.analyticsData,
      state.observations
    );

    // Simple markdown to HTML format
    const formattedHtml = narrativeMarkdown
      .replace(/### (.*)/g, '<h4 class="text-white font-bold text-sm mt-3 mb-1">$1</h4>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
      .replace(/`(.*?)`/g, '<code class="bg-slate-950 px-1 py-0.5 rounded text-emerald-400 font-mono text-[11px]">$1</code>')
      .replace(/\n- (.*)/g, '<li class="ml-4 list-disc text-slate-300">$1</li>')
      .replace(/\n\n/g, '<p class="mb-2 text-slate-300"></p>');

    if (content) content.innerHTML = formattedHtml;
  } catch (err) {
    if (content) content.innerHTML = `<span class="text-rose-400">Failed to generate synthesis: ${err.message}</span>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function copyAINarrative() {
  const content = document.getElementById('ai-narrative-content');
  if (!content) return;
  navigator.clipboard.writeText(content.innerText);
  alert('AI Agronomic Narrative copied to clipboard!');
}

// ==========================================
// AI CONFIGURATION MODAL CONTROLS
// ==========================================
function openAISettingsModal() {
  const modal = document.getElementById('modal-ai-settings');
  if (modal) modal.classList.remove('hidden');
  initAICameraView();
}

function closeAISettingsModal() {
  const modal = document.getElementById('modal-ai-settings');
  if (modal) modal.classList.add('hidden');
}

function toggleAIKeyInput() {
  const prov = document.getElementById('ai-cfg-provider')?.value;
  const keyContainer = document.getElementById('ai-key-container');
  if (!keyContainer) return;

  if (prov === 'embedded') {
    keyContainer.classList.add('hidden');
  } else {
    keyContainer.classList.remove('hidden');
  }
}

function saveAISettings() {
  const prov = document.getElementById('ai-cfg-provider').value;
  const key = document.getElementById('ai-cfg-key').value;
  const model = document.getElementById('ai-cfg-model').value;

  window.AgroAI.saveConfig(prov, key, model);
  closeAISettingsModal();

  const hudModeTag = document.getElementById('hud-mode-tag');
  if (hudModeTag) hudModeTag.innerText = prov === 'embedded' ? 'EDGE VISION (OFFLINE)' : `${prov.toUpperCase()} CLOUD AI`;

  alert('AI Vision configuration saved!');
}
