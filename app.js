(() => {
  'use strict';

  /* ============================================================
     BAMBÚ LINU — app.js
     Paso 1: Capturar · Paso 2: Agrupar · Paso 3: Priorizar
     Paso 4: Estructurar · Modo Zen Panda
     Paso 5: Integración Google Gemini (IA Zen)
     ============================================================ */

  /* ---------- 1. CONSTANTES ---------- */
  const KEY                = 'bambulinu:v1';
  const KEY_OLD            = 'bambumind:v1';
  const KEY_GEMINI_API     = 'bambulinu:gemini_api_key';
  const KEY_GEMINI_API_OLD = 'bambumind:gemini_api_key';
  // Candidatos de respaldo robustos (priorizando Lite y 8B por velocidad y bajo costo)
  const FALLBACK_MODEL_CONFIGS = [
    { model: 'gemini-3.5-flash-lite',   apiVersion: 'v1beta' },
    { model: 'gemini-2.5-flash-lite',   apiVersion: 'v1beta' },
    { model: 'gemini-1.5-flash-8b',     apiVersion: 'v1'     },
    { model: 'gemini-3.8-flash',        apiVersion: 'v1beta' },
    { model: 'gemini-2.5-flash',        apiVersion: 'v1beta' },
    { model: 'gemini-2.0-flash',        apiVersion: 'v1beta' },
    { model: 'gemini-2.0-flash',        apiVersion: 'v1'     },
    { model: 'gemini-1.5-flash',        apiVersion: 'v1'     },
    { model: 'gemini-1.5-flash-latest', apiVersion: 'v1beta' },
    { model: 'gemini-pro',              apiVersion: 'v1'     },
  ];
  let discoveredConfigs   = null;
  let activeWorkingConfig = null;
  const MAX_CHAR           = 500;
  const ZEN_SECS           = 600; // 10 minutos

  const COLORS = [
    { id: 'bambu',   name: 'Bambú',   hex: '#7BC47F' },
    { id: 'durazno', name: 'Durazno', hex: '#FFB8B8' },
    { id: 'sol',     name: 'Sol',     hex: '#F6D97A' },
    { id: 'cielo',   name: 'Cielo',   hex: '#9CC9F0' },
    { id: 'lila',    name: 'Lila',    hex: '#C9B3F0' },
  ];

  const RAMA_PALETTE = ['#7BC47F', '#9CC9F0', '#FFB8B8', '#F6D97A', '#C9B3F0', '#F0B975'];

  const CUADRANTES = [
    { id: 'hacer',    icon: 'zap',       nombre: 'Hacer ya',   desc: 'Urgente · Importante',      clase: 'q-hacer'    },
    { id: 'planear',  icon: 'calendar',  nombre: 'Planificar', desc: 'Importante · No urgente',    clase: 'q-planear'  },
    { id: 'delegar',  icon: 'handshake', nombre: 'Delegar',    desc: 'Urgente · No importante',    clase: 'q-delegar'  },
    { id: 'eliminar', icon: 'trash',     nombre: 'Eliminar',   desc: 'No urgente · No importante', clase: 'q-eliminar' },
  ];

  const $  = (s, ctx = document) => ctx.querySelector(s);
  const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];

  /* ---------- 2. ESTADO GLOBAL + PERSISTENCIA ---------- */
  const defaults = () => ({
    version: 1,
    theme: null,
    step: 0,
    thoughts: [],
    /* Agrupar */
    ideaCentral: '',
    ramas: [],
    ramaMapa: {},
    /* Priorizar */
    cuadrantes: {},
    /* Estructurar */
    estructura: {
      conclusion: '',
      argumentos: [], // [{ id, texto, datos: [{ id, texto }] }]
    },
  });

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(KEY_OLD));
      if (raw && Array.isArray(raw.thoughts)) {
        const merged = { ...defaults(), ...raw };
        if (!merged.estructura || !Array.isArray(merged.estructura.argumentos)) {
          merged.estructura = defaults().estructura;
        }
        return merged;
      }
    } catch { /* datos dañados */ }
    return defaults();
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* lleno */ }
  }

  let state     = load();
  let query     = '';
  let editingId = null;
  let taggingId = null;
  let freshId   = null;
  let eating    = false;
  let eatTimer  = null;
  let mood      = null;
  let moodTimer = null;

  /* ---------- 3. UTILIDADES ---------- */
  const uid  = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function relTime(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'ahora';
    if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 7)  return `hace ${d} día${d > 1 ? 's' : ''}`;
    return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  }

  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if      (k === 'class')              n.className = v;
      else if (k === 'text')               n.textContent = v;
      else if (k === 'html')               n.innerHTML = v;
      else if (k.startsWith('on'))         n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null)   n.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => c && n.append(c));
    return n;
  }

  const ICONS = {
    leaf: '<svg viewBox="0 0 20 20"><path d="M4 16C4 9 8 4 16 4c0 8-5 12-12 12Z"/><path d="M4 16c1.5-3.5 4-6 8.5-8"/></svg>',
    zap: '<svg viewBox="0 0 20 20"><path d="M11 2 4 12h5l-1 6 8-11h-5l1-5Z"/></svg>',
    calendar: '<svg viewBox="0 0 20 20"><rect x="3" y="4.5" width="14" height="12.5" rx="2"/><path d="M3 8.5h14M7 2.5v3M13 2.5v3"/></svg>',
    handshake: '<svg viewBox="0 0 20 20"><circle cx="7" cy="8" r="3.4"/><circle cx="14" cy="9.5" r="2.6"/><path d="M3 17c.6-2.8 2-4.2 4-4.2s3.3 1.2 4 2.6c.7-1.6 2.1-2.6 3.7-2.6 1.7 0 2.8 1.4 3.3 4.2"/></svg>',
    trash: '<svg viewBox="0 0 20 20"><path d="M4 6h12M8 6V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M6 6l.6 10a1 1 0 0 0 1 1h4.8a1 1 0 0 0 1-1L14 6"/></svg>',
    gear: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="2.6"/><path d="M10 2.7v2M10 15.3v2M17.3 10h-2M4.7 10h-2M15.2 4.8l-1.4 1.4M6.2 13.8l-1.4 1.4M15.2 15.2l-1.4-1.4M6.2 6.2 4.8 4.8"/></svg>',
    sun: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="3.4"/><path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.4 4.6l-1.4 1.4M6 14l-1.4 1.4M15.4 15.4 14 14M6 6 4.6 4.6"/></svg>',
    moon: '<svg viewBox="0 0 20 20"><path d="M16.5 12.3A7 7 0 0 1 7.7 3.5a7 7 0 1 0 8.8 8.8Z"/></svg>',
    search: '<svg viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m17 17-4.3-4.3"/></svg>',
    eye: '<svg viewBox="0 0 20 20"><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z"/><circle cx="10" cy="10" r="2.3"/></svg>',
    link: '<svg viewBox="0 0 20 20"><path d="M8.5 11.5 15 5M9.5 4.5H15v5.5M15.5 11v3.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3.5"/></svg>',
    sparkle: '<svg viewBox="0 0 20 20"><path d="M9 2c.5 3 1.5 4 4.5 4.5-3 .5-4 1.5-4.5 4.5-.5-3-1.5-4-4.5-4.5C7.5 6 8.5 5 9 2Z"/><path d="M15.5 12c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5Z"/></svg>',
    send: '<svg viewBox="0 0 20 20"><path d="M17.5 2.5 2 8.8l6.2 2.4M17.5 2.5 11.4 18l-3.2-6.8M17.5 2.5 8.2 11.2"/></svg>',
    check: '<svg viewBox="0 0 20 20"><path d="m4 10.5 4 4L16 6"/></svg>',
    x: '<svg viewBox="0 0 20 20"><path d="M5 5l10 10M15 5 5 15"/></svg>',
    clipboard: '<svg viewBox="0 0 20 20"><rect x="4.5" y="4" width="11" height="14" rx="1.6"/><rect x="7.5" y="2" width="5" height="3" rx="1"/></svg>',
    doc: '<svg viewBox="0 0 20 20"><path d="M5 2.5h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z"/><path d="M12 2.5v3h3M7 10.5h6M7 13.5h6"/></svg>',
    chart: '<svg viewBox="0 0 20 20"><path d="M3 17V3M3 17h14"/><rect x="6" y="10" width="2.4" height="5"/><rect x="10" y="6.5" width="2.4" height="8.5"/><rect x="14" y="12" width="2.4" height="3"/></svg>',
    flag: '<svg viewBox="0 0 20 20"><path d="M5 17.5v-15"/><path d="M5 3.2c3-1.3 4.6.8 8 0v8c-3.4.8-5-1.3-8 0Z"/></svg>',
    bulb: '<svg viewBox="0 0 20 20"><path d="M10 2.5a5.5 5.5 0 0 1 3 10.1c-.6.4-1 1-1 1.7v.7H8v-.7c0-.7-.4-1.3-1-1.7A5.5 5.5 0 0 1 10 2.5Z"/><path d="M8 17.5h4M8.6 15.5h2.8"/></svg>',
    lotus: '<svg viewBox="0 0 20 20"><path d="M10 3c2 2.4 2 5.5 0 8.3C8 8.5 8 5.4 10 3Z"/><path d="M3.5 8c3 .4 5.3 2.2 6.5 5-3.4.3-5.7-1.6-6.5-5ZM16.5 8c-3 .4-5.3 2.2-6.5 5 3.4.3 5.7-1.6 6.5-5Z"/><path d="M4 15.5c1.6-2 3.7-3 6-3s4.4 1 6 3"/></svg>',
  };
  function ic(name, cls = '') {
    const svg = ICONS[name];
    if (!svg) return '';
    return svg.replace('<svg ', `<svg class="icon${cls ? ' ' + cls : ''}" aria-hidden="true" `);
  }

  function bounceEl(elem) {
    if (!elem) return;
    elem.classList.remove('bounce-drop');
    void elem.offsetWidth;
    elem.classList.add('bounce-drop');
  }

  /* ============================================================
     4. SISTEMA DE DESHACER (UNDO)
     ============================================================ */
  let undoSnapshot = null;
  let undoTimer    = null;

  function pushUndo(msg) {
    undoSnapshot = JSON.stringify(state);
    showUndoToast(msg);
  }

  function applyUndo() {
    if (!undoSnapshot) return;
    try {
      state = JSON.parse(undoSnapshot);
      undoSnapshot = null;
      save();
      render();
      renderCurrentPanel(state.step);
      hideUndoToast();
      celebrate(1600);
    } catch (e) {
      console.error('Error al deshacer', e);
    }
  }

  function showUndoToast(msg) {
    const toast = $('#toast-undo');
    if (!toast) return;
    const txt = toast.querySelector('.toast-text');
    if (txt) txt.textContent = msg;
    toast.hidden = false;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { hideUndoToast(); }, 9000);
  }

  function hideUndoToast() {
    const toast = $('#toast-undo');
    if (toast) toast.hidden = true;
    clearTimeout(undoTimer);
  }

  $('#toast-undo-btn')?.addEventListener('click', applyUndo);
  $('#toast-close-btn')?.addEventListener('click', hideUndoToast);

  /* ============================================================
     5. CLIENTE API GOOGLE GEMINI (Multi-versión v1/v1beta + Fallback)
     ============================================================ */
  function getGeminiApiKey() {
    return (localStorage.getItem(KEY_GEMINI_API) || localStorage.getItem(KEY_GEMINI_API_OLD) || '').trim();
  }

  function getSavedWorkingConfig() {
    if (activeWorkingConfig) return activeWorkingConfig;
    try {
      const raw = sessionStorage.getItem('bambulinu:working_model_cfg');
      if (raw) {
        activeWorkingConfig = JSON.parse(raw);
        return activeWorkingConfig;
      }
    } catch {}
    return null;
  }

  function setSavedWorkingConfig(cfg) {
    activeWorkingConfig = cfg;
    try {
      sessionStorage.setItem('bambulinu:working_model_cfg', JSON.stringify(cfg));
    } catch {}
  }

  /**
   * Consulta a Google ListModels tanto en v1 como en v1beta
   * para obtener la lista real de modelos autorizados y activos para esta clave.
   */
  async function discoverAvailableFlashModels(key) {
    if (!key) return FALLBACK_MODEL_CONFIGS;
    if (discoveredConfigs && discoveredConfigs.length > 0) return discoveredConfigs;

    const results = [];
    const versions = ['v1beta', 'v1'];

    for (const ver of versions) {
      try {
        const url = `https://generativelanguage.googleapis.com/${ver}/models?key=${encodeURIComponent(key)}`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        if (!Array.isArray(data.models)) continue;

        for (const m of data.models) {
          const rawName = m.name || '';
          const cleanName = rawName.replace(/^models\//, '');
          const lower = cleanName.toLowerCase();
          const methods = (m.supportedGenerationMethods || []).map((x) => String(x).toLowerCase());

          // Debe soportar generateContent (o si methods viene vacío asumimos compatible si es gemini)
          const supportsGen = methods.length === 0 || methods.includes('generatecontent');
          if (!supportsGen) continue;
          if (lower.includes('tts') || lower.includes('embed') || lower.includes('imagen')) continue;

          // Es un modelo de texto/chat válido
          const isFlash = lower.includes('flash');
          const versionNumMatch = cleanName.match(/(\d+(?:\.\d+)?)/);
          const versionNum = versionNumMatch ? parseFloat(versionNumMatch[1]) : (isFlash ? 1.0 : 0.5);

          results.push({
            model: cleanName,
            apiVersion: ver,
            isFlash,
            versionNum,
          });
        }
      } catch (e) {
        console.warn(`[Bambú Linu] Error al listar modelos en ${ver}:`, e);
      }
    }

    if (results.length > 0) {
      // Ordenar: primero los Lite/8B, luego Flash por versión descendente, luego los demás
      results.sort((a, b) => {
        if (a.isFlash && !b.isFlash) return -1;
        if (!a.isFlash && b.isFlash) return 1;
        
        // Priorizar versiones 'lite' o '8b' (más rápidas y económicas)
        const aIsLite = a.model.includes('lite') || a.model.includes('8b');
        const bIsLite = b.model.includes('lite') || b.model.includes('8b');
        
        if (aIsLite && !bIsLite) return -1;
        if (!aIsLite && bIsLite) return 1;

        // Si hay empate, preferir la versión numérica más alta
        return b.versionNum - a.versionNum;
      });

      // Deduplicar
      const seen = new Set();
      const deduped = [];
      for (const item of results) {
        const k = `${item.model}:${item.apiVersion}`;
        if (!seen.has(k)) {
          seen.add(k);
          deduped.push({ model: item.model, apiVersion: item.apiVersion });
        }
      }

      discoveredConfigs = deduped;
      if (deduped.length > 0) {
        setSavedWorkingConfig(deduped[0]);
      }
      return deduped;
    }

    return FALLBACK_MODEL_CONFIGS;
  }

  function setAiThinking(thinking, label = 'Pensando...') {
    const lbl = $('.panda-label');
    if (thinking) {
      mood = 'thinking';
      if (lbl) lbl.textContent = label;
      renderPanda();
    } else {
      mood = null;
      if (lbl) lbl.textContent = '¡Hola!';
      renderPanda();
    }
  }

  function formatGeminiError(err) {
    const msg = (err?.message || '').trim();
    if (!navigator.onLine || msg === 'OFFLINE' || msg === 'NETWORK_ERROR') {
      return 'No hay conexión a internet. Bambú Linu guarda y organiza los pensamientos sin conexión, pero las funciones de IA requieren conexión a internet activa.';
    }
    if (msg === 'NO_KEY') {
      return 'No has configurado tu API key de Gemini. Pulsa el ícono de engranaje arriba para agregarla.';
    }
    if (msg === 'INVALID_KEY') {
      return 'La API key de Gemini no es válida o no tiene permisos. Verifica tu clave en Configuración.';
    }
    if (msg === 'QUOTA_EXCEEDED') {
      return 'Límite de peticiones de Gemini alcanzado (cuota gratuita). Espera unos instantes y vuelve a intentar.';
    }
    if (msg === 'SERVER_ERROR') {
      return 'Los servidores de Google Gemini están ocupados temporalmente. Intenta en un momento.';
    }
    if (msg === 'SAFETY_BLOCKED') {
      return 'La respuesta fue bloqueada por las políticas de seguridad de Google.';
    }
    if (msg === 'PARSE_ERROR') {
      return 'No se pudo interpretar el formato devuelto por la IA. Por favor, reintenta.';
    }
    if (msg === 'EMPTY_RESPONSE') {
      return 'Gemini devolvió una respuesta vacía. Intenta reformular tu consulta.';
    }
    return `Error de Gemini: ${msg || 'Error desconocido'}`;
  }

  /**
   * Llamada genérica a la API REST de Google Gemini
   * con auto-detección dinámica multi-versión (v1 y v1beta) y cadena de relevo
   */
  async function callGemini(prompt, systemInstruction = '', options = {}) {
    if (!navigator.onLine) throw new Error('OFFLINE');
    const key = getGeminiApiKey();
    if (!key) throw new Error('NO_KEY');

    // 1. Descubrir modelos autorizados de la clave (o usar fallbacks si ya existen)
    let availableConfigs = [];
    try {
      availableConfigs = await discoverAvailableFlashModels(key);
    } catch {
      availableConfigs = FALLBACK_MODEL_CONFIGS;
    }

    // 2. Construir orden de prueba: primero el último que funcionó con éxito
    const saved = getSavedWorkingConfig();
    const candidateList = [];
    if (saved) candidateList.push(saved);
    candidateList.push(...availableConfigs, ...FALLBACK_MODEL_CONFIGS);

    // Deduplicar respetando prioridad
    const seen = new Set();
    const candidates = [];
    for (const c of candidateList) {
      const k = `${c.model}:${c.apiVersion}`;
      if (!seen.has(k)) {
        seen.add(k);
        candidates.push(c);
      }
    }

    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: options.temperature ?? 0.3,
      }
    };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    if (options.json) {
      body.generationConfig.responseMimeType = 'application/json';
    }

    let lastError = null;
    let attempted = 0;

    for (const { model, apiVersion } of candidates) {
      attempted++;
      const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

      let res;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch {
        throw new Error('NETWORK_ERROR');
      }

      if (!res.ok) {
        let errJson = null;
        try { errJson = await res.json(); } catch {}
        const errMsg = errJson?.error?.message || '';

        // Si la clave no es válida
        if (res.status === 400 || res.status === 403) {
          if (errMsg.toLowerCase().includes('api key') || errMsg.toLowerCase().includes('key not valid')) {
            throw new Error('INVALID_KEY');
          }
        }

        // Si se excedió cuota
        if (res.status === 429) {
          lastError = new Error('QUOTA_EXCEEDED');
          if (attempted < candidates.length) continue;
          throw lastError;
        }

        // Si es 404 (no existe en este endpoint/versión) o >= 500 (sobrecarga temporal)
        if (res.status === 404 || res.status >= 500) {
          console.warn(`[Bambú Linu] ${model} (${apiVersion}) dio HTTP ${res.status} ("${errMsg}"). Relevando al siguiente candidato...`);
          lastError = new Error(errMsg || 'SERVER_ERROR');
          continue; // Pasa automáticamente al siguiente modelo
        }

        lastError = new Error(errMsg || `HTTP_${res.status}`);
        continue;
      }

      // Respuesta exitosa
      const data = await res.json();
      const candidate = data?.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;
      if (!text) {
        if (candidate?.finishReason === 'SAFETY') throw new Error('SAFETY_BLOCKED');
        throw new Error('EMPTY_RESPONSE');
      }

      // Guardar el modelo y versión de API que respondieron con éxito
      setSavedWorkingConfig({ model, apiVersion });
      return text;
    }

    throw lastError || new Error('SERVER_ERROR');
  }

  /**
   * Limpia posibles bloques markdown (```json ... ```) y parsea JSON
   */
  function cleanAndParseJSON(raw) {
    if (!raw || typeof raw !== 'string') throw new Error('PARSE_ERROR');
    let text = raw.trim();
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) text = jsonMatch[0];
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('PARSE_ERROR');
    }
  }

  /* ============================================================
     6. MODAL DE SUGERENCIAS IA UNIFICADO
     ============================================================ */
  const sugDlg     = $('#ia-sugerencias-dlg');
  const sugTitle   = $('#ia-sug-title');
  const sugDesc    = $('#ia-sug-desc');
  const sugContent = $('#ia-sug-content');
  const sugCancel  = $('#ia-sug-cancel');
  const sugApply   = $('#ia-sug-apply');

  let sugApplyCallback = null;

  function openSuggestionDialog({ title, desc, renderPreview, onApply }) {
    if (!sugDlg) return;
    sugTitle.textContent = title;
    sugDesc.textContent  = desc;
    sugContent.replaceChildren(renderPreview());
    sugApplyCallback = onApply;
    sugDlg.showModal();
  }

  sugCancel?.addEventListener('click', () => {
    sugDlg.close();
    sugApplyCallback = null;
  });

  sugApply?.addEventListener('click', () => {
    sugDlg.close();
    if (sugApplyCallback) {
      sugApplyCallback();
      sugApplyCallback = null;
    }
  });

  /* ============================================================
     7. ACCIONES CORE DE PENSAMIENTOS
     ============================================================ */
  function addThought(text) {
    text = text.trim();
    if (!text) return;
    const t = { id: uid(), text, color: null, createdAt: Date.now() };
    state.thoughts.unshift(t);
    freshId = t.id;
    save(); eat(); render();
  }

  function addThoughtSilent(text, color = null) {
    text = text.trim();
    if (!text) return;
    const t = { id: uid(), text: text.slice(0, MAX_CHAR), color, createdAt: Date.now() };
    state.thoughts.unshift(t);
    freshId = t.id;
  }

  function patch(id, changes) {
    const t = state.thoughts.find((x) => x.id === id);
    if (t) { Object.assign(t, changes); save(); }
  }

  function remove(id, node) {
    node.classList.add('leaving');
    setTimeout(() => {
      state.thoughts = state.thoughts.filter((t) => t.id !== id);
      if (editingId === id) editingId = null;
      if (taggingId === id) taggingId = null;
      delete state.ramaMapa[id];
      delete state.cuadrantes[id];
      save(); render();
    }, 220);
  }

  function reorderThoughts(fromId, toId) {
    if (fromId === toId) return;
    const arr = state.thoughts;
    const fi  = arr.findIndex((t) => t.id === fromId);
    const ti  = arr.findIndex((t) => t.id === toId);
    if (fi === -1 || ti === -1) return;
    arr.splice(ti, 0, arr.splice(fi, 1)[0]);
    save(); render();
  }

  /* ---------- 8. PANDA (ESTADOS Y MIRADA) ---------- */
  function eat() {
    eating = true;
    clearTimeout(eatTimer);
    eatTimer = setTimeout(() => { eating = false; renderPanda(); }, 1800);
  }

  function celebrate(ms = 2800) {
    mood = 'celebrating'; renderPanda();
    clearTimeout(moodTimer);
    moodTimer = setTimeout(() => { mood = null; renderPanda(); }, ms);
  }

  function renderPanda() {
    const p = $('#panda');
    if (!p) return;
    if (mood) { p.dataset.state = mood; return; }
    p.dataset.state = state.thoughts.length === 0 ? 'sleeping' : eating ? 'eating' : 'awake';
  }

  const pandaBtn = $('#panda-btn');
  const pupils   = $('.pupils');
  let raf = 0;

  function look(x, y) {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (!pandaBtn || !pupils) return;
      const r  = pandaBtn.getBoundingClientRect();
      const dx = x - (r.left + r.width / 2);
      const dy = y - (r.top  + r.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      const k    = (Math.min(dist, 160) / 160) * 2.4;
      pupils.style.transform = `translate(${(dx / dist) * k}px,${(dy / dist) * k}px)`;
    });
  }

  addEventListener('pointermove', (e) => look(e.clientX, e.clientY), { passive: true });
  addEventListener('pointerdown', (e) => look(e.clientX, e.clientY), { passive: true });
  pandaBtn.addEventListener('click', () => celebrate());
  window.bambulinu = window.bambu = { celebrate, addThought };

  /* ============================================================
     9. DRAG ENGINE — POINTER EVENTS (TOUCH + MOUSE)
     ============================================================ */
  let activeDrag = null;

  function attachPointerDrag(source, opts) {
    source.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.target.closest('button, input, textarea, a')) return;
      if (activeDrag) return;
      e.preventDefault();
      const rect = source.getBoundingClientRect();
      const ox = e.clientX - rect.left;
      const oy = e.clientY - rect.top;
      const ghost = document.createElement('div');
      ghost.className = 'pointer-drag-ghost';
      ghost.textContent = (opts.ghostText || '').slice(0, 70);
      ghost.style.left  = (e.clientX - ox) + 'px';
      ghost.style.top   = (e.clientY - oy) + 'px';
      ghost.style.width = Math.min(rect.width, 260) + 'px';
      document.body.appendChild(ghost);
      source.classList.add(opts.dragClass || 'dragging');
      source.setPointerCapture(e.pointerId);
      activeDrag = { source, ghost, ox, oy, opts, currentZone: null, zoneEl: null };
    }, { passive: false });

    source.addEventListener('pointermove', (e) => {
      if (!activeDrag || activeDrag.source !== source) return;
      e.preventDefault();
      const { ghost, ox, oy } = activeDrag;
      ghost.style.left = (e.clientX - ox) + 'px';
      ghost.style.top  = (e.clientY - oy) + 'px';
      ghost.style.visibility = 'hidden';
      const under = document.elementFromPoint(e.clientX, e.clientY);
      ghost.style.visibility = '';
      const zoneEl = under?.closest('[data-drop-zone]');
      const zoneId = zoneEl?.dataset.dropZone ?? null;
      if (zoneId !== activeDrag.currentZone) {
        if (activeDrag.zoneEl) activeDrag.zoneEl.classList.remove('drop-active');
        if (zoneEl) zoneEl.classList.add('drop-active');
        activeDrag.currentZone = zoneId;
        activeDrag.zoneEl = zoneEl;
      }
    }, { passive: false });

    source.addEventListener('pointerup', () => {
      if (!activeDrag || activeDrag.source !== source) return;
      finalizeDrag(true);
    });
    source.addEventListener('pointercancel', () => {
      if (!activeDrag || activeDrag.source !== source) return;
      finalizeDrag(false);
    });
  }

  function finalizeDrag(doDrop) {
    if (!activeDrag) return;
    const { source, ghost, opts, currentZone, zoneEl } = activeDrag;
    ghost.remove();
    source.classList.remove(opts.dragClass || 'dragging');
    if (zoneEl) zoneEl.classList.remove('drop-active');
    activeDrag = null;
    if (doDrop && currentZone && opts.onDrop) opts.onDrop(currentZone);
  }

  /* ============================================================
     10. DRAG & DROP PASO 1 (TARJETAS)
     ============================================================ */
  let draggingId = null, dragOverId = null;

  function attachMouseDnd(li, id) {
    li.setAttribute('draggable', 'true');
    li.addEventListener('dragstart', (e) => {
      draggingId = id;
      requestAnimationFrame(() => li.classList.add('dragging'));
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    });
    li.addEventListener('dragend', () => { clearDrag1(); draggingId = dragOverId = null; });
    li.addEventListener('dragover', (e) => {
      if (!draggingId || draggingId === id) return;
      e.preventDefault();
      if (dragOverId !== id) {
        $$('.card.drag-over').forEach((c) => c.classList.remove('drag-over'));
        li.classList.add('drag-over'); dragOverId = id;
      }
    });
    li.addEventListener('dragleave', (e) => {
      if (!li.contains(e.relatedTarget)) { li.classList.remove('drag-over'); if (dragOverId === id) dragOverId = null; }
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      if (draggingId && draggingId !== id) reorderThoughts(draggingId, id);
    });
  }

  function clearDrag1() {
    $$('.card.dragging,.card.drag-over').forEach((c) => c.classList.remove('dragging', 'drag-over'));
  }

  let touchDragId1 = null, touchGhost1 = null;
  let touchOffX1 = 0, touchOffY1 = 0;
  let lastTouchTarget1 = null, longPressTimer1 = null;
  let isDraggingTouch1 = false;

  function attachTouchDnd(handle, card, id, text) {
    handle.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      longPressTimer1 = setTimeout(() => {
        isDraggingTouch1 = true; touchDragId1 = id; lastTouchTarget1 = null;
        card.classList.add('dragging'); document.body.style.userSelect = 'none';
        const rect = card.getBoundingClientRect();
        touchOffX1 = touch.clientX - rect.left; touchOffY1 = touch.clientY - rect.top;
        touchGhost1 = document.createElement('div');
        touchGhost1.className = 'drag-ghost-card';
        touchGhost1.textContent = text.length > 60 ? text.slice(0, 57) + '…' : text;
        touchGhost1.style.cssText = `position:fixed;z-index:9999;pointer-events:none;left:${touch.clientX - touchOffX1}px;top:${touch.clientY - touchOffY1}px;width:${Math.min(rect.width, 260)}px`;
        document.body.appendChild(touchGhost1);
        window.addEventListener('touchmove', onTM1, { passive: false });
        window.addEventListener('touchend',  onTE1, { passive: true });
      }, 350);
    }, { passive: true });
    handle.addEventListener('touchmove', () => clearTimeout(longPressTimer1), { passive: true });
    handle.addEventListener('touchend',  () => clearTimeout(longPressTimer1), { passive: true });
  }

  function onTM1(e) {
    if (!isDraggingTouch1) return; e.preventDefault();
    const t = e.touches[0];
    touchGhost1.style.left = (t.clientX - touchOffX1) + 'px';
    touchGhost1.style.top  = (t.clientY - touchOffY1) + 'px';
    touchGhost1.style.visibility = 'hidden';
    const under = document.elementFromPoint(t.clientX, t.clientY);
    touchGhost1.style.visibility = '';
    const tc = under?.closest('.card[data-id]');
    $$('.card.drag-over').forEach((c) => c.classList.remove('drag-over'));
    if (tc && tc.dataset.id !== touchDragId1) { tc.classList.add('drag-over'); lastTouchTarget1 = tc.dataset.id; }
    else lastTouchTarget1 = null;
  }

  function onTE1() {
    if (touchDragId1 && lastTouchTarget1) reorderThoughts(touchDragId1, lastTouchTarget1);
    if (touchGhost1) { touchGhost1.remove(); touchGhost1 = null; }
    clearDrag1();
    touchDragId1 = null; lastTouchTarget1 = null; isDraggingTouch1 = false;
    document.body.style.userSelect = '';
    window.removeEventListener('touchmove', onTM1);
    window.removeEventListener('touchend',  onTE1);
  }

  /* ============================================================
     11. AGRUPAR — MAPA MENTAL + IA
     ============================================================ */
  let agruparBounce = null;

  function addRama() {
    const color = RAMA_PALETTE[state.ramas.length % RAMA_PALETTE.length];
    state.ramas.push({ id: uid(), nombre: 'Nueva rama', color });
    save(); renderAgrupar();
    setTimeout(() => {
      const inputs = $$('.rama-nombre-input');
      if (inputs.length) { const last = inputs[inputs.length - 1]; last.focus(); last.select(); }
    }, 60);
  }

  function removeRama(ramaId) {
    state.ramas = state.ramas.filter((r) => r.id !== ramaId);
    Object.keys(state.ramaMapa).forEach((tid) => {
      if (state.ramaMapa[tid] === ramaId) delete state.ramaMapa[tid];
    });
    save(); renderAgrupar();
  }

  function handleAgruparDrop(thoughtId, zoneId) {
    if (zoneId === 'pool-agrupar') delete state.ramaMapa[thoughtId];
    else if (zoneId.startsWith('rama:')) {
      const ramaId = zoneId.slice(5);
      if (state.ramas.find((r) => r.id === ramaId)) state.ramaMapa[thoughtId] = ramaId;
    }
    agruparBounce = thoughtId; save(); renderAgrupar();
  }

  function buildAgruparChip(t, inRama = false) {
    const colorEntry = COLORS.find((c) => c.id === t.color);
    const chip = el('div', {
      class: 'thought-chip', 'data-id': t.id,
      style: colorEntry ? `--tag:${colorEntry.hex}` : '',
    }, el('span', { class: 'chip-text', text: t.text.length > 55 ? t.text.slice(0, 52) + '…' : t.text }));
    if (inRama) {
      chip.append(el('button', {
        class: 'chip-remove', type: 'button', 'aria-label': 'Quitar de la rama', html: '&times;',
        onclick: (e) => { e.stopPropagation(); delete state.ramaMapa[t.id]; save(); renderAgrupar(); },
      }));
    }
    attachPointerDrag(chip, { ghostText: t.text, onDrop: (z) => handleAgruparDrop(t.id, z) });
    return chip;
  }

  function buildRama(rama) {
    const thoughts = state.thoughts.filter((t) => state.ramaMapa[t.id] === rama.id);
    const div = el('div', { class: 'rama', 'data-drop-zone': `rama:${rama.id}`, style: `--rc:${rama.color}` });
    div.append(
      el('div', { class: 'rama-header' },
        el('input', {
          class: 'rama-nombre-input', type: 'text', value: rama.nombre,
          'aria-label': 'Nombre de la rama', maxlength: '40',
          oninput: (e) => { rama.nombre = e.target.value; save(); },
          onblur: () => drawMapLines(),
        }),
        el('button', {
          class: 'rama-delete', type: 'button',
          'aria-label': `Eliminar rama ${rama.nombre}`, html: '&times;',
          onclick: () => removeRama(rama.id),
        }),
      ),
      el('div', { class: 'rama-cards' },
        thoughts.length === 0 ? el('p', { class: 'rama-empty', text: 'Arrastra pensamientos aquí' }) : null,
        ...thoughts.map((t) => buildAgruparChip(t, true)),
      ),
    );
    return div;
  }

  function drawMapLines() {
    const svg  = $('#map-svg');
    const cont = $('#map-container');
    const node = $('#central-node');
    if (!svg || !cont || !node) return;
    const CR = cont.getBoundingClientRect();
    const NR = node.getBoundingClientRect();
    if (CR.width === 0) return;
    const sx = NR.left - CR.left + NR.width  / 2;
    const sy = NR.bottom - CR.top;
    const W  = CR.width;
    const H  = Math.max(CR.height, cont.scrollHeight);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.width = W + 'px'; svg.style.height = H + 'px';
    const paths = [];
    $$('.rama', cont).forEach((rama) => {
      const RR    = rama.getBoundingClientRect();
      const tx    = RR.left - CR.left + RR.width / 2;
      const ty    = RR.top  - CR.top  + (cont.scrollTop || 0);
      const color = getComputedStyle(rama).getPropertyValue('--rc').trim() || '#7BC47F';
      const mY    = sy + (ty - sy) * 0.45;
      paths.push({ d: `M ${sx} ${sy} C ${sx} ${mY}, ${tx} ${mY}, ${tx} ${ty}`, color });
    });
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const ns = 'http://www.w3.org/2000/svg';
    const prefRed = matchMedia('(prefers-reduced-motion: reduce)').matches;
    paths.forEach(({ d, color }) => {
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d); p.setAttribute('fill', 'none');
      p.setAttribute('stroke', color); p.setAttribute('stroke-width', '2.5');
      p.setAttribute('stroke-linecap', 'round'); p.setAttribute('opacity', '0.75');
      p.classList.add('map-line');
      if (!prefRed) { const len = p.getTotalLength ? p.getTotalLength() : 200; p.style.strokeDasharray = len; p.style.strokeDashoffset = len; }
      svg.appendChild(p);
    });
    if (!prefRed) requestAnimationFrame(() => { $$('.map-line', svg).forEach((p) => { p.style.transition = 'stroke-dashoffset .65s ease-out'; p.style.strokeDashoffset = '0'; }); });
  }

  /* --- Función IA: Agrupar con IA --- */
  async function iaAgrupar() {
    if (state.thoughts.length === 0) {
      alert('Primero captura algunos pensamientos en el paso 1.');
      return;
    }
    setAiThinking(true, 'Agrupando ramas...');

    const prompt = `Analiza estos pensamientos del usuario:
${JSON.stringify(state.thoughts.map((t) => ({ id: t.id, texto: t.text })))}

Tu tarea:
1. Propón una "ideaCentral" concisa (máximo 8 palabras) que sintetice estos pensamientos.
2. Propón entre 2 y 5 "ramas" temáticas lógicas y equilibradas con nombres claros.
3. Asigna cada pensamiento por su "id" a la rama correspondiente (cada uno en "thoughtIds").

Responde ÚNICAMENTE en JSON válido con este formato:
{
  "ideaCentral": "Idea central aquí",
  "ramas": [
    {
      "nombre": "Nombre de la rama",
      "thoughtIds": ["id1", "id2"]
    }
  ]
}`;

    try {
      const raw  = await callGemini(prompt, 'Eres un experto en pensamiento visual, organización y mapas mentales al servicio de la Señorita Manu. Responde siempre en español y en formato JSON válido.', { json: true });
      const data = cleanAndParseJSON(raw);
      setAiThinking(false);

      if (!data || !Array.isArray(data.ramas)) throw new Error('PARSE_ERROR');

      openSuggestionDialog({
        title: 'Sugerencia de Agrupamiento con IA',
        desc: `Idea central sugerida para la Señorita Manu: "${data.ideaCentral || 'Sin título'}". Revisa las ramas propuestas antes de aplicar:`,
        renderPreview: () => {
          const container = el('div', { style: 'display:flex;flex-direction:column;gap:10px;' });
          data.ramas.forEach((r, idx) => {
            const card = el('div', { class: 'sug-group-card' });
            const title = el('div', { class: 'sug-group-title' },
              el('span', { text: `${r.nombre}` }),
              el('small', { style: 'color:var(--muted);font-weight:400;', text: `(${r.thoughtIds?.length || 0})` })
            );
            const chips = el('div', { class: 'sug-chip-row' });
            (r.thoughtIds || []).forEach((tid) => {
              const t = state.thoughts.find((x) => x.id === tid);
              if (t) chips.append(el('span', { class: 'pill', text: t.text.length > 40 ? t.text.slice(0, 38) + '…' : t.text }));
            });
            card.append(title, chips);
            container.append(card);
          });
          return container;
        },
        onApply: () => {
          pushUndo('Agrupación con IA aplicada');
          if (data.ideaCentral) state.ideaCentral = data.ideaCentral;
          state.ramas = [];
          state.ramaMapa = {};

          data.ramas.forEach((r, idx) => {
            const ramaId = uid();
            const color  = RAMA_PALETTE[idx % RAMA_PALETTE.length];
            state.ramas.push({ id: ramaId, nombre: r.nombre || `Rama ${idx + 1}`, color });
            (r.thoughtIds || []).forEach((tid) => {
              state.ramaMapa[tid] = ramaId;
            });
          });

          save();
          renderAgrupar();
          celebrate(2000);
        }
      });

    } catch (err) {
      setAiThinking(false);
      alert(formatGeminiError(err));
    }
  }

  function renderAgrupar() {
    const panel = $('#paso-2');
    if (!panel) return;
    panel.innerHTML = '';
    if (state.thoughts.length === 0) {
      panel.append(el('div', { class: 'soon glass' },
        el('div', { class: 'soon-icon', html: ic('leaf') }),
        el('h2', { text: 'Primero captura tus pensamientos' }),
        el('p', { text: 'Ve al paso 1 "Capturar", escribe tus ideas y regresa aquí para organizarlas en grupos.' }),
      )); return;
    }
    panel.append(el('div', { class: 'map-header' },
      el('div', { class: 'idea-central-wrap' },
        el('label', { for: 'idea-central-input', class: 'idea-central-label', text: 'Idea central' }),
        el('input', {
          id: 'idea-central-input', class: 'idea-central-input', type: 'text',
          placeholder: 'Escribe la idea que une tus pensamientos…',
          value: state.ideaCentral || '', maxlength: '80',
          oninput: (e) => {
            state.ideaCentral = e.target.value; save();
            const sp = $('#central-node-text'); if (sp) sp.textContent = e.target.value || 'Idea central';
          },
        }),
      ),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' },
        el('button', { class: 'btn btn-primary', type: 'button', text: '+ Nueva rama', onclick: addRama }),
        el('button', { class: 'btn btn-ia', type: 'button', text: 'Agrupar con IA', onclick: iaAgrupar })
      ),
    ));
    const container = el('div', { class: 'map-container', id: 'map-container' });
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg'); svg.id = 'map-svg'; svg.setAttribute('aria-hidden', 'true');
    container.append(svg);
    container.append(el('div', { class: 'central-node', id: 'central-node' },
      el('span', { id: 'central-node-text', text: state.ideaCentral || 'Idea central' }),
    ));
    const grid = el('div', { class: 'ramas-grid', id: 'ramas-grid' });
    if (state.ramas.length === 0) grid.append(el('p', { class: 'empty', text: 'Pulsa "+ Nueva rama" o usa "Agrupar con IA" para comenzar.' }));
    else state.ramas.forEach((r) => grid.append(buildRama(r)));
    container.append(grid); panel.append(container);
    const unassigned = state.thoughts.filter((t) => !state.ramaMapa[t.id]);
    panel.append(el('div', { class: 'pool-section' },
      el('div', { class: 'pool-header' },
        el('span', { class: 'pool-title', text: `Sin asignar (${unassigned.length})` }),
        unassigned.length === 0 ? el('span', { class: 'pool-done', text: '¡Todo agrupado!' }) : el('span', { class: 'pool-hint', text: 'Arrastra un chip a una rama' }),
      ),
      el('div', { class: 'pool', 'data-drop-zone': 'pool-agrupar', id: 'pool-agrupar' },
        unassigned.length === 0 ? el('p', { class: 'pool-empty', text: 'Todos asignados.' }) : null,
        ...unassigned.map((t) => buildAgruparChip(t, false)),
      ),
    ));
    if (agruparBounce) { bounceEl($(`[data-id="${agruparBounce}"]`)); agruparBounce = null; }
    requestAnimationFrame(() => drawMapLines());
    window.removeEventListener('resize', drawMapLines);
    window.addEventListener('resize', drawMapLines);
    if (container._ro) container._ro.disconnect();
    container._ro = new ResizeObserver(() => drawMapLines());
    container._ro.observe(container);
  }

  /* ============================================================
     12. PRIORIZAR — MATRIZ DE EISENHOWER + IA
     ============================================================ */
  let priorizarBounce = null;

  function handlePriorizarDrop(thoughtId, zoneId) {
    if (CUADRANTES.some((q) => q.id === zoneId)) state.cuadrantes[thoughtId] = zoneId;
    else if (zoneId === 'pool-priorizar') delete state.cuadrantes[thoughtId];
    priorizarBounce = thoughtId; save(); renderPriorizar();
    if (state.thoughts.length > 0 && Object.keys(state.cuadrantes).length >= state.thoughts.length)
      setTimeout(() => celebrate(), 400);
  }

  function buildPriorizarChip(t, inMatrix = false) {
    const colorEntry = COLORS.find((c) => c.id === t.color);
    const chip = el('div', {
      class: 'thought-chip' + (inMatrix ? ' chip-matrix' : ''), 'data-id': t.id,
      style: colorEntry ? `--tag:${colorEntry.hex}` : '',
    }, el('span', { class: 'chip-text', text: t.text.length > 55 ? t.text.slice(0, 52) + '…' : t.text }));
    if (inMatrix) {
      chip.append(el('button', {
        class: 'chip-remove', type: 'button', 'aria-label': 'Quitar de la matriz', html: '&times;',
        onclick: (e) => { e.stopPropagation(); delete state.cuadrantes[t.id]; save(); renderPriorizar(); },
      }));
    }
    attachPointerDrag(chip, { ghostText: t.text, onDrop: (z) => handlePriorizarDrop(t.id, z) });
    return chip;
  }

  /* --- Función IA: Priorizar con IA --- */
  async function iaPriorizar() {
    if (state.thoughts.length === 0) {
      alert('Primero captura algunos pensamientos en el paso 1.');
      return;
    }
    setAiThinking(true, 'Evaluando prioridades...');

    const prompt = `Analiza estos pensamientos de la Señorita Manu:
${JSON.stringify(state.thoughts.map((t) => ({ id: t.id, texto: t.text })))}

Cuadrantes posibles:
- "hacer": Urgente e Importante
- "planear": Importante pero No Urgente
- "delegar": Urgente pero No Importante
- "eliminar": Ni Urgente Ni Importante

Para cada pensamiento de la Señorita Manu, asigna un cuadrante y redacta una justificación concisa de EXACTAMENTE UNA línea en español dirigida a la Señorita Manu (puedes dirigirte a ella como "Señorita Manu" cuando sea apropiado).

Responde ÚNICAMENTE en JSON válido con este formato:
[
  {
    "id": "id_del_pensamiento",
    "cuadrante": "hacer" | "planear" | "delegar" | "eliminar",
    "razon": "Justificación de una sola línea"
  }
]`;

    try {
      const raw  = await callGemini(prompt, 'Eres un mentor de productividad ejecutiva y la Matriz de Eisenhower para la Señorita Manu. Si te diriges a ella en las razones, hazlo siempre con respeto y calidez como "Señorita Manu". Responde siempre en español y en formato JSON válido.', { json: true });
      const data = cleanAndParseJSON(raw);
      setAiThinking(false);

      if (!Array.isArray(data)) throw new Error('PARSE_ERROR');

      openSuggestionDialog({
        title: 'Sugerencia de Priorización con IA',
        desc: 'Revisa las asignaciones sugeridas con su motivo en una sola línea:',
        renderPreview: () => {
          const container = el('div', { style: 'display:flex;flex-direction:column;gap:8px;' });
          data.forEach((item) => {
            const t = state.thoughts.find((x) => x.id === item.id);
            if (!t) return;
            const q = CUADRANTES.find((c) => c.id === item.cuadrante) || CUADRANTES[0];
            const row = el('div', { class: 'sug-table-row' },
              el('div', {},
                el('p', { class: 'sug-table-desc', text: t.text }),
                el('div', { class: 'sug-table-reason', text: `${item.razon || ''}` })
              ),
              el('span', { class: 'pill q-pill' }, el('span', { class: 'q-emoji-sm', html: ic(q.icon) }), q.nombre)
            );
            container.append(row);
          });
          return container;
        },
        onApply: () => {
          pushUndo('Priorización con IA aplicada');
          data.forEach((item) => {
            if (CUADRANTES.some((q) => q.id === item.cuadrante)) {
              state.cuadrantes[item.id] = item.cuadrante;
            }
          });
          save();
          renderPriorizar();
          celebrate(2000);
        }
      });

    } catch (err) {
      setAiThinking(false);
      alert(formatGeminiError(err));
    }
  }

  function renderPriorizar() {
    const panel = $('#paso-3');
    if (!panel) return;
    panel.innerHTML = '';
    if (state.thoughts.length === 0) {
      panel.append(el('div', { class: 'soon glass' },
        el('div', { class: 'soon-icon', html: ic('zap') }),
        el('h2', { text: 'Primero captura tus pensamientos' }),
        el('p', { text: 'Ve al paso 1 "Capturar" y regresa aquí para priorizarlos.' }),
      )); return;
    }
    const unassigned = state.thoughts.filter((t) => !state.cuadrantes[t.id]);
    const assigned   = state.thoughts.length - unassigned.length;
    panel.append(el('div', { class: 'priorizar-header' },
      el('div', { class: 'priorizar-title-wrap' },
        el('h2', { class: 'priorizar-title', text: 'Matriz de Eisenhower' }),
        el('p',  { class: 'priorizar-desc', text: 'Arrastra cada pensamiento al cuadrante que le corresponda.' }),
      ),
      el('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;' },
        el('button', { class: 'btn btn-ia', type: 'button', text: 'Priorizar con IA', onclick: iaPriorizar }),
        el('span', { class: 'pill', text: `${assigned} / ${state.thoughts.length}` }),
      )
    ));
    panel.append(el('div', { class: 'pool-section' },
      el('div', { class: 'pool-header' },
        el('span', { class: 'pool-title', text: `Sin priorizar (${unassigned.length})` }),
        unassigned.length === 0 ? el('span', { class: 'pool-done', text: '¡Todo priorizado!' }) : el('span', { class: 'pool-hint', text: 'Arrastra al cuadrante que corresponda' }),
      ),
      el('div', { class: 'pool', 'data-drop-zone': 'pool-priorizar', id: 'pool-priorizar' },
        unassigned.length === 0 ? el('p', { class: 'pool-empty', text: 'Todos priorizados.' }) : null,
        ...unassigned.map((t) => buildPriorizarChip(t, false)),
      ),
    ));
    const wrap = el('div', { class: 'matrix-wrap' });
    wrap.append(el('div', { class: 'axis-y' },
      el('span', { class: 'axis-y-label top', text: 'Importante' }),
      el('span', { class: 'axis-y-label bot', text: 'No importante' }),
    ));
    const col = el('div', { class: 'matrix-col' });
    col.append(el('div', { class: 'axis-x' },
      el('span', { class: 'axis-x-label urgente',    text: 'Urgente' }),
      el('span', { class: 'axis-x-label no-urgente', text: 'No urgente' }),
    ));
    const matrix = el('div', { class: 'matrix', role: 'group', 'aria-label': 'Matriz de Eisenhower' });
    CUADRANTES.forEach(({ id, icon, nombre, desc, clase }) => {
      const inQ = state.thoughts.filter((t) => state.cuadrantes[t.id] === id);
      matrix.append(el('div', { class: `cuadrante ${clase}`, 'data-drop-zone': id },
        el('div', { class: 'q-header' },
          el('span', { class: 'q-emoji', html: ic(icon) }),
          el('div', {}, el('strong', { class: 'q-name', text: nombre }), el('small', { class: 'q-desc', text: desc })),
          el('span', { class: 'q-count', text: String(inQ.length) }),
        ),
        el('div', { class: 'q-cards' }, ...inQ.map((t) => buildPriorizarChip(t, true))),
      ));
    });
    col.append(matrix); wrap.append(col); panel.append(wrap);
    if (priorizarBounce) { bounceEl($(`[data-id="${priorizarBounce}"]`)); priorizarBounce = null; }
  }

  /* ============================================================
     13. ESTRUCTURAR — PIRÁMIDE DE MINTO + IA
     ============================================================ */
  function estrAddArg() {
    state.estructura.argumentos.push({ id: uid(), texto: '', datos: [] });
    save(); renderEstructurar();
  }

  function estrRemoveArg(argId) {
    state.estructura.argumentos = state.estructura.argumentos.filter((a) => a.id !== argId);
    save(); renderEstructurar();
  }

  function estrAddDato(argId) {
    const arg = state.estructura.argumentos.find((a) => a.id === argId);
    if (arg) { arg.datos.push({ id: uid(), texto: '' }); save(); renderEstructurar(); }
  }

  function estrRemoveDato(argId, datoId) {
    const arg = state.estructura.argumentos.find((a) => a.id === argId);
    if (arg) { arg.datos = arg.datos.filter((d) => d.id !== datoId); save(); renderEstructurar(); }
  }

  function buildTypst() {
    const e = state.estructura;
    const lines = [];
    lines.push(`#set text(font: "Inter", size: 11pt)`);
    lines.push(`#set page(margin: 2cm)`);
    lines.push(`#set par(justify: true)`);
    lines.push('');
    lines.push(`= ${e.conclusion || '(Sin conclusión)'}`);
    lines.push('');
    e.argumentos.forEach((arg, i) => {
      lines.push(`== ${i + 1}. ${arg.texto || '(Sin argumento)'}`);
      lines.push('');
      arg.datos.forEach((d) => lines.push(`- ${d.texto || '(Sin dato)'}`));
      lines.push('');
    });
    return lines.join('\n').trimEnd();
  }

  let argDragging = null;

  function attachArgDrag(argEl, argId) {
    argEl.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.arg-header')) return;
      if (e.target.closest('button, input')) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      argDragging = argId;
      argEl.classList.add('arg-dragging');
      argEl.setPointerCapture(e.pointerId);
    });
    argEl.addEventListener('pointermove', (e) => {
      if (!argDragging || argDragging !== argId) return;
      e.preventDefault();
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const targetEl = under?.closest('.argumento[data-arg-id]');
      $$('.argumento.arg-over').forEach((a) => a.classList.remove('arg-over'));
      if (targetEl && targetEl.dataset.argId !== argId) targetEl.classList.add('arg-over');
    }, { passive: false });
    argEl.addEventListener('pointerup', (e) => {
      if (!argDragging || argDragging !== argId) return;
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const targetEl = under?.closest('.argumento[data-arg-id]');
      if (targetEl && targetEl.dataset.argId !== argId) {
        const args = state.estructura.argumentos;
        const fi = args.findIndex((a) => a.id === argId);
        const ti = args.findIndex((a) => a.id === targetEl.dataset.argId);
        if (fi !== -1 && ti !== -1) { args.splice(ti, 0, args.splice(fi, 1)[0]); save(); }
      }
      argEl.classList.remove('arg-dragging');
      $$('.argumento.arg-over').forEach((a) => a.classList.remove('arg-over'));
      argDragging = null;
      renderEstructurar();
    });
    argEl.addEventListener('pointercancel', () => {
      argEl.classList.remove('arg-dragging');
      $$('.argumento.arg-over').forEach((a) => a.classList.remove('arg-over'));
      argDragging = null;
    });
  }

  /* ---- Confeti de hojas ---- */
  let confettiRaf = null;
  const confettiCanvas  = $('#confeti-canvas');
  const confettiCtx     = confettiCanvas?.getContext('2d');
  let confettiParticles = [];
  const CONFETTI_COLORS = ['#7BC47F', '#FFB8B8', '#F6D97A', '#9CC9F0', '#C9B3F0', '#F0B975'];

  function launchConfetti(count = 90) {
    if (!confettiCanvas || !confettiCtx) return;
    confettiCanvas.style.display = 'block';
    confettiCanvas.width  = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
    confettiParticles = [];
    for (let i = 0; i < count; i++) {
      confettiParticles.push({
        x: Math.random() * confettiCanvas.width,
        y: (Math.random() * confettiCanvas.height * 0.6) - (confettiCanvas.height * 0.3),
        w: 10 + Math.random() * 10,
        h: 18 + Math.random() * 12,
        r: Math.random() * Math.PI * 2,
        vx: (Math.random() - .5) * 3.5,
        vy: 2.5 + Math.random() * 3.5,
        vr: (Math.random() - .5) * .12,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        opacity: 1,
      });
    }
    cancelAnimationFrame(confettiRaf);
    let elapsed = 0;
    const tick = () => {
      confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      elapsed++;
      confettiParticles.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
        if (elapsed > 120) p.opacity -= .012;
        confettiCtx.save();
        confettiCtx.globalAlpha = Math.max(0, p.opacity);
        confettiCtx.translate(p.x, p.y);
        confettiCtx.rotate(p.r);
        confettiCtx.fillStyle = p.color;
        confettiCtx.beginPath();
        confettiCtx.ellipse(0, 0, p.w / 2.5, p.h / 2, 0, 0, Math.PI * 2);
        confettiCtx.fill();
        confettiCtx.restore();
      });
      const alive = confettiParticles.some((p) => p.opacity > 0 && p.y < confettiCanvas.height + 40);
      if (alive) {
        confettiRaf = requestAnimationFrame(tick);
      } else {
        confettiCanvas.style.display = 'none';
        confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      }
    };
    confettiRaf = requestAnimationFrame(tick);
  }

  /* --- Función IA: Estructurar con IA --- */
  async function iaEstructurar() {
    if (state.thoughts.length === 0) {
      alert('Primero captura algunos pensamientos en el paso 1.');
      return;
    }
    setAiThinking(true, 'Estructurando pirámide...');

    const prompt = `Contexto del usuario:
- Pensamientos actuales: ${JSON.stringify(state.thoughts.map((t) => t.text))}
- Idea central previa: ${state.ideaCentral || 'Ninguna'}
- Conclusión previa: ${state.estructura.conclusion || 'Ninguna'}

Genera una Pirámide de Minto en español estructurada y persuasiva:
1. "conclusion": Una conclusión o mensaje principal contundente y orientador (Nivel 0).
2. "argumentos": Entre 2 y 4 argumentos lógicos que la sustentan (Nivel 1).
3. Para cada argumento, 1 a 3 "datos" (evidencias, datos o ejemplos de apoyo) (Nivel 2).

Responde ÚNICAMENTE en JSON válido con este formato:
{
  "conclusion": "Mensaje principal concluyente",
  "argumentos": [
    {
      "texto": "Argumento clave",
      "datos": ["Dato o evidencia 1", "Dato o evidencia 2"]
    }
  ]
}`;

    try {
      const raw  = await callGemini(prompt, 'Eres Barbara Minto, experta en comunicación estructurada y pensamiento lógico. Ayudas a la Señorita Manu a sintetizar sus ideas en una conclusión poderosa y argumentos claros. Responde siempre en español y en formato JSON válido.', { json: true });
      const data = cleanAndParseJSON(raw);
      setAiThinking(false);

      if (!data || !data.conclusion || !Array.isArray(data.argumentos)) throw new Error('PARSE_ERROR');

      openSuggestionDialog({
        title: 'Borrador de Pirámide de Minto con IA',
        desc: 'Revisa la conclusión y argumentos propuestos antes de reemplazar tu esquema actual:',
        renderPreview: () => {
          const container = el('div', { style: 'display:flex;flex-direction:column;gap:12px;' });
          const conclBox = el('div', { class: 'estr-conclusion', style: 'margin:0;' },
            el('div', { class: 'estr-conclusion-header' }, el('span', { class: 'nivel-badge', text: 'Conclusión' })),
            el('p', { style: 'padding:12px 16px;margin:0;font-weight:600;', text: data.conclusion })
          );
          container.append(conclBox);

          data.argumentos.forEach((arg, i) => {
            const argBox = el('div', { class: 'argumento' },
              el('div', { class: 'arg-header' },
                el('span', { class: 'nivel-badge', text: `Arg ${i + 1}` }),
                el('span', { style: 'font-weight:600;', text: arg.texto })
              )
            );
            if (arg.datos && arg.datos.length) {
              const dList = el('div', { class: 'arg-datos' });
              arg.datos.forEach((d) => {
                dList.append(el('div', { class: 'dato-row' },
                  el('span', { class: 'dato-nivel-badge', html: ic('chart') }),
                  el('span', { style: 'font-size:.88rem;', text: d })
                ));
              });
              argBox.append(dList);
            }
            container.append(argBox);
          });
          return container;
        },
        onApply: () => {
          pushUndo('Estructura Minto con IA aplicada');
          state.estructura.conclusion = data.conclusion;
          state.estructura.argumentos = data.argumentos.map((a) => ({
            id: uid(),
            texto: a.texto || '',
            datos: (a.datos || []).map((d) => ({ id: uid(), texto: d })),
          }));
          save();
          renderEstructurar();
          celebrate(2200);
        }
      });

    } catch (err) {
      setAiThinking(false);
      alert(formatGeminiError(err));
    }
  }

  function renderEstructurar() {
    const panel = $('#paso-4');
    if (!panel) return;
    panel.innerHTML = '';

    const md = buildTypst();

    const exportWrap = el('div', { class: 'estr-export-wrap' });

    const btnAi = el('button', { class: 'btn btn-ia', type: 'button', text: 'Borrador con IA', onclick: iaEstructurar });

    const btnMd = el('button', { class: 'btn btn-primary', type: 'button', text: 'Copiar Typst' });
    btnMd.addEventListener('click', () => {
      navigator.clipboard.writeText(md).then(() => {
        btnMd.textContent = 'Copiado';
        setTimeout(() => { btnMd.textContent = 'Copiar Typst'; }, 2000);
      });
    });

    const btnTxt = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Copiar texto' });
    btnTxt.addEventListener('click', () => {
      const plain = md.replace(/^#+\s*/gm, '').replace(/^- /gm, '• ');
      navigator.clipboard.writeText(plain).then(() => {
        btnTxt.textContent = 'Copiado';
        setTimeout(() => { btnTxt.textContent = 'Copiar texto'; }, 2000);
      });
    });

    exportWrap.append(btnAi, btnMd, btnTxt);

    panel.append(el('div', { class: 'estr-header' },
      el('div', { class: 'estr-title-wrap' },
        el('h2', { class: 'estr-title', text: 'Pirámide de Minto' }),
        el('p', { class: 'estr-desc', text: 'Estructura tu idea con una conclusión principal, argumentos clave y datos de apoyo.' }),
      ),
      exportWrap,
    ));

    panel.append(el('div', { class: 'piramide-deco', 'aria-hidden': 'true' },
      el('div', { class: 'pira-level pira-level-0', text: 'Conclusión' }),
      el('div', { class: 'pira-level pira-level-1', text: 'Argumentos' }),
      el('div', { class: 'pira-level pira-level-2', text: 'Datos de apoyo' }),
    ));

    const conclusionTA = el('textarea', {
      class: 'conclusion-input',
      placeholder: 'Escribe tu conclusión o idea principal aquí…',
      'aria-label': 'Conclusión principal',
      rows: 2,
    });
    conclusionTA.value = state.estructura.conclusion || '';
    conclusionTA.addEventListener('input', (e) => {
      state.estructura.conclusion = e.target.value; save();
      updateExportPreview(panel, buildTypst());
    });

    panel.append(el('div', { class: 'estr-conclusion' },
      el('div', { class: 'estr-conclusion-header' },
        el('span', { class: 'nivel-badge', text: 'Conclusión' }),
        el('span', { class: 'pool-hint', text: 'Nivel 0 — tu mensaje principal' }),
      ),
      conclusionTA,
    ));

    const argsList = el('div', { class: 'estr-argumentos', id: 'estr-argumentos' });

    state.estructura.argumentos.forEach((arg) => {
      const argEl = el('div', { class: 'argumento', 'data-arg-id': arg.id });

      const argInput = el('input', {
        class: 'arg-texto-input', type: 'text',
        placeholder: 'Argumento…', value: arg.texto,
        'aria-label': 'Texto del argumento',
        oninput: (e) => { arg.texto = e.target.value; save(); updateExportPreview(panel, buildTypst()); },
      });

      const addDatoBtn = el('button', {
        class: 'arg-btn', type: 'button', 'aria-label': 'Agregar dato de apoyo', text: '+',
        onclick: () => estrAddDato(arg.id),
      });
      const removeArgBtn = el('button', {
        class: 'arg-btn danger', type: 'button', 'aria-label': 'Eliminar argumento', text: '×',
        onclick: () => estrRemoveArg(arg.id),
      });

      argEl.append(el('div', { class: 'arg-header' },
        el('span', { class: 'arg-drag-dots', 'aria-hidden': 'true', text: '⠿' }),
        el('span', { class: 'nivel-badge', text: 'Arg.' }),
        argInput,
        el('div', { class: 'arg-actions' }, addDatoBtn, removeArgBtn),
      ));

      if (arg.datos.length > 0) {
        const datosEl = el('div', { class: 'arg-datos' });
        arg.datos.forEach((dato) => {
          const datoTA = el('textarea', {
            class: 'dato-input',
            placeholder: 'Dato de apoyo, evidencia o ejemplo…',
            'aria-label': 'Dato de apoyo',
            rows: 1,
          });
          datoTA.value = dato.texto || '';
          datoTA.addEventListener('input', (e) => {
            dato.texto = e.target.value; save(); updateExportPreview(panel, buildTypst());
          });
          datosEl.append(el('div', { class: 'dato-row' },
            el('span', { class: 'dato-nivel-badge', html: ic('chart') }),
            datoTA,
            el('button', {
              class: 'dato-remove', type: 'button', 'aria-label': 'Eliminar dato', html: '&times;',
              onclick: () => estrRemoveDato(arg.id, dato.id),
            }),
          ));
        });
        argEl.append(datosEl);
      }

      argEl.append(el('div', { style: 'padding:0 14px 12px' },
        el('button', { class: 'add-dato-btn', type: 'button', text: '+ Dato de apoyo',
          onclick: () => estrAddDato(arg.id) }),
      ));

      attachArgDrag(argEl, arg.id);
      argsList.append(argEl);
    });

    argsList.append(el('button', { class: 'add-arg-btn', type: 'button', text: '+ Agregar argumento', onclick: estrAddArg }));
    panel.append(argsList);

    const previewPre = el('pre', { text: md });
    const preview = el('div', { class: 'export-preview', id: 'export-preview' },
      el('div', { class: 'export-preview-header' },
        el('span', { text: 'Vista previa — Typst' }),
        el('button', {
          class: 'btn btn-ghost', type: 'button', text: 'Copiar', style: 'min-height:36px;padding:0 14px;font-size:.82rem',
          onclick: () => { navigator.clipboard.writeText(previewPre.textContent); },
        }),
      ),
      previewPre,
    );
    panel.append(preview);

    const completarBtn = el('button', {
      class: 'btn btn-primary', type: 'button', text: '¡Estructura completada!',
      style: 'margin-top:24px;width:100%;justify-content:center;font-size:1.05rem;',
      onclick: () => {
        launchConfetti();
        celebrate(4000);
      },
    });
    panel.append(completarBtn);
  }

  function updateExportPreview(panel, md) {
    const pre = $('pre', $('#export-preview', panel) || panel);
    if (pre) pre.textContent = md;
  }

  /* ============================================================
     14. MODO ZEN PANDA + SEPARACIÓN CON IA
     ============================================================ */
  const zenOverlay  = $('#zen-overlay');
  const zenBtn      = $('#zen-btn');
  const zenClose    = $('#zen-close');
  const zenStart    = $('#zen-start');
  const zenPause    = $('#zen-pause');
  const zenResume   = $('#zen-resume');
  const zenFinish   = $('#zen-finish');
  const zenAiFinish = $('#zen-ai-finish');
  const zenTimerEl  = $('#zen-timer');
  const zenTextarea = $('#zen-textarea');

  let zenInterval    = null;
  let zenSecsLeft    = ZEN_SECS;
  let zenRunning     = false;

  function fmtTime(secs) {
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function zenReset() {
    clearInterval(zenInterval);
    zenInterval  = null;
    zenRunning   = false;
    zenSecsLeft  = ZEN_SECS;
    zenTimerEl.textContent = fmtTime(ZEN_SECS);
    zenTimerEl.classList.remove('urgent');
    zenTextarea.value = '';
    zenTextarea.classList.remove('zen-active');
    zenStart.hidden    = false;
    zenPause.hidden    = true;
    zenResume.hidden   = true;
    zenFinish.hidden   = true;
    if (zenAiFinish) zenAiFinish.hidden = true;
    mood = null; renderPanda();
  }

  function zenOpen() {
    zenReset();
    zenOverlay.hidden = false;
    zenOverlay.focus?.();
    mood = 'zen'; renderPanda();
  }

  function zenCloseAction() {
    clearInterval(zenInterval);
    zenOverlay.hidden = true;
    zenReset();
  }

  function zenConvertToThoughts(paragraphs = null) {
    const text = zenTextarea.value.trim();
    if (!text && !paragraphs) { zenCloseAction(); return; }

    const list = paragraphs || text
      .split(/\n{2,}/)
      .flatMap((p) => {
        const t = p.trim();
        if (!t) return [];
        if (t.includes('\n') && t.length > 200) {
          return t.split('\n').map((l) => l.trim()).filter(Boolean);
        }
        return [t];
      })
      .filter((p) => p.length > 0);

    if (list.length === 0) { zenCloseAction(); return; }

    pushUndo(`Sesión Zen Panda: ${list.length} ideas capturadas`);
    list.reverse().forEach((p) => addThoughtSilent(p));
    save();
    render();
    zenCloseAction();
    goTo(0);
    setTimeout(() => { launchConfetti(); celebrate(3000); }, 300);
  }

  /* --- Separar con IA en Zen Panda --- */
  async function iaZenSeparar() {
    const text = zenTextarea.value.trim();
    if (!text) {
      alert('Escribe algo en el lienzo Zen antes de procesarlo.');
      return;
    }
    setAiThinking(true, 'Separando ideas con IA...');

    const prompt = `Analiza este texto de escritura libre (braindump) y divídelo quirúrgicamente en ideas, tareas o pensamientos ATÓMICOS (muy concretos, breves e individuales). 
Reglas cruciales:
1. FRAGMENTA: Si un párrafo tiene múltiples conceptos, tareas o sentimientos, divídelo en varias tarjetas distintas.
2. BREVEDAD: Ninguna idea debe ser un bloque grande de texto. Lo ideal son frases de 1 a 2 líneas (máximo 150-200 caracteres por idea).
3. LIMPIEZA: Mantén la esencia y la intención del autor, pero omite el relleno, las muletillas o las divagaciones innecesarias.

Para cada idea atómica, sugiere una etiqueta de color adecuada entre:
- "bambu" (crecimiento, hábitos, calma, naturaleza)
- "durazno" (urgencias, preocupaciones, emociones)
- "sol" (energía, trabajo, proyectos, vitalidad)
- "cielo" (claridad, orden, aprendizaje)
- "lila" (filosofía, descanso, arte)
- null (sin color específico)

Responde ÚNICAMENTE en JSON válido con este formato exacto:
[
  {
    "texto": "Idea muy breve y concreta",
    "color": "bambu" | "durazno" | "sol" | "cielo" | "lila" | null
  }
]

Texto libre de la Señorita Manu:
${text}`;

    try {
      const raw  = await callGemini(prompt, 'Eres un organizador mental zen y reflexivo al servicio de la Señorita Manu. Responde siempre en español y en formato JSON válido.', { json: true });
      const data = cleanAndParseJSON(raw);
      setAiThinking(false);

      if (!Array.isArray(data)) throw new Error('PARSE_ERROR');

      openSuggestionDialog({
        title: 'Ideas extraídas con IA',
        desc: `Se identificaron ${data.length} ideas con sus etiquetas sugeridas:`,
        renderPreview: () => {
          const container = el('div', { style: 'display:flex;flex-direction:column;gap:8px;' });
          data.forEach((item) => {
            const colorObj = COLORS.find((c) => c.id === item.color);
            const card = el('div', { class: 'sug-table-row' },
              el('p', { class: 'sug-table-desc', text: item.texto }),
              colorObj
                ? el('span', { class: 'pill', style: `background:${colorObj.hex};color:#1E1E24;`, text: colorObj.name })
                : el('span', { class: 'pill', style: 'opacity:.6;', text: 'Sin color' })
            );
            container.append(card);
          });
          return container;
        },
        onApply: () => {
          pushUndo(`Zen Panda IA: ${data.length} pensamientos creados`);
          data.reverse().forEach((item) => {
            addThoughtSilent(item.texto, item.color);
          });
          save();
          render();
          zenCloseAction();
          goTo(0);
          setTimeout(() => { launchConfetti(); celebrate(3000); }, 300);
        }
      });

    } catch (err) {
      setAiThinking(false);
      alert(formatGeminiError(err));
    }
  }

  function zenTick() {
    zenSecsLeft--;
    zenTimerEl.textContent = fmtTime(zenSecsLeft);
    if (zenSecsLeft <= 60) zenTimerEl.classList.add('urgent');
    if (zenSecsLeft <= 0) {
      clearInterval(zenInterval);
      zenRunning = false;
      zenTextarea.classList.remove('zen-active');
      zenConvertToThoughts();
    }
  }

  zenBtn?.addEventListener('click', zenOpen);
  zenClose?.addEventListener('click', zenCloseAction);
  zenOverlay?.addEventListener('keydown', (e) => { if (e.key === 'Escape') zenCloseAction(); });

  zenStart?.addEventListener('click', () => {
    zenRunning = true;
    zenStart.hidden    = true;
    zenPause.hidden    = false;
    zenFinish.hidden   = false;
    if (zenAiFinish) zenAiFinish.hidden = false;
    zenTextarea.classList.add('zen-active');
    zenTextarea.focus();
    zenInterval = setInterval(zenTick, 1000);
  });

  zenPause?.addEventListener('click', () => {
    clearInterval(zenInterval); zenRunning = false;
    zenPause.hidden    = true;
    zenResume.hidden   = false;
    zenTextarea.classList.remove('zen-active');
  });

  zenResume?.addEventListener('click', () => {
    zenRunning = true;
    zenResume.hidden   = true;
    zenPause.hidden    = false;
    zenTextarea.classList.add('zen-active');
    zenTextarea.focus();
    zenInterval = setInterval(zenTick, 1000);
  });

  zenFinish?.addEventListener('click', () => zenConvertToThoughts());
  zenAiFinish?.addEventListener('click', iaZenSeparar);

  /* ============================================================
     15. PANDA SABIO — CHAT CONTEXTUAL
     ============================================================ */
  const chatDrawer   = $('#chat-drawer');
  const chatBtn      = $('#chat-btn');
  const chatCloseBtn = $('#chat-close-btn');
  const chatMessages = $('#chat-messages');
  const chatInput    = $('#chat-input');
  const chatSendBtn  = $('#chat-send-btn');

  function openChatDrawer() {
    chatDrawer.hidden = false;
    if (chatMessages.children.length === 0) {
      appendChatMessage('panda', '¡Hola, Señorita Manu! 🐼 Soy el Panda Sabio. Conozco sus pensamientos e ideas actuales en Bambú Linu. ¿En qué le gustaría que nos enfoquemos hoy?');
    }
    chatInput.focus();
  }

  function closeChatDrawer() {
    chatDrawer.hidden = true;
  }

  function appendChatMessage(sender, text) {
    const msg = el('div', { class: `chat-msg ${sender}` },
      el('div', { class: 'chat-bubble', text }),
      el('span', { class: 'chat-msg-time', text: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) })
    );
    chatMessages.append(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return msg;
  }

  function showChatTyping() {
    const typing = el('div', { class: 'chat-msg panda', id: 'chat-typing' },
      el('div', { class: 'panda-typing' },
        el('span', { class: 'typing-dot' }),
        el('span', { class: 'typing-dot' }),
        el('span', { class: 'typing-dot' }),
      )
    );
    chatMessages.append(typing);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function hideChatTyping() {
    $('#chat-typing')?.remove();
  }

  function buildPandaSystemPrompt() {
    const thoughtsList = state.thoughts.map((t) => `- "${t.text}" (color: ${t.color || 'sin color'})`).join('\n') || 'Ninguno';
    const branchesList = state.ramas.map((r) => {
      const ts = state.thoughts.filter((t) => state.ramaMapa[t.id] === r.id).map((t) => t.text).join(', ');
      return `- Rama "${r.nombre}": ${ts || 'vacía'}`;
    }).join('\n') || 'Ninguna';

    const prioList = CUADRANTES.map((q) => {
      const ts = state.thoughts.filter((t) => state.cuadrantes[t.id] === q.id).map((t) => t.text).join(', ');
      return `- ${q.nombre}: ${ts || 'ninguno'}`;
    }).join('\n');

    return `Eres el Panda Sabio 🐼, un mentor de vida y organización personal sereno, perspicaz, empático y práctico de la app Bambú Linu.
Hablas siempre en español, con calidez, brevedad y sabiduría zen.

REGLA ABSOLUTA DE IDENTIDAD:
La persona que te consulta es única y exclusivamente la "Señorita Manu". Debes dirigirte SIEMPRE a ella con el título "Señorita Manu" (por ejemplo: "Hola, Señorita Manu", "Entiendo muy bien, Señorita Manu...", "Para usted, Señorita Manu, sugiero...", "¿Qué le parece si revisamos esto, Señorita Manu?").
Jamás uses otro nombre, jamás te dirijas a ella en masculino, y no uses un trato frío o impersonal. Trátala con dulzura, respeto y cercanía zen.

Tienes acceso total al estado actual de pensamientos de la Señorita Manu:
- Pensamientos capturados (${state.thoughts.length}):
${thoughtsList}
- Idea central: "${state.ideaCentral || 'No definida'}"
- Ramas del mapa mental:
${branchesList}
- Prioridades de la Matriz de Eisenhower:
${prioList}
- Estructura Minto: Conclusión: "${state.estructura.conclusion || 'No definida'}". Argumentos: ${state.estructura.argumentos.map((a) => a.texto).join('; ') || 'Ninguno'}.

Instrucciones:
- Dirígete SIEMPRE a la usuaria como "Señorita Manu" en todas tus respuestas.
- Responde siempre de forma directa, útil y concisa (máximo 2 a 3 párrafos cortos).
- Refiérete a los pensamientos reales de la Señorita Manu cuando sea oportuno.
- Ofrece claridad, tranquilidad y el siguiente paso más sensato.`;
  }

  async function handleSendChatMessage(textToSend = null) {
    const text = (textToSend || chatInput.value).trim();
    if (!text) return;

    chatInput.value = '';
    appendChatMessage('user', text);
    showChatTyping();
    setAiThinking(true, 'El Panda Sabio reflexiona...');

    try {
      const reply = await callGemini(text, buildPandaSystemPrompt(), { temperature: 0.7 });
      hideChatTyping();
      setAiThinking(false);
      appendChatMessage('panda', reply);
    } catch (err) {
      hideChatTyping();
      setAiThinking(false);
      appendChatMessage('panda', `${formatGeminiError(err)}`);
    }
  }

  chatBtn?.addEventListener('click', openChatDrawer);
  chatCloseBtn?.addEventListener('click', closeChatDrawer);
  chatDrawer?.addEventListener('click', (e) => { if (e.target === chatDrawer) closeChatDrawer(); });
  chatSendBtn?.addEventListener('click', () => handleSendChatMessage());
  chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChatMessage();
    }
  });

  $$('.chat-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const prompt = chip.dataset.prompt;
      if (prompt) handleSendChatMessage(prompt);
    });
  });

  /* ============================================================
     16. PANEL DE CONFIGURACIÓN GEMINI
     ============================================================ */
  const configDlg      = $('#config-dlg');
  const configBtn      = $('#config-btn');
  const configCloseBtn = $('#config-close-btn');
  const cfgApiKey      = $('#cfg-apikey');
  const cfgToggleVis   = $('#cfg-toggle-vis');
  const cfgTestBtn     = $('#cfg-test-btn');
  const cfgSaveBtn     = $('#cfg-save-btn');
  const cfgStatus      = $('#cfg-status');

  function openConfig() {
    if (!configDlg) return;
    cfgApiKey.value = getGeminiApiKey();
    cfgStatus.className = 'config-status';
    cfgStatus.textContent = '';
    configDlg.showModal();
  }

  function closeConfig() {
    configDlg?.close();
  }

  function saveConfig() {
    const key = cfgApiKey.value.trim();
    localStorage.setItem(KEY_GEMINI_API, key);
    discoveredConfigs = null;
    activeWorkingConfig = null;
    try { sessionStorage.removeItem('bambulinu:working_model_cfg'); } catch {}
    if (key) {
      discoverAvailableFlashModels(key).catch(() => {});
    }
    showConfigStatus('success', 'API Key guardada en este dispositivo.');
    setTimeout(() => { closeConfig(); }, 800);
  }

  function showConfigStatus(type, text) {
    if (!cfgStatus) return;
    cfgStatus.className = `config-status active ${type}`;
    cfgStatus.textContent = text;
  }

  async function testConfigConnection() {
    const key = cfgApiKey.value.trim();
    if (!key) {
      showConfigStatus('error', 'Por favor ingresa una API Key para probar.');
      return;
    }

    showConfigStatus('info', '⏳ Conectando y detectando modelos de Google Gemini...');
    cfgTestBtn.disabled = true;

    const startTime = Date.now();
    try {
      discoveredConfigs = null;
      activeWorkingConfig = null;
      await discoverAvailableFlashModels(key);

      const prevKey = localStorage.getItem(KEY_GEMINI_API);
      localStorage.setItem(KEY_GEMINI_API, key);

      let reply;
      try {
        reply = await callGemini('Responde únicamente con la palabra "OK".', '', { temperature: 0.1 });
      } finally {
        if (prevKey === null) localStorage.removeItem(KEY_GEMINI_API);
        else localStorage.setItem(KEY_GEMINI_API, prevKey);
      }

      const elapsed = Date.now() - startTime;
      const working = getSavedWorkingConfig();
      const modelLabel = working ? `${working.model} (${working.apiVersion})` : 'Gemini Flash';
      showConfigStatus('success', `¡Conexión exitosa! Usando modelo: ${modelLabel} (${elapsed} ms)`);
    } catch (err) {
      showConfigStatus('error', `Falló la prueba: ${formatGeminiError(err)}`);
    } finally {
      cfgTestBtn.disabled = false;
    }
  }

  configBtn?.addEventListener('click', openConfig);
  configCloseBtn?.addEventListener('click', closeConfig);
  cfgSaveBtn?.addEventListener('click', saveConfig);
  cfgTestBtn?.addEventListener('click', testConfigConnection);
  cfgToggleVis?.addEventListener('click', () => {
    cfgApiKey.type = cfgApiKey.type === 'password' ? 'text' : 'password';
  });

  /* ============================================================
     17. RENDER CAPTURAR (PASO 1)
     ============================================================ */
  function visible() {
    const q = norm(query.trim());
    return q ? state.thoughts.filter((t) => norm(t.text).includes(q)) : state.thoughts;
  }

  function buildCard(t) {
    const color     = COLORS.find((c) => c.id === t.color);
    const isEditing = editingId === t.id;
    const isTagging = taggingId === t.id;
    const li = el('li', {
      class: 'card' + (t.id === freshId ? ' new' : ''),
      style: color ? `--tag:${color.hex}` : null,
      'data-id': t.id,
    });
    if (isEditing) {
      const ta = el('textarea', { rows: 3, 'aria-label': 'Editar pensamiento' });
      ta.value = t.text;
      const finish = (ok) => {
        const v = ta.value.trim();
        if (ok && v) patch(t.id, { text: v });
        editingId = null; render();
      };
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') finish(false);
      });
      li.append(
        el('div', { class: 'card-header' }, el('span'), el('span', { class: 'card-ts', text: relTime(t.createdAt) })),
        el('div', { style: 'padding:0 14px 4px' }, ta),
        el('div', { class: 'actions' },
          el('button', { class: 'btn btn-primary', type: 'button', text: 'Guardar',  onclick: () => finish(true) }),
          el('button', { class: 'btn btn-ghost',   type: 'button', text: 'Cancelar', onclick: () => finish(false) }),
        ),
      );
      setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 0);
      return li;
    }
    const handle = el('button', {
      class: 'drag-handle', type: 'button',
      'aria-label': 'Arrastrar para reordenar', title: 'Mantén pulsado para arrastrar',
      html: `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
               <circle cx="5"  cy="3.5"  r="1.4" fill="currentColor"/>
               <circle cx="11" cy="3.5"  r="1.4" fill="currentColor"/>
               <circle cx="5"  cy="8"    r="1.4" fill="currentColor"/>
               <circle cx="11" cy="8"    r="1.4" fill="currentColor"/>
               <circle cx="5"  cy="12.5" r="1.4" fill="currentColor"/>
               <circle cx="11" cy="12.5" r="1.4" fill="currentColor"/>
             </svg>`,
    });
    li.append(
      el('div', { class: 'card-header' }, handle, el('span', { class: 'card-ts', text: relTime(t.createdAt) })),
      el('p', { class: 'text', text: t.text }),
      el('div', { class: 'actions' },
        el('button', {
          class: 'btn btn-ghost', type: 'button',
          text: isTagging ? 'Cerrar' : 'Etiquetar', 'aria-expanded': String(isTagging),
          onclick: () => { taggingId = isTagging ? null : t.id; render(); },
        }),
        el('button', { class: 'btn btn-ghost', type: 'button', text: 'Editar', onclick: () => { editingId = t.id; taggingId = null; render(); } }),
        el('button', {
          class: 'btn btn-danger', type: 'button', text: 'Borrar',
          'aria-label': `Borrar: ${t.text.slice(0, 40)}`,
          onclick: () => remove(t.id, li),
        }),
      ),
    );
    if (isTagging) {
      const pick = (id) => { patch(t.id, { color: id }); taggingId = null; render(); };
      li.append(el('div', { class: 'swatches', role: 'group', 'aria-label': 'Color de etiqueta' },
        el('button', { class: 'swatch none', type: 'button', 'aria-label': 'Sin color', 'aria-pressed': String(!t.color), onclick: () => pick(null) }),
        ...COLORS.map((c) => el('button', { class: 'swatch', type: 'button', style: `--c:${c.hex}`, 'aria-label': c.name, 'aria-pressed': String(t.color === c.id), onclick: () => pick(c.id) })),
      ));
    }
    attachMouseDnd(li, t.id);
    attachTouchDnd(handle, li, t.id, t.text);
    return li;
  }

  function renderMeta(list) {
    const total = state.thoughts.length;
    const ctr = $('#contador');
    if (ctr) ctr.textContent = query.trim()
      ? `${list.length} de ${total} ${total === 1 ? 'pensamiento' : 'pensamientos'}`
      : `${total} ${total === 1 ? 'pensamiento' : 'pensamientos'}`;
    const empty = $('#vacio');
    if (empty) {
      empty.hidden = list.length > 0;
      if (total === 0) empty.innerHTML = 'Todo está en calma.<br>Escribe tu primer pensamiento arriba.';
      else empty.textContent = 'Ningún pensamiento coincide con la búsqueda.';
    }
    const borrar = $('#borrar-todo');
    if (borrar) borrar.disabled = total === 0;
  }

  function render() {
    const list  = visible();
    const lista = $('#lista');
    if (lista) lista.replaceChildren(...list.map(buildCard));
    freshId = null;
    renderMeta(list); renderPanda();
    clearTimeout(render._t);
    if (state.thoughts.length > 0) render._t = setTimeout(render, 60000);
  }
  render._t = null;

  /* ============================================================
     18. TEMA
     ============================================================ */
  const currentTheme = () =>
    state.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  function applyTheme(animate = false) {
    const t = currentTheme();
    if (animate) {
      const ripple = $('#tema-ripple');
      if (ripple) {
        const btn  = $('#tema');
        const rect = btn.getBoundingClientRect();
        const size = Math.max(window.innerWidth, window.innerHeight) * 2;
        ripple.style.cssText = `width:${size}px;height:${size}px;left:${rect.left + rect.width / 2 - size / 2}px;top:${rect.top + rect.height / 2 - size / 2}px;background:${t === 'dark' ? '#17171b' : '#F7F5F0'};`;
        ripple.classList.remove('active'); void ripple.offsetWidth; ripple.classList.add('active');
        setTimeout(() => ripple.classList.remove('active'), 600);
      }
    }
    document.documentElement.dataset.theme = t;
    const btn = $('#tema');
    if (btn) {
      const lbl = btn.querySelector('.tema-label');
      if (lbl) lbl.textContent = t === 'dark' ? 'Modo claro' : 'Modo oscuro';
      btn.setAttribute('aria-label', t === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    }
  }

  $('#tema')?.addEventListener('click', () => { state.theme = currentTheme() === 'dark' ? 'light' : 'dark'; save(); applyTheme(true); });

  /* ============================================================
     19. EVENTOS CAPTURAR (PASO 1)
     ============================================================ */
  const inputEl   = $('#nuevo');
  const charCount = document.createElement('span');
  charCount.className = 'char-count';
  charCount.setAttribute('aria-live', 'polite');
  charCount.setAttribute('aria-atomic', 'true');
  const taWrap = document.createElement('div'); taWrap.className = 'textarea-wrap';
  inputEl.parentNode.insertBefore(taWrap, inputEl); taWrap.append(inputEl, charCount);

  function updateCharCount() {
    const len = inputEl.value.length;
    charCount.textContent = len > 0 ? `${len} / ${MAX_CHAR}` : '';
    charCount.className = 'char-count' + (len >= MAX_CHAR ? ' limit' : len >= MAX_CHAR - 50 ? ' warn' : '');
    if (len > MAX_CHAR) inputEl.value = inputEl.value.slice(0, MAX_CHAR);
  }
  inputEl.addEventListener('input', updateCharCount);

  function submit() {
    const text = inputEl.value.trim();
    if (!text) { inputEl.focus(); return; }
    addThought(text); inputEl.value = ''; updateCharCount(); inputEl.focus();
  }
  inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } });
  $('#agregar').addEventListener('click', submit);
  $('#buscar').addEventListener('input', (e) => { query = e.target.value; editingId = taggingId = null; render(); });
  $('#buscar').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.target.value = ''; query = ''; editingId = taggingId = null; render(); } });

  /* ---------- 20. DIÁLOGO BORRAR TODO ---------- */
  const dlg = $('#confirmar');
  $('#borrar-todo')?.addEventListener('click', () => { dlg.returnValue = ''; dlg.showModal(); });
  dlg?.addEventListener('close', () => {
    if (dlg.returnValue !== 'ok') return;
    pushUndo('Todos los pensamientos fueron borrados');
    state.thoughts = []; state.ramaMapa = {}; state.cuadrantes = {};
    editingId = taggingId = null; query = ''; $('#buscar').value = '';
    save(); render();
  });

  /* ============================================================
     21. STEPPER
     ============================================================ */
  const panels = $$('.panel');
  const steps  = $$('.step');
  const fill   = $('#stepper-fill');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let busy = false;

  function markStep() {
    steps.forEach((b, i) => {
      if (i === state.step) b.setAttribute('aria-current', 'step');
      else                  b.removeAttribute('aria-current');
    });
    if (fill) fill.style.width = `${((state.step + 1) / panels.length) * 100}%`;
  }

  function renderCurrentPanel(n) {
    if (n === 1) renderAgrupar();
    if (n === 2) renderPriorizar();
    if (n === 3) renderEstructurar();
  }

  function goTo(n) {
    if (busy || n === state.step || n < 0 || n >= panels.length) return;
    const from = panels[state.step];
    const to   = panels[n];
    const fwd  = n > state.step;
    state.step = n; save(); markStep();
    renderCurrentPanel(n);
    to.hidden = false;
    if (reduce.matches) { from.hidden = true; return; }
    busy = true;
    from.classList.add(fwd ? 'out-l' : 'out-r');
    to.classList.add(fwd   ? 'in-r'  : 'in-l');
    setTimeout(() => {
      from.hidden = true; from.className = 'panel'; to.className = 'panel'; busy = false;
      if (n === 1) drawMapLines();
    }, 400);
  }

  steps.forEach((b, i) => {
    b.addEventListener('click', () => goTo(i));
    b.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d && steps[i + d]) { e.preventDefault(); steps[i + d].focus(); goTo(i + d); }
    });
  });

  /* ---------- 22. HOJAS DE BAMBÚ (FONDO) ---------- */
  const hojas = $('#hojas');
  if (hojas) {
    for (let i = 0; i < 35; i++) {
      const s = document.createElement('span');
      s.className = 'leaf';
      s.style.cssText = [`--x:${Math.random() * 100}%`, `--s:${8 + Math.random() * 10}px`, `--d:${14 + Math.random() * 14}s`, `--dl:${-Math.random() * 24}s`, `--w:${(Math.random() - .5) * 160}px`].join(';');
      hojas.append(s);
    }
  }

  /* ---------- 23. INICIO ---------- */
  if (!(state.step >= 0 && state.step < panels.length)) state.step = 0;
  panels.forEach((p, i) => { p.hidden = i !== state.step; });
  markStep();
  applyTheme(false);
  render();
  renderCurrentPanel(state.step);

  // Inicializar detección inteligente de modelos Flash en segundo plano
  const initialKey = getGeminiApiKey();
  if (initialKey) {
    discoverAvailableFlashModels(initialKey).catch(() => {});
  }


  /* ---------- 23. CARTA DE BIENVENIDA ---------- */
  const welcomeOverlay = document.getElementById('welcome-overlay');
  const loveCard = document.getElementById('love-card');
  const welcomeEnterBtn = document.getElementById('welcome-enter-btn');

  if (welcomeOverlay && loveCard && welcomeEnterBtn) {
    loveCard.addEventListener('click', () => {
      if (!loveCard.classList.contains('is-open')) {
        loveCard.classList.add('is-open');
        if (typeof launchConfetti === 'function') { launchConfetti(350); if(typeof celebrate === 'function') celebrate(4000); }
      }
    });

    welcomeEnterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      welcomeOverlay.classList.add('hidden');
      // Opcional: enfocar el input principal tras cerrar
      setTimeout(() => inputEl?.focus(), 500);
    });
  }

  /* ---------- 24. PWA: SERVICE WORKER & INSTALACIÓN ---------- */
  // 1. Registro del Service Worker con ruta relativa
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('[Bambú Linu SW] Registrado con alcance:', reg.scope);
        })
        .catch((err) => {
          console.warn('[Bambú Linu SW] Error al registrar Service Worker:', err);
        });
    });
  }

  // 2. Control de instalación PWA (botón Instalar)
  let deferredInstallPrompt = null;
  const installBtn = $('#install-btn');

  window.addEventListener('beforeinstallprompt', (e) => {
    // Previene que el navegador muestre el banner genérico predeterminado
    e.preventDefault();
    deferredInstallPrompt = e;
    if (installBtn) {
      installBtn.hidden = false;
    }
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      console.log('[Bambú Linu PWA] Elección de instalación:', outcome);
      if (outcome === 'accepted') {
        installBtn.hidden = true;
      }
      deferredInstallPrompt = null;
    });
  }

  window.addEventListener('appinstalled', () => {
    if (installBtn) installBtn.hidden = true;
    deferredInstallPrompt = null;
    console.log('[Bambú Linu PWA] App instalada en el dispositivo');
  });

  // 3. Monitor de conexión online/offline con aviso visual
  const bannerOffline = $('#banner-offline');
  function updateOnlineStatus() {
    if (bannerOffline) {
      bannerOffline.hidden = navigator.onLine;
    }
  }
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

})();