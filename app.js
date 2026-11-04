// TITAN 61 PRO — Motor de Entrenamiento, Calculadora por Máquina/Ejercicio y Simetría Bilateral
(function () {
  const STORAGE_KEY = "titan61_pro_state_v2";

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
    bodyMetrics: [
      {
        date: getTodayISO(),
        weightKg: 61.0,
        chestCm: 94.0,
        shouldersCm: 111.0,
        waistCm: 76.0,
        armRightCm: 33.6,
        armLeftCm: 33.2,
        forearmRightCm: 27.5,
        forearmLeftCm: 27.2,
        thighRightCm: 52.2,
        thighLeftCm: 51.8,
        calfRightCm: 35.6,
        calfLeftCm: 35.4,
        note: "Base Inicial (61 kg · 3 meses gym)"
      }
    ]
  };

  let state = loadState();
  let workoutSeconds = 0;
  let workoutTimerId = null;
  let restSecondsLeft = 0;
  let restTimerId = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultState);
      const parsed = JSON.parse(raw);
      return Object.assign(structuredClone(defaultState), parsed);
    } catch (_) {
      return structuredClone(defaultState);
    }
  }

  const SUPABASE_CONFIG = {
    url: "https://kdlffmjkdmlleabrnvqr.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkbGZmbWprZG1sbGVhYnJudnFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4MjQwOTMsImV4cCI6MjEwOTQwMDA5M30.r3e9eQll7y7OPruKCUeqP7fahQqruSHn4EEzeUsYZII",
    recordId: "max_gym_sync_v1"
  };

  let syncTimeout = null;
  let isSyncing = false;

  function updateSyncBadge(status, text) {
    const badge = document.getElementById("sync-status-badge");
    const label = document.getElementById("sync-status-text");
    const details = document.getElementById("sync-details");
    if (!badge || !label) return;
    badge.className = `sync-indicator ${status}`;
    label.textContent = text;
    if (details) {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (status === "synced") {
        details.innerHTML = `✅ Conectado a Supabase · Última sincronización: <strong>${now}</strong>`;
      } else if (status === "syncing") {
        details.innerHTML = `🔄 Sincronizando con Supabase...`;
      } else if (status === "offline") {
        details.innerHTML = `⚠️ Sin conexión a internet (modo offline activado). Se sincronizará al volver a conectar.`;
      } else if (status === "error") {
        details.innerHTML = `⚠️ ${text}. Si es la primera vez, crea la tabla <code>gym_sync</code> en tu panel de Supabase.`;
      }
    }
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
        const err = await res.json().catch(() => ({}));
        console.warn("Error pushing to Supabase:", err);
        updateSyncBadge("error", "Error tabla");
      }
    } catch (e) {
      console.warn("Supabase network error:", e);
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
          // Si la nube tiene datos más completos o recientes, fusionar preservando estructura
          state = Object.assign(structuredClone(defaultState), cloudData);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          // Refrescar vistas
          renderSupplements();
          renderRoutineDay();
          renderBodyMetrics();
          renderAllSessionsLog();
          renderStrengthHistorySelect();
          renderProfileStats();
          updateSyncBadge("synced", "Nube al día");
          if (isManual) alert("✅ Datos sincronizados correctamente desde Supabase.");
        } else {
          // La tabla existe pero está vacía, subimos nuestro estado local inicial
          await pushToSupabase();
        }
      } else {
        updateSyncBadge("error", "Crear tabla");
      }
    } catch (e) {
      console.warn("Supabase pull error:", e);
      updateSyncBadge("offline", "Offline");
    }
  }

  window.manualSync = async function () {
    await pullFromSupabase(true);
  };

  function scheduleCloudPush() {
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      pushToSupabase();
    }, 1200);
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    scheduleCloudPush();
  }

  function findExerciseById(exId) {
    for (const d of window.ROUTINE_DAYS) {
      for (const ex of d.exercises) {
        if (ex.id === exId) return { day: d, ex };
      }
    }
    return null;
  }

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.14 + 0.13);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.14);
        osc.stop(ctx.currentTime + i * 0.14 + 0.14);
      });
    } catch (_) {}
  }

  // Suplementos diarios
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
    renderProfileStats();
  };

  // Cronómetro de sesión de 60m
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
        document.getElementById("workout-clock-label").textContent = `${mins}:${secs} / 60m`;
      }, 1000);
    }
  };

  // Temporizador de descanso entre series
  window.startRestTimer = function (seconds, exerciseName) {
    clearInterval(restTimerId);
    restSecondsLeft = seconds;
    const bar = document.getElementById("rest-timer-bar");
    const label = document.getElementById("rest-ex-label");
    bar.classList.add("active");
    label.textContent = `Descanso · ${exerciseName}`;
    updateRestUI();

    restTimerId = setInterval(() => {
      restSecondsLeft--;
      if (restSecondsLeft <= 0) {
        clearInterval(restTimerId);
        restTimerId = null;
        playBeep();
        document.getElementById("rest-time-display").textContent = "¡Siguiente serie!";
        setTimeout(() => bar.classList.remove("active"), 3500);
      } else {
        updateRestUI();
      }
    }, 1000);
  };

  function updateRestUI() {
    const m = Math.floor(restSecondsLeft / 60);
    const s = String(restSecondsLeft % 60).padStart(2, "0");
    document.getElementById("rest-time-display").textContent = `${m}:${s}`;
  }

  window.adjustRestTimer = function (delta) {
    restSecondsLeft = Math.max(5, restSecondsLeft + delta);
    updateRestUI();
  };

  window.stopRestTimer = function () {
    clearInterval(restTimerId);
    restTimerId = null;
    document.getElementById("rest-timer-bar").classList.remove("active");
  };

  // Lightbox Zoom para ver fotos Paso 1 / Paso 2 en grande
  window.openImageModal = function (exId) {
    const found = findExerciseById(exId);
    if (!found) return;
    const ex = found.ex;
    const modal = document.getElementById("image-modal");
    const body = document.getElementById("image-modal-body");

    const visualHtml = ex.aiSplitImage
      ? `<img src="${ex.aiSplitImage}" alt="${ex.name}" style="width:100%;display:block;" />`
      : `
        <div class="dual-photo-grid" style="cursor:default;">
          <div class="dual-photo-frame">
            <img src="${ex.step1Photo}" alt="Paso 1" />
            <span class="step-photo-tag">PASO 1: INICIO</span>
          </div>
          <div class="dual-photo-frame">
            <img src="${ex.step2Photo}" alt="Paso 2" />
            <span class="step-photo-tag step2">PASO 2: FINAL</span>
          </div>
        </div>
      `;

    body.innerHTML = `
      <div style="padding:12px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e293b;">
        <div>
          <strong style="font-size:15px;">${ex.name}</strong>
          <div style="font-size:11.5px;color:#22d3ee;">${ex.machineName}</div>
        </div>
        <button class="btn-secondary" onclick="closeImageModal()">Cerrar ✕</button>
      </div>
      ${visualHtml}
      <div class="steps-text-grid">
        <div class="step-card">
          <h4>${ex.step1Title}</h4>
          <p>${ex.step1Desc}</p>
        </div>
        <div class="step-card step-2">
          <h4>${ex.step2Title}</h4>
          <p>${ex.step2Desc}</p>
        </div>
      </div>
    `;
    modal.classList.add("active");
  };

  window.closeImageModal = function () {
    document.getElementById("image-modal").classList.remove("active");
  };

  // Motor de Doble Progresión
  function getProgressionAdvice(ex) {
    const equipRule = window.EQUIPMENT_RULES[ex.equipmentType] || window.EQUIPMENT_RULES.barbell;
    const history = state.workoutHistory[ex.id] || [];

    if (history.length === 0) {
      return {
        type: "new",
        recommendedKg: ex.suggestedStartKg,
        text: `🎯 <strong>Peso Inicial Sugerido (61 kg):</strong> ${equipRule.breakdownFn(ex.suggestedStartKg)}. Si en la Serie 1 sientes que puedes hacer más de ${ex.repRange[1] + 2} reps, usa el botón <strong>"🧮 Calcular mi peso"</strong> arriba.`
      };
    }

    const lastEntry = history[history.length - 1];
    const validSets = lastEntry.sets.filter((s) => Number(s.kg) > 0 && Number(s.reps) > 0);
    if (validSets.length === 0) {
      return {
        type: "new",
        recommendedKg: ex.suggestedStartKg,
        text: `🎯 Referencia inicial: ${equipRule.breakdownFn(ex.suggestedStartKg)}.`
      };
    }

    const maxKg = Math.max(...validSets.map((s) => Number(s.kg)));
    const repsStr = validSets.map((s) => `${s.reps}`).join(", ");
    const allHitTop =
      validSets.length >= ex.sets &&
      validSets.every((s) => Number(s.reps) >= ex.repRange[1]);

    if (allHitTop) {
      const nextKg = +(maxKg + ex.incrementKg).toFixed(1);
      return {
        type: "up",
        recommendedKg: nextKg,
        text: `🔥 <strong>¡Toca subir peso hoy!</strong> La sesión pasada lograste [${repsStr}] reps con ${maxKg} kg. Hoy sube a <strong>${nextKg} kg</strong> (${equipRule.breakdownFn(nextKg)}).`
      };
    }

    return {
      type: "keep",
      recommendedKg: maxKg,
      text: `📈 <strong>Última sesión:</strong> ${maxKg} kg × [${repsStr}] reps. Mantén <strong>${maxKg} kg</strong> (${equipRule.breakdownFn(maxKg)}) y busca sacar +1 repetición extra hoy.`
    };
  }

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

  function getOrInitDraft(ex, recommendedKg) {
    if (!state.activeDrafts[ex.id] || state.activeDrafts[ex.id].length !== ex.sets) {
      const history = state.workoutHistory[ex.id] || [];
      const lastEntry = history.length > 0 ? history[history.length - 1] : null;

      state.activeDrafts[ex.id] = Array.from({ length: ex.sets }, (_, idx) => {
        const prevSet = lastEntry && lastEntry.sets && lastEntry.sets[idx] ? lastEntry.sets[idx] : null;
        return {
          kg: prevSet ? Number(prevSet.kg) : (recommendedKg || ex.suggestedStartKg),
          reps: prevSet ? Number(prevSet.reps) : (idx === 0 ? ex.repRange[1] : Math.max(ex.repRange[0], ex.repRange[1] - idx)),
          rir: idx === ex.sets - 1 ? "0" : idx === 0 ? "2" : "1",
          done: false
        };
      });
    }
    return state.activeDrafts[ex.id];
  }

  function buildVisualGuideHtml(ex) {
    if (ex.aiSplitImage) {
      return `
        <div class="ai-split-wrapper" onclick="openImageModal('${ex.id}')">
          <img src="${ex.aiSplitImage}" alt="${ex.name} Paso 1 y Paso 2" loading="lazy" />
          <span class="zoom-pill">🔍 Toca para ampliar Paso 1 y 2</span>
        </div>
      `;
    }

    return `
      <div class="dual-photo-grid" onclick="openImageModal('${ex.id}')">
        <div class="dual-photo-frame">
          <img src="${ex.step1Photo}" alt="${ex.name} Paso 1" loading="lazy" />
          <span class="step-photo-tag">PASO 1: INICIO</span>
          <span class="muscle-glow-badge">💪 ${ex.primaryMuscle.split("(")[0]}</span>
        </div>
        <div class="dual-photo-frame">
          <img src="${ex.step2Photo}" alt="${ex.name} Paso 2" loading="lazy" />
          <span class="step-photo-tag step2">PASO 2: FINAL</span>
          <span class="zoom-pill">🔍 Ampliar</span>
        </div>
      </div>
    `;
  }

  function renderRoutineDay() {
    const day = window.ROUTINE_DAYS.find((d) => d.id === state.selectedDayId) || window.ROUTINE_DAYS[0];
    const container = document.getElementById("routine-container");

    if (day.isRestDay) {
      container.innerHTML = `
        <div class="day-banner">
          <div class="day-banner-top">
            <span class="tag-badge">${day.focusTag}</span>
          </div>
          <h2>${day.title}</h2>
          <p>${day.subtitle}</p>
          <div class="warmup-box">
            <strong>Plan de Recuperación del Lunes:</strong><br/>
            • Toma tus 5 g de Creatina monohidratada y mantén tus ~115 g de proteína.<br/>
            • Tus fibras musculares se reparan y crecen hoy para que mañana martes rompas tus marcas en Push A.
          </div>
        </div>
      `;
      return;
    }

    // Calcular progreso en vivo de series completadas hoy
    let completedSetsToday = 0;
    let totalSetsToday = 0;
    day.exercises.forEach((ex) => {
      const advice = getProgressionAdvice(ex);
      const draft = getOrInitDraft(ex, advice.recommendedKg);
      totalSetsToday += ex.sets;
      completedSetsToday += draft.filter((s) => s.done).length;
    });
    const pct = totalSetsToday > 0 ? Math.round((completedSetsToday / totalSetsToday) * 100) : 0;

    let html = `
      <div class="day-banner">
        <div class="day-banner-top">
          <span class="tag-badge">⏱ ${day.focusTag}</span>
          <span class="tag-badge" style="background:rgba(16,185,129,0.18);color:#34d399;border-color:rgba(16,185,129,0.4);">
            ${day.totalSets} series · ${day.exercises.length} ejercicios
          </span>
        </div>
        <h2>${day.title}</h2>
        <p>${day.subtitle}</p>

        <div class="session-progress-wrap">
          <div class="session-progress-head">
            <span>Progreso de tu sesión de hoy</span>
            <span>${completedSetsToday} / ${totalSetsToday} series (${pct}%)</span>
          </div>
          <div class="session-progress-bar">
            <div class="session-progress-fill" style="width:${pct}%"></div>
          </div>
        </div>

        <div class="warmup-box">
          <strong>🔥 Calentamiento (5 min):</strong> ${day.warmup}
        </div>
      </div>
    `;

    day.exercises.forEach((ex, index) => {
      const advice = getProgressionAdvice(ex);
      const draftSets = getOrInitDraft(ex, advice.recommendedKg);
      const equipRule = window.EQUIPMENT_RULES[ex.equipmentType] || window.EQUIPMENT_RULES.barbell;
      const currentFirstKg = draftSets[0]?.kg || ex.suggestedStartKg;

      const setsRowsHtml = draftSets.map((s, sIdx) => {
        const targetRirText = sIdx === ex.sets - 1 ? "🔥 AL FALLO" : sIdx === 0 ? "RIR 2 (Guarda 2)" : "RIR 1 (Guarda 1)";
        return `
          <div class="set-row ${s.done ? "completed" : ""}">
            <div class="set-label">
              Serie ${sIdx + 1}
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
            <select onchange="updateSetField('${ex.id}', ${sIdx}, 'rir', this.value)">
              <option value="2" ${s.rir === "2" ? "selected" : ""}>RIR 2</option>
              <option value="1" ${s.rir === "1" ? "selected" : ""}>RIR 1</option>
              <option value="0" ${s.rir === "0" ? "selected" : ""}>🔥 Fallo</option>
            </select>
            <button class="check-set-btn" onclick="completeSet('${ex.id}', ${sIdx}, ${ex.restSec}, '${ex.name.replace(/'/g, "")}')">
              ✓
            </button>
          </div>
        `;
      }).join("");

      html += `
        <div class="exercise-card" id="card-${ex.id}">
          <div class="ex-header">
            <div class="ex-title-wrap">
              <span class="ex-num">${index + 1}</span>
              <div>
                <div class="ex-title">${ex.name}</div>
                <span class="ex-machine-sub">📍 ${ex.machineName}</span>
              </div>
            </div>
            <span class="ex-rep-badge">${ex.repLabel}</span>
          </div>

          <div class="ex-meta">
            <span class="meta-pill muscle">🎯 ${ex.primaryMuscle}</span>
            <span class="meta-pill equip">${equipRule.badge}</span>
            <span class="meta-pill">⏱ Descanso: ${ex.restSec}s</span>
          </div>

          <!-- Guía Visual Paso 1 y Paso 2 -->
          <div class="visual-guide-box">
            ${buildVisualGuideHtml(ex)}
            <div class="steps-text-grid">
              <div class="step-card">
                <h4>${ex.step1Title}</h4>
                <p>${ex.step1Desc}</p>
              </div>
              <div class="step-card step-2">
                <h4>${ex.step2Title}</h4>
                <p>${ex.step2Desc}</p>
              </div>
            </div>
            <div class="mistake-strip">
              ❌ <strong>Evita este error:</strong> ${ex.commonMistake}
            </div>
          </div>

          <!-- Barra de explicación de peso en esta máquina + Botón directo a Calculadora -->
          <div class="equip-explain-bar">
            <div class="equip-explain-text">
              💡 <strong>Cómo cargar ${currentFirstKg} kg aquí:</strong> ${equipRule.breakdownFn(currentFirstKg)}
            </div>
            <div style="display:flex;gap:6px;">
              <button class="open-calc-btn" onclick="openCalculatorForExercise('${ex.id}')">
                🧮 Calcular mi peso
              </button>
              <button class="btn-secondary" style="padding:6px 10px;font-size:11.5px;" title="Reiniciar series de este ejercicio" onclick="resetExerciseDraft('${ex.id}')">
                ↺
              </button>
            </div>
          </div>

          <div class="coach-hint ${advice.type}">
            ${advice.text}
          </div>

          <div class="sets-grid">
            ${setsRowsHtml}
          </div>
        </div>
      `;
    });

    if (day.cardioBlock) {
      const todayKey = `${getTodayISO()}_${day.id}`;
      const cLog = state.cardioLogs[todayKey] || { completed: false };
      html += `
        <div class="cardio-card">
          <h3>${day.cardioBlock.title}</h3>
          <p><strong>Modalidad:</strong> ${day.cardioBlock.type}</p>
          <p><strong>Paso a paso:</strong> ${day.cardioBlock.protocol}</p>
          <p><strong>Máquinas recomendadas:</strong> ${day.cardioBlock.options}</p>
          <p style="font-size:12px;color:#fde68a;margin-top:6px;">🧠 ${day.cardioBlock.why}</p>
          <button class="btn-primary" style="background:${cLog.completed ? "#10b981" : "#f59e0b"};"
            onclick="toggleCardioDone('${day.id}')">
            ${cLog.completed ? "✓ Bloque de Cardio Completado Hoy" : "Marcar Bloque de Cardio como Completado"}
          </button>
        </div>
      `;
    }

    html += `
      <button class="btn-primary" onclick="finishWorkoutSession('${day.id}')">
        💾 Terminar y Guardar Entrenamiento de ${day.dayName}
      </button>
    `;

    container.innerHTML = html;
  }

  window.updateSetField = function (exId, setIdx, field, val, shouldRender = true) {
    if (!state.activeDrafts[exId]) return;
    state.activeDrafts[exId][setIdx][field] = field === "rir" ? val : Number(val);
    saveState();
    renderAllSessionsLog();
    if (shouldRender && setIdx === 0 && field === "kg") {
      renderRoutineDay();
    }
  };

  window.completeSet = function (exId, setIdx, restSec, exName) {
    if (!state.activeDrafts[exId]) return;
    const current = state.activeDrafts[exId][setIdx];
    current.done = !current.done;
    saveState();
    renderRoutineDay();
    renderAllSessionsLog();
    if (current.done) {
      window.startRestTimer(restSec, exName);
    }
  };

  window.toggleCardioDone = function (dayId) {
    const key = `${getTodayISO()}_${dayId}`;
    const prev = state.cardioLogs[key] || { completed: false };
    state.cardioLogs[key] = { completed: !prev.completed };
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
        state.activeDrafts[ex.id] = draft.map((s) => ({ ...s, done: false }));
        savedCount++;
      }
    });

    saveState();
    renderRoutineDay();
    renderAllSessionsLog();
    renderStrengthHistorySelect();
    alert(`¡Entrenamiento guardado y sincronizado! Se registraron tus marcas en ${savedCount} ejercicios.`);
  };

  // =========================================================================
  // PESTAÑA 2: CALCULADORA ESPECÍFICA POR EJERCICIO Y MÁQUINA
  // =========================================================================
  function populateCalculatorExercises() {
    const select = document.getElementById("calc-exercise-select");
    if (!select) return;

    let optionsHtml = "";
    window.ROUTINE_DAYS.forEach((d) => {
      if (d.isRestDay) return;
      optionsHtml += `<optgroup label="${d.dayName} — ${d.shortName}">`;
      d.exercises.forEach((ex) => {
        const rule = window.EQUIPMENT_RULES[ex.equipmentType] || window.EQUIPMENT_RULES.barbell;
        optionsHtml += `<option value="${ex.id}">${ex.name} (${ex.repLabel}) · [${rule.unitHint}]</option>`;
      });
      optionsHtml += `</optgroup>`;
    });

    select.innerHTML = optionsHtml;
    window.onCalcExerciseChange();
  }

  window.openCalculatorForExercise = function (exId) {
    const navBtns = document.querySelectorAll(".nav-btn");
    window.switchTab("guide", navBtns[1]);
    const select = document.getElementById("calc-exercise-select");
    if (select) {
      select.value = exId;
      window.onCalcExerciseChange();
    }
  };

  window.onCalcExerciseChange = function () {
    const select = document.getElementById("calc-exercise-select");
    if (!select) return;
    const found = findExerciseById(select.value);
    if (!found) return;

    const ex = found.ex;
    const draft = state.activeDrafts[ex.id];
    const startWeight = draft && draft[0] ? draft[0].kg : ex.suggestedStartKg;

    document.getElementById("calc-kg").value = startWeight;
    document.getElementById("calc-reps").value = ex.repRange[1];
    document.getElementById("calc-rir").value = "2";
    window.calculateHypertrophyLoads();
  };

  window.calculateHypertrophyLoads = function () {
    const select = document.getElementById("calc-exercise-select");
    if (!select) return;
    const found = findExerciseById(select.value);
    if (!found) return;

    const { day, ex } = found;
    const rule = window.EQUIPMENT_RULES[ex.equipmentType] || window.EQUIPMENT_RULES.barbell;

    const testKg = parseFloat(document.getElementById("calc-kg").value) || ex.suggestedStartKg;
    const testReps = parseInt(document.getElementById("calc-reps").value, 10) || ex.repRange[1];
    const testRir = parseInt(document.getElementById("calc-rir").value, 10) || 0;

    // Mostrar explicación de la máquina seleccionada
    document.getElementById("calc-machine-banner").innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
        <strong style="font-size:15px;color:#fff;">📍 ${ex.machineName}</strong>
        <span class="tag-badge">${day.dayName} ·Meta: ${ex.repLabel}</span>
      </div>
      <p style="font-size:12.5px;color:#a5f3fc;margin-bottom:4px;">
        <strong>¿Cómo se mide el peso aquí?</strong> ${rule.howToMeasure}
      </p>
      <p style="font-size:12px;color:#cbd5e1;">
        Músculo principal: <strong style="color:#34d399;">${ex.primaryMuscle}</strong> · Incremento mínimo: <strong>+${ex.incrementKg} kg</strong>
      </p>
    `;

    document.getElementById("calc-kg-label").textContent = `Peso que probaste (${rule.unitHint})`;

    // Calcular 1RM estimado y el peso ideal para que la Serie 3 llegue al fallo dentro de ex.repRange
    const repsToFailureWithTestWeight = testReps + testRir;
    const e1RM = testKg * (1 + repsToFailureWithTestWeight / 30);

    // En la Serie 1 queremos que el usuario pueda hacer ex.repRange[1] con RIR 2 (es decir, capacidad de ex.repRange[1] + 2 reps al fallo).
    // Así, por fatiga acumulada, en la Serie 3 llegará al fallo (RIR 0) justo entre ex.repRange[0] y ex.repRange[1]!
    const targetCapReps = ex.repRange[1] + 2;
    let rawIdealKg = e1RM / (1 + targetCapReps / 30);

    // Redondear al incremento real del equipo (ej. 1 kg o 2 kg en mancuernas, 2.5 kg en barra/placas)
    const step = ex.equipmentType === "dumbbell" ? 1 : 2.5;
    let idealWorkingKg = Math.max(step, Math.round(rawIdealKg / step) * step);
    let warmupKg = Math.max(step, Math.round((idealWorkingKg * 0.6) / step) * step);
    if (ex.equipmentType === "barbell" && warmupKg < 20) warmupKg = 20;

    let seriePlanHtml = `
      <div class="serie-plan-item">
        <div>
          <strong style="color:#fcd34d;font-size:13px;">🔥 Serie de Calentamiento / Aproximación</strong>
          <div style="font-size:12px;color:#cbd5e1;">${rule.breakdownFn(warmupKg)}</div>
        </div>
        <div style="text-align:right;">
          <strong style="font-size:15px;color:#fde68a;">${warmupKg} kg × 10 reps</strong>
          <div style="font-size:10.5px;color:#94a3b8;">Fácil (sin cansarte)</div>
        </div>
      </div>
    `;

    for (let s = 1; s <= ex.sets; s++) {
      const isLast = s === ex.sets;
      const expectedReps = isLast
        ? `${ex.repRange[0]} a ${ex.repRange[0] + 1} reps`
        : s === 1
        ? `${ex.repRange[1]} reps`
        : `${Math.max(ex.repRange[0] + 1, ex.repRange[1] - 1)} reps`;
      const rirDesc = isLast
        ? "🔥 Llega al FALLO TÉCNICO (RIR 0)"
        : s === 1
        ? "Para guardando 2 en el tanque (RIR 2)"
        : "Para guardando 1 en el tanque (RIR 1)";

      seriePlanHtml += `
        <div class="serie-plan-item ${isLast ? "failure" : ""}">
          <div>
            <strong style="color:${isLast ? "#34d399" : "#22d3ee"};font-size:13.5px;">
              Serie Efectiva ${s} ${isLast ? "(Serie al Fallo)" : ""}
            </strong>
            <div style="font-size:12px;color:#e2e8f0;">${rule.breakdownFn(idealWorkingKg)}</div>
            <div style="font-size:11px;color:#94a3b8;">${rirDesc}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <strong style="font-size:17px;color:#fff;">${idealWorkingKg} kg</strong>
            <div style="font-size:12px;color:#34d399;font-weight:800;">Haz ${expectedReps}</div>
          </div>
        </div>
      `;
    }

    document.getElementById("calc-output").innerHTML = `
      <div class="serie-plan-grid">
        ${seriePlanHtml}
      </div>
      <button class="btn-primary" onclick="applyCalculatedWeight('${ex.id}', '${day.id}', ${idealWorkingKg})">
        ✅ Usar ${idealWorkingKg} kg en "${ex.name}" hoy
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
    const navBtns = document.querySelectorAll(".nav-btn");
    window.switchTab("workout", navBtns[0]);
    setTimeout(() => {
      const card = document.getElementById(`card-${exId}`);
      if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
  };

  // =========================================================================
  // PESTAÑA 3: MEDIDAS CORPORALES BILATERALES (DERECHO VS IZQUIERDO)
  // =========================================================================
  function formatSymmetryBadge(rightVal, leftVal, name) {
    const r = Number(rightVal) || 0;
    const l = Number(leftVal) || 0;
    const diff = +(r - l).toFixed(1);
    const absDiff = Math.abs(diff);

    if (absDiff <= 0.3) {
      return `<span class="sym-badge ok">✓ Simétrico (Δ ${absDiff} cm)</span>`;
    }
    const weaker = diff > 0 ? "Izquierdo" : "Derecho";
    return `<span class="sym-badge diff">⚠️ Δ ${absDiff} cm (Inicia con ${name} ${weaker})</span>`;
  }

  window.updateLiveSymmetryBadges = function () {
    const armR = document.getElementById("m-arm-r")?.value;
    const armL = document.getElementById("m-arm-l")?.value;
    const foreR = document.getElementById("m-forearm-r")?.value;
    const foreL = document.getElementById("m-forearm-l")?.value;
    const thighR = document.getElementById("m-thigh-r")?.value;
    const thighL = document.getElementById("m-thigh-l")?.value;
    const calfR = document.getElementById("m-calf-r")?.value;
    const calfL = document.getElementById("m-calf-l")?.value;

    document.getElementById("sym-arm").innerHTML = formatSymmetryBadge(armR, armL, "brazo");
    document.getElementById("sym-forearm").innerHTML = formatSymmetryBadge(foreR, foreL, "antebrazo");
    document.getElementById("sym-thigh").innerHTML = formatSymmetryBadge(thighR, thighL, "pierna");
    document.getElementById("sym-calf").innerHTML = formatSymmetryBadge(calfR, calfL, "pantorrilla");
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
      calfLeftCm: parseFloat(document.getElementById("m-calf-l").value) || 0,
      note: `Control #${state.bodyMetrics.length + 1}`
    });

    saveState();
    renderBodyMetrics();
    alert("¡Medidas derechas e izquierdas registradas con éxito!");
  };

  window.resetExerciseDraft = function (exId) {
    const found = findExerciseById(exId);
    if (!found) return;
    delete state.activeDrafts[exId];
    saveState();
    renderRoutineDay();
  };

  window.deleteBodyMetric = function (idx) {
    if (!confirm("¿Seguro que quieres borrar este registro de medidas?")) return;
    state.bodyMetrics.splice(idx, 1);
    saveState();
    renderBodyMetrics();
  };

  window.deleteStrengthEntry = function (exId, idx) {
    if (!confirm("¿Seguro que quieres borrar esta sesión guardada del ejercicio?")) return;
    if (!state.workoutHistory[exId]) return;
    state.workoutHistory[exId].splice(idx, 1);
    saveState();
    renderAllSessionsLog();
    window.renderExerciseStrengthHistory();
    renderRoutineDay();
  };

  window.resetAllData = function () {
    if (!confirm("¿Seguro que quieres borrar TODOS los registros de ejemplo y empezar en blanco?")) return;
    state = {
      selectedDayId: getDefaultDayId(),
      supplementsByDate: {},
      workoutHistory: {},
      activeDrafts: {},
      cardioLogs: {},
      bodyMetrics: []
    };
    saveState();
    initApp();
    alert("Todos los datos han sido reiniciados en blanco.");
  };

  function renderBodyMetrics() {
    const list = state.bodyMetrics;
    const fallback = defaultState.bodyMetrics[0];
    const latest = list[list.length - 1] || fallback;
    const first = list[0] || latest;

    // Pre-llenar campos con los últimos valores (con soporte retrocompatible)
    document.getElementById("m-weight").value = latest.weightKg ?? 61.0;
    document.getElementById("m-chest").value = latest.chestCm ?? 94.0;
    document.getElementById("m-shoulders").value = latest.shouldersCm ?? 111.0;
    document.getElementById("m-waist").value = latest.waistCm ?? 76.0;

    document.getElementById("m-arm-r").value = latest.armRightCm ?? latest.armCm ?? 33.6;
    document.getElementById("m-arm-l").value = latest.armLeftCm ?? latest.armCm ?? 33.2;
    document.getElementById("m-forearm-r").value = latest.forearmRightCm ?? 27.5;
    document.getElementById("m-forearm-l").value = latest.forearmLeftCm ?? 27.2;
    document.getElementById("m-thigh-r").value = latest.thighRightCm ?? latest.thighCm ?? 52.2;
    document.getElementById("m-thigh-l").value = latest.thighLeftCm ?? latest.thighCm ?? 51.8;
    document.getElementById("m-calf-r").value = latest.calfRightCm ?? latest.calfCm ?? 35.6;
    document.getElementById("m-calf-l").value = latest.calfLeftCm ?? latest.calfCm ?? 35.4;

    window.updateLiveSymmetryBadges();

    const diffWeight = (latest.weightKg - first.weightKg).toFixed(1);
    const diffWaist = (latest.waistCm - first.waistCm).toFixed(1);

    if (list.length === 0) {
      document.getElementById("recomp-summary").innerHTML = `
        <div class="calc-box" style="grid-column: span 2;">
          <strong>Sin medidas aún</strong>
          <span>Ingresa tus medidas abajo y dale a Guardar</span>
        </div>
      `;
      document.getElementById("metrics-tbody").innerHTML = `
        <tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:12px;">No hay medidas registradas todavía.</td></tr>
      `;
      document.getElementById("metrics-chart-svg").innerHTML = `
        <rect width="340" height="130" rx="12" fill="#080d18"/>
        <text x="170" y="68" fill="#94a3b8" font-size="11" text-anchor="middle">Guarda tu primera medida para ver la gráfica</text>
      `;
      return;
    }

    document.getElementById("recomp-summary").innerHTML = `
      <div class="calc-box">
        <strong>${latest.weightKg} kg</strong>
        <span>Peso (${diffWeight >= 0 ? "+" : ""}${diffWeight} kg)</span>
      </div>
      <div class="calc-box">
        <strong>${latest.waistCm} cm</strong>
        <span>Cintura (${diffWaist >= 0 ? "+" : ""}${diffWaist} cm)</span>
      </div>
      <div class="calc-box">
        <strong>D:${latest.armRightCm ?? latest.armCm} / I:${latest.armLeftCm ?? latest.armCm}</strong>
        <span>Bíceps Der / Izq (cm)</span>
      </div>
      <div class="calc-box">
        <strong>D:${latest.thighRightCm ?? latest.thighCm} / I:${latest.thighLeftCm ?? latest.thighCm}</strong>
        <span>Pierna Der / Izq (cm)</span>
      </div>
    `;

    const tbody = document.getElementById("metrics-tbody");
    tbody.innerHTML = list
      .map((m, realIdx) => ({ m, realIdx }))
      .reverse()
      .map(
        ({ m, realIdx }) => `
      <tr>
        <td>${m.date}</td>
        <td><strong>${m.weightKg}kg</strong></td>
        <td>${m.waistCm}cm</td>
        <td>${m.armRightCm ?? m.armCm} / ${m.armLeftCm ?? m.armCm}</td>
        <td>${m.thighRightCm ?? m.thighCm} / ${m.thighLeftCm ?? m.thighCm}</td>
        <td>${m.calfRightCm ?? m.calfCm} / ${m.calfLeftCm ?? m.calfCm}</td>
        <td style="text-align:right;">
          <button onclick="deleteBodyMetric(${realIdx})" style="background:rgba(244,63,94,0.2);border:1px solid rgba(244,63,94,0.5);color:#fda4af;border-radius:6px;padding:3px 7px;font-size:11px;font-weight:800;cursor:pointer;">
            🗑️ Borrar
          </button>
        </td>
      </tr>
    `
      )
      .join("");

    renderWeightChart();
  }

  function renderWeightChart() {
    const svg = document.getElementById("metrics-chart-svg");
    const data = state.bodyMetrics;
    if (!svg || data.length === 0) return;

    const weights = data.map((d) => d.weightKg);
    const minW = Math.min(...weights) - 1.5;
    const maxW = Math.max(...weights) + 1.5;
    const w = 340;
    const h = 130;

    const points = data.map((d, i) => {
      const x = data.length === 1 ? w / 2 : 32 + (i / (data.length - 1)) * (w - 64);
      const y = h - 26 - ((d.weightKg - minW) / (maxW - minW || 1)) * (h - 54);
      return { x, y, val: d.weightKg, date: d.date.slice(5) };
    });

    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

    svg.innerHTML = `
      <rect width="${w}" height="${h}" rx="12" fill="#080d18"/>
      <line x1="20" y1="${h - 22}" x2="${w - 20}" y2="${h - 22}" stroke="#1e293b" stroke-width="1.5"/>
      <path d="${pathD}" stroke="#10b981" stroke-width="3" fill="none" stroke-linecap="round"/>
      ${points
        .map(
          (p) => `
        <circle cx="${p.x}" cy="${p.y}" r="5" fill="#34d399" />
        <text x="${p.x}" y="${p.y - 9}" fill="#f8fafc" font-size="10" font-weight="800" text-anchor="middle">${p.val}kg</text>
        <text x="${p.x}" y="${h - 7}" fill="#94a3b8" font-size="9" text-anchor="middle">${p.date}</text>
      `
        )
        .join("")}
    `;
  }

  function renderAllSessionsLog() {
    const box = document.getElementById("all-sessions-log-box");
    if (!box) return;

    // 1. Recopilar todas las sesiones guardadas en workoutHistory
    const savedRows = [];
    window.ROUTINE_DAYS.forEach((d) => {
      d.exercises.forEach((ex) => {
        const hist = state.workoutHistory[ex.id] || [];
        hist.forEach((entry, idx) => {
          savedRows.push({
            date: entry.date,
            dayName: d.shortName,
            exId: ex.id,
            exName: ex.name,
            sets: entry.sets,
            idx
          });
        });
      });
    });

    // 2. Recopilar series marcadas con ✓ o editadas en las tarjetas actuales (activeDrafts)
    const activeCaptures = [];
    window.ROUTINE_DAYS.forEach((d) => {
      if (d.isRestDay) return;
      d.exercises.forEach((ex) => {
        const draft = state.activeDrafts[ex.id];
        if (!draft) return;
        const hasCheckedOrCustom = draft.some(
          (s) => s.done || Number(s.kg) !== Number(ex.suggestedStartKg)
        );
        if (hasCheckedOrCustom) {
          activeCaptures.push({
            dayId: d.id,
            dayName: d.shortName,
            exName: ex.name,
            sets: draft
          });
        }
      });
    });

    let html = "";

    if (activeCaptures.length > 0) {
      html += `
        <div style="background:rgba(6,182,212,0.12);border:1px solid rgba(34,211,238,0.35);border-radius:12px;padding:12px;margin-bottom:12px;">
          <div style="font-size:13px;font-weight:900;color:#22d3ee;margin-bottom:6px;">
            ⚡ Pesos Actuales en tus Tarjetas de Rutina:
          </div>
          <table class="metrics-table" style="margin-top:4px;">
            <thead>
              <tr><th>Día / Ejercicio</th><th>Series Capturadas (Peso × Reps)</th></tr>
            </thead>
            <tbody>
              ${activeCaptures
                .map((c) => {
                  const setsStr = c.sets
                    .map((s) => `${s.done ? "✅ " : ""}${s.kg}kg×${s.reps}`)
                    .join(" · ");
                  return `<tr>
                    <td><strong style="color:#f8fafc;">${c.exName}</strong><br/><span style="font-size:10.5px;color:#94a3b8;">${c.dayName}</span></td>
                    <td style="color:#a7f3d0;font-weight:700;">${setsStr}</td>
                  </tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    if (savedRows.length === 0) {
      html += `
        <div style="background:#080d18;border:1px solid rgba(148,163,184,0.15);border-radius:12px;padding:12px;font-size:12.5px;color:#cbd5e1;">
          💡 <strong>Tip:</strong> Cuando termines tus ejercicios del día en la pestaña <strong>Entrenar</strong>, toca el botón verde de hasta abajo <strong>"💾 Terminar y Guardar Entrenamiento"</strong> para que quede archivado por fecha aquí abajo.
        </div>
      `;
    } else {
      savedRows.reverse();
      html += `
        <div style="font-size:13px;font-weight:900;color:#34d399;margin-bottom:6px;">
          ✅ Sesiones Guardadas por Fecha (${savedRows.length} registros):
        </div>
        <div style="overflow-x:auto;">
          <table class="metrics-table" style="margin-top:2px;">
            <thead>
              <tr><th>Fecha</th><th>Ejercicio</th><th>Series (Peso × Reps)</th><th></th></tr>
            </thead>
            <tbody>
              ${savedRows
                .map((r) => {
                  const summary = r.sets.map((s) => `${s.kg}kg×${s.reps}`).join(" · ");
                  return `<tr>
                    <td>${r.date}<br/><span style="font-size:10px;color:#94a3b8;">${r.dayName}</span></td>
                    <td><strong>${r.exName}</strong></td>
                    <td style="color:#34d399;font-weight:700;">${summary}</td>
                    <td style="text-align:right;">
                      <button onclick="deleteStrengthEntry('${r.exId}', ${r.idx})" style="background:rgba(244,63,94,0.2);border:1px solid rgba(244,63,94,0.5);color:#fda4af;border-radius:6px;padding:3px 7px;font-size:11px;font-weight:800;cursor:pointer;">
                        🗑️
                      </button>
                    </td>
                  </tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    box.innerHTML = html;
  }

  function renderStrengthHistorySelect() {
    const sel = document.getElementById("strength-ex-select");
    if (!sel) return;
    const allExercises = [];
    window.ROUTINE_DAYS.forEach((d) => {
      d.exercises.forEach((ex) => {
        if (!allExercises.some((e) => e.id === ex.id)) {
          allExercises.push(ex);
        }
      });
    });

    sel.innerHTML = allExercises
      .map((ex) => `<option value="${ex.id}">${ex.name} (${ex.machineName})</option>`)
      .join("");
    window.renderExerciseStrengthHistory();
  }

  window.renderExerciseStrengthHistory = function () {
    const sel = document.getElementById("strength-ex-select");
    const box = document.getElementById("strength-history-box");
    if (!sel || !box) return;
    const exId = sel.value;
    const entries = state.workoutHistory[exId] || [];

    if (entries.length === 0) {
      box.innerHTML = `<p style="font-size:12.5px;color:#94a3b8;margin-top:8px;">Aún no hay sesiones guardadas para este ejercicio. Al guardar tu entrenamiento verás tu progreso aquí.</p>`;
      return;
    }

    box.innerHTML = `
      <table class="metrics-table">
        <thead>
          <tr><th>Fecha</th><th>Series (Peso × Reps)</th><th>Mejor Carga</th><th></th></tr>
        </thead>
        <tbody>
          ${entries
            .map((e, realIdx) => ({ e, realIdx }))
            .reverse()
            .map(({ e, realIdx }) => {
              const summary = e.sets.map((s) => `${s.kg}kg×${s.reps}`).join(" · ");
              const bestKg = Math.max(...e.sets.map((s) => Number(s.kg)));
              return `<tr>
                <td>${e.date}</td>
                <td>${summary}</td>
                <td><strong style="color:#34d399">${bestKg} kg</strong></td>
                <td style="text-align:right;">
                  <button onclick="deleteStrengthEntry('${exId}', ${realIdx})" style="background:rgba(244,63,94,0.2);border:1px solid rgba(244,63,94,0.5);color:#fda4af;border-radius:6px;padding:3px 7px;font-size:11px;font-weight:800;cursor:pointer;">
                    🗑️ Borrar
                  </button>
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    `;
  };

  function renderProfileStats() {
    const daysLogged = Object.values(state.supplementsByDate);
    const creatineCount = daysLogged.filter((d) => d.creatine).length;
    const proteinCount = daysLogged.filter((d) => d.protein).length;

    const el = document.getElementById("supp-stats-box");
    if (el) {
      el.innerHTML = `
        <div class="calc-box">
          <strong>${creatineCount} días</strong>
          <span>Creatina (5 g) cumplida</span>
        </div>
        <div class="calc-box">
          <strong>${proteinCount} días</strong>
          <span>Proteína (~115 g) cumplida</span>
        </div>
      `;
    }
  }

  window.exportBackup = function () {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `titan61-pro-${getTodayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  window.importBackup = function (event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const imported = JSON.parse(e.target.result);
        state = Object.assign(structuredClone(defaultState), imported);
        saveState();
        initApp();
        alert("Respaldo restaurado correctamente.");
      } catch (_) {
        alert("Archivo JSON inválido.");
      }
    };
    reader.readAsText(file);
  };

  window.switchTab = function (tabId, btnEl) {
    document.querySelectorAll(".tab-view").forEach((t) => t.classList.remove("active"));
    document.getElementById(`tab-${tabId}`).classList.add("active");

    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    if (btnEl) btnEl.classList.add("active");
    if (tabId === "progress") renderAllSessionsLog();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  function initApp() {
    renderSupplements();
    renderDayCarousel();
    renderRoutineDay();
    populateCalculatorExercises();
    renderBodyMetrics();
    renderAllSessionsLog();
    renderStrengthHistorySelect();
    renderProfileStats();

    window.addEventListener("online", () => {
      pullFromSupabase();
    });

    // Cargar automáticamente los datos más recientes de Supabase al abrir
    pullFromSupabase();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }

  document.addEventListener("DOMContentLoaded", initApp);
})();
