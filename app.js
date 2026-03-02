/* app.js — Height Horizon */
(function () {
  'use strict';

  // ============================================
  // THEME TOGGLE
  // ============================================
  (function initTheme() {
    const toggle = document.querySelector('[data-theme-toggle]');
    const root = document.documentElement;
    let theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    root.setAttribute('data-theme', theme);
    updateToggleIcon(toggle, theme);

    if (toggle) {
      toggle.addEventListener('click', () => {
        theme = theme === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', theme);
        toggle.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
        updateToggleIcon(toggle, theme);
      });
    }
  })();

  function updateToggleIcon(btn, theme) {
    if (!btn) return;
    btn.innerHTML = theme === 'dark'
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }

  // ============================================
  // STATE
  // ============================================
  let people = [];
  let personIdCounter = 0;
  let chartInstance = null;

  const PERSON_COLORS = [
    '#0B8A8A', '#5B8DEF', '#E07A5F', '#81B29A',
    '#F2CC8F', '#9B72AA', '#3D405B', '#E76F51'
  ];
  const PERSON_COLORS_DARK = [
    '#3DB8B8', '#7DA8F5', '#F09A80', '#9ECFB5',
    '#F5DDB0', '#B895C9', '#8E92B0', '#F09580'
  ];

  function getColor(idx) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const palette = isDark ? PERSON_COLORS_DARK : PERSON_COLORS;
    return palette[idx % palette.length];
  }

  // ============================================
  // CDC DATA HELPERS
  // ============================================
  // CDC_STAT and CDC_INF are loaded from cdc_data.js as arrays of [sex,agemos,L,M,S]

  function getLMSData(sex) {
    // sex: 1=male, 2=female
    // Merge infant + stature data, sorted by agemos
    // Infant covers 0-35.5, Stature covers 24-240
    // Use infant for <24 months, stature for >=24 months
    const inf = (typeof CDC_INF !== 'undefined' ? CDC_INF : []).filter(d => d[0] === sex && d[1] < 24);
    const stat = (typeof CDC_STAT !== 'undefined' ? CDC_STAT : []).filter(d => d[0] === sex);
    const combined = [...inf, ...stat];
    combined.sort((a, b) => a[1] - b[1]);
    return combined;
  }

  function interpolateLMS(data, agemos) {
    // data: sorted array of [sex, agemos, L, M, S]
    if (data.length === 0) return null;
    if (agemos <= data[0][1]) return { L: data[0][2], M: data[0][3], S: data[0][4] };
    if (agemos >= data[data.length - 1][1]) return { L: data[data.length - 1][2], M: data[data.length - 1][3], S: data[data.length - 1][4] };

    // Find bracketing points
    let lo = 0, hi = data.length - 1;
    for (let i = 0; i < data.length - 1; i++) {
      if (data[i][1] <= agemos && data[i + 1][1] >= agemos) {
        lo = i;
        hi = i + 1;
        break;
      }
    }
    const t = (agemos - data[lo][1]) / (data[hi][1] - data[lo][1]);
    return {
      L: data[lo][2] + t * (data[hi][2] - data[lo][2]),
      M: data[lo][3] + t * (data[hi][3] - data[lo][3]),
      S: data[lo][4] + t * (data[hi][4] - data[lo][4])
    };
  }

  function heightToZScore(height, lms) {
    if (!lms) return 0;
    const { L, M, S } = lms;
    if (Math.abs(L) < 0.001) {
      return Math.log(height / M) / S;
    }
    return (Math.pow(height / M, L) - 1) / (L * S);
  }

  function zScoreToHeight(z, lms) {
    if (!lms) return 0;
    const { L, M, S } = lms;
    if (Math.abs(L) < 0.001) {
      return M * Math.exp(S * z);
    }
    return M * Math.pow(1 + L * S * z, 1 / L);
  }

  function normalCDF(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
    return 0.5 * (1.0 + sign * y);
  }

  function zToPercentile(z) {
    return normalCDF(z) * 100;
  }

  function ageInMonths(dob, dateStr) {
    const d1 = new Date(dob);
    const d2 = dateStr ? new Date(dateStr) : new Date();
    let months = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
    const dayDiff = d2.getDate() - d1.getDate();
    if (dayDiff < 0) months -= 1;
    // Add fractional month
    const daysInMonth = new Date(d2.getFullYear(), d2.getMonth() + 1, 0).getDate();
    const frac = (dayDiff >= 0) ? dayDiff / daysInMonth : (daysInMonth + dayDiff) / daysInMonth;
    return months + frac;
  }

  function ageInYears(dob, dateStr) {
    return ageInMonths(dob, dateStr) / 12;
  }

  function formatAge(ageYears) {
    const y = Math.floor(ageYears);
    const m = Math.round((ageYears - y) * 12);
    if (y === 0) return `${m} month${m !== 1 ? 's' : ''}`;
    if (m === 0) return `${y} year${y !== 1 ? 's' : ''}`;
    return `${y}y ${m}m`;
  }

  // ============================================
  // UI RENDERING
  // ============================================
  const peopleList = document.getElementById('peopleList');
  const actionBar = document.getElementById('actionBar');
  const sectionResults = document.getElementById('sectionResults');
  const btnAddPerson = document.getElementById('btnAddPerson');
  const btnAddFirst = document.getElementById('btnAddFirst');
  const btnTryExample = document.getElementById('btnTryExample');
  const btnPredict = document.getElementById('btnPredict');
  const btnReset = document.getElementById('btnReset');

  function createPerson(defaults = {}) {
    personIdCounter++;
    const person = {
      id: personIdCounter,
      name: defaults.name || '',
      role: defaults.role || 'younger',
      sex: defaults.sex || 'male',
      dob: defaults.dob || '',
      adultReached: defaults.adultReached || false,
      adultHeight: defaults.adultHeight || '',
      measurements: defaults.measurements || [{ date: '', height: '' }]
    };
    people.push(person);
    renderPeople();
    updateActionBar();
    return person;
  }

  function removePerson(id) {
    people = people.filter(p => p.id !== id);
    renderPeople();
    updateActionBar();
  }

  function updateActionBar() {
    if (people.length >= 2) {
      actionBar.style.display = '';
    } else {
      actionBar.style.display = 'none';
    }
  }

  function renderPeople() {
    peopleList.innerHTML = '';
    people.forEach((person, idx) => {
      const card = document.createElement('div');
      card.className = 'person-card';
      card.setAttribute('data-person-id', person.id);

      const color = PERSON_COLORS[idx % PERSON_COLORS.length];

      card.innerHTML = `
        <div class="person-card-header">
          <h3><span class="person-number" style="background:${color}">${idx + 1}</span> ${person.name || 'Person ' + (idx + 1)}</h3>
          <button class="btn btn--danger btn--sm" type="button" data-remove="${person.id}" aria-label="Remove person">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Remove
          </button>
        </div>
        <div class="person-card-body">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="name-${person.id}">Name</label>
              <input class="form-input" type="text" id="name-${person.id}" value="${escHtml(person.name)}" placeholder="e.g. Emma" data-field="name">
            </div>
            <div class="form-group">
              <label class="form-label" for="role-${person.id}">Role</label>
              <select class="form-select" id="role-${person.id}" data-field="role">
                <option value="younger" ${person.role === 'younger' ? 'selected' : ''}>Younger Sibling</option>
                <option value="older" ${person.role === 'older' ? 'selected' : ''}>Older Sibling</option>
                <option value="parent" ${person.role === 'parent' ? 'selected' : ''}>Parent / Guardian</option>
                <option value="other" ${person.role === 'other' ? 'selected' : ''}>Other</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="sex-${person.id}">Sex</label>
              <select class="form-select" id="sex-${person.id}" data-field="sex">
                <option value="male" ${person.sex === 'male' ? 'selected' : ''}>Male</option>
                <option value="female" ${person.sex === 'female' ? 'selected' : ''}>Female</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="dob-${person.id}">Date of Birth</label>
              <input class="form-input" type="date" id="dob-${person.id}" value="${person.dob}" data-field="dob">
            </div>
          </div>

          <div class="toggle-wrap">
            <label class="toggle">
              <input type="checkbox" ${person.adultReached ? 'checked' : ''} data-field="adultReached">
              <span class="toggle-thumb"></span>
            </label>
            <span class="form-label">Has reached adult height</span>
          </div>

          <div class="adult-height-row" ${person.adultReached ? '' : 'style="display:none"'}>
            <div class="form-group" style="max-width: 200px;">
              <label class="form-label" for="adulth-${person.id}">Adult Height (cm)</label>
              <input class="form-input" type="number" step="0.1" id="adulth-${person.id}" value="${person.adultHeight}" placeholder="e.g. 175" data-field="adultHeight">
            </div>
          </div>

          <div class="measurements-section" ${person.adultReached ? 'style="display:none"' : ''}>
            <div class="form-label" style="margin-bottom: var(--space-2);">Height Measurements</div>
            <div class="measurements-list" data-measurements="${person.id}">
              ${person.measurements.map((m, mi) => measurementRowHtml(person.id, mi, m)).join('')}
            </div>
            <div style="margin-top: var(--space-2);">
              <button class="btn btn--ghost btn--sm" type="button" data-add-measurement="${person.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Measurement
              </button>
            </div>
          </div>
        </div>
      `;

      peopleList.appendChild(card);
    });

    attachCardListeners();
  }

  function measurementRowHtml(personId, idx, m) {
    return `
      <div class="measurement-row">
        <div class="form-group">
          <label class="form-label" for="mdate-${personId}-${idx}">Date</label>
          <input class="form-input" type="date" id="mdate-${personId}-${idx}" value="${m.date || ''}" data-mfield="date" data-midx="${idx}">
        </div>
        <div class="form-group">
          <label class="form-label" for="mh-${personId}-${idx}">Height (cm)</label>
          <input class="form-input" type="number" step="0.1" id="mh-${personId}-${idx}" value="${m.height || ''}" placeholder="e.g. 120" data-mfield="height" data-midx="${idx}">
        </div>
        <button class="btn-remove" type="button" data-remove-measurement="${idx}" aria-label="Remove measurement">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `;
  }

  function escHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function attachCardListeners() {
    // Remove person
    document.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-remove'));
        removePerson(id);
      });
    });

    // Field changes
    document.querySelectorAll('.person-card').forEach(card => {
      const pid = parseInt(card.getAttribute('data-person-id'));
      const person = people.find(p => p.id === pid);
      if (!person) return;

      card.querySelectorAll('[data-field]').forEach(el => {
        const field = el.getAttribute('data-field');
        const evtType = (el.type === 'checkbox') ? 'change' : 'input';
        el.addEventListener(evtType, () => {
          if (field === 'adultReached') {
            person.adultReached = el.checked;
            const adultRow = card.querySelector('.adult-height-row');
            const measSection = card.querySelector('.measurements-section');
            if (person.adultReached) {
              adultRow.style.display = '';
              measSection.style.display = 'none';
            } else {
              adultRow.style.display = 'none';
              measSection.style.display = '';
            }
          } else if (field === 'adultHeight') {
            person[field] = el.value;
          } else {
            person[field] = el.value;
          }
          // Update header name
          if (field === 'name') {
            const h3 = card.querySelector('.person-card-header h3');
            const numSpan = h3.querySelector('.person-number');
            h3.textContent = '';
            h3.appendChild(numSpan);
            h3.appendChild(document.createTextNode(' ' + (person.name || 'Person ' + (people.indexOf(person) + 1))));
          }
        });
      });

      // Measurement fields
      card.querySelectorAll('[data-mfield]').forEach(el => {
        const mfield = el.getAttribute('data-mfield');
        const midx = parseInt(el.getAttribute('data-midx'));
        el.addEventListener('input', () => {
          if (person.measurements[midx]) {
            person.measurements[midx][mfield] = el.value;
          }
        });
      });

      // Add measurement
      const addBtn = card.querySelector(`[data-add-measurement="${pid}"]`);
      if (addBtn) {
        addBtn.addEventListener('click', () => {
          person.measurements.push({ date: '', height: '' });
          renderPeople();
        });
      }

      // Remove measurement
      card.querySelectorAll('[data-remove-measurement]').forEach(btn => {
        btn.addEventListener('click', () => {
          const midx = parseInt(btn.getAttribute('data-remove-measurement'));
          if (person.measurements.length > 1) {
            person.measurements.splice(midx, 1);
            renderPeople();
          }
        });
      });
    });
  }

  // ============================================
  // PREDICTION ENGINE
  // ============================================
  function runPredictions() {
    // Validate
    const errors = validateInputs();
    if (errors.length > 0) {
      alert('Please fix the following:\n\n' + errors.join('\n'));
      return;
    }

    const results = [];
    const growingPeople = [];
    const adultPeople = [];

    people.forEach((person, idx) => {
      const sexNum = person.sex === 'male' ? 1 : 2;
      const lmsData = getLMSData(sexNum);
      const color = PERSON_COLORS[idx % PERSON_COLORS.length];

      if (person.adultReached) {
        adultPeople.push({
          ...person,
          sexNum,
          lmsData,
          color,
          projectedAdultHeight: parseFloat(person.adultHeight),
          isGrowing: false
        });
      } else {
        // Calculate Z-scores for measurements
        const validMeasurements = person.measurements
          .filter(m => m.date && m.height)
          .map(m => {
            const ageMo = ageInMonths(person.dob, m.date);
            const lms = interpolateLMS(lmsData, ageMo);
            const z = heightToZScore(parseFloat(m.height), lms);
            return { date: m.date, height: parseFloat(m.height), ageMo, z, lms };
          });

        // Use latest Z-score for projection (more responsive to recent growth)
        // If only 1 measurement, use it; if multiple, use average of last 2
        let projZ = 0;
        if (validMeasurements.length >= 2) {
          const sorted = validMeasurements.sort((a, b) => a.ageMo - b.ageMo);
          projZ = (sorted[sorted.length - 1].z + sorted[sorted.length - 2].z) / 2;
        } else if (validMeasurements.length === 1) {
          projZ = validMeasurements[0].z;
        }

        // Project adult height (at 216 months / 18 years)
        const adultLMS = interpolateLMS(lmsData, 216);
        const projectedAdultHeight = zScoreToHeight(projZ, adultLMS);

        // Current percentile
        const latestM = validMeasurements.sort((a, b) => b.ageMo - a.ageMo)[0];
        const currentPercentile = latestM ? zToPercentile(latestM.z) : null;
        const currentAgeMo = latestM ? latestM.ageMo : ageInMonths(person.dob);

        growingPeople.push({
          ...person,
          sexNum,
          lmsData,
          color,
          validMeasurements: validMeasurements.sort((a, b) => a.ageMo - b.ageMo),
          projZ,
          projectedAdultHeight,
          currentPercentile,
          currentAgeMo,
          isGrowing: true
        });
      }
    });

    // Mid-parental height
    const parents = adultPeople.filter(p => p.role === 'parent');
    const fatherHeight = parents.find(p => p.sex === 'male')?.projectedAdultHeight;
    const motherHeight = parents.find(p => p.sex === 'female')?.projectedAdultHeight;
    let midParentalBoys = null, midParentalGirls = null;
    if (fatherHeight && motherHeight) {
      midParentalBoys = (motherHeight + fatherHeight + 13) / 2;
      midParentalGirls = (motherHeight + fatherHeight - 13) / 2;
    }

    // Build chart data
    buildChart([...growingPeople, ...adultPeople], midParentalBoys, midParentalGirls);

    // Percentile summary
    buildPercentileSummary(growingPeople, adultPeople, midParentalBoys, midParentalGirls);

    // Catch-up comparisons
    buildCatchupCards(growingPeople, adultPeople);

    // Show results
    sectionResults.classList.remove('hidden');
    setTimeout(() => {
      sectionResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  function validateInputs() {
    const errors = [];
    if (people.length < 2) {
      errors.push('Add at least 2 people to compare.');
      return errors;
    }
    people.forEach((p, i) => {
      const label = p.name || ('Person ' + (i + 1));
      if (!p.dob) errors.push(`${label}: Date of birth is required.`);
      if (p.adultReached) {
        if (!p.adultHeight || isNaN(parseFloat(p.adultHeight))) {
          errors.push(`${label}: Adult height is required.`);
        }
      } else {
        const valid = p.measurements.filter(m => m.date && m.height);
        if (valid.length < 1) {
          errors.push(`${label}: At least 1 height measurement is required.`);
        }
      }
    });
    return errors;
  }

  // ============================================
  // CHART
  // ============================================
  function buildChart(allPeople, midParentalBoys, midParentalGirls) {
    const canvas = document.getElementById('growthChart');
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }

    const datasets = [];
    let minAge = 20;

    allPeople.forEach((person, idx) => {
      const color = getColor(idx);
      const label = person.name || ('Person ' + (idx + 1));

      if (person.isGrowing) {
        // Plot actual measurements
        const actualData = person.validMeasurements.map(m => {
          const ageYr = m.ageMo / 12;
          if (ageYr < minAge) minAge = ageYr;
          return { x: ageYr, y: m.height };
        });

        datasets.push({
          label: label + ' (measured)',
          data: actualData,
          showLine: true,
          borderColor: color,
          backgroundColor: color,
          pointRadius: 5,
          pointHoverRadius: 7,
          borderWidth: 2,
          tension: 0.3,
          order: 1
        });

        // Plot projected curve from last measurement to age 18
        const projData = [];
        const lastMeas = person.validMeasurements[person.validMeasurements.length - 1];
        const startMo = lastMeas ? lastMeas.ageMo : ageInMonths(person.dob);

        // Connect projection to last measurement point
        if (lastMeas) {
          projData.push({ x: lastMeas.ageMo / 12, y: lastMeas.height });
        }

        for (let mo = Math.ceil(startMo) + 1; mo <= 216; mo += 3) {
          const lms = interpolateLMS(person.lmsData, mo);
          const h = zScoreToHeight(person.projZ, lms);
          projData.push({ x: mo / 12, y: Math.round(h * 10) / 10 });
        }
        // Add age 18 endpoint
        const lms18 = interpolateLMS(person.lmsData, 216);
        projData.push({ x: 18, y: Math.round(zScoreToHeight(person.projZ, lms18) * 10) / 10 });

        datasets.push({
          label: label + ' (projected)',
          data: projData,
          showLine: true,
          borderColor: color,
          backgroundColor: 'transparent',
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 0,
          tension: 0.3,
          order: 2
        });
      } else {
        // Adult: horizontal line across chart
        const h = person.projectedAdultHeight;
        datasets.push({
          label: label + ' (' + h.toFixed(0) + ' cm)',
          data: [{ x: 0, y: h }, { x: 18, y: h }],
          showLine: true,
          borderColor: color,
          backgroundColor: 'transparent',
          borderDash: [3, 3],
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 0,
          tension: 0,
          order: 3
        });
      }
    });

    // Add mid-parental height target lines
    if (midParentalBoys !== null) {
      datasets.push({
        label: 'Mid-parental target (boys) ' + midParentalBoys.toFixed(0) + ' cm',
        data: [{ x: 0, y: midParentalBoys }, { x: 18, y: midParentalBoys }],
        showLine: true,
        borderColor: '#9B72AA',
        backgroundColor: 'transparent',
        borderDash: [2, 4],
        borderWidth: 1.2,
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0,
        order: 4
      });
    }
    if (midParentalGirls !== null) {
      datasets.push({
        label: 'Mid-parental target (girls) ' + midParentalGirls.toFixed(0) + ' cm',
        data: [{ x: 0, y: midParentalGirls }, { x: 18, y: midParentalGirls }],
        showLine: true,
        borderColor: '#E07A5F',
        backgroundColor: 'transparent',
        borderDash: [2, 4],
        borderWidth: 1.2,
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0,
        order: 4
      });
    }

    // Calculate smart x-axis min
    const xMin = Math.max(0, Math.floor(minAge) - 1);

    // Determine chart styling based on theme
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const textColor = isDark ? '#8A9E9E' : '#637070';

    chartInstance = new Chart(canvas, {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2,
        animation: {
          duration: 400
        },
        hover: {
          animationDuration: 0
        },
        interaction: {
          mode: 'nearest',
          intersect: true
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              usePointStyle: true,
              padding: 16,
              font: { family: "'DM Sans', sans-serif", size: 12 },
              color: textColor
            }
          },
          tooltip: {
            backgroundColor: isDark ? '#1A2424' : '#FFFFFF',
            titleColor: isDark ? '#D5E0E0' : '#1A2B2B',
            bodyColor: isDark ? '#8A9E9E' : '#637070',
            borderColor: isDark ? '#334242' : '#D0CDC7',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            titleFont: { family: "'DM Sans', sans-serif", weight: '600' },
            bodyFont: { family: "'DM Sans', sans-serif" },
            callbacks: {
              title: (items) => {
                if (items.length === 0) return '';
                return `Age: ${items[0].parsed.x.toFixed(1)} years`;
              },
              label: (item) => {
                return `${item.dataset.label}: ${item.parsed.y.toFixed(1)} cm`;
              }
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            title: {
              display: true,
              text: 'Age (years)',
              font: { family: "'DM Sans', sans-serif", size: 13 },
              color: textColor
            },
            min: xMin,
            max: 18,
            ticks: {
              stepSize: 2,
              font: { family: "'DM Sans', sans-serif", size: 11 },
              color: textColor
            },
            grid: { color: gridColor }
          },
          y: {
            title: {
              display: true,
              text: 'Height (cm)',
              font: { family: "'DM Sans', sans-serif", size: 13 },
              color: textColor
            },
            ticks: {
              font: { family: "'DM Sans', sans-serif", size: 11 },
              color: textColor
            },
            grid: { color: gridColor }
          }
        }
      }
    });
  }

  // ============================================
  // PERCENTILE SUMMARY
  // ============================================
  function buildPercentileSummary(growing, adults, mpBoys, mpGirls) {
    const grid = document.getElementById('percentileGrid');
    grid.innerHTML = '';

    growing.forEach((person, idx) => {
      const color = getColor(people.indexOf(people.find(p => p.id === person.id)));
      const initial = (person.name || 'P')[0].toUpperCase();
      const pctile = person.currentPercentile !== null ? person.currentPercentile.toFixed(1) : '—';
      const projAdult = person.projectedAdultHeight.toFixed(1);

      let mpNote = '';
      if (person.sexNum === 1 && mpBoys !== null) {
        mpNote = `Mid-parental target: ${mpBoys.toFixed(1)} cm (±8.5 cm)`;
      } else if (person.sexNum === 2 && mpGirls !== null) {
        mpNote = `Mid-parental target: ${mpGirls.toFixed(1)} cm (±8.5 cm)`;
      }

      const card = document.createElement('div');
      card.className = 'percentile-card';
      card.innerHTML = `
        <div class="percentile-avatar" style="background: ${color}">${escHtml(initial)}</div>
        <div class="percentile-info">
          <div class="percentile-name">${escHtml(person.name || 'Person')}</div>
          <div class="percentile-detail">
            Current percentile: <strong>${pctile}th</strong><br>
            Projected adult height: <strong>${projAdult} cm</strong>
            ${mpNote ? '<br><span style="opacity:0.7">' + mpNote + '</span>' : ''}
          </div>
        </div>
      `;
      grid.appendChild(card);
    });

    adults.forEach((person, idx) => {
      const color = getColor(people.indexOf(people.find(p => p.id === person.id)));
      const initial = (person.name || 'P')[0].toUpperCase();

      const card = document.createElement('div');
      card.className = 'percentile-card';
      card.innerHTML = `
        <div class="percentile-avatar" style="background: ${color}">${escHtml(initial)}</div>
        <div class="percentile-info">
          <div class="percentile-name">${escHtml(person.name || 'Person')}</div>
          <div class="percentile-detail">
            Adult height: <strong>${person.projectedAdultHeight.toFixed(1)} cm</strong><br>
            <span class="badge badge--teal">${person.role === 'parent' ? 'Parent' : 'Adult'}</span>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  // ============================================
  // CATCH-UP CARDS
  // ============================================
  function buildCatchupCards(growing, adults) {
    const grid = document.getElementById('catchupGrid');
    grid.innerHTML = '';

    const allTargets = [...growing, ...adults];

    // For each growing person, compare against every other person
    const seen = new Set();
    growing.forEach(child => {
      allTargets.forEach(target => {
        if (child.id === target.id) return;
        // Create a unique pair key to avoid duplicates
        const pairKey = [Math.min(child.id, target.id), Math.max(child.id, target.id)].join('-');
        if (seen.has(pairKey)) return;

        // Only compare a growing child with someone whose current/adult height is greater
        // (or with any adult/parent)
        let targetCurrentH = target.projectedAdultHeight;
        if (target.isGrowing && target.validMeasurements.length > 0) {
          targetCurrentH = target.validMeasurements[target.validMeasurements.length - 1].height;
        }

        // If target is an adult or currently taller, show the comparison
        const childCurrentH = child.validMeasurements.length > 0
          ? child.validMeasurements[child.validMeasurements.length - 1].height
          : 0;

        // Always show comparison if target is adult; for growing targets, show if the child is shorter
        if (!target.isGrowing || childCurrentH < targetCurrentH) {
          seen.add(pairKey);
          const card = buildSingleCatchupCard(child, target);
          if (card) grid.appendChild(card);
        }
      });
    });

    if (grid.children.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>No catch-up comparisons to display. Add at least one growing child and one other person.</p></div>';
    }
  }

  function buildSingleCatchupCard(younger, older) {
    const youngerName = younger.name || 'Younger';
    const olderName = older.name || 'Older';

    // Project month by month from younger's current age
    const startMo = younger.currentAgeMo || ageInMonths(younger.dob);
    let catchUpAge = null;

    // Calculate the age difference in months between younger and older
    // (older DOB is earlier, so this should be positive if older is truly older)
    const youngerDob = new Date(younger.dob);
    const olderDob = new Date(older.dob);
    const dobDiffMo = (youngerDob.getFullYear() - olderDob.getFullYear()) * 12 +
                      (youngerDob.getMonth() - olderDob.getMonth());

    for (let mo = Math.ceil(startMo); mo <= 216; mo++) {
      const youngerLMS = interpolateLMS(younger.lmsData, mo);
      const youngerH = zScoreToHeight(younger.projZ, youngerLMS);

      let olderH;
      if (older.isGrowing) {
        // When younger is at age `mo` months, older is at `mo + dobDiffMo` months
        const olderAgeMo = mo + dobDiffMo;
        if (olderAgeMo > 216) {
          olderH = older.projectedAdultHeight;
        } else if (olderAgeMo < 0) {
          continue;
        } else {
          const olderLMS = interpolateLMS(older.lmsData, olderAgeMo);
          olderH = zScoreToHeight(older.projZ, olderLMS);
        }
      } else {
        olderH = older.projectedAdultHeight;
      }

      if (youngerH >= olderH) {
        catchUpAge = mo / 12;
        break;
      }
    }

    const card = document.createElement('div');
    card.className = 'result-card';

    const youngerColor = getColor(people.findIndex(p => p.id === younger.id));
    const olderColor = getColor(people.findIndex(p => p.id === older.id));

    if (catchUpAge !== null) {
      card.innerHTML = `
        <div class="result-card-title">
          <span class="color-dot" style="background:${youngerColor}"></span>
          ${escHtml(youngerName)} vs
          <span class="color-dot" style="background:${olderColor}"></span>
          ${escHtml(olderName)}
        </div>
        <div class="result-value">${formatAge(catchUpAge)}</div>
        <div class="result-detail">
          ${escHtml(youngerName)} is estimated to match ${escHtml(olderName)}'s height at age ${formatAge(catchUpAge)}.
        </div>
        <div class="result-detail">
          <strong>${escHtml(youngerName)}</strong>: projected ${younger.projectedAdultHeight.toFixed(1)} cm &nbsp;|&nbsp;
          <strong>${escHtml(olderName)}</strong>: ${older.projectedAdultHeight.toFixed(1)} cm
        </div>
        <div class="result-note">Based on current growth trajectory and CDC percentile data</div>
      `;
    } else {
      card.innerHTML = `
        <div class="result-card-title">
          <span class="color-dot" style="background:${youngerColor}"></span>
          ${escHtml(youngerName)} vs
          <span class="color-dot" style="background:${olderColor}"></span>
          ${escHtml(olderName)}
        </div>
        <div class="result-value" style="color: var(--color-text-muted); font-size: var(--text-lg);">Unlikely to catch up</div>
        <div class="result-detail">
          Based on current growth patterns, ${escHtml(youngerName)} is unlikely to reach ${escHtml(olderName)}'s height by age 18.
        </div>
        <div class="result-detail">
          <strong>${escHtml(youngerName)}</strong>: projected ${younger.projectedAdultHeight.toFixed(1)} cm &nbsp;|&nbsp;
          <strong>${escHtml(olderName)}</strong>: ${older.projectedAdultHeight.toFixed(1)} cm
        </div>
        <div class="result-note">Based on current growth trajectory and CDC percentile data</div>
      `;
    }
    return card;
  }

  // ============================================
  // EXAMPLE DATA
  // ============================================
  function loadExample() {
    people = [];
    personIdCounter = 0;

    createPerson({
      name: 'Mum',
      role: 'parent',
      sex: 'female',
      dob: '1985-03-15',
      adultReached: true,
      adultHeight: '165',
      measurements: [{ date: '', height: '' }]
    });
    createPerson({
      name: 'Dad',
      role: 'parent',
      sex: 'male',
      dob: '1983-07-20',
      adultReached: true,
      adultHeight: '180',
      measurements: [{ date: '', height: '' }]
    });
    createPerson({
      name: 'Emma',
      role: 'older',
      sex: 'female',
      dob: '2015-06-10',
      adultReached: false,
      adultHeight: '',
      measurements: [
        { date: '2023-06-10', height: '120' },
        { date: '2024-06-10', height: '126' }
      ]
    });
    createPerson({
      name: 'Jack',
      role: 'younger',
      sex: 'male',
      dob: '2018-09-01',
      adultReached: false,
      adultHeight: '',
      measurements: [
        { date: '2023-09-01', height: '105' },
        { date: '2024-09-01', height: '112' }
      ]
    });

    renderPeople();
    updateActionBar();

    // Scroll to input section
    document.getElementById('sectionInput').scrollIntoView({ behavior: 'smooth' });
  }

  function resetAll() {
    people = [];
    personIdCounter = 0;
    renderPeople();
    updateActionBar();
    sectionResults.classList.add('hidden');
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    document.getElementById('percentileGrid').innerHTML = '';
    document.getElementById('catchupGrid').innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ============================================
  // EVENT BINDINGS
  // ============================================
  btnAddPerson.addEventListener('click', () => createPerson());
  btnAddFirst.addEventListener('click', () => {
    createPerson();
    document.getElementById('sectionInput').scrollIntoView({ behavior: 'smooth' });
  });
  btnTryExample.addEventListener('click', loadExample);
  btnPredict.addEventListener('click', runPredictions);
  btnReset.addEventListener('click', resetAll);

})();
