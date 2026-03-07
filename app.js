// ════════════════════════════════════════════════════════════
//  ACCOUNT MANAGER
// ════════════════════════════════════════════════════════════
const accountManager = (function() {
  const LS_KEY = 'api_test_user_accounts';
  let accounts = [];
  let currentId = null;
  let open = false;

  function persist() {
    localStorage.setItem(LS_KEY, JSON.stringify({ accounts }));
  }

  function applyActive() {
    const acc = accounts.find(a => a.active) || accounts[0];
    if (!acc) return;
    document.getElementById('cfgLogin').value    = acc.login;
    document.getElementById('cfgPassword').value = acc.password;
    const lbl = document.getElementById('accTriggerLabel');
    if (lbl) lbl.textContent = acc.name || acc.login || '—';
  }

  function getById(id) {
    return accounts.find(a => a.id === id);
  }

  function fillEditor(acc) {
    document.getElementById('accName').value     = acc ? acc.name     : '';
    document.getElementById('accLogin').value    = acc ? acc.login    : '';
    document.getElementById('accPass').value     = acc ? acc.password : '';
    document.getElementById('accActive').checked = acc ? !!acc.active : false;
  }

  function renderList() {
    const list = document.getElementById('accList');
    if (!list) return;
    list.innerHTML = accounts.map(a => `
      <div class="acc-list-item${a.id === currentId ? ' selected' : ''}" onclick="accountManager.selectItem('${a.id}')">
        <span class="acc-list-name">${a.name || a.login || '—'}</span>
        ${a.active ? '<span class="acc-active-dot">●</span>' : ''}
      </div>`).join('');
  }

  return {
    init() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) accounts = JSON.parse(raw).accounts || [];
      } catch(e) { accounts = []; }

      if (accounts.length === 0) {
        const login    = document.getElementById('cfgLogin').value || '';
        const password = document.getElementById('cfgPassword').value || '';
        accounts = [{
          id: Date.now().toString(),
          name: login || 'Default',
          login, password, active: true
        }];
        persist();
      }

      if (!accounts.find(a => a.active)) accounts[0].active = true;
      currentId = (accounts.find(a => a.active) || accounts[0]).id;

      applyActive();

      // Закрывать при клике вне
      document.addEventListener('click', e => {
        if (!open) return;
        const dd = document.getElementById('accDropdown');
        const tr = document.getElementById('accTrigger');
        if (dd && !dd.contains(e.target) && tr && !tr.contains(e.target)) {
          accountManager.closeDropdown();
        }
      });
    },

    toggleDropdown() {
      open ? this.closeDropdown() : this.openDropdown();
    },

    openDropdown() {
      open = true;
      const dd = document.getElementById('accDropdown');
      if (dd) dd.style.display = 'flex';
      renderList();
      fillEditor(getById(currentId) || accounts[0]);
    },

    closeDropdown() {
      open = false;
      const dd = document.getElementById('accDropdown');
      if (dd) dd.style.display = 'none';
    },

    selectItem(id) {
      currentId = id;
      const acc = getById(id);
      if (!acc) return;
      document.getElementById('cfgLogin').value    = acc.login;
      document.getElementById('cfgPassword').value = acc.password;
      renderList();
      fillEditor(acc);
    },

    save() {
      const acc = getById(currentId);
      if (!acc) return;
      acc.name     = document.getElementById('accName').value.trim();
      acc.login    = document.getElementById('accLogin').value.trim();
      acc.password = document.getElementById('accPass').value;
      const makeActive = document.getElementById('accActive').checked;
      if (makeActive) {
        accounts.forEach(a => a.active = false);
        acc.active = true;
      } else {
        acc.active = false;
        if (!accounts.find(a => a.active) && accounts.length > 0) accounts[0].active = true;
      }
      persist();
      applyActive();
      renderList();
      toast('Сохранено', 'success');
    },

    newAcc() {
      const acc = {
        id: Date.now().toString(),
        name: '', login: '', password: '', active: false
      };
      accounts.push(acc);
      currentId = acc.id;
      persist();
      renderList();
      fillEditor(acc);
      document.getElementById('accName').focus();
    },

    deleteAcc() {
      if (accounts.length <= 1) { toast('Нельзя удалить последнюю запись', 'warn'); return; }
      const wasActive = !!getById(currentId)?.active;
      accounts = accounts.filter(a => a.id !== currentId);
      if (wasActive) accounts[0].active = true;
      persist();
      currentId = accounts[0].id;
      applyActive();
      renderList();
      fillEditor(accounts[0]);
    },

    // legacy — оставлен для совместимости если где-то вызывается
    select(id) { this.selectItem(id); },
    openPanel() { this.openDropdown(); }
  };
})();


