// ════════════════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════════════════
const S = {
  suites:       [],
  cases:        [],
  activeSuite:  null,
  activeCase:   null,
  activeResult: null,
  editingCase:  null,    // объект редактируемого кейса
  run: {
    active:   false,
    mode:     'auto',   // auto | step
    queue:    [],
    index:    0,
    results:  [],
    passed:   0,
    failed:   0,
    startedAt: 0,
    runId:    null,
  },
  state:    {},          // state переменных между шагами (<b_id> и т.д.)
  graphNodes: [],        // для панели 4
  previewTab: 'graph',
  debug: { calls: [] },
};
// ─────────────────────────────
// LOGIN
// ─────────────────────────────
async function login() {
  setRunStatus('running', 'Авторизация...');

  try {
    const { login, password } = cfg();

    if (!login || !password) {
      throw new Error('Введите логин и пароль');
    }

    // Шаг 1 — auth
    const d1 = await apiPost('/auth/', {
      login,
      type: 'e-mail',
      password
    });

    if (d1.code !== '200' || !d1.auth_hash) {
      throw new Error(d1.message || 'auth failed');
    }

    // Шаг 2 — token (использует PHP session)
    const d2 = await apiPost('/token', {
      auth_hash: d1.auth_hash
    });

    if (d2.code !== '200' || !d2.data?.token) {
      throw new Error(d2.message || 'token failed');
    }

    // ВАЖНО: структура backend
    S.state.token  = d2.data.token;
    S.state.u_hash = d2.data.u_hash;
    S.state.u_id   = d2.auth_user?.u_id || null;

    setRunStatus('pass', `Авторизован (u_id: ${S.state.u_id ?? '—'})`);
    toast('Авторизация успешна', 'success');

  } catch (e) {
    S.state = {};
    setRunStatus('fail', 'Ошибка авторизации');
    toast(e.message, 'error');
  }
}

// ─────────────────────────────
// LOGOUT
// ─────────────────────────────
function logout() {
  S.state = {};
  S.suites = [];
  S.cases  = [];
  renderTree();
  setRunStatus('idle', 'Не авторизован');
  toast('Вы вышли', 'info');
}

// ─────────────────────────────
// LOAD SUITES
// ─────────────────────────────
async function loadSuites() {

  if (!S.state.token) {
    toast('Сначала выполните вход', 'error');
    return;
  }

  setTreeLoading(true);

  try {
    const rows = await queryTemplate(101);

    S.suites = rows.map(r => ({
      id: Number(r.id),
      name: r.name,
      description: r.description || '',
      domain: r.domain || 'medical',
      base_url: r.base_url || cfg().baseUrl,
      sort: Number(r.sort) || 0,
    }));

    renderTree();
    toast(`Наборов загружено: ${S.suites.length}`, 'success');

  } catch (e) {
    toast(`Ошибка загрузки наборов: ${e.message}`, 'error');
  }

  setTreeLoading(false);
  if (S.suites.length > 0) {
    await selectSuite(S.suites[0].id);
  }
}
// ════════════════════════════════════════════════════════════
//  CONFIG
// ════════════════════════════════════════════════════════════
function cfg() {
  return {
    baseUrl:  document.getElementById('cfgBaseUrl').value.replace(/\/$/, ''),
    login:    document.getElementById('cfgLogin').value,
    password: document.getElementById('cfgPassword').value,
    token:    S.state.token   || '',
    u_hash:   S.state.u_hash  || '',
  };
}

// ════════════════════════════════════════════════════════════
//  API — queryTemplate слой
// ════════════════════════════════════════════════════════════

async function apiPost(url, bodyObj) {
  const { baseUrl } = cfg();
  const body = new URLSearchParams(bodyObj);
  const resp = await fetch(baseUrl + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  return resp.json();
}

// Версия без .json() — возвращает raw Response для text()-чтения
async function apiPostRaw(url, bodyObj) {
  const { baseUrl } = cfg();
  const body = new URLSearchParams(bodyObj);
  return fetch(baseUrl + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

async function apiGet(url, params = {}) {
  const { baseUrl, token, u_hash } = cfg();
  const qs = new URLSearchParams({ token, u_hash, ...params }).toString();
  const resp = await fetch(`${baseUrl}${url}?${qs}`, {
    headers: { 'Accept': 'application/json' },
  });
  return resp.json();
}

// Запрос к именованному SQL-шаблону
async function queryTemplate(templateId, vars = {}) {
  const { token, u_hash } = cfg();
  const payload = { token, u_hash };
  if (vars && Object.keys(vars).length > 0) {
    payload.data = JSON.stringify(vars);
  }

  const entry = {
    id:         S.debug.calls.length + 1,
    templateId,
    time:       new Date().toLocaleTimeString(),
    payload:    JSON.parse(JSON.stringify(payload)),
    raw:        null,
    parsed:     null,
    error:      null,
  };
  S.debug.calls.push(entry);

  try {
    const resp = await apiPostRaw(`/query/template/${templateId}`, payload);
    const raw  = await resp.text();
    entry.raw  = raw;

    let parsed = null;
    try { parsed = JSON.parse(raw); } catch(e) { /* not json */ }
    entry.parsed = parsed;

    if (parsed === null) {
      entry.error = 'Response is not valid JSON';
      renderDebugLog();
      throw new Error(entry.error);
    }

    if (parsed.code !== '200') {
      entry.error = parsed.message || `template ${templateId} error`;
      renderDebugLog();
      throw new Error(entry.error);
    }

    renderDebugLog();
    return parsed.data;

  } catch (e) {
    if (!entry.error) entry.error = e.message;
    renderDebugLog();
    throw e;
  }
}
// Нормализовать строку БД → объект кейса
function normalizeCase(row) {
  return {
    id:              Number(row.id),
    suite:           Number(row.id_api_test_suite),
    name:            row.name || '',
    description:     row.description || '',
    sort:            Number(row.sort) || 0,
    method:          row.method || 'GET',
    url:             row.url || '',
    params:          row.params || '{}',
    u_a_role:        Number(row.u_a_role) || 0,
    depends_on:      Number(row.depends_on) || 0,
    group:           row.chain_group || '',
    state_save:      row.state_save || '{}',
    validations:     tryParse(row.validations, []),
    snapshot_config: tryParse(row.snapshot_config, null),
    tags:            row.tags || '',
    active:          Number(row.active),
  };
}

// ════════════════════════════════════════════════════════════
//  INIT — авторизация → загрузка наборов → загрузка кейсов
// ════════════════════════════════════════════════════════════
async function init() {
  setRunStatus('running', 'Авторизация...');
  setTreeLoading(true);

  try {
    const { baseUrl, login, password } = cfg();

    // Шаг 1: auth_hash
    const d1 = await apiPost('/auth/', { login, type: 'e-mail', password });
    if (d1.code !== '200' || !d1.auth_hash)
      throw new Error(d1.message || 'auth step 1 failed');

    // Шаг 2: token
    const d2 = await apiPost('/token', { auth_hash: d1.auth_hash });
    if (d2.code !== '200' || !d2.data?.token)
      throw new Error(d2.message || 'auth step 2 failed');

    S.state.token  = d2.data.token;
    S.state.u_hash = d2.data.u_hash;
    S.state.u_id   = d2.data.u_id;
    setRunStatus('pass', `Авторизован (u_id: ${d2.data.u_id})`);
    toast('Авторизация успешна', 'success');

  } catch(e) {
    setRunStatus('fail', `Ошибка авторизации: ${e.message}`);
    toast(`Авторизация: ${e.message}`, 'error');
    setTreeLoading(false);
    return;
  }

  // Загрузка наборов (шаблон 101)
  try {
    const rows = await queryTemplate(101);
    S.suites = rows.map(r => ({
      id:          Number(r.id),
      name:        r.name,
      description: r.description || '',
      domain:      r.domain || 'medical',
      base_url:    r.base_url || cfg().baseUrl,
      sort:        Number(r.sort) || 0,
    }));
    toast(`Наборов загружено: ${S.suites.length}`, 'info');
  } catch(e) {
    toast(`Ошибка загрузки наборов: ${e.message}`, 'error');
    S.suites = [];
  }

  setTreeLoading(false);
  renderTree();

  if (S.suites.length > 0) {
    await selectSuite(S.suites[0].id);
  }
}

function setTreeLoading(on) {
  const el = document.getElementById('suiteTree');

  if (on) {
    el.innerHTML = `
      <div class="empty-state" style="height:120px">
        <div class="no-results-icon" style="font-size:22px;opacity:.5">⏳</div>
        <div class="no-results-text">Загрузка из БД...</div>
      </div>`;
  } else {
    el.innerHTML = '';
  }
}

// ════════════════════════════════════════════════════════════
//  TREE RENDER
// ════════════════════════════════════════════════════════════
function renderTree() {
  const el = document.getElementById('suiteTree');
  el.innerHTML = '';

  S.suites.forEach(suite => {
    const sEl = document.createElement('div');
    sEl.className = 'suite-item' + (S.activeSuite?.id === suite.id ? ' active' : '');
    sEl.innerHTML = `
      <span class="suite-name">${suite.name}</span>
      <span class="suite-domain">${suite.domain}</span>
    `;
    sEl.onclick = () => selectSuite(suite.id);
    el.appendChild(sEl);

    if (S.activeSuite?.id === suite.id) {
      const cases = S.cases.filter(c => c.suite === suite.id)
        .sort((a, b) => a.sort - b.sort);

      // group by chain_group
      const groups = {};
      const ungrouped = [];
      cases.forEach(c => {
        if (c.group) {
          if (!groups[c.group]) groups[c.group] = [];
          groups[c.group].push(c);
        } else {
          ungrouped.push(c);
        }
      });

      const render = (cs) => cs.forEach(c => {
        const result = S.run.results.find(r => r.caseId === c.id);
        const status = result?.status || 'pending';
        const icons = { pass:'✓', fail:'✗', running:'●', pending:'○', skip:'–' };
        const tags  = (c.tags || '').split(',').map(t => t.trim()).filter(Boolean);
        const cEl   = document.createElement('div');
        cEl.className = `case-item ${status}` + (S.activeCase?.id === c.id ? ' active' : '');
        cEl.id = `case-item-${c.id}`;
        cEl.innerHTML = `
          <div class="case-status-icon ${status}">${icons[status] || '○'}</div>
          <div class="case-label">
            <div class="case-name">${c.name}</div>
            <div class="case-meta">
              <span class="method-badge ${c.method}">${c.method}</span>
              <span style="color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100px">${c.url}</span>
              ${tags.slice(0,2).map(t => `<span class="tag-badge ${t}">${t}</span>`).join('')}
            </div>
          </div>
        `;
        cEl.onclick = () => selectCase(c.id);
        el.appendChild(cEl);
      });

      Object.values(groups).forEach(render);
      render(ungrouped);
    }
  });
}

async function selectSuite(id) {
  S.activeSuite = S.suites.find(s => s.id === id);
  S.activeCase  = null;
  S.cases = [];
  renderTree();
  document.getElementById('editorBody').innerHTML = `<div class="empty-state"><div class="empty-state-icon">✏️</div><div class="empty-state-text">Загрузка кейсов...</div></div>`;
  document.getElementById('editorActions').style.display = 'none';

  try {
    const rows = await queryTemplate(102, {"{{suite_id}}": id });
    S.cases = rows.map(normalizeCase);
    toast(`Кейсов загружено: ${S.cases.length}`, 'info');
  } catch(e) {
    toast(`Ошибка загрузки кейсов: ${e.message}`, 'error');
    S.cases = [];
  }

  renderTree();
  document.getElementById('editorBody').innerHTML = `<div class="empty-state"><div class="empty-state-icon">✏️</div><div class="empty-state-text">Выберите тест-кейс</div></div>`;
}

function selectCase(id) {
  S.activeCase  = S.cases.find(c => c.id === id);
  S.editingCase = JSON.parse(JSON.stringify(S.activeCase));
  renderTree();
  renderEditor();
  // if result exists, show it in panels 3+4
  const result = S.run.results.find(r => r.caseId === id);
  if (result) selectResult(result);
}

// ════════════════════════════════════════════════════════════
//  EDITOR RENDER
// ════════════════════════════════════════════════════════════
function renderEditor() {
  const c = S.editingCase;
  if (!c) return;

  const vJson = Array.isArray(c.validations)
    ? c.validations
    : tryParse(c.validations, []);

  const validRows = vJson.map((v, i) => buildValidationRow(v, i)).join('');

  const snapCfg = Array.isArray(c.snapshot_config)
    ? JSON.stringify(c.snapshot_config, null, 2)
    : (c.snapshot_config || '');

  const stSave = typeof c.state_save === 'object'
    ? JSON.stringify(c.state_save, null, 2)
    : (c.state_save || '{}');

  let params = c.params || '{}';
  try { params = JSON.stringify(JSON.parse(params), null, 2); } catch(e) {}

  document.getElementById('editorBody').innerHTML = `
    <div class="editor-form">
      <div class="field-group">
        <div class="field-label">Название</div>
        <input class="input" id="ef-name" value="${esc(c.name)}">
      </div>
      <div class="field-group">
        <div class="field-label">Описание</div>
        <textarea class="textarea" id="ef-desc" style="min-height:48px">${esc(c.description||'')}</textarea>
      </div>
      <div class="field-group">
        <div class="field-label">Метод + URL</div>
        <div class="field-row">
          <select class="method-select" id="ef-method">
            ${['GET','POST','PUT','DELETE'].map(m => `<option ${m===c.method?'selected':''}>${m}</option>`).join('')}
          </select>
          <input class="input url-input" id="ef-url" value="${esc(c.url)}" placeholder="/drive">
        </div>
      </div>
      <div class="field-group">
        <div class="field-label">Роль (u_a_role)</div>
        <div class="role-toggle">
          <label class="role-opt ${c.u_a_role==0?'selected':''}" onclick="setRole(0)">
            <input type="radio" name="role" value="0"> role=4 (Admin)
          </label>
          <label class="role-opt ${c.u_a_role==2?'selected':''}" onclick="setRole(2)">
            <input type="radio" name="role" value="2"> u_a_role=2 (Врач)
          </label>
        </div>
      </div>
      <div class="field-group">
        <div class="field-label">Параметры запроса (JSON)</div>
        <textarea class="textarea tall" id="ef-params" spellcheck="false">${esc(params)}</textarea>
        <div style="font-size:9px;color:var(--text3);margin-top:2px">Поддерживает &lt;переменные&gt; из state: &lt;b_id&gt;, &lt;co_id&gt;, &lt;token&gt;, &lt;cfg_login&gt;…</div>
      </div>
      <div class="field-group">
        <div class="field-label">Группа цепочки (chain_group)</div>
        <input class="input" id="ef-chain" value="${esc(c.group||'')}">
      </div>
      <div class="field-group">
        <div class="field-label">Зависит от (ID кейса)</div>
        <input class="input" id="ef-depends" type="number" value="${c.depends_on||0}">
      </div>
      <div class="field-group">
        <div class="field-label">Сохранить в state (JSON)</div>
        <textarea class="textarea" id="ef-state-save" spellcheck="false">${esc(stSave)}</textarea>
        <div style="font-size:9px;color:var(--text3);margin-top:2px">{"state_key":"response.data.field"}</div>
      </div>
      <div class="field-group">
        <div class="field-label">Валидации <button class="btn small" onclick="addValidation()" style="margin-left:6px">+ Добавить</button></div>
        <div class="validations-list" id="ef-validations">${validRows}</div>
      </div>
      <div class="field-group">
        <div class="field-label">Конфиг снапшота (JSON array)</div>
        <textarea class="textarea" id="ef-snapshot" spellcheck="false">${esc(snapCfg)}</textarea>
        <div style="font-size:9px;color:var(--text3);margin-top:2px">[{"label":"Приём","method":"GET","url":"/drive/get/&lt;b_id&gt;"}]</div>
      </div>
      <div class="field-group">
        <div class="field-label">Теги (через запятую)</div>
        <input class="input" id="ef-tags" value="${esc(c.tags||'')}">
      </div>
      <div class="field-group">
        <div class="field-label">Порядок (sort)</div>
        <input class="input" id="ef-sort" type="number" value="${c.sort||0}">
      </div>
    </div>
  `;
  document.getElementById('editorActions').style.display = 'flex';
}

function buildValidationRow(v, i) {
  const types = ['eq','neq','hasField','notEmpty','contains','gte','lte'];
  return `
    <div class="validation-row" id="vrow-${i}">
      <select class="select" style="width:90px" onchange="updateValidation(${i},'type',this.value)">
        ${types.map(t => `<option ${t===v.type?'selected':''}>${t}</option>`).join('')}
      </select>
      <input class="input" placeholder="field (напр. code)" value="${esc(v.field||'')}" onchange="updateValidation(${i},'field',this.value)">
      <input class="input" placeholder="value" value="${esc(v.value||'')}" onchange="updateValidation(${i},'value',this.value)">
      <div class="remove-btn" onclick="removeValidation(${i})">×</div>
    </div>`;
}

function setRole(r) {
  if (!S.editingCase) return;
  S.editingCase.u_a_role = r;
  document.querySelectorAll('.role-opt').forEach((el, i) => {
    el.classList.toggle('selected', (i===0 && r===0) || (i===1 && r===2));
  });
}

function addValidation() {
  const vJson = getCurrentValidations();
  vJson.push({ type: 'eq', field: '', value: '' });
  const list = document.getElementById('ef-validations');
  list.insertAdjacentHTML('beforeend', buildValidationRow(vJson[vJson.length-1], vJson.length-1));
}

function removeValidation(i) {
  document.getElementById(`vrow-${i}`)?.remove();
}

function updateValidation(i, key, val) {
  // live — collected on save
}

function getCurrentValidations() {
  const rows = document.querySelectorAll('#ef-validations .validation-row');
  const out = [];
  rows.forEach(row => {
    const selects = row.querySelectorAll('select');
    const inputs  = row.querySelectorAll('input');
    out.push({ type: selects[0]?.value, field: inputs[0]?.value, value: inputs[1]?.value });
  });
  return out;
}

function collectEditorValues() {
  return {
    name:          document.getElementById('ef-name')?.value || '',
    description:   document.getElementById('ef-desc')?.value || '',
    method:        document.getElementById('ef-method')?.value || 'GET',
    url:           document.getElementById('ef-url')?.value || '',
    params: JSON.stringify( JSON.parse(document.getElementById('ef-params')?.value || '{}') ),
    group:         document.getElementById('ef-chain')?.value || '',
    depends_on:    parseInt(document.getElementById('ef-depends')?.value) || 0,
    state_save:    document.getElementById('ef-state-save')?.value || '{}',
    validations:   getCurrentValidations(),
    snapshot_config: tryParse(document.getElementById('ef-snapshot')?.value, null),
    tags:          document.getElementById('ef-tags')?.value || '',
    sort:          parseInt(document.getElementById('ef-sort')?.value) || 0,
    u_a_role: document.querySelector('.role-opt.selected input')?.value
  ? Number(document.querySelector('.role-opt.selected input').value)
  : 0,
  };
}

// ════════════════════════════════════════════════════════════
//  CASE CRUD
// ════════════════════════════════════════════════════════════
function newCase() {
  if (!S.activeSuite) { toast('Выберите набор тестов', 'error'); return; }
  const maxSort = Math.max(0, ...S.cases.filter(c => c.suite === S.activeSuite.id).map(c => c.sort));
  const maxId   = Math.max(0, ...S.cases.map(c => c.id));
  S.editingCase = {
    id: maxId + 1, suite: S.activeSuite.id,
    name: 'Новый тест', description: '', method: 'POST', url: '',
    params: '{}', u_a_role: 0, depends_on: 0, group: '', state_save: '{}',
    validations: [], snapshot_config: null, tags: '', sort: maxSort + 10,
  };
  S.activeCase = null;
  S.cases.push(S.editingCase);
  renderTree();
  renderEditor();
}

async function saveCase() {
  if (!S.editingCase) return;
  const vals = collectEditorValues();
  Object.assign(S.editingCase, vals);

  const c = S.editingCase;
  try {
 

    const payload = {
      case_id:     c.id || 0,
      suite_id:    c.suite,
      name:        c.name,
      description: c.description || '',
      sort:        c.sort || 0,
      method:      c.method,
      url:         c.url,
      params:      c.params || '{}',
      u_a_role:    c.u_a_role || 0,
      depends_on:  c.depends_on || 0,
      chain_group: c.group || '',
      state_save:  typeof c.state_save === 'object'
        ? JSON.stringify(c.state_save)
        : (c.state_save || '{}'),
      validations: JSON.stringify(
        Array.isArray(c.validations) ? c.validations : []
      ),
    };

    await queryTemplate(104, payload);
    toast('Тест-кейс сохранён в БД', 'success');
  } catch(e) {
    toast(`Ошибка сохранения: ${e.message}`, 'error');
  }

  // Перезагрузить кейсы чтобы получить id из БД если новый
  if (S.activeSuite) {
    try {
      const rows = await queryTemplate(102, { suite_id: S.activeSuite.id });
      S.cases = rows.map(normalizeCase);
    } catch(e) { /* ignore */ }
  }

  S.activeCase = S.cases.find(c2 => c2.name === c.name && c2.suite === c.suite) || S.editingCase;
  renderTree();
}

async function deleteCase() {
  if (!S.editingCase) return;
  if (!confirm(`Удалить "${S.editingCase.name}"?`)) return;
  try {
    await queryTemplate(105, { case_id: S.editingCase.id });
    toast('Кейс удалён из БД', 'info');
  } catch(e) {
    toast(`Ошибка удаления: ${e.message}`, 'error');
    return;
  }
  S.cases = S.cases.filter(c => c.id !== S.editingCase.id);
  S.editingCase = null; S.activeCase = null;
  document.getElementById('editorBody').innerHTML = `<div class="empty-state"><div class="empty-state-icon">✏️</div><div class="empty-state-text">Выберите тест-кейс</div></div>`;
  document.getElementById('editorActions').style.display = 'none';
  renderTree();
}

function newSuite() { openModal('suiteModal'); }

async function createSuite() {
  const name = document.getElementById('suiteModalName').value.trim();
  if (!name) { toast('Введите название', 'error'); return; }
  const domain      = document.getElementById('suiteModalDomain').value;
  const description = document.getElementById('suiteModalDesc').value;
  const base_url    = cfg().baseUrl;
  try {
    await queryTemplate(106, {
      suite_id:    0,
      name:        name,
      description: description,
      domain:      domain,
      base_url:    base_url,
      sort:        S.suites.length * 10,
      active:      1,
      user_id:     S.state.u_id || 0,
    });
    toast('Набор создан в БД', 'success');
    // Перезагрузить список
    const rows = await queryTemplate(101);
    S.suites = rows.map(r => ({
      id: Number(r.id), name: r.name, description: r.description || '',
      domain: r.domain, base_url: r.base_url || base_url, sort: Number(r.sort),
    }));
  } catch(e) {
    toast(`Ошибка создания набора: ${e.message}`, 'error');
    return;
  }
  closeModal('suiteModal');
  renderTree();
  const newSuite = S.suites.find(s => s.name === name);
  if (newSuite) await selectSuite(newSuite.id);
}

// ════════════════════════════════════════════════════════════
//  RUN ENGINE
// ════════════════════════════════════════════════════════════
async function startRun(mode) {
  if (S.run.active) { stopRun(); return; }
  if (!S.activeSuite) { toast('Выберите набор тестов', 'error'); return; }

  const c = cfg();
  if (!c.login && !S.state.token) { toast('Заполните логин/пароль для автоматического входа', 'error'); return; }

  const cases = S.cases
    .filter(c => c.suite === S.activeSuite.id)
    .sort((a, b) => a.sort - b.sort);

  S.run = {
    active: true, mode,
    queue: cases, index: 0,
    results: [], passed: 0, failed: 0,
    startedAt: Date.now(),
    runId: null,
  };

  // Сохраняем токен между запусками, сбрасываем только контекстные переменные
  if (!S.state.token) {
  await login();
  if (!S.state.token) return;
}

  setRunStatus('running', 'Запуск...');
  updateProgress();
  document.getElementById('runProgress').classList.add('visible');
  document.getElementById('btnRunAll').textContent  = '◼ Стоп';
  document.getElementById('btnRunStep').style.display = mode === 'step' ? 'none' : '';
  document.getElementById('btnStepNext').style.display = mode === 'step' ? '' : 'none';
  document.getElementById('btnStop').style.display = mode === 'step' ? '' : 'none';

  if (mode === 'auto') {
    await runNext();
  } else {
    toast('Пошаговый режим. Нажмите → для следующего шага', 'info');
  }
}

async function runNext() {
  const R = S.run;
  if (!R.active || R.index >= R.queue.length) {
    finishRun();
    return;
  }

  const kase = R.queue[R.index];
  highlightCase(kase.id, 'running');
  setRunStatus('running', `${R.index + 1}/${R.queue.length}: ${kase.name}`);

  const result = await executeCase(kase);
  R.results.push(result);
  if (result.status === 'pass') R.passed++; else R.failed++;
  R.index++;

  renderResultItem(result);
  updateProgress();
  highlightCase(kase.id, result.status);
  selectResult(result);

  if (R.mode === 'auto' && R.active) {
    await sleep(180);
    await runNext();
  }
}

async function stepNext() {
  if (!S.run.active) return;
  await runNext();
}

function stopRun() {
  S.run.active = false;
  setRunStatus('idle', 'Остановлено');
  resetRunButtons();
}

function finishRun() {
  S.run.active = false;
  const total   = S.run.results.length;
  const passed  = S.run.passed;
  const failed  = S.run.failed;
  const elapsed = ((Date.now() - S.run.startedAt) / 1000).toFixed(1);

  if (failed === 0) {
    setRunStatus('pass', `✓ Все ${total} тестов прошли (${elapsed}s)`);
    toast(`✓ ${passed}/${total} тестов прошли за ${elapsed}s`, 'success');
  } else {
    setRunStatus('fail', `✗ ${failed} ошибок из ${total} (${elapsed}s)`);
    toast(`✗ ${failed} ошибок, ${passed} успешно за ${elapsed}s`, 'error');
  }
  resetRunButtons();
}

function resetRunButtons() {
  document.getElementById('btnRunAll').textContent    = '▶ Авто';
  document.getElementById('btnRunStep').style.display = '';
  document.getElementById('btnStepNext').style.display = 'none';
  document.getElementById('btnStop').style.display    = 'none';
}

async function runSingle() {
  if (!S.activeCase) return;
  const result = await executeCase(S.activeCase);
  S.run.results = S.run.results.filter(r => r.caseId !== S.activeCase.id);
  S.run.results.push(result);
  renderResultItem(result);
  highlightCase(S.activeCase.id, result.status);
  selectResult(result);
}

// ════════════════════════════════════════════════════════════
//  EXECUTE ONE CASE
// ════════════════════════════════════════════════════════════
async function executeCase(kase) {
  const start = Date.now();
  const result = {
    caseId: kase.id, caseName: kase.name,
    status: 'pending', httpStatus: 0,
    requestUrl: '', requestBody: {}, responseBody: null,
    validationResults: [], snapshotAfter: [], stateAfter: {},
    durationMs: 0, errorMessage: '',
  };

  try {
    // Resolve URL and params
    const url    = resolveVars(kase.url, S.state);
    const method = kase.method;
    const baseUrl = cfg().baseUrl;

    // Build form body
    const rawParams = tryParse(resolveVars(kase.params || '{}', S.state), {});
    const body = buildFormBody(rawParams, kase, S.state);

    result.requestUrl  = baseUrl + url;
    result.requestBody = rawParams;

    let fetchOpts = { method, headers: { 'Accept': 'application/json' } };
    let fetchUrl = baseUrl + url;

    if (method === 'GET') {
      const qs = new URLSearchParams(rawParams).toString();
      if (qs) fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + qs;
      // auth params for GET
      const authQs = new URLSearchParams({ token: S.state.token||'', u_hash: S.state.u_hash||'' }).toString();
      fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + authQs;
    } else {
      fetchOpts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      fetchOpts.body = body;
    }

    const resp = await fetch(fetchUrl, fetchOpts);
    result.httpStatus = resp.status;

    let data = null;
    try { data = await resp.json(); } catch(e) { data = null; }
    result.responseBody = data;

    // Save state
    if (data && kase.state_save) {
      const saveMap = tryParse(kase.state_save, {});
      Object.entries(saveMap).forEach(([key, path]) => {
        const val = getPath(data, path);
        if (val !== undefined) S.state[key] = val;
      });
    }

    // Validate
    const validations = Array.isArray(kase.validations)
      ? kase.validations
      : tryParse(kase.validations, []);

    result.validationResults = validations.map(v => validateCheck(v, data));
    const allPass = result.validationResults.every(v => v.pass);
    result.status = allPass ? 'pass' : 'fail';

    // Snapshot
    if (kase.snapshot_config) {
      const snaps = Array.isArray(kase.snapshot_config)
        ? kase.snapshot_config
        : tryParse(kase.snapshot_config, []);
      for (const snap of snaps) {
        const snapUrl = resolveVars(snap.url, S.state);
        const snapParams = resolveVarsObj(snap.params || {}, S.state);
        try {
          let su = cfg().baseUrl + snapUrl;
          const sq = new URLSearchParams({ ...snapParams, token: S.state.token||'', u_hash: S.state.u_hash||'' }).toString();
          su += (su.includes('?') ? '&' : '?') + sq;
          const sr = await fetch(su, { method: snap.method || 'GET', headers: { Accept: 'application/json' } });
          const sd = await sr.json();
          result.snapshotAfter.push({ label: snap.label, data: sd });
          updateGraph(snap.label, sd, kase);
        } catch(e) {
          result.snapshotAfter.push({ label: snap.label, error: e.message });
        }
      }
    }

  } catch(e) {
    result.status = 'fail';
    result.errorMessage = e.message;
  }

  result.durationMs  = Date.now() - start;
  result.stateAfter  = { ...S.state };
  return result;
}

function buildFormBody(params, kase, state) {
  const body = new URLSearchParams();
  // always add auth
  if (state.token)  body.set('token',  state.token);
  if (state.u_hash) body.set('u_hash', state.u_hash);
  if (kase.u_a_role) body.set('u_a_role', String(kase.u_a_role));
  // add params
  Object.entries(params).forEach(([k, v]) => {
    if (!['token','u_hash','u_a_role'].includes(k)) body.set(k, String(v));
  });
  return body.toString();
}

function validateCheck(v, data) {
  const val = getPath(data, v.field);
  let pass = false;
  switch(v.type) {
    case 'eq':
      pass = String(val) === String(v.value);
      break;
    case 'neq':
      pass = String(val) !== String(v.value);
      break;
    case 'hasField':
      pass = val !== undefined && val !== null;
      break;
    case 'notEmpty':
      pass = val !== undefined && val !== null && val !== '' && val !== 0
          && !(Array.isArray(val) && val.length === 0);
      break;
    case 'contains':
      pass = String(val||'').includes(v.value);
      break;
    case 'gte': pass = Number(val) >= Number(v.value); break;
    case 'lte': pass = Number(val) <= Number(v.value); break;
  }
  // actual — читаемое значение для отображения в UI
  let actual = val;
  if (val === undefined) actual = 'undefined';
  else if (val === null)  actual = 'null';
  else if (typeof val === 'object') actual = JSON.stringify(val).slice(0, 60);
  else actual = String(val);
  return { ...v, pass, actual };
}

// ════════════════════════════════════════════════════════════
//  RESULTS PANEL
// ════════════════════════════════════════════════════════════
function renderResultItem(result) {
  const list = document.getElementById('resultsList');
  // remove no-results placeholder
  const noRes = list.querySelector('.no-results');
  if (noRes) noRes.remove();

  const existing = document.getElementById(`ri-${result.caseId}`);
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = `result-item ${S.activeResult?.caseId === result.caseId ? 'active' : ''}`;
  el.id = `ri-${result.caseId}`;
  el.onclick = () => selectResult(result);

  const checksHtml = result.validationResults.map(v =>
    `<div class="check-pill ${v.pass ? 'pass' : 'fail'}">${v.pass ? '✓' : '✗'} ${v.type}:${v.field}${v.value ? '='+v.value : ''}</div>`
  ).join('');

  // Краткий превью ответа API прямо в карточке
  const rb = result.responseBody;
  let respPreview = '';
  if (rb) {
    const code = rb.code || rb.status || '?';
    const msg  = rb.message || rb.error || rb.msg || '';
    respPreview = `<div class="result-resp-preview">← code:<b>${code}</b>${msg ? ' · ' + String(msg).slice(0, 60) : ''}</div>`;
  } else if (result.errorMessage) {
    respPreview = `<div class="result-resp-preview" style="color:var(--red)">← ${result.errorMessage}</div>`;
  }

  el.innerHTML = `
    <div class="result-header">
      <span class="result-name">${result.caseName}</span>
      <span class="result-badge ${result.status}">${result.status.toUpperCase()}</span>
    </div>
    <div class="result-checks">${checksHtml}</div>
    ${respPreview}
    <div class="result-timing">${result.durationMs}ms · ${result.requestUrl.replace(/.*\/api\/v\d/, '')}</div>
  `;
  list.appendChild(el);
  el.scrollIntoView({ block: 'nearest' });
}

function selectResult(result) {
  S.activeResult = result;
  document.querySelectorAll('.result-item').forEach(el => {
    el.classList.toggle('active', el.id === `ri-${result.caseId}`);
  });
  // При FAIL — автоматически открыть Запрос/Ответ для диагностики
  if (result.status === 'fail' && S.previewTab === 'graph') {
    switchPreviewTab('request');
    return; // switchPreviewTab вызовет renderPreview
  }
  renderPreview(result);
}

function clearResults() {
  S.run.results = [];
  S.run.passed = 0;
  S.run.failed = 0;
  S.graphNodes = [];
  document.getElementById('resultsList').innerHTML = `
    <div class="no-results">
      <div class="no-results-icon">📋</div>
      <div class="no-results-text">Результаты появятся после запуска</div>
    </div>`;
  document.getElementById('graphContainer').innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">🔗</div>
      <div class="empty-state-text">Граф объектов появится после запуска</div>
    </div>`;
  renderTree();
}

// ════════════════════════════════════════════════════════════
//  PREVIEW PANEL (4)
// ════════════════════════════════════════════════════════════
function switchPreviewTab(tab) {
  S.previewTab = tab;
  document.querySelectorAll('.preview-tab').forEach((el, i) => {
    const tabs = ['graph', 'snapshot', 'request', 'state', 'log'];
    el.classList.toggle('active', tabs[i] === tab);
  });
  if (tab === 'log') { renderDebugLog(); return; }
  if (S.activeResult) renderPreview(S.activeResult);
  else renderPreviewEmpty(tab);
}

function renderPreviewEmpty(tab) {
  const body = document.getElementById('previewBody');
  if (tab === 'graph') {
    body.innerHTML = `<div class="graph-container" id="graphContainer"><div class="empty-state"><div class="empty-state-icon">🔗</div><div class="empty-state-text">Граф появится после запуска</div></div></div>`;
  } else {
    body.innerHTML = `<div class="empty-state" style="height:100%"><div class="empty-state-icon">👆</div><div class="empty-state-text">Выберите результат</div></div>`;
  }
}

function renderPreview(result) {
  const body = document.getElementById('previewBody');
  const tab  = S.previewTab;

  if (tab === 'graph') {
    // graph is maintained separately via updateGraph
    if (!document.getElementById('graphContainer')) {
      body.innerHTML = `<div class="graph-container" id="graphContainer"></div>`;
    }
    return;
  }

  if (tab === 'snapshot') {
    if (!result.snapshotAfter?.length) {
      body.innerHTML = `<div class="preview-content"><div class="empty-state-text" style="color:var(--text3)">Снапшот не настроен для этого теста</div></div>`;
      return;
    }
    body.innerHTML = `<div class="preview-content" id="snapshotContent"></div>`;
    const cont = document.getElementById('snapshotContent');
    result.snapshotAfter.forEach((snap, i) => {
      const card = document.createElement('div');
      card.className = 'snapshot-card';
      card.innerHTML = `
        <div class="snapshot-card-header" onclick="toggleSnap(${i})">
          <span class="snapshot-card-label">📦 ${snap.label}</span>
          <span class="snapshot-card-toggle" id="snap-toggle-${i}">▶</span>
        </div>
        <div class="snapshot-card-body" id="snap-body-${i}">${colorJson(snap.data||snap.error)}</div>
      `;
      cont.appendChild(card);
    });
    return;
  }

  if (tab === 'request') {
    body.innerHTML = `
      <div class="preview-content">
        <div class="req-section">
          <div class="req-section-label">Запрос → ${result.requestUrl}</div>
          <div class="req-body json-view">${colorJson(result.requestBody)}</div>
        </div>
        <div class="req-section">
          <div class="req-section-label" style="display:flex;align-items:center;gap:6px">
            Ответ
            <span style="color:var(--text2);font-size:9px">HTTP ${result.httpStatus || '—'}</span>
            ${result.responseBody?.code ? `<span style="color:${result.responseBody.code==='200'?'var(--green)':'var(--red)'};font-size:9px;font-weight:600">code: ${result.responseBody.code}</span>` : ''}
            <button class="copy-btn" onclick="copyText(${JSON.stringify(JSON.stringify(result.responseBody))})">Copy JSON</button>
          </div>
          <div class="req-body json-view" style="max-height:300px">${colorJson(result.responseBody)}</div>
        </div>
        <div class="req-section">
          <div class="req-section-label">Валидации</div>
          <div class="req-body">
            ${(result.validationResults||[]).map(v => `
              <div class="check-pill ${v.pass?'pass':'fail'}" style="margin-bottom:3px;display:flex">
                ${v.pass?'✓':'✗'} <b>${v.type}</b> &nbsp;
                <code>${v.field}</code>
                ${v.value ? `<span style="color:var(--text3)"> = ${v.value}</span>` : ''}
                <span style="color:var(--text3);margin-left:auto">→ ${String(v.actual).slice(0,40)}</span>
              </div>`).join('')}
          </div>
        </div>
        ${renderTemplateDebug()}
      </div>`;
    return;
  }

  if (tab === 'state') {
    const st = result.stateAfter || {};
    const keys = Object.keys(st);
    body.innerHTML = `
      <div class="preview-content">
        <div class="req-section-label" style="margin-bottom:8px">State после шага</div>
        ${keys.length === 0
          ? `<div class="state-empty">State пуст</div>`
          : keys.map(k => `
              <div class="state-item">
                <span class="state-key">${k}</span>
                <span class="state-val">${typeof st[k] === 'object' ? JSON.stringify(st[k]) : st[k]}</span>
              </div>`).join('')}
      </div>`;
  }
}

function toggleSnap(i) {
  const body   = document.getElementById(`snap-body-${i}`);
  const toggle = document.getElementById(`snap-toggle-${i}`);
  const open   = body.classList.toggle('open');
  toggle.textContent = open ? '▼' : '▶';
  toggle.classList.toggle('open', open);
}

// ════════════════════════════════════════════════════════════
//  GRAPH (panel 4, tab: graph)
// ════════════════════════════════════════════════════════════
const TYPE_MAP = {
  patient:  { label: 'Пациент',       cls: 'type-patient',  icon: '👤' },
  primary:  { label: 'Первичный',     cls: 'type-primary',  icon: '🩺' },
  followup: { label: 'Осмотр',        cls: 'type-followup', icon: '🔍' },
  repeat:   { label: 'Повторный',     cls: 'type-repeat',   icon: '🔄' },
  photos:   { label: 'Фото',          cls: 'type-photo',    icon: '📷' },
  config:   { label: 'Конфигурация',  cls: 'type-patient',  icon: '⚙️' },
};

function updateGraph(label, data, kase) {
  if (!document.getElementById('graphContainer')) return;
  const gc = document.getElementById('graphContainer');

  // clear placeholder
  const placeholder = gc.querySelector('.empty-state');
  if (placeholder) placeholder.remove();

  const group = kase.group || 'other';
  const typeInfo = TYPE_MAP[group] || { label: group, cls: 'type-patient', icon: '📋' };

  // get ID from data
  const id = data?.data?.b_id || data?.data?.co_id || data?.data?.id || '';
  const nodeId = `graph-${group}-${id || label}`;

  if (document.getElementById(nodeId)) return; // already rendered

  // connector if not first
  if (gc.children.length > 0) {
    const conn = document.createElement('div');
    conn.className = 'graph-connector';
    gc.appendChild(conn);
  }

  const node = document.createElement('div');
  node.className = 'graph-node';
  node.id = nodeId;
  node.innerHTML = `
    <div class="graph-node-header" onclick="toggleGraphNode('${nodeId}')">
      <span class="graph-node-type ${typeInfo.cls}">${typeInfo.icon} ${typeInfo.label}</span>
      <span class="graph-node-label">${label}</span>
      ${id ? `<span class="graph-node-id">${id}</span>` : ''}
    </div>
    <div class="graph-node-body" id="body-${nodeId}">
      <div class="json-view">${colorJson(data?.data || data)}</div>
    </div>
  `;
  gc.appendChild(node);

  // auto-expand patient and appointments
  if (['patient','primary','followup','repeat'].includes(group)) {
    document.getElementById(`body-${nodeId}`)?.classList.add('open');
  }
}

function toggleGraphNode(id) {
  document.getElementById(`body-${id}`)?.classList.toggle('open');
}

// ════════════════════════════════════════════════════════════
//  UTILS
// ════════════════════════════════════════════════════════════
function resolveVars(str, state) {
  if (!str) return str;
  return str.replace(/<([^>]+)>/g, (match, key) => {
    if (key.startsWith('cfg_')) {
      const cfgKey = key.slice(4);
      const c = cfg();
      return c[cfgKey] !== undefined ? c[cfgKey] : match;
    }
    return state[key] !== undefined ? state[key] : match;
  });
}

function resolveVarsObj(obj, state) {
  const out = {};
  Object.entries(obj).forEach(([k, v]) => {
    out[k] = typeof v === 'string' ? resolveVars(v, state) : v;
  });
  return out;
}

function getPath(obj, path) {
  if (!path || obj === null || obj === undefined) return undefined;
  return path.split('.').reduce((o, k) => (o != null ? o[k] : undefined), obj);
}

function tryParse(str, fallback) {
  try { return JSON.parse(str); } catch(e) { return fallback; }
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function colorJson(obj) {
  if (obj === null || obj === undefined) return '<span class="json-null">null</span>';
  const str = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  return str
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span class="json-str">"$1"</span>')
    .replace(/: (\d+\.?\d*)/g, ': <span class="json-num">$1</span>')
    .replace(/: (true|false)/g, ': <span class="json-bool">$1</span>')
    .replace(/: null/g, ': <span class="json-null">null</span>');
}

function updateProgress() {
  const R = S.run;
  const total = R.queue.length;
  const done  = R.index;
  const pct   = total ? Math.round(done / total * 100) : 0;
  document.getElementById('progressFill').style.width    = pct + '%';
  document.getElementById('progressLabel').textContent   = `${done} / ${total}`;
  document.getElementById('progressPassed').textContent  = `${R.passed} ✓`;
  document.getElementById('progressFailed').textContent  = `${R.failed} ✗`;
}

function setRunStatus(type, text) {
  const dot = document.getElementById('runStatusDot');
  dot.className = 'status-dot ' + (type === 'running' ? 'running' : type === 'pass' ? 'pass' : type === 'fail' ? 'fail' : '');
  document.getElementById('runStatusText').textContent = text;
}

function highlightCase(id, status) {
  const el = document.getElementById(`case-item-${id}`);
  if (!el) return;
  el.className = `case-item ${status} ${S.activeCase?.id === id ? 'active' : ''}`;
  const icon = el.querySelector('.case-status-icon');
  if (icon) {
    const icons = { pass:'✓', fail:'✗', running:'●', pending:'○', skip:'–' };
    icon.className = `case-status-icon ${status}`;
    icon.textContent = icons[status] || '○';
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => toast('Скопировано', 'success'));
}

// close modal on overlay click
document.addEventListener('click', e => {
  document.querySelectorAll('.modal-overlay').forEach(m => {
    if (e.target === m) m.classList.remove('open');
  });
});

// keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
  if (e.key === 'F5' && !e.target.matches('input,textarea')) { e.preventDefault(); startRun('auto'); }
  if (e.key === 'ArrowRight' && S.run.active && S.run.mode === 'step') { e.preventDefault(); stepNext(); }
});

// ════════════════════════════════════════════════════════════
//  THEME
// ════════════════════════════════════════════════════════════
function toggleTheme() {
  const root = document.documentElement;
  const isLight = root.classList.toggle('light');
  document.getElementById('themeIcon').textContent      = isLight ? '☀️' : '🌙';
  document.getElementById('themeIconRight').textContent = isLight ? '🌙' : '☀️';
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
}

// Восстановить тему из localStorage
(function() {
  if (localStorage.getItem('theme') === 'light') {
    document.documentElement.classList.add('light');
    // иконки обновятся после рендера DOM
    document.addEventListener('DOMContentLoaded', () => {
      const i1 = document.getElementById('themeIcon');
      const i2 = document.getElementById('themeIconRight');
      if (i1) i1.textContent = '☀️';
      if (i2) i2.textContent = '🌙';
    });
  }
})();
/* ════════════════════════════════════════════════════════════
   LAYOUT MANAGER (Resize + Toggle)
   Не вмешивается в существующую логику
════════════════════════════════════════════════════════════ */

(function(){

  const ws = document.querySelector('.workspace');
  const panels = Array.from(ws.querySelectorAll('.panel'));

  if (panels.length !== 4) return;

  // --- Вставляем resize handles между панелями ---
  for (let i = 0; i < 3; i++) {
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    handle.dataset.index = i;
    panels[i].after(handle);
  }

  let sizes = [240, null, null, 340]; // стартовые
  let visible = [true, true, true, true];

  function buildGrid() {

  const handles = ws.querySelectorAll('.resize-handle');
  handles.forEach(h => h.style.display = 'none');

  const visibleIndexes = [];
  for (let i = 0; i < 4; i++) {
    if (visible[i]) visibleIndexes.push(i);
  }

  // если ни одной панели
  if (visibleIndexes.length === 0) {
    ws.style.gridTemplateColumns = '1fr';
    return;
  }

  // если одна панель — растянуть
  if (visibleIndexes.length === 1) {
    ws.style.gridTemplateColumns = '1fr';

    panels.forEach(p => p.style.gridColumn = '');
    panels[visibleIndexes[0]].style.gridColumn = '1';

    return;
  }

  const cols = [];
  let colIndex = 1;

  visibleIndexes.forEach((panelIndex, idx) => {

    // ширина
    cols.push(sizes[panelIndex] ? sizes[panelIndex] + 'px' : '1fr');

    // назначаем явную колонку панели
    panels[panelIndex].style.gridColumn = colIndex;
    colIndex++;

    // если не последняя — добавляем handle
    if (idx < visibleIndexes.length - 1) {

      const handle = handles[panelIndex];
      if (handle) {
        handle.style.display = 'block';
        handle.style.gridColumn = colIndex;
      }

      cols.push('6px');
      colIndex++;
    }
  });

  ws.style.gridTemplateColumns = cols.join(' ');
}

  buildGrid();

  // --- Resize ---
  ws.querySelectorAll('.resize-handle').forEach(handle => {

    handle.addEventListener('mousedown', e => {

      const i = Number(handle.dataset.index);
      const left  = panels[i];
      const right = panels[i+1];

      const startX = e.clientX;
      const startLeft  = left.offsetWidth;
      const startRight = right.offsetWidth;

      function move(ev) {
        const dx = ev.clientX - startX;
        sizes[i]   = startLeft + dx;
        sizes[i+1] = startRight - dx;
        buildGrid();
      }

      function up() {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
      }

      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });

  });

  // --- Toggle API ---
  window.togglePanel = function(index){

  if (index < 1 || index > 4) return;
  const i = index - 1;
  visible[i] = !visible[i];
  panels[i].style.display = visible[i] ? 'flex' : 'none';
  // ─── Обновляем цвет кнопки ───
  const btn = document.querySelector(
    '.panel-toggle-btn[data-panel="' + index + '"]'
  );
  if (btn) {
    btn.classList.toggle('active', visible[i]);
  }
  buildGrid();
};

})();
function renderTemplateDebug() { return ''; } // оставлен для совместимости

// ════════════════════════════════════════════════════════════
//  DEBUG LOG (панель 4, таб: Лог)
// ════════════════════════════════════════════════════════════
function renderDebugLog() {
  if (S.previewTab !== 'log') return;
  const body = document.getElementById('previewBody');
  const calls = S.debug.calls;

  if (calls.length === 0) {
    body.innerHTML = `
      <div class="debug-log-header">
        <span>Лог пуст</span>
      </div>`;
    return;
  }

  body.innerHTML = `
    <div class="debug-log-header">
      <span>${calls.length} вызов(ов)</span>
      <button class="btn small danger" onclick="clearDebugLog()">Очистить</button>
    </div>
    <div id="debugLogList"></div>`;

  const list = document.getElementById('debugLogList');

  [...calls].reverse().forEach(entry => {
    const hasError = !!entry.error;

    // payload.data parsing
    let payloadDataStr = null;
    let payloadDataParsed = null;
    if (entry.payload?.data) {
      payloadDataStr = entry.payload.data;
      try { payloadDataParsed = JSON.parse(payloadDataStr); } catch(e) {}
    }

    const item = document.createElement('div');
    item.className = `debug-log-item ${hasError ? 'error' : 'ok'}`;
    item.id = `dbg-${entry.id}`;
    item.innerHTML = `
      <div class="debug-log-row" onclick="toggleDebugEntry(${entry.id})">
        <span class="debug-log-num">#${entry.id}</span>
        <span class="debug-log-tpl">template/${entry.templateId}</span>
        <span class="debug-log-time">${entry.time}</span>
        <span class="debug-log-status ${hasError ? 'fail' : 'pass'}">${hasError ? '✗' : '✓'}</span>
      </div>
      <div class="debug-log-body" id="dbg-body-${entry.id}">

        ${payloadDataStr ? `
        <div class="req-section">
          <div class="req-section-label" style="color:var(--cyan)">PAYLOAD.DATA (string)</div>
          <div class="req-body json-view" style="word-break:break-all">${esc(payloadDataStr)}</div>
        </div>
        <div class="req-section">
          <div class="req-section-label" style="color:var(--cyan)">PAYLOAD.DATA (parsed)</div>
          <div class="req-body json-view">${payloadDataParsed !== null ? colorJson(payloadDataParsed) : '<span style="color:var(--red)">not valid JSON</span>'}</div>
        </div>` : ''}

        <div class="req-section">
          <div class="req-section-label" style="color:var(--yellow)">RAW RESPONSE</div>
          <div class="req-body json-view" style="max-height:200px;word-break:break-all">${entry.raw !== null ? esc(entry.raw) : '<span style="color:var(--text3)">—</span>'}</div>
        </div>

        <div class="req-section">
          <div class="req-section-label" style="color:${hasError ? 'var(--red)' : 'var(--green)'}">
            ${entry.parsed !== null ? 'PARSED JSON' : 'PARSED JSON — not valid'}
          </div>
          <div class="req-body json-view" style="max-height:200px">${
            entry.parsed !== null
              ? colorJson(entry.parsed)
              : `<span style="color:var(--red)">${esc(entry.error || 'Response is not valid JSON')}</span>`
          }</div>
        </div>

      </div>`;
    list.appendChild(item);
  });
}

function toggleDebugEntry(id) {
  document.getElementById(`dbg-body-${id}`)?.classList.toggle('open');
}

function clearDebugLog() {
  S.debug.calls = [];
  renderDebugLog();
}

// ════════════════════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════════════════════
// init();  // убрали автологин
setRunStatus('idle', 'Не авторизован');
