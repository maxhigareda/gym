// GYMMAX PRO — Motor UFC GYM Style con KPIs Limpios, Sync Supabase y Referencia por Ejercicio
(function () {
  const STORAGE_KEY = "gymmax_pro_state_v1";

  function getTodayISO() {
    return new Date().toISOString().split("T")[0];
  }

  function getDefaultDayId() {
    const dayMap = {
      2: "tuesday_push_a",
      3: "wednesday_pull_a",
      4: "thursday_legs_a",
      5: "friday_push_b",
      6: "saturday_pull_b_cardio",
      0: "sunday_legs_b_cardio",
      1: "monday_rest"
    };
    return dayMap[new Date().getDay()] || "tuesday_push_a";
  }

  const defaultState = {
    selectedDayId: getDefaultDayId(),
    supplementsByDate: {},
    workoutHistory: {},
    activeDrafts: {},
    cardioLogs: {},
    bodyMetrics: [],
    lastUpdated: 0
  };

  const SUPABASE_CONFIG = {
    url: "https://kdlffmjkdmlleabrnvqr.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkbGZmbWprZG1sbGVhYnJudnFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4MjQwOTMsImV4cCI6MjEwOTQwMDA5M30.r3e9eQll7y7OPruKCUeqP7fahQqruSHn4EEzeUsYZII",
    recordId: "max_gym_sync_v1"
  };

  let state = loadState();
  let workoutSeconds = 0;
  let workoutTimerId = null;
  let syncTimeout = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultState);
      return Object.assign(structuredClone(defaultState), JSON.parse(raw));
    } catch (_) {
      return structuredClone(defaultState);
    }
  }

  function saveState() {
    state.lastUpdated = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateLiveHeaderStats();
    scheduleCloudPush();
  }

  function scheduleCloudPush() {
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      pushToSupabase();
    }, 1000);
  }

  // ================= SUPABASE CLOUD SYNC =================
  function updateSyncBadge(status, text) {
    const badge = document.getElementById("sync-status-badge");
    const label = document.getElementById("sync-status-text");
    if (!badge || !label) return;
    badge.className = `sync-indicator ${status}`;
    label.textContent = text;
  }

  async function pushToSupabase() {
    if (!navigator.onLine) {
      updateSyncBadge("offline", "Offline");
      return;
    }
    try {
      updateSyncBadge("syncing", "Guardando...");
      const payload = {
        id: SUPABASE_CONFIG.recordId,
        data: state,
        updated_at: new Date().toISOString()
      };
      const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/gym_sync`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_CONFIG.anonKey,
          "Authorization": `Bearer ${SUPABASE_CONFIG.anonKey}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates"
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        updateSyncBadge("synced", "Nube al día");
      } else {
        updateSyncBadge("offline", "Error nube");
      }
    } catch (e) {
      updateSyncBadge("offline", "Offline");
    }
  }

  async function pullFromSupabase(isManual = false) {
    if (!navigator.onLine) {
      updateSyncBadge("offline", "Offline");
      return;
    }
    try {
      updateSyncBadge("syncing", "Cargando...");
      const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/gym_sync?id=eq.${SUPABASE_CONFIG.recordId}&select=*`, {
        headers: {
          "apikey": SUPABASE_CONFIG.anonKey,
          "Authorization": `Bearer ${SUPABASE_CONFIG.anonKey}`
        }
      });
      if (res.ok) {
        const rows = await res.json();
        if (rows && rows.length > 0 && rows[0].data) {
          const cloudData = rows[0].data;
          const cloudTimestamp = cloudData.lastUpdated || (rows[0].updated_at ? new Date(rows[0].updated_at).getTime() : 0);
          const localTimestamp = state.lastUpdated || 0;

          if (localTimestamp > cloudTimestamp) {
            await pushToSupabase();
            return;
          }

          state = Object.assign(structuredClone(defaultState), cloudData);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

          renderSupplements();
          renderRoutineDay();
          renderBodyMetrics();
          renderExercisesKpiList();
          updateLiveHeaderStats();
          updateSyncBadge("synced", "Nube al día");
          if (isManual) alert("✅ Datos sincronizados con éxito desde Supabase.");
        } else {
          await pushToSupabase();
        }
      }
    } catch (e) {
      updateSyncBadge("offline", "Offline");
    }
  }

  window.manualSync = async function () {
    await pullFromSupabase(true);
  };

  // ================= DINÁMICO: ACTUALIZAR SUBTÍTULO DEL HEADER =================
  // Muestra siempre tu edad (38), tu último peso real y estatura (o si ya subiste/bajaste)
  function updateLiveHeaderStats() {
    const el = document.getElementById("live-header-stats");
    if (!el) return;
    const latestMetric = state.bodyMetrics.length > 0 ? state.bodyMetrics[state.bodyMetrics.length - 1] : null;
    const currentWeight = latestMetric && latestMetric.weightKg ? latestMetric.weightKg : 62.0;
    const currentArm = latestMetric && latestMetric.armRightCm ? latestMetric.armRightCm : null;
    
    let text = `38 AÑOS · ${currentWeight} KG · 1.61 M`;
    if (currentArm) {
      text += ` · BRAZO: ${currentArm} CM`;
    }
    el.textContent = text;
  }

  // ================= CRONÓMETRO UFC =================
  window.toggleWorkoutClock = function () {
    const btn = document.getElementById("workout-clock-btn");
    if (workoutTimerId) {
      clearInterval(workoutTimerId);
      workoutTimerId = null;
      btn.classList.remove("active");
    } else {
      btn.classList.add("active");
      workoutTimerId = setInterval(() => {
        workoutSeconds++;
        const mins = String(Math.floor(workoutSeconds / 60)).padStart(2, "0");
        const secs = String(workoutSeconds % 60).padStart(2, "0");
        document.getElementById("workout-clock-label").textContent = `${mins}:${secs}`;
      }, 1000);
    }
  };

  // ================= CHECKLIST SUPLEMENTOS =================
  function renderSupplements() {
    const today = getTodayISO();
    const todaySupp = state.supplementsByDate[today] || { creatine: false, protein: false };

    const btnCreatine = document.getElementById("supp-creatine");
    const btnProtein = document.getElementById("supp-protein");

    btnCreatine.className = "supp-pill" + (todaySupp.creatine ? " done" : "");
    btnCreatine.querySelector(".status-dot").textContent = todaySupp.creatine ? "✓" : "";

    btnProtein.className = "supp-pill" + (todaySupp.protein ? " done" : "");
    btnProtein.querySelector(".status-dot").textContent = todaySupp.protein ? "✓" : "";
  }

  window.toggleSupplement = function (type) {
    const today = getTodayISO();
    if (!state.supplementsByDate[today]) {
      state.supplementsByDate[today] = { creatine: false, protein: false };
    }
    state.supplementsByDate[today][type] = !state.supplementsByDate[today][type];
    saveState();
    renderSupplements();
  };

  // ================= RUTINA & DÍAS =================
  function renderDayCarousel() {
    const container = document.getElementById("day-carousel");
    container.innerHTML = window.ROUTINE_DAYS.map((d) => {
      const active = d.id === state.selectedDayId ? "active" : "";
      return `<button class="day-chip ${active}" onclick="selectRoutineDay('${d.id}')">${d.shortName}</button>`;
    }).join("");
  }

  window.selectRoutineDay = function (dayId) {
    state.selectedDayId = dayId;
    saveState();
    renderDayCarousel();
    renderRoutineDay();
  };

  function findExerciseById(exId) {
    for (const d of window.ROUTINE_DAYS) {
      for (const ex of d.exercises) {
        if (ex.id === exId) return { day: d, ex };
      }
    }
    return null;
  }

  // Pre-cargar SIEMPRE los pesos que el usuario ya registró en la sesión anterior
  function getOrInitDraft(ex) {
    const history = state.workoutHistory[ex.id] || [];
    const lastEntry = history.length > 0 ? history[history.length - 1] : null;

    if (!state.activeDrafts[ex.id] || state.activeDrafts[ex.id].length !== ex.sets) {
      state.activeDrafts[ex.id] = Array.from({ length: ex.sets }, (_, idx) => {
        const prevSet = lastEntry && lastEntry.sets && lastEntry.sets[idx] ? lastEntry.sets[idx] : null;
        return {
          kg: prevSet ? Number(prevSet.kg) : ex.suggestedStartKg,
          reps: prevSet ? Number(prevSet.reps) : (idx === 0 ? ex.repRange[1] : Math.max(ex.repRange[0], ex.repRange[1] - idx)),
          rir: idx === ex.sets - 1 ? "0" : idx === 0 ? "2" : "1",
          done: false
        };
      });
    }
    return state.activeDrafts[ex.id];
  }

  function getExerciseKpi(exId) {
    const hist = state.workoutHistory[exId] || [];
    if (hist.length === 0) return null;
    const lastEntry = hist[hist.length - 1];
    let maxKg = 0;
    let totalVolume = 0;
    hist.forEach((entry) => {
      entry.sets.forEach((s) => {
        const kg = Number(s.kg) || 0;
        const reps = Number(s.reps) || 0;
        if (kg > maxKg) maxKg = kg;
        totalVolume += kg * reps;
      });
    });
    return {
      totalSessions: hist.length,
      lastDate: lastEntry.date,
      lastSets: lastEntry.sets,
      lastMaxKg: Math.max(...lastEntry.sets.map((s) => Number(s.kg))),
      personalRecordKg: maxKg,
      totalVolumeKg: Math.round(totalVolume)
    };
  }

  function renderRoutineDay() {
    const day = window.ROUTINE_DAYS.find((d) => d.id === state.selectedDayId) || window.ROUTINE_DAYS[0];
    const container = document.getElementById("routine-container");
    const kpiBar = document.getElementById("day-kpi-bar");

    if (day.isRestDay) {
      kpiBar.innerHTML = "";
      container.innerHTML = `
        <div class="day-banner">
          <h2>${day.title}</h2>
          <p>${day.subtitle}</p>
          <div style="margin-top:12px;padding:12px;background:#141414;border-left:3px solid var(--ufc-red);border-radius:4px;font-size:12.5px;color:#ccc;">
            <strong>DESCANSO TOTAL:</strong> Toma tus 5g de Creatina y tus ~115g de proteína. Tus músculos crecen hoy para rendir al 100% en el Octágono del gimnasio mañana.
          </div>
        </div>
      `;
      return;
    }

    // KPIs rápidos del día
    let completedSets = 0;
    let totalSets = day.totalSets;
    day.exercises.forEach((ex) => {
      const draft = getOrInitDraft(ex);
      completedSets += draft.filter((s) => s.done).length;
    });

    kpiBar.innerHTML = `
      <div class="kpi-box">
        <strong>${day.exercises.length}</strong>
        <span>EJERCICIOS</span>
      </div>
      <div class="kpi-box">
        <strong>${completedSets} / ${totalSets}</strong>
        <span>SERIES LISTAS</span>
      </div>
      <div class="kpi-box">
        <strong style="color:var(--ufc-red);">${day.targetDurationMin}m</strong>
        <span>META TIEMPO</span>
      </div>
    `;

    let html = `
      <div class="day-banner">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <h2>${day.title}</h2>
          <span class="tag-badge red">${day.focusTag}</span>
        </div>
        <p>${day.subtitle}</p>
        <div style="margin-top:10px;font-size:12px;color:#a3a3a3;">
          <strong style="color:#d20a0a;">CALENTAMIENTO:</strong> ${day.warmup}
        </div>
      </div>
    `;

    day.exercises.forEach((ex, index) => {
      const draftSets = getOrInitDraft(ex);
      const equipRule = window.EQUIPMENT_RULES[ex.equipmentType] || window.EQUIPMENT_RULES.barbell;
      const kpi = getExerciseKpi(ex.id);

      // KPI Banner exclusivo del ejercicio (muestra última marca real y PR)
      let kpiHeaderHtml = "";
      if (kpi) {
        const setsSummary = kpi.lastSets.map((s) => `${s.kg}kg×${s.reps}`).join(" · ");
        kpiHeaderHtml = `
          <div class="ex-kpi-banner">
            <div>
              <strong>ÚLTIMA VEZ (${kpi.lastDate}):</strong>
              <div style="font-size:12px;color:#ccc;">${setsSummary}</div>
            </div>
            <div style="text-align:right;">
              <span class="kpi-val">PR: ${kpi.personalRecordKg} KG</span>
              <small>${kpi.totalSessions} sesiones</small>
            </div>
          </div>
        `;
      } else {
        kpiHeaderHtml = `
          <div class="ex-kpi-banner" style="border-left-color:#555;">
            <div>
              <strong style="color:#999;">PESO BASE SUGERIDO:</strong>
              <div style="font-size:12px;color:#ccc;">${equipRule.breakdownFn(ex.suggestedStartKg)}</div>
            </div>
            <div style="text-align:right;">
              <span class="kpi-val" style="color:#fff;">~${ex.suggestedStartKg} KG</span>
              <small>Sin registro previo</small>
            </div>
          </div>
        `;
      }

      // Sets rows
      const setsRowsHtml = draftSets.map((s, sIdx) => {
        const isFailure = sIdx === ex.sets - 1;
        const targetRirText = isFailure ? "FALLO TOTAL" : sIdx === 0 ? "RIR 2" : "RIR 1";
        return `
          <div class="set-row ${s.done ? "completed" : ""}">
            <div class="set-label">
              S${sIdx + 1}
              <small>${targetRirText}</small>
            </div>
            <div class="input-wrap">
              <input type="number" step="0.5" value="${s.kg}"
                oninput="updateSetField('${ex.id}', ${sIdx}, 'kg', this.value, false)"
                onchange="updateSetField('${ex.id}', ${sIdx}, 'kg', this.value, true)" />
              <span>kg</span>
            </div>
            <div class="input-wrap">
              <input type="number" step="1" value="${s.reps}"
                oninput="updateSetField('${ex.id}', ${sIdx}, 'reps', this.value, false)"
                onchange="updateSetField('${ex.id}', ${sIdx}, 'reps', this.value, true)" />
              <span>reps</span>
            </div>
            <select onchange="updateSetField('${ex.id}', ${sIdx}, 'rir', this.value, true)">
              <option value="2" ${s.rir === "2" ? "selected" : ""}>RIR 2</option>
              <option value="1" ${s.rir === "1" ? "selected" : ""}>RIR 1</option>
              <option value="0" ${s.rir === "0" ? "selected" : ""}>FALLO</option>
            </select>
            <button class="check-set-btn" onclick="completeSet('${ex.id}', ${sIdx})">
              ✓
            </button>
          </div>
        `;
      }).join("");

      // Visual Guide Photo
      const visualHtml = ex.aiSplitImage
        ? `<div class="ai-split-wrapper" onclick="openImageModal('${ex.id}')">
             <img src="${ex.aiSplitImage}" alt="${ex.name}" loading="lazy" />
             <span class="zoom-pill">AMPLIAR PASO 1 Y 2</span>
           </div>`
        : `<div class="dual-photo-grid" onclick="openImageModal('${ex.id}')">
             <div class="dual-photo-frame">
               <img src="${ex.step1Photo}" alt="Paso 1" loading="lazy" />
               <span class="step-photo-tag">PASO 1</span>
             </div>
             <div class="dual-photo-frame">
               <img src="${ex.step2Photo}" alt="Paso 2" loading="lazy" />
               <span class="step-photo-tag" style="border-color:#fff;">PASO 2</span>
             </div>
           </div>`;

      html += `
        <div class="exercise-card">
          <div class="ex-header">
            <div class="ex-title-wrap">
              <span class="ex-num">${index + 1}</span>
              <div>
                <div class="ex-title">${ex.name}</div>
                <span class="ex-machine-sub">${ex.machineName}</span>
              </div>
            </div>
            <span class="ex-rep-badge">${ex.repLabel}</span>
          </div>

          ${kpiHeaderHtml}

          <div class="visual-guide-box">
            ${visualHtml}
            <div class="steps-text-grid">
              <div class="step-card">
                <h4>${ex.step1Title}</h4>
                <p>${ex.step1Desc}</p>
              </div>
              <div class="step-card">
                <h4 style="color:#fff;">${ex.step2Title}</h4>
                <p>${ex.step2Desc}</p>
              </div>
            </div>
            <div class="mistake-strip">
              ⚠️ <strong>EVITA:</strong> ${ex.commonMistake}
            </div>
          </div>

          <div class="sets-grid">
            ${setsRowsHtml}
          </div>
        </div>
      `;
    });

    if (day.cardioBlock) {
      html += `
        <div class="info-card" style="border-left:4px solid var(--ufc-red);">
          <h3>CARDIO <span>BLOQUE FIN DE SEMANA</span></h3>
          <p style="font-size:13px;color:#fff;font-weight:700;">${day.cardioBlock.title}</p>
          <p style="font-size:12px;color:#aaa;margin-top:4px;">${day.cardioBlock.protocol}</p>
        </div>
      `;
    }

    html += `
      <button class="btn-primary" onclick="finishWorkoutSession('${day.id}')">
        GUARDAR Y FINALIZAR SESIÓN DE ${day.dayName}
      </button>
    `;

    container.innerHTML = html;
  }

  window.updateSetField = function (exId, setIdx, field, val, shouldRender = true) {
    if (!state.activeDrafts[exId]) return;
    state.activeDrafts[exId][setIdx][field] = field === "rir" ? val : Number(val);
    saveState();
    if (shouldRender) {
      renderRoutineDay();
    }
  };

  window.completeSet = function (exId, setIdx) {
    if (!state.activeDrafts[exId]) return;
    state.activeDrafts[exId][setIdx].done = !state.activeDrafts[exId][setIdx].done;
    saveState();
    renderRoutineDay();
  };

  window.finishWorkoutSession = function (dayId) {
    const day = window.ROUTINE_DAYS.find((d) => d.id === dayId);
    if (!day) return;
    const today = getTodayISO();
    let savedCount = 0;

    day.exercises.forEach((ex) => {
      const draft = state.activeDrafts[ex.id];
      if (!draft) return;
      const completedSets = draft.filter((s) => s.done || Number(s.kg) > 0);
      if (completedSets.length > 0) {
        if (!state.workoutHistory[ex.id]) state.workoutHistory[ex.id] = [];
        state.workoutHistory[ex.id].push({
          date: today,
          sets: structuredClone(completedSets)
        });
        // Mantener los pesos cargados para la siguiente sesión, solo limpiar checks
        state.activeDrafts[ex.id] = draft.map((s) => ({ ...s, done: false }));
        savedCount++;
      }
    });

    saveState();
    pushToSupabase();
    renderRoutineDay();
    renderExercisesKpiList();
    alert(`🔥 Sesión de ${day.dayName} registrada en tu historial y sincronizada con Supabase.`);
  };

  // ================= TAB 2: KPIS & HISTORIAL DETALLADO =================
  function renderExercisesKpiList() {
    const container = document.getElementById("exercises-kpi-list");
    if (!container) return;

    const allExercises = [];
    window.ROUTINE_DAYS.forEach((d) => {
      d.exercises.forEach((ex) => {
        if (!allExercises.some((e) => e.id === ex.id)) {
          allExercises.push(ex);
        }
      });
    });

    container.innerHTML = allExercises.map((ex) => {
      const kpi = getExerciseKpi(ex.id);
      if (!kpi) {
        return `
          <div style="background:#0a0a0a;border:1px solid var(--border-subtle);border-radius:6px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <strong style="font-size:14px;text-transform:uppercase;">${ex.name}</strong>
              <div style="font-size:11px;color:#666;">Sin sesiones registradas aún</div>
            </div>
            <span style="font-size:12px;color:#555;">0 PR</span>
          </div>
        `;
      }

      const setsStr = kpi.lastSets.map((s) => `${s.kg}k×${s.reps}`).join(" ");

      return `
        <div style="background:#0d0d0d;border:1px solid var(--border-strong);border-left:3px solid var(--ufc-red);border-radius:6px;padding:12px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
              <strong style="font-size:14.5px;text-transform:uppercase;color:#fff;">${ex.name}</strong>
              <div style="font-size:11.5px;color:#aaa;margin-top:2px;">Última: <span style="color:#fff;">${setsStr}</span> (${kpi.lastDate})</div>
            </div>
            <div style="text-align:right;">
              <span style="font-size:15px;color:var(--ufc-gold);font-weight:900;">PR ${kpi.personalRecordKg} KG</span>
              <div style="font-size:10px;color:#777;text-transform:uppercase;">${kpi.totalSessions} Sesiones</div>
            </div>
          </div>
          <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,0.06);padding-top:6px;">
            <span style="font-size:11px;color:#888;">Volumen: ${kpi.totalVolumeKg} kg</span>
            <button class="btn-secondary" style="padding:4px 9px;font-size:11px;" onclick="openHistoryModal('${ex.id}')">
              Ver Detalle ➔
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  // Modal para ver cada sesión individual con opción de borrar
  window.openHistoryModal = function (exId) {
    const found = findExerciseById(exId);
    if (!found) return;
    const ex = found.ex;
    const entries = state.workoutHistory[exId] || [];

    document.getElementById("modal-ex-title").textContent = ex.name;
    document.getElementById("modal-ex-sub").textContent = `${entries.length} sesiones guardadas · ${ex.machineName}`;

    const content = document.getElementById("modal-history-content");
    if (entries.length === 0) {
      content.innerHTML = `<p style="font-size:12px;color:#888;padding:12px 0;">No hay sesiones guardadas aún.</p>`;
    } else {
      content.innerHTML = `
        <table class="metrics-table">
          <thead>
            <tr><th>FECHA</th><th>SERIES (KG × REPS)</th><th>MÁX</th><th></th></tr>
          </thead>
          <tbody>
            ${entries.slice().reverse().map((e, revIdx) => {
              const realIdx = entries.length - 1 - revIdx;
              const summary = e.sets.map((s) => `${s.kg}kg×${s.reps}`).join(" · ");
              const maxSet = Math.max(...e.sets.map((s) => Number(s.kg)));
              return `
                <tr>
                  <td style="font-weight:700;color:#ddd;">${e.date}</td>
                  <td style="color:#aaa;">${summary}</td>
                  <td><strong style="color:var(--ufc-gold);">${maxSet} kg</strong></td>
                  <td style="text-align:right;">
                    <button onclick="deleteWorkoutHistoryEntry('${exId}', ${realIdx})" style="background:rgba(210,10,10,0.2);border:1px solid #d20a0a;color:#ff8080;padding:3px 6px;border-radius:3px;font-size:10px;font-weight:900;cursor:pointer;">
                      ✕
                    </button>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `;
    }

    document.getElementById("history-modal").classList.add("active");
  };

  window.closeHistoryModal = function () {
    document.getElementById("history-modal").classList.remove("active");
  };

  window.deleteWorkoutHistoryEntry = function (exId, idx) {
    if (!confirm("¿Borrar esta sesión del historial?")) return;
    if (!state.workoutHistory[exId]) return;
    state.workoutHistory[exId].splice(idx, 1);
    saveState();
    pushToSupabase();
    renderExercisesKpiList();
    renderRoutineDay();
    openHistoryModal(exId);
  };

  // ================= TAB 3: MEDIDAS CORPORALES =================
  window.updateLiveSymmetryBadges = function () {
    const armR = Number(document.getElementById("m-arm-r")?.value) || 0;
    const armL = Number(document.getElementById("m-arm-l")?.value) || 0;
    const diffArm = (armR - armL).toFixed(1);
    document.getElementById("sym-arm").textContent = `Δ ${Math.abs(diffArm)} cm`;
  };

  window.addBodyMetric = function (e) {
    e.preventDefault();
    const weightKg = parseFloat(document.getElementById("m-weight").value);
    if (!weightKg) return;

    state.bodyMetrics.push({
      date: getTodayISO(),
      weightKg,
      chestCm: parseFloat(document.getElementById("m-chest").value) || 0,
      shouldersCm: parseFloat(document.getElementById("m-shoulders").value) || 0,
      waistCm: parseFloat(document.getElementById("m-waist").value) || 0,
      armRightCm: parseFloat(document.getElementById("m-arm-r").value) || 0,
      armLeftCm: parseFloat(document.getElementById("m-arm-l").value) || 0,
      forearmRightCm: parseFloat(document.getElementById("m-forearm-r").value) || 0,
      forearmLeftCm: parseFloat(document.getElementById("m-forearm-l").value) || 0,
      thighRightCm: parseFloat(document.getElementById("m-thigh-r").value) || 0,
      thighLeftCm: parseFloat(document.getElementById("m-thigh-l").value) || 0,
      calfRightCm: parseFloat(document.getElementById("m-calf-r").value) || 0,
      calfLeftCm: parseFloat(document.getElementById("m-calf-l").value) || 0
    });

    saveState();
    pushToSupabase();
    renderBodyMetrics();
    updateLiveHeaderStats();
    alert("✅ Medidas guardadas en tu ficha y sincronizadas con Supabase.");
  };

  function renderBodyMetrics() {
    const list = state.bodyMetrics;
    const latest = list.length > 0 ? list[list.length - 1] : {
      weightKg: 62.0,
      waistCm: 89.0,
      chestCm: 94.0,
      shouldersCm: 118.0,
      armRightCm: 34.1,
      armLeftCm: 33.3,
      forearmRightCm: 25.5,
      forearmLeftCm: 25.0,
      thighRightCm: 44.2,
      thighLeftCm: 44.2,
      calfRightCm: 32.0,
      calfLeftCm: 32.0
    };

    // Prellenar inputs
    document.getElementById("m-weight").value = latest.weightKg ?? 62.0;
    document.getElementById("m-waist").value = latest.waistCm ?? 89.0;
    document.getElementById("m-chest").value = latest.chestCm ?? 94.0;
    document.getElementById("m-shoulders").value = latest.shouldersCm ?? 118.0;
    document.getElementById("m-arm-r").value = latest.armRightCm ?? 34.1;
    document.getElementById("m-arm-l").value = latest.armLeftCm ?? 33.3;
    document.getElementById("m-forearm-r").value = latest.forearmRightCm ?? 25.5;
    document.getElementById("m-forearm-l").value = latest.forearmLeftCm ?? 25.0;
    document.getElementById("m-thigh-r").value = latest.thighRightCm ?? 44.2;
    document.getElementById("m-thigh-l").value = latest.thighLeftCm ?? 44.2;
    document.getElementById("m-calf-r").value = latest.calfRightCm ?? 32.0;
    document.getElementById("m-calf-l").value = latest.calfLeftCm ?? 32.0;

    window.updateLiveSymmetryBadges();

    // KPI Box
    document.getElementById("recomp-summary").innerHTML = `
      <div class="kpi-box">
        <strong>${latest.weightKg} kg</strong>
        <span>PESO ACTUAL</span>
      </div>
      <div class="kpi-box">
        <strong>${latest.waistCm} cm</strong>
        <span>CINTURA</span>
      </div>
      <div class="kpi-box">
        <strong style="color:var(--ufc-gold);">${latest.armRightCm || latest.armCm || "--"} cm</strong>
        <span>BRAZO DERECHO</span>
      </div>
    `;

    // Tabla
    const tbody = document.getElementById("metrics-tbody");
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#666;padding:12px;">Sin medidas guardadas aún.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.slice().reverse().map((m, revIdx) => {
      const realIdx = list.length - 1 - revIdx;
      return `
        <tr>
          <td style="font-weight:800;color:#fff;">${m.date}</td>
          <td><strong>${m.weightKg}kg</strong></td>
          <td>${m.waistCm}cm</td>
          <td>${m.armRightCm}/${m.armLeftCm}</td>
          <td>${m.thighRightCm}/${m.thighLeftCm}</td>
          <td style="text-align:right;">
            <button onclick="deleteBodyMetric(${realIdx})" style="background:rgba(210,10,10,0.2);border:1px solid #d20a0a;color:#ff8080;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:900;cursor:pointer;">
              ✕
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  window.deleteBodyMetric = function (idx) {
    if (!confirm("¿Borrar este control de medidas?")) return;
    state.bodyMetrics.splice(idx, 1);
    saveState();
    pushToSupabase();
    renderBodyMetrics();
    updateLiveHeaderStats();
  };

  // ================= TAB 4: CALCULADORA =================
  function populateCalculatorExercises() {
    const select = document.getElementById("calc-exercise-select");
    if (!select) return;
    let opts = "";
    window.ROUTINE_DAYS.forEach((d) => {
      if (d.isRestDay) return;
      opts += `<optgroup label="${d.dayName}">`;
      d.exercises.forEach((ex) => {
        opts += `<option value="${ex.id}">${ex.name}</option>`;
      });
      opts += `</optgroup>`;
    });
    select.innerHTML = opts;
    window.onCalcExerciseChange();
  }

  window.onCalcExerciseChange = function () {
    const select = document.getElementById("calc-exercise-select");
    if (!select) return;
    const found = findExerciseById(select.value);
    if (!found) return;
    const ex = found.ex;
    const rule = window.EQUIPMENT_RULES[ex.equipmentType] || window.EQUIPMENT_RULES.barbell;
    const kpi = getExerciseKpi(ex.id);

    document.getElementById("calc-machine-banner").innerHTML = `
      <div style="font-size:14px;font-weight:900;text-transform:uppercase;color:#fff;">${ex.name} (${ex.machineName})</div>
      <div style="font-size:11.5px;color:#aaa;margin-top:3px;">${rule.howToMeasure}</div>
      ${kpi ? `<div style="font-size:11.5px;color:var(--ufc-gold);margin-top:4px;">Tu PR actual: <strong>${kpi.personalRecordKg} kg</strong></div>` : ""}
    `;
    window.calculateHypertrophyLoads();
  };

  window.calculateHypertrophyLoads = function () {
    const select = document.getElementById("calc-exercise-select");
    if (!select) return;
    const found = findExerciseById(select.value);
    if (!found) return;
    const ex = found.ex;
    const rule = window.EQUIPMENT_RULES[ex.equipmentType] || window.EQUIPMENT_RULES.barbell;

    const testKg = parseFloat(document.getElementById("calc-kg").value) || ex.suggestedStartKg;
    const testReps = parseInt(document.getElementById("calc-reps").value, 10) || ex.repRange[1];
    const testRir = parseInt(document.getElementById("calc-rir").value, 10) || 0;

    const e1RM = testKg * (1 + (testReps + testRir) / 30);
    const targetCapReps = ex.repRange[1] + 2;
    let rawIdealKg = e1RM / (1 + targetCapReps / 30);
    const step = ex.equipmentType === "dumbbell" ? 1 : 2.5;
    let idealWorkingKg = Math.max(step, Math.round(rawIdealKg / step) * step);

    document.getElementById("calc-output").innerHTML = `
      <div style="background:#0d0d0d;border:1px solid #333;border-radius:6px;padding:12px;margin-top:10px;">
        <span style="font-size:11px;color:#999;text-transform:uppercase;">Carga de Trabajo Sugerida:</span>
        <div style="font-size:24px;font-weight:900;color:var(--ufc-red);font-style:italic;">${idealWorkingKg} KG</div>
        <div style="font-size:12px;color:#ccc;margin-top:4px;">${rule.breakdownFn(idealWorkingKg)}</div>
      </div>
      <button class="btn-primary" onclick="applyCalculatedWeight('${ex.id}', '${found.day.id}', ${idealWorkingKg})">
        APLICAR ${idealWorkingKg} KG A ${ex.name}
      </button>
    `;
  };

  window.applyCalculatedWeight = function (exId, dayId, idealKg) {
    const found = findExerciseById(exId);
    if (!found) return;
    const ex = found.ex;
    state.selectedDayId = dayId;
    state.activeDrafts[exId] = Array.from({ length: ex.sets }, (_, idx) => ({
      kg: idealKg,
      reps: idx === 0 ? ex.repRange[1] : Math.max(ex.repRange[0], ex.repRange[1] - idx),
      rir: idx === ex.sets - 1 ? "0" : idx === 0 ? "2" : "1",
      done: false
    }));
    saveState();
    renderDayCarousel();
    renderRoutineDay();
    switchTab("workout", document.querySelectorAll(".nav-btn")[0]);
  };

  // ================= LIGHTBOX FOTOS =================
  window.openImageModal = function (exId) {
    const found = findExerciseById(exId);
    if (!found) return;
    const ex = found.ex;
    const body = document.getElementById("image-modal-body");

    const visualHtml = ex.aiSplitImage
      ? `<img src="${ex.aiSplitImage}" alt="${ex.name}" style="width:100%;display:block;" />`
      : `<div class="dual-photo-grid">
           <img src="${ex.step1Photo}" alt="Paso 1" style="width:100%;display:block;" />
           <img src="${ex.step2Photo}" alt="Paso 2" style="width:100%;display:block;" />
         </div>`;

    body.innerHTML = `
      <div style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #333;">
        <div>
          <strong style="text-transform:uppercase;color:#fff;">${ex.name}</strong>
          <div style="font-size:11px;color:#999;">${ex.machineName}</div>
        </div>
        <button class="btn-secondary" style="padding:4px 8px;" onclick="closeImageModal()">✕</button>
      </div>
      ${visualHtml}
    `;
    document.getElementById("image-modal").classList.add("active");
  };

  window.closeImageModal = function () {
    document.getElementById("image-modal").classList.remove("active");
  };

  // ================= GENERAL =================
  window.switchTab = function (tabId, btnEl) {
    document.querySelectorAll(".tab-view").forEach((t) => t.classList.remove("active"));
    document.getElementById(`tab-${tabId}`).classList.add("active");
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    if (btnEl) btnEl.classList.add("active");
    if (tabId === "kpis") renderExercisesKpiList();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  window.exportBackup = function () {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gymmax-${getTodayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  window.resetAllData = function () {
    if (!confirm("¿Reiniciar toda la app y borrar datos locales?")) return;
    state = structuredClone(defaultState);
    saveState();
    pushToSupabase();
    initApp();
  };

  function initApp() {
    updateLiveHeaderStats();
    renderSupplements();
    renderDayCarousel();
    renderRoutineDay();
    populateCalculatorExercises();
    renderBodyMetrics();
    renderExercisesKpiList();

    window.addEventListener("online", () => pullFromSupabase());
    pullFromSupabase();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }

  document.addEventListener("DOMContentLoaded", initApp);
})();
