const dom = {
  searchInput: document.getElementById('searchInput'),
  clientsList: document.getElementById('clientsList'),
  summaryCounts: document.getElementById('summaryCounts'),
  summaryStats: document.getElementById('summaryStats'),
  newClientView: document.getElementById('newClientView'),
  clientView: document.getElementById('clientView'),
  newFirstName: document.getElementById('newFirstName'),
  newLastName: document.getElementById('newLastName'),
  newPhone: document.getElementById('newPhone'),
  newEmail: document.getElementById('newEmail'),
  btnCreateClient: document.getElementById('btnCreateClient'),
  btnCreateClientAndService: document.getElementById('btnCreateClientAndService'),
  clientTitle: document.getElementById('clientTitle'),
  btnToggleClient: document.getElementById('btnToggleClient'),
  clientDetails: document.getElementById('clientDetails'),
  fullName: document.getElementById('fullName'),
  phone: document.getElementById('phone'),
  email: document.getElementById('email'),
  skinType: document.getElementById('skinType'),
  skinNotes: document.getElementById('skinNotes'),
  cream: document.getElementById('cream'),
  servicePicker: document.getElementById('servicePicker'),
  serviceFormCosmetic: document.getElementById('serviceFormCosmetic'),
  serviceFormGeneric: document.getElementById('serviceFormGeneric'),
  treatmentType: document.getElementById('treatmentType'),
  addonsList: document.getElementById('addonsList'),
  basePrice: document.getElementById('basePrice'),
  addonsTotal: document.getElementById('addonsTotal'),
  manualTotal: document.getElementById('manualTotal'),
  finalTotal: document.getElementById('finalTotal'),
  worker: document.getElementById('worker'),
  paymentMethod: document.getElementById('paymentMethod'),
  visitNote: document.getElementById('visitNote'),
  visitDate: document.getElementById('visitDate'),
  genText1: document.getElementById('genText1'),
  genText2: document.getElementById('genText2'),
  genText3: document.getElementById('genText3'),
  genSelect1: document.getElementById('genSelect1'),
  genSelect2: document.getElementById('genSelect2'),
  genSelect3: document.getElementById('genSelect3'),
  genPrice: document.getElementById('genPrice'),
  genDate: document.getElementById('genDate'),
  genWorker: document.getElementById('genWorker'),
  genPaymentMethod: document.getElementById('genPaymentMethod'),
  genNote: document.getElementById('genNote'),
  visitsList: document.getElementById('visitsList'),
  btnNew: document.getElementById('btnNew'),
  btnSave: document.getElementById('btnSave'),
  btnAddVisit: document.getElementById('btnAddVisit'),
  btnAddGeneric: document.getElementById('btnAddGeneric'),
  btnSettings: document.getElementById('btnSettings'),
  btnEconomy: document.getElementById('btnEconomy'),
  btnCalendar: document.getElementById('btnCalendar'),
  btnBilling: document.getElementById('btnBilling'),
  btnNotifications: document.getElementById('btnNotifications'),
  btnLogout: document.getElementById('btnLogout'),
  serverStatus: document.getElementById('serverStatus'),
  serverDot: document.getElementById('serverDot'),
  userInfo: document.getElementById('userInfo'),
  authRoot: document.getElementById('authRoot'),
  modalRoot: document.getElementById('modalRoot')
};

const state = {
  clients: [],
  selectedClientId: null,
  settings: {
    skinTypes: [],
    services: [],
    treatments: [],
    addons: [],
    workers: []
  },
  visits: [],
  users: [],
  selectedServiceId: null,
  auth: {
    token: null,
    user: null,
    hasUsers: null
  }
};

let handleUnauthorized = () => {};

const api = {
  async request(url, options = {}) {
    const headers = {
      ...(options.headers || {})
    };
    const token = state.auth.token || localStorage.getItem('kartoteka_token');
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    let response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (err) {
      alert('Server je nedostupný.');
      throw err;
    }

    if (!response.ok) {
      if (response.status === 401) {
        handleUnauthorized();
      }
      const error = await response.json().catch(() => null);
      const message = error?.error || `Chyba komunikace se serverem (HTTP ${response.status}).`;
      const detail = error?.detail ? `\n${error.detail}` : '';
      alert(message + detail);
      throw new Error(message);
    }
    return response.json();
  },
  get(url) {
    return api.request(url);
  },
  post(url, data) {
    return api.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },
  put(url, data) {
    return api.request(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },
  del(url) {
    return api.request(url, { method: 'DELETE' });
  }
};

function todayLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function toLocalDateString(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function formatCzk(value) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  return `${safe.toLocaleString('cs-CZ')} Kč`;
}

function debounce(fn, delay = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function setServerStatus(online) {
  if (!dom.serverDot) return;
  dom.serverDot.classList.toggle('online', online);
  dom.serverDot.classList.toggle('offline', !online);
}

async function checkServer() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch('/api/health', { signal: controller.signal });
    clearTimeout(timeout);
    setServerStatus(response.ok);
  } catch (err) {
    setServerStatus(false);
  }
}

function startServerMonitor() {
  checkServer();
  setInterval(checkServer, 5000);
}

function showNewClientView() {
  dom.newClientView.classList.remove('hidden');
  dom.clientView.classList.add('hidden');
}

function showClientView() {
  dom.newClientView.classList.add('hidden');
  dom.clientView.classList.remove('hidden');
}

function setClientDetailsOpen(open) {
  if (!dom.clientDetails || !dom.btnToggleClient) return;
  dom.clientDetails.classList.toggle('hidden', !open);
  dom.btnToggleClient.textContent = open ? 'Skrýt údaje klientky' : 'Upravit údaje klientky';
}

function setAuthToken(token) {
  state.auth.token = token;
  if (token) {
    localStorage.setItem('kartoteka_token', token);
  } else {
    localStorage.removeItem('kartoteka_token');
  }
}

function updateUserUi() {
  if (state.auth.user) {
    const roleLabel =
      state.auth.user.role === 'admin'
        ? 'Administrátor'
        : state.auth.user.role === 'reception'
          ? 'Recepční'
          : 'Pracovník';
    dom.userInfo.textContent = `${state.auth.user.full_name} • ${roleLabel}`;
  } else {
    dom.userInfo.textContent = '';
  }

  const isAdmin = state.auth.user?.role === 'admin';
  const isWorker = state.auth.user?.role === 'worker';
  dom.btnSettings.classList.toggle('hidden', !isAdmin);
  const isLogged = !!state.auth.user;
  const canEconomy = isAdmin || isWorker;
  dom.btnEconomy.classList.toggle('hidden', !canEconomy);
  dom.summaryStats.classList.toggle('hidden', !isAdmin);
  dom.btnLogout.classList.toggle('hidden', !state.auth.user);
}

function hideAuthScreen() {
  dom.authRoot.innerHTML = '';
}

function showAuthScreen(html) {
  dom.authRoot.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">${html}</div>
    </div>
  `;
}

function showLoginScreen() {
  showAuthScreen(`
    <h2>Přihlášení</h2>
    <div class="field">
      <label>Uživatelské jméno</label>
      <input type="text" id="loginUsername" />
    </div>
    <div class="field">
      <label>Heslo</label>
      <input type="password" id="loginPassword" />
    </div>
    <div class="actions-row">
      <button class="primary" id="loginSubmit">Přihlásit</button>
    </div>
  `);

  document.getElementById('loginSubmit').addEventListener('click', async () => {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    if (!username || !password) {
      alert('Vyplň uživatelské jméno a heslo.');
      return;
    }
    const result = await api.post('/api/login', { username, password });
    setAuthToken(result.token);
    state.auth.user = result.user;
    hideAuthScreen();
    await onAuthenticated();
  });
}

function showSetupScreen() {
  showAuthScreen(`
    <h2>Vytvoření administrátora</h2>
    <div class="field">
      <label>Jméno a příjmení</label>
      <input type="text" id="setupName" />
    </div>
    <div class="field">
      <label>Uživatelské jméno</label>
      <input type="text" id="setupUsername" />
    </div>
    <div class="field">
      <label>Heslo</label>
      <input type="password" id="setupPassword" />
    </div>
    <div class="actions-row">
      <button class="primary" id="setupSubmit">Vytvořit a přihlásit</button>
    </div>
  `);

  document.getElementById('setupSubmit').addEventListener('click', async () => {
    const fullName = document.getElementById('setupName').value.trim();
    const username = document.getElementById('setupUsername').value.trim();
    const password = document.getElementById('setupPassword').value.trim();
    if (!fullName || !username || !password) {
      alert('Vyplň všechna pole.');
      return;
    }
    await api.post('/api/setup', { full_name: fullName, username, password });
    const login = await api.post('/api/login', { username, password });
    setAuthToken(login.token);
    state.auth.user = login.user;
    hideAuthScreen();
    await onAuthenticated();
  });
}

async function onAuthenticated() {
  updateUserUi();
  await loadSettings();
  await loadClients();
  await loadSummary();
  clearSelection();
  updatePricePreview();
}

async function bootstrapAuth() {
  const bootstrap = await api.get('/api/bootstrap');
  state.auth.hasUsers = bootstrap.has_users;

  const storedToken = localStorage.getItem('kartoteka_token');
  if (bootstrap.has_users && storedToken) {
    try {
      const me = await api.get('/api/me');
      state.auth.user = me.user;
      setAuthToken(storedToken);
      hideAuthScreen();
      await onAuthenticated();
      return;
    } catch (err) {
      setAuthToken(null);
    }
  }

  state.auth.user = null;
  updateUserUi();

  if (!bootstrap.has_users) {
    showSetupScreen();
  } else {
    showLoginScreen();
  }
}

handleUnauthorized = () => {
  setAuthToken(null);
  state.auth.user = null;
  updateUserUi();
  if (state.auth.hasUsers === false) {
    showSetupScreen();
  } else {
    showLoginScreen();
  }
};

async function loadSettings() {
  const data = await api.get('/api/settings');
  state.settings = {
    skinTypes: data.skinTypes || [],
    services: data.services || [],
    treatments: data.treatments || [],
    addons: data.addons || [],
    workers: data.workers || []
  };
  renderSettingsInputs();
  if (state.selectedClientId) {
    renderServiceButtons(false);
  }
}

async function loadUsers() {
  if (state.auth.user?.role !== 'admin') {
    state.users = [];
    return;
  }
  state.users = await api.get('/api/users');
}

async function loadClients() {
  const search = dom.searchInput.value.trim();
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  state.clients = await api.get(`/api/clients${query}`);
  renderClients();
}

async function loadVisits(clientId) {
  state.visits = clientId ? await api.get(`/api/clients/${clientId}/visits`) : [];
  renderVisits();
}

async function loadSummary() {
  const data = await api.get('/api/summary');
  if (state.auth.user?.role === 'reception') {
    dom.summaryCounts.textContent = `Klientek: ${data.counts.clients} • Záznamů: ${data.counts.visits}`;
  } else {
    dom.summaryCounts.textContent = `Klientek: ${data.counts.clients} • Záznamů: ${data.counts.visits} • Výdajů: ${data.counts.expenses}`;
  }
  dom.summaryStats.innerHTML = '';
}

function renderSettingsInputs() {
  dom.skinType.innerHTML = '<option value="">—</option>' + state.settings.skinTypes
    .map((item) => `<option value="${item.id}">${item.name}</option>`)
    .join('');

  dom.treatmentType.innerHTML = '<option value="">—</option>' + state.settings.treatments
    .map((item) => `<option value="${item.id}" data-price="${item.price}">${item.name}</option>`)
    .join('');

  dom.addonsList.innerHTML = state.settings.addons
    .map((item) => {
      return `
        <label class="addon-item">
          <span>
            <input type="checkbox" value="${item.id}" data-price="${item.price}" />
            ${item.name}
          </span>
          <span>${formatCzk(item.price)}</span>
        </label>
      `;
    })
    .join('');

  const workerOptions = '<option value="">—</option>' + state.settings.workers
    .map((item) => `<option value="${item.id}">${item.name}</option>`)
    .join('');
  dom.worker.innerHTML = workerOptions;
  dom.genWorker.innerHTML = workerOptions;
  applyDefaultWorker(dom.worker);
  applyDefaultWorker(dom.genWorker);

  dom.addonsList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.addEventListener('change', updatePricePreview);
  });
}

function getDefaultWorkerId() {
  const userId = state.auth.user?.id;
  if (!userId) return '';
  const exists = state.settings.workers.some((worker) => worker.id === userId);
  return exists ? userId : '';
}

function applyDefaultWorker(selectEl) {
  if (!selectEl) return;
  const workerId = getDefaultWorkerId();
  if (workerId) {
    selectEl.value = workerId;
  }
}

function renderServiceButtons(autoSelect = false) {
  if (!dom.servicePicker) return;
  if (!state.settings.services.length) {
    dom.servicePicker.innerHTML = '<div class="hint">V nastavení zatím nejsou žádné služby.</div>';
    dom.serviceFormCosmetic.classList.add('hidden');
    dom.serviceFormGeneric.classList.add('hidden');
    return;
  }

  if (state.selectedServiceId && !state.settings.services.find((item) => item.id === state.selectedServiceId)) {
    state.selectedServiceId = null;
  }

  dom.servicePicker.innerHTML = state.settings.services
    .map((service) => {
      const active = service.id === state.selectedServiceId ? 'active' : '';
      return `<button type="button" class="service-button ${active}" data-id="${service.id}">${service.name}</button>`;
    })
    .join('');

  dom.servicePicker.querySelectorAll('.service-button').forEach((button) => {
    button.addEventListener('click', () => selectService(button.dataset.id));
  });

  if (autoSelect && !state.selectedServiceId) {
    selectService(state.settings.services[0].id);
  } else if (state.selectedServiceId) {
    selectService(state.selectedServiceId);
  } else {
    dom.serviceFormCosmetic.classList.add('hidden');
    dom.serviceFormGeneric.classList.add('hidden');
  }
}

function selectService(id) {
  const previous = state.selectedServiceId;
  state.selectedServiceId = id;
  const service = state.settings.services.find((item) => item.id === id);
  if (!service) return;
  if (previous !== id) {
    resetVisitFields();
  }

  dom.servicePicker.querySelectorAll('.service-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.id === id);
  });

  if (service.form_type === 'cosmetic') {
    dom.serviceFormCosmetic.classList.remove('hidden');
    dom.serviceFormGeneric.classList.add('hidden');
  } else {
    dom.serviceFormCosmetic.classList.add('hidden');
    dom.serviceFormGeneric.classList.remove('hidden');
  }
}

function renderClients() {
  if (!state.clients.length) {
    dom.clientsList.innerHTML = '<div class="hint">Zatím tu nic není. Vpravo přidej první klientku.</div>';
    return;
  }

  dom.clientsList.innerHTML = state.clients
    .map((client) => {
      const active = client.id === state.selectedClientId ? 'active' : '';
      const phone = client.phone ? client.phone : '';
      const email = client.email ? client.email : '';
      const meta = [phone, email].filter(Boolean).join(' • ');
      return `
        <div class="client-card ${active}" data-id="${client.id}">
          <div class="name">${client.full_name}</div>
          <div class="small">${meta || 'Bez kontaktu'}</div>
        </div>
      `;
    })
    .join('');

  dom.clientsList.querySelectorAll('.client-card').forEach((card) => {
    card.addEventListener('click', () => selectClient(card.dataset.id));
  });
}

function renderVisits() {
  if (!state.selectedClientId) {
    dom.visitsList.innerHTML = '<div class="hint">Vyber klientku, abys viděla historii.</div>';
    return;
  }
  if (!state.visits.length) {
    dom.visitsList.innerHTML = '<div class="hint">Zatím žádná historie návštěv.</div>';
    return;
  }

  dom.visitsList.innerHTML = state.visits
    .map((visit) => {
      const date = visit.date || '';
      const serviceName = visit.service_name || 'Služba';
      const treatment = visit.treatment_name ? ` • ${visit.treatment_name}` : '';
      const title = `${serviceName}${treatment}`.trim();
      const worker = visit.worker_name ? ` • ${visit.worker_name}` : '';
      const payment = visit.payment_method === 'transfer' ? 'Převodem' : 'Hotově';
      const note = visit.note ? `Poznámka: ${visit.note}` : '';
      const noteLine = note ? `<div class="history-meta">${note}</div>` : '';
      return `
        <div class="history-card">
          <div class="history-title">
            <span>${title}</span>
            <span>${formatCzk(visit.total)}</span>
          </div>
          <div class="history-meta">${date} • ${payment}${worker}</div>
          ${noteLine}
        </div>
      `;
    })
    .join('');
}

function setFormValues(client) {
  dom.fullName.value = client?.full_name || '';
  dom.phone.value = client?.phone || '';
  dom.email.value = client?.email || '';
  dom.skinType.value = client?.skin_type_id || '';
  dom.skinNotes.value = client?.skin_notes || '';
  dom.cream.value = client?.cream || '';
}

function resetVisitFields() {
  dom.treatmentType.value = '';
  dom.manualTotal.value = '';
  dom.paymentMethod.value = 'cash';
  dom.visitNote.value = '';
  dom.visitDate.value = todayLocal();
  dom.worker.value = getDefaultWorkerId();
  dom.addonsList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = false;
  });
  dom.genText1.value = '';
  dom.genText2.value = '';
  dom.genText3.value = '';
  dom.genSelect1.value = '';
  dom.genSelect2.value = '';
  dom.genSelect3.value = '';
  dom.genPrice.value = '';
  dom.genDate.value = todayLocal();
  dom.genWorker.value = getDefaultWorkerId();
  dom.genPaymentMethod.value = 'cash';
  dom.genNote.value = '';
  updatePricePreview();
}

function clearSelection() {
  state.selectedClientId = null;
  state.selectedServiceId = null;
  setFormValues(null);
  resetVisitFields();
  renderClients();
  renderVisits();
  dom.clientTitle.textContent = 'Karta klientky';
  dom.servicePicker.innerHTML = '';
  setClientDetailsOpen(false);
  showNewClientView();
  dom.newFirstName.value = '';
  dom.newLastName.value = '';
  dom.newPhone.value = '';
  dom.newEmail.value = '';
}

function resetAppData() {
  state.clients = [];
  state.visits = [];
  dom.clientsList.innerHTML = '';
  dom.visitsList.innerHTML = '';
  dom.summaryCounts.textContent = '';
  dom.summaryStats.innerHTML = '';
  clearSelection();
}

async function handleLogout() {
  try {
    await api.post('/api/logout', {});
  } catch (err) {
    // ignore
  }
  setAuthToken(null);
  state.auth.user = null;
  updateUserUi();
  resetAppData();
  showLoginScreen();
}

async function selectClient(id, autoSelectService = false) {
  state.selectedClientId = id;
  state.selectedServiceId = null;
  const client = await api.get(`/api/clients/${id}`);
  setFormValues(client);
  dom.clientTitle.textContent = client.full_name || 'Karta klientky';
  showClientView();
  setClientDetailsOpen(false);
  resetVisitFields();
  await loadVisits(id);
  renderClients();
  renderServiceButtons(autoSelectService);
}

function collectNewClientPayload() {
  const firstName = dom.newFirstName.value.trim();
  const lastName = dom.newLastName.value.trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  return {
    full_name: fullName,
    phone: dom.newPhone.value.trim(),
    email: dom.newEmail.value.trim()
  };
}

function collectClientPayload() {
  return {
    full_name: dom.fullName.value.trim(),
    phone: dom.phone.value.trim(),
    email: dom.email.value.trim(),
    skin_type_id: dom.skinType.value || null,
    skin_notes: dom.skinNotes.value.trim(),
    cream: dom.cream.value.trim()
  };
}

async function saveClient() {
  const payload = collectClientPayload();
  if (!payload.full_name) {
    alert('Vyplň jméno a příjmení.');
    return null;
  }

  if (!state.selectedClientId) {
    alert('Vyber klientku nebo použij formulář Nová klientka.');
    return null;
  }

  await api.put(`/api/clients/${state.selectedClientId}`, payload);
  await loadClients();
  dom.clientTitle.textContent = payload.full_name;
  return state.selectedClientId;
}

async function createClient(selectService = false) {
  const payload = collectNewClientPayload();
  if (!payload.full_name) {
    alert('Vyplň jméno a příjmení.');
    return;
  }

  const result = await api.post('/api/clients', payload);
  await loadClients();

  if (selectService) {
    await selectClient(result.id, true);
    dom.newFirstName.value = '';
    dom.newLastName.value = '';
    dom.newPhone.value = '';
    dom.newEmail.value = '';
  } else {
    dom.newFirstName.value = '';
    dom.newLastName.value = '';
    dom.newPhone.value = '';
    dom.newEmail.value = '';
  }
}

function updatePricePreview() {
  const treatment = state.settings.treatments.find((item) => item.id === dom.treatmentType.value);
  const basePrice = treatment ? Number(treatment.price) : 0;
  const addonsTotal = Array.from(dom.addonsList.querySelectorAll('input[type="checkbox"]'))
    .filter((input) => input.checked)
    .reduce((sum, input) => sum + Number(input.dataset.price || 0), 0);

  const manual = dom.manualTotal.value !== '' ? Number(dom.manualTotal.value) : null;
  const finalPrice = manual !== null && !Number.isNaN(manual) ? manual : basePrice + addonsTotal;

  dom.basePrice.value = formatCzk(basePrice);
  dom.addonsTotal.value = formatCzk(addonsTotal);
  dom.finalTotal.value = formatCzk(finalPrice);
}

async function addVisit() {
  if (!state.selectedServiceId) {
    alert('Vyber službu.');
    return;
  }

  const service = state.settings.services.find((item) => item.id === state.selectedServiceId);
  if (!service || service.form_type !== 'cosmetic') {
    alert('Vybraná služba nemá kosmetický formulář.');
    return;
  }

  const clientId = await saveClient();
  if (!clientId) return;

  const treatmentId = dom.treatmentType.value || null;
  if (!treatmentId) {
    const proceed = confirm('Nebyl vybraný typ ošetření. Chceš přesto uložit návštěvu?');
    if (!proceed) return;
  }

  if (!dom.worker.value) {
    alert('Vyber pracovníka pro ekonomiku.');
    return;
  }

  const addons = Array.from(dom.addonsList.querySelectorAll('input[type="checkbox"]'))
    .filter((input) => input.checked)
    .map((input) => input.value);

  await api.post(`/api/clients/${clientId}/visits`, {
    date: dom.visitDate.value || todayLocal(),
    service_id: state.selectedServiceId,
    treatment_id: treatmentId,
    addons,
    manual_total: dom.manualTotal.value,
    note: dom.visitNote.value.trim(),
    worker_id: dom.worker.value,
    payment_method: dom.paymentMethod.value
  });

  resetVisitFields();
  await loadVisits(clientId);
  await loadSummary();
}

async function addGenericVisit() {
  if (!state.selectedServiceId) {
    alert('Vyber službu.');
    return;
  }

  const service = state.settings.services.find((item) => item.id === state.selectedServiceId);
  if (!service || service.form_type === 'cosmetic') {
    alert('Vybraná služba nemá obecný formulář.');
    return;
  }

  const clientId = await saveClient();
  if (!clientId) return;

  if (!dom.genWorker.value) {
    alert('Vyber pracovníka pro ekonomiku.');
    return;
  }

  if (!dom.genPrice.value) {
    alert('Vyplň cenu služby.');
    return;
  }

  const serviceData = {
    text1: dom.genText1.value.trim(),
    text2: dom.genText2.value.trim(),
    text3: dom.genText3.value.trim(),
    select1: dom.genSelect1.value,
    select2: dom.genSelect2.value,
    select3: dom.genSelect3.value
  };

  await api.post(`/api/clients/${clientId}/visits`, {
    date: dom.genDate.value || todayLocal(),
    service_id: state.selectedServiceId,
    manual_total: dom.genPrice.value,
    note: dom.genNote.value.trim(),
    worker_id: dom.genWorker.value,
    payment_method: dom.genPaymentMethod.value,
    service_data: serviceData
  });

  resetVisitFields();
  await loadVisits(clientId);
  await loadSummary();
}

function openModal(contentHtml) {
  dom.modalRoot.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true">
      <div class="modal">${contentHtml}</div>
    </div>
  `;
  const backdrop = dom.modalRoot.querySelector('.modal-backdrop');
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      closeModal();
    }
  });
}

function closeModal() {
  dom.modalRoot.innerHTML = '';
}

function durationOptions() {
  return [30, 60, 90, 120, 150, 180, 210, 240];
}

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: toLocalDateString(start),
    to: toLocalDateString(end)
  };
}

function monthName(monthIndex) {
  return [
    'leden',
    'únor',
    'březen',
    'duben',
    'květen',
    'červen',
    'červenec',
    'srpen',
    'září',
    'říjen',
    'listopad',
    'prosinec'
  ][monthIndex];
}

function timeSlots() {
  const slots = [];
  for (let hour = 7; hour <= 19; hour += 1) {
    const label = String(hour).padStart(2, '0');
    slots.push(`${label}:00`);
    if (hour !== 19) {
      slots.push(`${label}:30`);
    }
  }
  return slots;
}

function sampleReservationsForMonth(year, month) {
  const sampleDays = [2, 5, 8, 12, 14, 18, 21, 26];
  return new Set(
    sampleDays.map((day) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
  );
}

function buildCalendarHtml(year, month, reservations) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weekdayOffset = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((weekdayOffset + daysInMonth) / 7) * 7;

  const cells = [];
  for (let i = 0; i < totalCells; i += 1) {
    const dayNumber = i - weekdayOffset + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      cells.push('<div class="calendar-day empty"></div>');
      continue;
    }
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
    const hasReservation = reservations.has(dateKey);
    cells.push(`
      <div class="calendar-day${hasReservation ? ' has-reservation' : ''}">
        <div class="calendar-day-number">${dayNumber}</div>
        ${hasReservation ? '<span class="calendar-dot"></span>' : ''}
      </div>
    `);
  }

  return `
    <div class="calendar">
      <div class="calendar-month">${monthName(month)} ${year}</div>
      <div class="calendar-weekdays">
        <span>Po</span><span>Út</span><span>St</span><span>Čt</span><span>Pá</span><span>So</span><span>Ne</span>
      </div>
      <div class="calendar-grid">
        ${cells.join('')}
      </div>
    </div>
  `;
}

async function openCalendarModal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = 1; // únor (demo)
  let reservations = new Set();
  try {
    const data = await api.get(`/api/reservations/calendar?year=${year}&month=${month + 1}`);
    reservations = new Set(data.days || []);
  } catch (err) {
    reservations = sampleReservationsForMonth(year, month);
  }

  const canEditAvailability = state.auth.user?.role !== 'reception';
  const days = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
  const dayCheckboxes = days
    .map(
      (label, index) => `
        <label class="checkbox-pill">
          <input type="checkbox" class="availability-day" value="${index}" />
          ${label}
        </label>
      `
    )
    .join('');
  const timeCheckboxes = timeSlots()
    .map(
      (time) => `
        <label class="checkbox-pill">
          <input type="checkbox" class="availability-time" value="${time}" />
          ${time}
        </label>
      `
    )
    .join('');

  openModal(`
    <div class="modal-header">
      <div>
        <h2>Kalendář</h2>
        <div class="meta">Rezervace pro únor ${year}</div>
      </div>
      <button class="ghost" id="closeModal">Zavřít</button>
    </div>
    <div class="modal-grid">
      ${buildCalendarHtml(year, month, reservations)}
      <div class="hint">Modrá tečka značí den s rezervací.</div>
      <div class="settings-section">
        <h3>Rezervace v měsíci</h3>
        <div id="calendarReservations" class="settings-list"></div>
      </div>
      ${
        canEditAvailability
          ? `
            <div class="settings-section availability-section">
              <h3>Moje dostupnost</h3>
              <div class="meta">Vyber pracovní dny a časy (platí každý týden).</div>
              <div class="availability-days">${dayCheckboxes}</div>
              <div class="availability-times">${timeCheckboxes}</div>
              <div class="actions-row">
                <button class="primary" id="availabilitySave">Uložit dostupnost</button>
              </div>
            </div>
          `
          : ''
      }
    </div>
  `);

  document.getElementById('closeModal').addEventListener('click', closeModal);

  let monthReservations = [];
  try {
    const data = await api.get(`/api/reservations?year=${year}&month=${month + 1}`);
    monthReservations = data.reservations || [];
  } catch (err) {
    monthReservations = [];
  }

  const listEl = document.getElementById('calendarReservations');
  const renderReservationList = (dateFilter = '') => {
    const filtered = dateFilter
      ? monthReservations.filter((item) => item.date === dateFilter)
      : monthReservations;
    if (!filtered.length) {
      listEl.innerHTML = '<div class="hint">Zatím žádné rezervace.</div>';
      return;
    }
    listEl.innerHTML = filtered
      .map(
        (item) => `
          <div class="settings-item">
            <span>${item.date} • ${item.time_slot} • ${item.service_name || 'Služba'} • ${item.client_name}${
          item.worker_name ? ` • ${item.worker_name}` : ''
        }</span>
            <span>${item.phone || item.email || ''}</span>
          </div>
        `
      )
      .join('');
  };

  renderReservationList();

  document.querySelectorAll('.calendar-day').forEach((cell) => {
    if (cell.classList.contains('empty')) return;
    cell.addEventListener('click', () => {
      document.querySelectorAll('.calendar-day').forEach((item) => item.classList.remove('selected'));
      cell.classList.add('selected');
      const day = cell.querySelector('.calendar-day-number')?.textContent;
      if (!day) {
        renderReservationList();
        return;
      }
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      renderReservationList(dateKey);
    });
  });

  if (canEditAvailability) {
    const data = await api.get('/api/availability');
    const daySet = new Set(data.days || []);
    const timeSet = new Set(data.times || []);
    document.querySelectorAll('.availability-day').forEach((input) => {
      input.checked = daySet.has(Number(input.value));
    });
    document.querySelectorAll('.availability-time').forEach((input) => {
      input.checked = timeSet.has(input.value);
    });

    document.getElementById('availabilitySave').addEventListener('click', async () => {
      const selectedDays = Array.from(document.querySelectorAll('.availability-day:checked')).map((input) =>
        Number(input.value)
      );
      const selectedTimes = Array.from(document.querySelectorAll('.availability-time:checked')).map(
        (input) => input.value
      );
      await api.post('/api/availability', {
        days: selectedDays,
        times: selectedTimes
      });
      alert('Dostupnost uložena.');
    });
  }
}

async function openEconomyModal() {
  const range = monthRange();
  const isAdmin = state.auth.user?.role === 'admin';
  const serviceOptions = '<option value="">Všechny služby</option>' + state.settings.services
    .map((service) => `<option value="${service.id}">${service.name}</option>`)
    .join('');
  const workerOptions = '<option value="">Všichni pracovníci</option>' + state.settings.workers
    .map((worker) => `<option value="${worker.id}">${worker.name}</option>`)
    .join('');
  openModal(`
    <div class="modal-header">
      <div>
        <h2>Ekonomika</h2>
        <div class="meta">Příjmy z ošetření + ručně zadané výdaje</div>
      </div>
      <button class="ghost" id="closeModal">Zavřít</button>
    </div>
    <div class="modal-grid">
      <div id="ecoSummary"></div>
      <div class="actions-row quick-ranges" id="ecoQuickRanges">
        <button class="ghost" data-range="month">Tento měsíc</button>
        <button class="ghost" data-range="prev-month">Minulý měsíc</button>
        <button class="ghost" data-range="quarter">Aktuální kvartál</button>
        <button class="ghost" data-range="prev-quarter">Minulý kvartál</button>
        <button class="ghost" data-range="year">Aktuální rok</button>
        <button class="ghost" data-range="prev-year">Minulý rok</button>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Od</label>
          <input type="date" id="ecoFrom" value="${range.from}" />
        </div>
        <div class="field">
          <label>Do</label>
          <input type="date" id="ecoTo" value="${range.to}" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Služba</label>
          <select id="ecoService">${serviceOptions}</select>
        </div>
        ${isAdmin
          ? `<div class="field">
              <label>Pracovník</label>
              <select id="ecoWorker">${workerOptions}</select>
            </div>`
          : ''}
      </div>
      <div class="actions-row">
        <button class="ghost" id="ecoFilter">Filtrovat</button>
      </div>
      <div class="settings-section">
        <h3>Přidat výdaj</h3>
        <div class="field-row">
          <div class="field">
            <label>Popis</label>
            <input type="text" id="expenseTitle" placeholder="Např. materiál" />
          </div>
          <div class="field">
            <label>Částka</label>
            <input type="number" id="expenseAmount" min="0" step="1" />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>DPH (%)</label>
            <input type="number" id="expenseVat" min="0" step="1" value="0" />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Datum</label>
            <input type="date" id="expenseDate" value="${todayLocal()}" />
          </div>
          <div class="field">
            <label>Poznámka</label>
            <input type="text" id="expenseNote" />
          </div>
        </div>
        <div class="actions-row">
          <button class="primary" id="expenseSave">Uložit výdaj</button>
        </div>
      </div>
      <div class="settings-section">
        <h3>Příjmy (ošetření)</h3>
        <div id="ecoVisits"></div>
      </div>
      ${isAdmin
        ? `<div class="settings-section">
            <h3>Podle uživatele</h3>
            <div id="ecoByWorker"></div>
          </div>`
        : ''}
      <div class="settings-section">
        <h3>Výdaje</h3>
        <div id="ecoExpenses"></div>
      </div>
    </div>
  `);

  const closeBtn = document.getElementById('closeModal');
  closeBtn.addEventListener('click', closeModal);

  function setRange(kind) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    let start;
    let end;

    if (kind === 'month') {
      start = new Date(year, month, 1);
      end = new Date(year, month + 1, 0);
    } else if (kind === 'prev-month') {
      start = new Date(year, month - 1, 1);
      end = new Date(year, month, 0);
    } else if (kind === 'quarter') {
      const quarterStart = Math.floor(month / 3) * 3;
      start = new Date(year, quarterStart, 1);
      end = new Date(year, quarterStart + 3, 0);
    } else if (kind === 'prev-quarter') {
      const quarterStart = Math.floor(month / 3) * 3;
      start = new Date(year, quarterStart - 3, 1);
      end = new Date(year, quarterStart, 0);
    } else if (kind === 'year') {
      start = new Date(year, 0, 1);
      end = new Date(year, 11, 31);
    } else if (kind === 'prev-year') {
      start = new Date(year - 1, 0, 1);
      end = new Date(year - 1, 11, 31);
    } else {
      return;
    }

    document.getElementById('ecoFrom').value = toLocalDateString(start);
    document.getElementById('ecoTo').value = toLocalDateString(end);
  }

  async function loadEconomy() {
    const from = document.getElementById('ecoFrom').value;
    const to = document.getElementById('ecoTo').value;
    const params = new URLSearchParams({ from, to });
    const serviceId = document.getElementById('ecoService')?.value;
    const workerId = isAdmin ? document.getElementById('ecoWorker')?.value : '';
    if (serviceId) params.set('service_id', serviceId);
    if (workerId) params.set('worker_id', workerId);
    const data = await api.get(`/api/economy?${params.toString()}`);
    const summary = document.getElementById('ecoSummary');
    let summaryHtml = `
      <div class="stats">
        <div><strong>Moje ekonomika</strong></div>
        <div>Tržba: <strong class="stat-income">${formatCzk(data.totals.income)}</strong></div>
        <div>Výdaje: <strong class="stat-expenses">${formatCzk(data.totals.expenses)}</strong></div>
        <div>Zisk: <strong class="stat-profit">${formatCzk(data.totals.profit)}</strong></div>
      </div>
    `;
    if (data.totals_all_income) {
      summaryHtml += `
        <div class="stats">
          <div><strong>Celkové příjmy (všichni)</strong></div>
          <div>Tržba: <strong class="stat-income">${formatCzk(data.totals_all_income)}</strong></div>
        </div>
      `;
    }
    summary.innerHTML = summaryHtml;

    const visits = document.getElementById('ecoVisits');
    if (!data.visits.length) {
      visits.innerHTML = '<div class="hint">V tomto období nejsou žádná ošetření.</div>';
    } else {
      visits.innerHTML = data.visits
        .map((visit) => `
          <div class="settings-item">
            <span>${visit.date} • ${visit.client_name || 'Klientka'} • ${visit.service_name || 'Služba'}${visit.treatment_name ? ` • ${visit.treatment_name}` : ''}${visit.worker_name ? ` • ${visit.worker_name}` : ''}</span>
            <span>${formatCzk(visit.total)}</span>
          </div>
        `)
        .join('');
    }

    const expenses = document.getElementById('ecoExpenses');
    if (!data.expenses.length) {
      expenses.innerHTML = '<div class="hint">V tomto období nejsou žádné výdaje.</div>';
    } else {
      expenses.innerHTML = data.expenses
        .map((expense) => `
          <div class="settings-item">
            <span>${expense.date} • ${expense.title}${expense.worker_name ? ` • ${expense.worker_name}` : ''}${expense.vat_rate ? ` • DPH ${expense.vat_rate}%` : ''}</span>
            <span>${formatCzk(expense.amount)}</span>
          </div>
        `)
        .join('');
    }

    const byWorker = document.getElementById('ecoByWorker');
    if (byWorker) {
      if (!data.by_worker || !data.by_worker.length) {
        byWorker.innerHTML = '<div class="hint">Zatím žádná data podle pracovníka.</div>';
      } else {
        byWorker.innerHTML = data.by_worker
          .map((row) => `
            <div class="settings-item">
              <span>${row.worker_name || 'Neurčeno'}</span>
              <span>${formatCzk(row.total)}</span>
            </div>
          `)
          .join('');
      }
    }
  }

  document.getElementById('ecoFilter').addEventListener('click', loadEconomy);
  document.querySelectorAll('#ecoQuickRanges button[data-range]').forEach((button) => {
    button.addEventListener('click', async () => {
      setRange(button.dataset.range);
      await loadEconomy();
    });
  });
  document.getElementById('expenseSave').addEventListener('click', async () => {
    const title = document.getElementById('expenseTitle').value.trim();
    const amount = document.getElementById('expenseAmount').value;
    if (!title || !amount) {
      alert('Vyplň popis a částku výdaje.');
      return;
    }
    const vatRate = document.getElementById('expenseVat').value || '0';
    await api.post('/api/expenses', {
      title,
      amount,
      vat_rate: vatRate,
      date: document.getElementById('expenseDate').value,
      note: document.getElementById('expenseNote').value.trim()
    });
    document.getElementById('expenseTitle').value = '';
    document.getElementById('expenseAmount').value = '';
    document.getElementById('expenseVat').value = '0';
    document.getElementById('expenseNote').value = '';
    await loadEconomy();
    await loadSummary();
  });

  await loadEconomy();
}


function settingsSectionTemplate({
  title,
  subtitle,
  formId,
  fields,
  listId
}) {
  return `
    <div class="settings-section" data-form="${formId}">
      <div class="panel-header">
        <div>
          <h3>${title}</h3>
          <div class="meta">${subtitle}</div>
        </div>
      </div>
      <div class="field-row">
        ${fields.join('')}
      </div>
      <div class="actions-row">
        <button class="ghost" data-action="reset">Nový</button>
        <button class="primary" data-action="save">Uložit</button>
      </div>
      <div class="settings-list" id="${listId}"></div>
    </div>
  `;
}

async function openServiceDetailModal(serviceId) {
  const service = state.settings.services.find((item) => item.id === serviceId);
  if (!service) return;

  openModal(`
    <div class="modal-header">
      <div>
        <h2>${service.name}</h2>
        <div class="meta">Nastavení vybrané služby.</div>
      </div>
      <div class="actions-row">
        <button class="ghost" id="backToSettings">Zpět</button>
        <button class="ghost" id="closeModal">Zavřít</button>
      </div>
    </div>
    <div class="modal-grid" id="serviceSettingsGrid">
      <div class="settings-section" data-service-edit>
        <div class="panel-header">
          <div>
            <h3>Základní údaje</h3>
            <div class="meta">Název a typ formuláře.</div>
          </div>
        </div>
      <div class="field-row">
        <div class="field">
          <label>Název</label>
          <input id="serviceEditName" type="text" />
        </div>
        <div class="field">
          <label>Formulář</label>
          <select id="serviceEditForm">
            <option value="cosmetic">Kosmetika (detailní)</option>
            <option value="generic">Obecný</option>
          </select>
        </div>
        <div class="field">
          <label>Délka (min)</label>
          <select id="serviceEditDuration">
            ${durationOptions().map((value) => `<option value="${value}">${value}</option>`).join('')}
          </select>
        </div>
      </div>
        <div class="actions-row">
          <button class="primary" id="serviceSave">Uložit službu</button>
        </div>
      </div>
      ${settingsSectionTemplate({
        title: 'Typy pleti',
        subtitle: 'Používá se v kartě klientky.',
        formId: 'skin',
        listId: 'skinList',
        fields: [
          '<div class="field"><label>Název</label><input type="text" data-field="name" placeholder="Např. Citlivá" /></div>'
        ]
      })}
      ${settingsSectionTemplate({
        title: 'Typy ošetření',
        subtitle: 'Název, cena a poznámka.',
        formId: 'treatments',
        listId: 'treatmentList',
        fields: [
          '<div class="field"><label>Název</label><input type="text" data-field="name" /></div>',
          '<div class="field"><label>Cena</label><input type="number" data-field="price" min="0" step="1" /></div>',
          '<div class="field"><label>Poznámka</label><input type="text" data-field="note" /></div>'
        ]
      })}
      ${settingsSectionTemplate({
        title: 'Příplatky',
        subtitle: 'Položky k ošetření.',
        formId: 'addons',
        listId: 'addonList',
        fields: [
          '<div class="field"><label>Název</label><input type="text" data-field="name" /></div>',
          '<div class="field"><label>Cena</label><input type="number" data-field="price" min="0" step="1" /></div>'
        ]
      })}
    </div>
  `);

  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('backToSettings').addEventListener('click', () => {
    openSettingsModal().catch(() => {});
  });

  const nameInput = document.getElementById('serviceEditName');
  const formSelect = document.getElementById('serviceEditForm');
  const durationSelect = document.getElementById('serviceEditDuration');
  nameInput.value = service.name || '';
  formSelect.value = service.form_type || 'generic';
  durationSelect.value = String(service.duration_minutes || 30);

  document.getElementById('serviceSave').addEventListener('click', async () => {
    const payload = {
      name: nameInput.value.trim(),
      form_type: formSelect.value,
      duration_minutes: durationSelect.value
    };
    if (!payload.name) {
      alert('Vyplň název služby.');
      return;
    }
    await api.put(`/api/services/${service.id}`, payload);
    await loadSettings();
    closeModal();
  });

  renderSettingsLists();
  wireSettingsForms();
}

async function openSettingsModal() {
  if (state.auth.user?.role === 'admin') {
    await loadUsers();
  }

  openModal(`
    <div class="modal-header">
      <div>
        <h2>Nastavení</h2>
        <div class="meta">Správa služeb a uživatelů.</div>
      </div>
      <button class="ghost" id="closeModal">Zavřít</button>
    </div>
    <div class="modal-grid" id="settingsGrid"></div>
  `);

  document.getElementById('closeModal').addEventListener('click', closeModal);

  const grid = document.getElementById('settingsGrid');
  const sections = [
    settingsSectionTemplate({
      title: 'Služby',
      subtitle: 'Hlavní služby pro výběr v kartě klientky.',
      formId: 'services',
      listId: 'serviceList',
      fields: [
        '<div class="field"><label>Název</label><input type="text" data-field="name" placeholder="Např. Kosmetika" /></div>',
        '<div class="field"><label>Formulář</label><select data-field="form_type"><option value="cosmetic">Kosmetika (detailní)</option><option value="generic">Obecný</option></select></div>',
        '<div class="field"><label>Délka (min)</label><select data-field="duration_minutes"><option value="30">30</option><option value="60">60</option><option value="90">90</option><option value="120">120</option><option value="150">150</option><option value="180">180</option></select></div>'
      ]
    })
  ];

  if (state.auth.user?.role === 'admin') {
    sections.push(
      settingsSectionTemplate({
        title: 'Uživatelé',
        subtitle: 'Přihlašovací účty a role.',
        formId: 'users',
        listId: 'userList',
        fields: [
          '<div class="field"><label>Jméno</label><input type="text" data-field="full_name" /></div>',
          '<div class="field"><label>Uživatelské jméno</label><input type="text" data-field="username" /></div>',
          '<div class="field"><label>Role</label><select data-field="role"><option value="worker">Pracovník</option><option value="reception">Recepční</option><option value="admin">Administrátor</option></select></div>',
          '<div class="field"><label>Heslo</label><input type="password" data-field="password" placeholder="Nové heslo" /></div>'
        ]
      })
    );
  }

  grid.innerHTML = sections.join('');

  renderSettingsLists();
  wireSettingsForms();
}

function renderSettingsLists() {
  const serviceList = document.getElementById('serviceList');
  if (serviceList) {
    serviceList.innerHTML = state.settings.services
      .map((item) => {
        const label = item.form_type === 'cosmetic' ? 'Kosmetika' : 'Obecný';
        const durationLabel = `${item.duration_minutes || 30} min`;
        return settingsItemTemplate(item, `${label} • ${durationLabel}`, 'services');
      })
      .join('');
  }

  const skinList = document.getElementById('skinList');
  if (skinList) {
    skinList.innerHTML = state.settings.skinTypes
      .map((item) => settingsItemTemplate(item, '', 'skin'))
      .join('');
  }

  const treatmentList = document.getElementById('treatmentList');
  if (treatmentList) {
    treatmentList.innerHTML = state.settings.treatments
      .map((item) => settingsItemTemplate(item, [formatCzk(item.price), item.note].filter(Boolean).join(' • '), 'treatments'))
      .join('');
  }

  const addonList = document.getElementById('addonList');
  if (addonList) {
    addonList.innerHTML = state.settings.addons
      .map((item) => settingsItemTemplate(item, formatCzk(item.price), 'addons'))
      .join('');
  }

  const userList = document.getElementById('userList');
  if (userList) {
    userList.innerHTML = state.users
      .map((user) => userItemTemplate(user))
      .join('');
  }

  document.querySelectorAll('.settings-item button[data-action="edit"]').forEach((button) => {
    if (button.dataset.section === 'users') {
      button.addEventListener('click', () => startEditUser(button.dataset.id));
    } else if (button.dataset.section === 'services') {
      button.addEventListener('click', () => openServiceDetailModal(button.dataset.id));
    } else {
      button.addEventListener('click', () => startEditSetting(button.dataset.section, button.dataset.id));
    }
  });
  document.querySelectorAll('.settings-item button[data-action="delete"]').forEach((button) => {
    if (button.dataset.section === 'users') {
      button.addEventListener('click', () => deleteUser(button.dataset.id));
    } else {
      button.addEventListener('click', () => deleteSetting(button.dataset.section, button.dataset.id));
    }
  });
}

function settingsItemTemplate(item, suffix = '', section = '') {
  return `
    <div class="settings-item">
      <span>${item.name}${suffix ? ` • ${suffix}` : ''}</span>
      <div class="settings-actions">
        <button class="ghost" data-action="edit" data-section="${section}" data-id="${item.id}">Upravit</button>
        <button class="ghost" data-action="delete" data-section="${section}" data-id="${item.id}">Smazat</button>
      </div>
    </div>
  `;
}

function userItemTemplate(user) {
  const roleLabel = user.role === 'admin' ? 'Administrátor' : user.role === 'reception' ? 'Recepční' : 'Pracovník';
  return `
    <div class="settings-item">
      <span>${user.full_name} • ${user.username} • ${roleLabel}</span>
      <div class="settings-actions">
        <button class="ghost" data-action="edit" data-section="users" data-id="${user.id}">Upravit</button>
        <button class="ghost" data-action="delete" data-section="users" data-id="${user.id}">Smazat</button>
      </div>
    </div>
  `;
}

function wireSettingsForms() {
  const sections = {
    services: {
      list: state.settings.services,
      resource: 'services'
    },
    skin: {
      list: state.settings.skinTypes,
      resource: 'skin-types'
    },
    treatments: {
      list: state.settings.treatments,
      resource: 'treatments'
    },
    addons: {
      list: state.settings.addons,
      resource: 'addons'
    }
  };

  if (state.auth.user?.role === 'admin') {
    sections.users = {
      list: state.users,
      resource: 'users'
    };
  }

  Object.entries(sections).forEach(([key, config]) => {
    const form = document.querySelector(`[data-form="${key}"]`);
    if (!form) return;
    form.dataset.editing = '';

    const saveButton = form.querySelector('button[data-action="save"]');
    const resetButton = form.querySelector('button[data-action="reset"]');

    saveButton.addEventListener('click', async () => {
      const payload = {};
      form.querySelectorAll('[data-field]').forEach((input) => {
        payload[input.dataset.field] = input.value.trim();
      });

      const id = form.dataset.editing;
      if (id) {
        await api.put(`/api/${config.resource}/${id}`, payload);
      } else {
        await api.post(`/api/${config.resource}`, payload);
      }

      await loadSettings();
      await openSettingsModal();
    });

    resetButton.addEventListener('click', () => {
      form.dataset.editing = '';
      form.querySelectorAll('[data-field]').forEach((input) => {
        if (input.tagName === 'SELECT') {
          input.value = input.querySelector('option')?.value || '';
        } else {
          input.value = '';
        }
      });
    });

  });
}

function startEditSetting(section, id) {
  const form = document.querySelector(`[data-form="${section}"]`);
  if (!form) return;

  const list =
    section === 'services'
      ? state.settings.services
      : section === 'skin'
      ? state.settings.skinTypes
      : section === 'treatments'
        ? state.settings.treatments
        : section === 'addons'
          ? state.settings.addons
          : [];

  const item = list.find((entry) => entry.id === id);
  if (!item) return;

  form.dataset.editing = id;
  form.querySelectorAll('[data-field]').forEach((input) => {
    const value = item[input.dataset.field] ?? '';
    input.value = value;
  });
}

function startEditUser(id) {
  const form = document.querySelector('[data-form="users"]');
  if (!form) return;

  const user = state.users.find((entry) => entry.id === id);
  if (!user) return;

  form.dataset.editing = id;
  form.querySelectorAll('[data-field]').forEach((input) => {
    if (input.dataset.field === 'password') {
      input.value = '';
      return;
    }
    const value = user[input.dataset.field] ?? '';
    input.value = value;
  });
}

async function deleteUser(id) {
  const confirmDelete = confirm('Opravdu smazat uživatele?');
  if (!confirmDelete) return;

  await api.del(`/api/users/${id}`);
  await loadUsers();
  await openSettingsModal();
}

async function deleteSetting(section, id) {
  const confirmDelete = confirm('Opravdu smazat položku?');
  if (!confirmDelete) return;

  const resource =
    section === 'services'
      ? 'services'
      : section === 'skin'
        ? 'skin-types'
      : section === 'treatments'
        ? 'treatments'
        : 'addons';

  await api.del(`/api/${resource}/${id}`);
  await loadSettings();
  await openSettingsModal();
}


function wireEvents() {
  dom.searchInput.addEventListener('input', debounce(loadClients));
  dom.btnNew.addEventListener('click', clearSelection);
  dom.btnCreateClient.addEventListener('click', () => createClient(false));
  dom.btnCreateClientAndService.addEventListener('click', () => createClient(true));
  dom.btnSave.addEventListener('click', saveClient);
  dom.btnAddVisit.addEventListener('click', addVisit);
  dom.btnAddGeneric.addEventListener('click', addGenericVisit);
  if (dom.btnToggleClient) {
    dom.btnToggleClient.addEventListener('click', () => {
      const isHidden = dom.clientDetails?.classList.contains('hidden');
      setClientDetailsOpen(isHidden);
    });
  }
  dom.btnSettings.addEventListener('click', () => {
    openSettingsModal().catch(() => {});
  });
  dom.btnEconomy.addEventListener('click', openEconomyModal);
  if (dom.btnCalendar) {
    dom.btnCalendar.addEventListener('click', openCalendarModal);
  }
  dom.btnLogout.addEventListener('click', handleLogout);
  dom.treatmentType.addEventListener('change', updatePricePreview);
  dom.manualTotal.addEventListener('input', updatePricePreview);
}

async function init() {
  dom.visitDate.value = todayLocal();
  setClientDetailsOpen(false);
  wireEvents();
  updateUserUi();
  startServerMonitor();
  await bootstrapAuth();
}

init();
