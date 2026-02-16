const dom = {
  searchInput: document.getElementById('searchInput'),
  brandTitle: document.getElementById('brandTitle'),
  brandLogo: document.getElementById('brandLogo'),
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
  serviceFormGeneric: document.getElementById('serviceFormGeneric'),
  genericSchemaFields: document.getElementById('genericSchemaFields'),
  genPrice: document.getElementById('genPrice'),
  genDate: document.getElementById('genDate'),
  genSchemaExtras: document.getElementById('genSchemaExtras'),
  genWorker: document.getElementById('genWorker'),
  genPaymentMethod: document.getElementById('genPaymentMethod'),
  genNote: document.getElementById('genNote'),
  visitsList: document.getElementById('visitsList'),
  btnNew: document.getElementById('btnNew'),
  btnSave: document.getElementById('btnSave'),
  btnAddGeneric: document.getElementById('btnAddGeneric'),
  btnSettings: document.getElementById('btnSettings'),
  btnEconomy: document.getElementById('btnEconomy'),
  btnCalendar: document.getElementById('btnCalendar'),
  btnBilling: document.getElementById('btnBilling'),
  btnNotifications: document.getElementById('btnNotifications'),
  btnLogout: document.getElementById('btnLogout'),
  serverStatus: document.getElementById('serverStatus'),
  serverDot: document.getElementById('serverDot'),
  buildInfo: document.getElementById('buildInfo'),
  userInfo: document.getElementById('userInfo'),
  authRoot: document.getElementById('authRoot'),
  modalRoot: document.getElementById('modalRoot')
};

const state = {
  tenant: null,
  ui: {
    settingsTab: 'services',
    clonesTab: 'clones'
  },
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
  clones: [],
  featureAccess: {
    tenant_id: null,
    catalog: [],
    plan: 'basic',
    overrides: {},
    effective: {}
  },
  featureMatrix: {
    features: [],
    tenants: []
  },
  selectedServiceId: null,
  selectedServiceSchema: null,
  selectedServiceSchemaJson: null,
  auth: {
    token: null,
    user: null,
    hasUsers: null
  }
};

const PRO_PREVIEW_MAP = {
  economy: {
    title: 'Ekonomika - náhled',
    description: 'Náhled funkcí PRO verze. V tomto režimu nejde nic upravovat ani ukládat.',
    images: [
      { src: '/previews/economy-1.svg', alt: 'Náhled ekonomiky 1', caption: 'Souhrn ekonomiky a grafy' },
      { src: '/previews/economy-2.svg', alt: 'Náhled ekonomiky 2', caption: 'Detail příjmů a výdajů' }
    ]
  },
  calendar: {
    title: 'Kalendář - náhled',
    description: 'Náhled funkcí PRO verze. V tomto režimu nejde nic upravovat ani ukládat.',
    images: [
      { src: '/previews/calendar-1.svg', alt: 'Náhled kalendáře 1', caption: 'Měsíční pohled rezervací' },
      { src: '/previews/calendar-2.svg', alt: 'Náhled kalendáře 2', caption: 'Rezervace a dostupnost' }
    ]
  },
  billing: {
    title: 'Fakturace - náhled',
    description: 'Náhled funkcí PRO verze. V tomto režimu nejde nic upravovat ani vystavit.',
    images: [
      { src: '/previews/billing-1.svg', alt: 'Náhled fakturace', caption: 'Přehled faktur a stavu plateb' }
    ]
  },
  notifications: {
    title: 'Notifikace - náhled',
    description: 'Náhled funkcí PRO verze. V tomto režimu nejde nic upravovat ani odesílat.',
    images: [
      { src: '/previews/notifications-1.svg', alt: 'Náhled notifikací', caption: 'Nastavení e-mail a SMS notifikací' }
    ]
  }
};

let handleUnauthorized = () => {};
let pendingTenantLogoData = null;

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

const SERVICE_FIELD_TYPES = new Set(['text', 'textarea', 'number', 'checkbox', 'select', 'multiselect', 'heading']);

function randomId(prefix = 'id') {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

function parseServiceSchemaJson(schemaJson) {
  const raw = (schemaJson || '').toString().trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const fields = Array.isArray(parsed.fields) ? parsed.fields : [];
    const normalizedFields = fields
      .map((field) => ({
        id: (field.id || '').toString().trim(),
        type: (field.type || '').toString().trim(),
        label: (field.label || '').toString().trim(),
        required: field.required === true || field.required === 1 || field.required === '1',
        price_delta: Number(field.price_delta) || 0,
        options: Array.isArray(field.options) ? field.options : []
      }))
      .filter((field) => field.id && field.label && SERVICE_FIELD_TYPES.has(field.type));

    normalizedFields.forEach((field) => {
      if (field.type === 'select' || field.type === 'multiselect') {
        field.options = field.options
          .map((opt) => ({
            id: (opt.id || '').toString().trim(),
            label: (opt.label || '').toString().trim(),
            price_delta: Number(opt.price_delta) || 0
          }))
          .filter((opt) => opt.id && opt.label);
      } else {
        field.options = [];
      }
    });

    return { version: 1, fields: normalizedFields };
  } catch (err) {
    return null;
  }
}

function collectSchemaValues(container, schema) {
  const values = {};
  if (!container || !schema || !Array.isArray(schema.fields)) return values;

  schema.fields.forEach((field) => {
    if (field.type === 'heading') return;
    const selector = `[data-schema-field="${CSS.escape(field.id)}"]`;
    const input = container.querySelector(selector);

    if (field.type === 'checkbox') {
      values[field.id] = Boolean(input && input.checked);
      return;
    }

    if (field.type === 'multiselect') {
      const checks = Array.from(container.querySelectorAll(`[data-schema-field="${CSS.escape(field.id)}"][data-schema-option]`));
      values[field.id] = checks.filter((item) => item.checked).map((item) => item.dataset.schemaOption);
      return;
    }

    if (!input) return;

    if (field.type === 'number') {
      const raw = input.value === '' ? null : Number(input.value);
      if (raw !== null && Number.isFinite(raw)) {
        values[field.id] = raw;
      }
      return;
    }

    values[field.id] = input.value;
  });

  return values;
}

function computeSchemaExtras(schema, values) {
  if (!schema || !Array.isArray(schema.fields)) return 0;
  let total = 0;
  schema.fields.forEach((field) => {
    if (field.type === 'checkbox') {
      if (values[field.id]) total += Number(field.price_delta) || 0;
      return;
    }
    if (field.type === 'select') {
      const selected = values[field.id];
      const option = (field.options || []).find((opt) => opt.id === selected);
      if (option) total += Number(option.price_delta) || 0;
      return;
    }
    if (field.type === 'multiselect') {
      const selected = Array.isArray(values[field.id]) ? values[field.id] : [];
      const optionMap = new Map((field.options || []).map((opt) => [opt.id, opt]));
      selected.forEach((id) => {
        const option = optionMap.get(id);
        if (option) total += Number(option.price_delta) || 0;
      });
    }
  });
  return total;
}

function formatSignedCzk(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return '';
  const abs = Math.abs(numeric);
  const formatted = `${abs.toLocaleString('cs-CZ')} Kč`;
  return numeric > 0 ? `+${formatted}` : `-${formatted}`;
}

function renderSchemaFields(container, schema, onChange) {
  if (!container) return;
  container.innerHTML = '';
  if (!schema || !Array.isArray(schema.fields) || !schema.fields.length) return;

  const title = document.createElement('div');
  title.className = 'custom-title';
  title.textContent = 'Doplňující údaje';
  container.appendChild(title);

  schema.fields.forEach((field) => {
    if (field.type === 'heading') {
      const heading = document.createElement('div');
      heading.className = 'custom-title';
      heading.textContent = field.label;
      container.appendChild(heading);
      return;
    }

    if (field.type === 'checkbox') {
      const row = document.createElement('div');
      row.className = 'custom-field-inline';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.schemaField = field.id;

      const label = document.createElement('label');
      const price = formatSignedCzk(field.price_delta);
      label.textContent = price ? `${field.label} (${price})` : field.label;

      input.addEventListener('change', () => onChange && onChange());

      row.appendChild(input);
      row.appendChild(label);
      container.appendChild(row);
      return;
    }

    if (field.type === 'multiselect') {
      const wrapper = document.createElement('div');
      wrapper.className = 'field';

      const label = document.createElement('label');
      label.textContent = field.label;
      wrapper.appendChild(label);

      const list = document.createElement('div');
      list.className = 'addon-list';
      (field.options || []).forEach((opt) => {
        const item = document.createElement('label');
        item.className = 'addon-item';
        const left = document.createElement('span');
        const price = formatSignedCzk(opt.price_delta);
        left.textContent = price ? `${opt.label} (${price})` : opt.label;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.schemaField = field.id;
        checkbox.dataset.schemaOption = opt.id;
        checkbox.addEventListener('change', () => onChange && onChange());
        item.appendChild(left);
        item.appendChild(checkbox);
        list.appendChild(item);
      });
      wrapper.appendChild(list);
      container.appendChild(wrapper);
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'field';

    const label = document.createElement('label');
    label.textContent = field.label;
    wrapper.appendChild(label);

    if (field.type === 'textarea') {
      const textarea = document.createElement('textarea');
      textarea.rows = 3;
      textarea.dataset.schemaField = field.id;
      textarea.addEventListener('input', () => onChange && onChange());
      wrapper.appendChild(textarea);
      container.appendChild(wrapper);
      return;
    }

    if (field.type === 'select') {
      const select = document.createElement('select');
      select.dataset.schemaField = field.id;
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = '—';
      select.appendChild(empty);
      (field.options || []).forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt.id;
        const price = formatSignedCzk(opt.price_delta);
        option.textContent = price ? `${opt.label} (${price})` : opt.label;
        select.appendChild(option);
      });
      select.addEventListener('change', () => onChange && onChange());
      wrapper.appendChild(select);
      container.appendChild(wrapper);
      return;
    }

    const input = document.createElement('input');
    input.type = field.type === 'number' ? 'number' : 'text';
    if (field.type === 'number') {
      input.step = '1';
    }
    input.dataset.schemaField = field.id;
    input.addEventListener('input', () => onChange && onChange());
    wrapper.appendChild(input);
    container.appendChild(wrapper);
  });
}

function removeDiacritics(value) {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function slugifySchemaId(value) {
  const ascii = removeDiacritics(value).toLowerCase();
  const slug = ascii
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug;
}

function ensureUniqueSchemaId(fields, baseId) {
  const used = new Set((fields || []).map((field) => field.id));
  const base = baseId || '';
  if (base && !used.has(base)) return base;
  const fallback = base || 'pole';
  let counter = 2;
  let id = `${fallback}-${counter}`;
  while (used.has(id) && counter < 99) {
    counter += 1;
    id = `${fallback}-${counter}`;
  }
  return used.has(id) ? randomId('pole') : id;
}

function serviceSchemaFieldTypeOptions() {
  return [
    { value: 'text', label: 'Text' },
    { value: 'textarea', label: 'Text (více řádků)' },
    { value: 'number', label: 'Číslo' },
    { value: 'checkbox', label: 'Zaškrtávací políčko (+cena)' },
    { value: 'select', label: 'Výběr (1 možnost)' },
    { value: 'multiselect', label: 'Výběr (více možností)' },
    { value: 'heading', label: 'Nadpis / oddělovač' }
  ];
}

function normalizeSchemaDraft(schema) {
  if (!schema || !Array.isArray(schema.fields)) return { version: 1, fields: [] };
  return {
    version: 1,
    fields: schema.fields.map((field) => ({
      id: (field.id || '').toString().trim(),
      type: SERVICE_FIELD_TYPES.has(field.type) ? field.type : 'text',
      label: (field.label || '').toString().trim(),
      required: field.required === true || field.required === 1 || field.required === '1',
      price_delta: Number(field.price_delta) || 0,
      options: Array.isArray(field.options) ? field.options.map((opt) => ({
        id: (opt.id || '').toString().trim(),
        label: (opt.label || '').toString().trim(),
        price_delta: Number(opt.price_delta) || 0
      })) : []
    }))
  };
}

function renderSchemaBuilder(container, schemaDraft, onChange) {
  if (!container) return;
  container.innerHTML = '';

  const fields = schemaDraft?.fields || [];
  if (!fields.length) {
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Zatím nejsou přidaná žádná vlastní pole.';
    container.appendChild(hint);
    return;
  }

  fields.forEach((field, index) => {
    const card = document.createElement('div');
    card.className = 'schema-field-card';

    const rowTop = document.createElement('div');
    rowTop.className = 'field-row';

    const labelWrap = document.createElement('div');
    labelWrap.className = 'field';
    const labelLabel = document.createElement('label');
    labelLabel.textContent = 'Popis';
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = field.label || '';
    labelInput.addEventListener('input', () => {
      field.label = labelInput.value;
      if (!field.id) {
        field.id = ensureUniqueSchemaId(fields, slugifySchemaId(field.label));
      }
      onChange && onChange();
    });
    labelWrap.appendChild(labelLabel);
    labelWrap.appendChild(labelInput);

    const typeWrap = document.createElement('div');
    typeWrap.className = 'field';
    const typeLabel = document.createElement('label');
    typeLabel.textContent = 'Typ';
    const typeSelect = document.createElement('select');
    serviceSchemaFieldTypeOptions().forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      typeSelect.appendChild(option);
    });
    typeSelect.value = field.type || 'text';
    typeSelect.addEventListener('change', () => {
      field.type = typeSelect.value;
      if (field.type !== 'checkbox') {
        field.price_delta = 0;
      }
      if (field.type === 'select' || field.type === 'multiselect') {
        if (!Array.isArray(field.options) || !field.options.length) {
          field.options = [
            { id: 'a', label: 'Možnost A', price_delta: 0 },
            { id: 'b', label: 'Možnost B', price_delta: 0 }
          ];
        }
      } else {
        field.options = [];
      }
      onChange && onChange(true);
    });
    typeWrap.appendChild(typeLabel);
    typeWrap.appendChild(typeSelect);

    rowTop.appendChild(labelWrap);
    rowTop.appendChild(typeWrap);

    const rowMeta = document.createElement('div');
    rowMeta.className = 'field-row';

    const reqWrap = document.createElement('div');
    reqWrap.className = 'field';
    const reqLabel = document.createElement('label');
    reqLabel.textContent = 'Povinné';
    const reqSelect = document.createElement('select');
    reqSelect.innerHTML = '<option value="0">Ne</option><option value="1">Ano</option>';
    reqSelect.value = field.required ? '1' : '0';
    reqSelect.addEventListener('change', () => {
      field.required = reqSelect.value === '1';
      onChange && onChange();
    });
    reqWrap.appendChild(reqLabel);
    reqWrap.appendChild(reqSelect);

    const priceWrap = document.createElement('div');
    priceWrap.className = 'field';
    const priceLabel = document.createElement('label');
    priceLabel.textContent = 'Příplatek (Kč)';
    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.step = '1';
    priceInput.min = '0';
    priceInput.value = String(field.price_delta || 0);
    priceInput.disabled = field.type !== 'checkbox';
    priceInput.addEventListener('input', () => {
      field.price_delta = priceInput.value === '' ? 0 : Number(priceInput.value) || 0;
      onChange && onChange();
    });
    priceWrap.appendChild(priceLabel);
    priceWrap.appendChild(priceInput);

    rowMeta.appendChild(reqWrap);
    rowMeta.appendChild(priceWrap);

    card.appendChild(rowTop);
    card.appendChild(rowMeta);

    if (field.type === 'select' || field.type === 'multiselect') {
      const optionsWrap = document.createElement('div');
      optionsWrap.className = 'schema-options';

      const optionTitle = document.createElement('div');
      optionTitle.className = 'custom-title';
      optionTitle.textContent = 'Možnosti (s příplatkem)';
      optionsWrap.appendChild(optionTitle);

      const options = Array.isArray(field.options) ? field.options : [];
      options.forEach((opt) => {
        const row = document.createElement('div');
        row.className = 'schema-option-row';

        const optLabelWrap = document.createElement('div');
        optLabelWrap.className = 'field';
        const optLabel = document.createElement('label');
        optLabel.textContent = 'Název';
        const optInput = document.createElement('input');
        optInput.type = 'text';
        optInput.value = opt.label || '';
        optInput.addEventListener('input', () => {
          opt.label = optInput.value;
          if (!opt.id) {
            opt.id = slugifySchemaId(opt.label) || randomId('opt');
          }
          onChange && onChange();
        });
        optLabelWrap.appendChild(optLabel);
        optLabelWrap.appendChild(optInput);

        const optPriceWrap = document.createElement('div');
        optPriceWrap.className = 'field';
        const optPriceLabel = document.createElement('label');
        optPriceLabel.textContent = 'Příplatek (Kč)';
        const optPriceInput = document.createElement('input');
        optPriceInput.type = 'number';
        optPriceInput.step = '1';
        optPriceInput.value = String(opt.price_delta || 0);
        optPriceInput.addEventListener('input', () => {
          opt.price_delta = optPriceInput.value === '' ? 0 : Number(optPriceInput.value) || 0;
          onChange && onChange();
        });
        optPriceWrap.appendChild(optPriceLabel);
        optPriceWrap.appendChild(optPriceInput);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'ghost';
        delBtn.textContent = 'Smazat';
        delBtn.addEventListener('click', () => {
          field.options = (field.options || []).filter((item) => item !== opt);
          onChange && onChange(true);
        });

        row.appendChild(optLabelWrap);
        row.appendChild(optPriceWrap);
        row.appendChild(delBtn);
        optionsWrap.appendChild(row);
      });

      const addOptionBtn = document.createElement('button');
      addOptionBtn.type = 'button';
      addOptionBtn.className = 'ghost';
      addOptionBtn.textContent = 'Přidat možnost';
      addOptionBtn.addEventListener('click', () => {
        const nextLabel = `Možnost ${String.fromCharCode(65 + (field.options || []).length)}`;
        const nextId = ensureUniqueSchemaId(field.options || [], slugifySchemaId(nextLabel) || 'opt');
        field.options = [...(field.options || []), { id: nextId, label: nextLabel, price_delta: 0 }];
        onChange && onChange(true);
      });
      optionsWrap.appendChild(addOptionBtn);

      card.appendChild(optionsWrap);
    }

    const actions = document.createElement('div');
    actions.className = 'schema-field-actions';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'ghost';
    upBtn.textContent = 'Nahoru';
    upBtn.disabled = index === 0;
    upBtn.addEventListener('click', () => {
      if (index <= 0) return;
      const copy = [...fields];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      schemaDraft.fields = copy;
      onChange && onChange(true);
    });

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'ghost';
    downBtn.textContent = 'Dolů';
    downBtn.disabled = index === fields.length - 1;
    downBtn.addEventListener('click', () => {
      if (index >= fields.length - 1) return;
      const copy = [...fields];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      schemaDraft.fields = copy;
      onChange && onChange(true);
    });

    const delFieldBtn = document.createElement('button');
    delFieldBtn.type = 'button';
    delFieldBtn.className = 'ghost';
    delFieldBtn.textContent = 'Smazat pole';
    delFieldBtn.addEventListener('click', () => {
      schemaDraft.fields = fields.filter((item) => item !== field);
      onChange && onChange(true);
    });

    actions.appendChild(upBtn);
    actions.appendChild(downBtn);
    actions.appendChild(delFieldBtn);
    card.appendChild(actions);

    container.appendChild(card);
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function recurringTypeLabel(value) {
  const map = {
    none: 'Jednorázově',
    weekly: 'Týdenně',
    monthly: 'Měsíčně',
    quarterly: 'Kvartálně',
    yearly: 'Ročně'
  };
  return map[(value || 'none').toString().toLowerCase()] || 'Jednorázově';
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

function formatBuildDateTime(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function setBuildInfo(healthData) {
  if (!dom.buildInfo) return;
  const version = (healthData?.version || '').toString().trim();
  const deployedAt = formatBuildDateTime(healthData?.deployed_at);
  const versionLabel = version ? `ver. ${version}` : 'ver. —';
  dom.buildInfo.textContent = deployedAt ? `${versionLabel} • ${deployedAt}` : versionLabel;
}

async function checkServer() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch('/api/health', { signal: controller.signal });
    clearTimeout(timeout);
    const healthData = response.ok ? await response.json().catch(() => null) : null;
    if (healthData) {
      setBuildInfo(healthData);
    }
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

function resolveBrandTitle() {
  if (state.tenant?.slug === 'default') return 'softmax.cz';
  return state.tenant?.name || 'Kartotéka';
}

function renderBrand() {
  const title = resolveBrandTitle();
  const logoData = state.tenant?.logo_data || null;

  if (dom.brandLogo) {
    if (logoData) {
      dom.brandLogo.src = logoData;
      dom.brandLogo.classList.remove('hidden');
    } else {
      dom.brandLogo.removeAttribute('src');
      dom.brandLogo.classList.add('hidden');
    }
  }

  if (dom.brandTitle) {
    dom.brandTitle.textContent = title;
    dom.brandTitle.classList.toggle('hidden', !!logoData);
  }

  document.title = title;
}

function updateUserUi() {
  if (state.auth.user) {
    const roleLabel =
      state.auth.user.role === 'admin'
        ? 'Administrátor'
        : state.auth.user.role === 'reception'
          ? 'Recepční'
          : 'Pracovník';
    const superLabel = state.auth.user.is_superadmin ? ' • Super admin' : '';
    dom.userInfo.textContent = `${state.auth.user.full_name} • ${roleLabel}${superLabel}`;
  } else {
    dom.userInfo.textContent = '';
  }

  const isAdmin = state.auth.user?.role === 'admin';
  const isWorker = state.auth.user?.role === 'worker';
  const isReception = state.auth.user?.role === 'reception';
  dom.btnSettings.classList.toggle('hidden', !isAdmin);
  const canEconomy = (isAdmin || isWorker) && isFeatureEnabled('economy');
  const canCalendar = !!state.auth.user && isFeatureEnabled('calendar');
  const canBilling = !!state.auth.user && isFeatureEnabled('billing');
  const canNotifications = !!state.auth.user && isFeatureEnabled('notifications');

  dom.btnEconomy.classList.toggle('hidden', !canEconomy || isReception);
  dom.btnCalendar.classList.toggle('hidden', !canCalendar);
  dom.btnBilling.classList.toggle('hidden', !canBilling);
  dom.btnNotifications.classList.toggle('hidden', !canNotifications);
  dom.summaryStats.classList.toggle('hidden', !isAdmin);
  dom.btnLogout.classList.toggle('hidden', !state.auth.user);
  [dom.btnEconomy, dom.btnCalendar, dom.btnBilling, dom.btnNotifications].forEach((button) => {
    if (!button) return;
    button.classList.remove('pro-locked');
  });
}

function isFeatureEnabled(featureKey) {
  return !!state.featureAccess?.effective?.[featureKey];
}

function openProPreviewModal(featureKey) {
  const preview = PRO_PREVIEW_MAP[featureKey] || PRO_PREVIEW_MAP.economy;
  const gallery = (preview.images || [])
    .map(
      (image) => `
        <figure class="preview-card">
          <img src="${image.src}" alt="${image.alt}" loading="lazy" />
          ${image.caption ? `<figcaption>${image.caption}</figcaption>` : ''}
        </figure>
      `
    )
    .join('');

  openModal(`
    <div class="modal-header">
      <div>
        <h2>${preview.title}</h2>
        <div class="meta">${preview.description}</div>
      </div>
      <button class="ghost" id="closeModal">Zavřít</button>
    </div>
    <div class="modal-grid">
      <div class="preview-note">Klient vidí pouze obrázkový náhled. Funkce jsou aktivní jen v PRO verzi.</div>
      <div class="preview-gallery">${gallery}</div>
    </div>
  `);

  document.getElementById('closeModal').addEventListener('click', closeModal);
}

async function runProFeature(featureKey, openFeature) {
  if (isFeatureEnabled(featureKey)) {
    await openFeature();
    return;
  }
  openProPreviewModal(featureKey);
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
  await loadFeatureAccess();
  updateUserUi();
  await loadSettings();
  await loadClones();
  await loadFeatureMatrix();
  await loadClients();
  await loadSummary();
  clearSelection();
  updateGenericPricePreview();
}

async function loadFeatureAccess() {
  if (!state.auth.user) {
    state.featureAccess = {
      tenant_id: null,
      catalog: [],
      plan: 'basic',
      overrides: {},
      effective: {}
    };
    return;
  }
  const data = await api.get('/api/features');
  state.featureAccess = {
    tenant_id: data.tenant_id || null,
    catalog: data.catalog || [],
    plan: data.plan || 'basic',
    overrides: data.overrides || {},
    effective: data.effective || {}
  };
}

async function loadFeatureMatrix() {
  if (state.auth.user?.role !== 'admin' || !state.auth.user?.is_superadmin) {
    state.featureMatrix = { features: [], tenants: [] };
    return;
  }
  const data = await api.get('/api/admin/feature-matrix');
  state.featureMatrix = {
    features: data.features || [],
    tenants: data.tenants || []
  };
}

async function bootstrapAuth() {
  const bootstrap = await api.get('/api/bootstrap');
  state.auth.hasUsers = bootstrap.has_users;
  state.tenant = bootstrap.tenant || null;
  renderBrand();

  const storedToken = localStorage.getItem('kartoteka_token');
  if (bootstrap.has_users && storedToken) {
    try {
      const me = await api.get('/api/me');
      state.auth.user = me.user;
      setAuthToken(storedToken);
      state.tenant = me.tenant || state.tenant;
      renderBrand();
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

async function loadClones() {
  if (state.auth.user?.role !== 'admin' || !state.auth.user?.is_superadmin) {
    state.clones = [];
    return;
  }
  const data = await api.get('/api/clones');
  state.clones = data.clones || [];
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

  const workerOptions = '<option value="">—</option>' + state.settings.workers
    .map((item) => `<option value="${item.id}">${item.name}</option>`)
    .join('');
  dom.genWorker.innerHTML = workerOptions;
  applyDefaultWorker(dom.genWorker);
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

function closeAllServiceParentMenus() {
  if (!dom.servicePicker) return;
  dom.servicePicker.querySelectorAll('.service-dropdown-wrap.open').forEach((wrapper) => {
    wrapper.classList.remove('open');
    const toggle = wrapper.querySelector('[data-service-parent-toggle]');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
}

function renderServiceButtons(autoSelect = false) {
  if (!dom.servicePicker) return;
  if (!state.settings.services.length) {
    dom.servicePicker.innerHTML = '<div class="hint">V nastavení zatím nejsou žádné služby.</div>';
    dom.serviceFormGeneric.classList.add('hidden');
    return;
  }

  const services = Array.isArray(state.settings.services) ? state.settings.services : [];
  const parentIds = new Set(services.filter((s) => s.parent_id).map((s) => String(s.parent_id)));

  if (
    state.selectedServiceId &&
    (!services.find((item) => item.id === state.selectedServiceId) || parentIds.has(String(state.selectedServiceId)))
  ) {
    state.selectedServiceId = null;
  }

  const collator = new Intl.Collator('cs', { sensitivity: 'base' });
  const childrenByParent = new Map();
  const serviceById = new Map();
  services.forEach((service) => {
    serviceById.set(String(service.id), service);
    const key = service.parent_id ? String(service.parent_id) : '';
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(service);
  });
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => collator.compare(a.name || '', b.name || ''));
  }

  const collectLeafDescendants = (parentId) => {
    const list = childrenByParent.get(String(parentId)) || [];
    const leaves = [];
    list.forEach((service) => {
      if (parentIds.has(String(service.id))) {
        leaves.push(...collectLeafDescendants(service.id));
      } else {
        leaves.push(service);
      }
    });
    return leaves;
  };

  const findTopParentId = (serviceId) => {
    let cursor = serviceById.get(String(serviceId));
    let parentId = '';
    while (cursor && cursor.parent_id) {
      parentId = String(cursor.parent_id);
      cursor = serviceById.get(String(cursor.parent_id));
    }
    return parentId;
  };

  const selectedTopParentId = state.selectedServiceId ? findTopParentId(state.selectedServiceId) : '';

  const renderTree = (parentKey) => {
    const list = childrenByParent.get(parentKey) || [];
    return list
      .map((service) => {
        const hasChildren = parentIds.has(String(service.id));
        if (hasChildren) {
          const leafChildren = collectLeafDescendants(service.id);
          const childrenHtml = leafChildren
            .map((child) => {
              const active = child.id === state.selectedServiceId ? 'active' : '';
              return `<button type="button" class="service-button service-submenu-option ${active}" data-id="${child.id}">${escapeHtml(child.name)}</button>`;
            })
            .join('');
          const parentActive = selectedTopParentId === String(service.id) ? 'active' : '';
          return `
            <div class="service-dropdown-wrap" data-parent-id="${service.id}">
              <button type="button" class="service-button service-parent-toggle ${parentActive}" data-service-parent-toggle="${service.id}" aria-expanded="false">
                <span class="service-dropdown-label">${escapeHtml(service.name)}</span>
                <span class="service-dropdown-chevron" aria-hidden="true">▾</span>
              </button>
              <div class="service-dropdown-children">
                ${childrenHtml}
              </div>
            </div>
          `;
        }
        const active = service.id === state.selectedServiceId ? 'active' : '';
        return `<button type="button" class="service-button ${active}" data-id="${service.id}">${escapeHtml(service.name)}</button>`;
      })
      .join('');
  };

  dom.servicePicker.innerHTML = renderTree('');

  dom.servicePicker.querySelectorAll('.service-button').forEach((button) => {
    if (button.dataset.serviceParentToggle) {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const wrapper = button.closest('.service-dropdown-wrap');
        if (!wrapper) return;
        const willOpen = !wrapper.classList.contains('open');
        closeAllServiceParentMenus();
        if (willOpen) {
          wrapper.classList.add('open');
          button.setAttribute('aria-expanded', 'true');
        }
      });
      return;
    }
    if (!button.dataset.id) return;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      selectService(button.dataset.id);
      closeAllServiceParentMenus();
    });
  });

  if (autoSelect && !state.selectedServiceId) {
    const findFirstLeaf = (parentKey) => {
      const list = childrenByParent.get(parentKey) || [];
      for (const service of list) {
        if (parentIds.has(String(service.id))) {
          const nested = findFirstLeaf(String(service.id));
          if (nested) return nested;
          continue;
        }
        return service;
      }
      return null;
    };
    const firstLeaf = findFirstLeaf('');
    if (firstLeaf) {
      selectService(firstLeaf.id);
    }
  } else if (state.selectedServiceId) {
    selectService(state.selectedServiceId);
  } else {
    dom.serviceFormGeneric.classList.add('hidden');
  }
}

function selectService(id) {
  const previous = state.selectedServiceId;
  state.selectedServiceId = id;
  const service = state.settings.services.find((item) => item.id === id);
  if (!service) return;
  const schemaJson = (service.form_schema_json || '').toString();
  const schemaChanged = schemaJson !== (state.selectedServiceSchemaJson || '');
  state.selectedServiceSchemaJson = schemaJson;
  state.selectedServiceSchema = parseServiceSchemaJson(schemaJson);

  dom.servicePicker.querySelectorAll('.service-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.id === id);
  });

  dom.serviceFormGeneric.classList.remove('hidden');

  if (previous !== id || schemaChanged) {
    resetVisitFields();
  } else {
    renderActiveSchemaFields();
    updateGenericPricePreview();
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
  dom.genPrice.value = '';
  dom.genDate.value = todayLocal();
  dom.genWorker.value = getDefaultWorkerId();
  dom.genPaymentMethod.value = 'cash';
  dom.genNote.value = '';
  if (dom.genericSchemaFields) {
    dom.genericSchemaFields.innerHTML = '';
  }
  dom.genSchemaExtras.value = '';
  renderActiveSchemaFields();
  updateGenericPricePreview();
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

function updateGenericPricePreview() {
  const schemaValues = collectSchemaValues(dom.genericSchemaFields, state.selectedServiceSchema);
  const schemaPrice = computeSchemaExtras(state.selectedServiceSchema, schemaValues);
  dom.genSchemaExtras.value = formatCzk(schemaPrice);

  // "Celkem (ručně)" je finální cena. Pokud není vyplněná a karta dává cenu, předvyplníme ji.
  if (dom.genPrice.value === '' && schemaPrice > 0) {
    dom.genPrice.value = String(schemaPrice);
  }
}

function renderActiveSchemaFields() {
  const schema = state.selectedServiceSchema;
  renderSchemaFields(dom.genericSchemaFields, schema, updateGenericPricePreview);
}

async function addGenericVisit() {
  if (!state.selectedServiceId) {
    alert('Vyber službu.');
    return;
  }

  const service = state.settings.services.find((item) => item.id === state.selectedServiceId);
  if (!service) {
    alert('Vybraná služba neexistuje.');
    return;
  }

  const clientId = await saveClient();
  if (!clientId) return;

  if (!dom.genWorker.value) {
    alert('Vyber pracovníka pro ekonomiku.');
    return;
  }

  const schemaHasFields = !!(state.selectedServiceSchema && Array.isArray(state.selectedServiceSchema.fields) && state.selectedServiceSchema.fields.length);
  const schemaData = schemaHasFields ? collectSchemaValues(dom.genericSchemaFields, state.selectedServiceSchema) : {};
  const schemaPrice = computeSchemaExtras(state.selectedServiceSchema, schemaData);

  if (!dom.genPrice.value) {
    if (schemaPrice > 0) {
      dom.genPrice.value = String(schemaPrice);
    } else {
      alert('Vyplň cenu služby.');
      return;
    }
  }

  await api.post(`/api/clients/${clientId}/visits`, {
    date: dom.genDate.value || todayLocal(),
    service_id: state.selectedServiceId,
    manual_total: dom.genPrice.value,
    note: dom.genNote.value.trim(),
    worker_id: dom.genWorker.value,
    payment_method: dom.genPaymentMethod.value,
    service_data: schemaData
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
            <label>Hodnota výdaje</label>
            <input type="number" id="expenseAmount" min="0" step="1" />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>DPH (%)</label>
            <input type="number" id="expenseVat" min="0" step="1" value="0" />
          </div>
          <div class="field">
            <label>Opakování</label>
            <select id="expenseRecurring">
              <option value="none">Jednorázově</option>
              <option value="weekly">Týdenní</option>
              <option value="monthly">Měsíční</option>
              <option value="quarterly">Kvartální</option>
              <option value="yearly">Roční</option>
            </select>
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

  function economyDonutHtml(totals) {
    const income = Math.max(0, Number(totals?.income) || 0);
    const expenses = Math.max(0, Number(totals?.expenses) || 0);
    const profitValue = Number(totals?.profit) || 0;
    const basis = income + expenses;
    const incomePct = basis > 0 ? (income / basis) * 100 : 0;
    const expensesPct = basis > 0 ? (expenses / basis) * 100 : 0;
    const profitPct = income > 0 ? (profitValue / income) * 100 : 0;
    const radius = 44;
    const circumference = 2 * Math.PI * radius;
    const incomeLen = (incomePct / 100) * circumference;
    const expensesLen = (expensesPct / 100) * circumference;
    const profit = profitValue.toLocaleString('cs-CZ');
    const profitPctText = `${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(1)} %`;

    return `
      <div class="eco-card">
        <div class="eco-card-title">Moje ekonomika</div>
        <div class="eco-donut-wrap">
          <svg class="eco-donut" viewBox="0 0 120 120" aria-hidden="true">
            <circle class="eco-donut-track" cx="60" cy="60" r="${radius}" />
            <circle class="eco-donut-income" cx="60" cy="60" r="${radius}"
              style="stroke-dasharray:${incomeLen} ${circumference};stroke-dashoffset:0;" />
            <circle class="eco-donut-expenses" cx="60" cy="60" r="${radius}"
              style="stroke-dasharray:${expensesLen} ${circumference};stroke-dashoffset:-${incomeLen};" />
          </svg>
          <div class="eco-donut-center">
            <div class="eco-donut-label">Zisk</div>
            <div class="eco-donut-value">${profit} Kč</div>
            <div class="eco-donut-value">${profitPctText}</div>
          </div>
        </div>
      </div>
    `;
  }

  function trendHtml(rows, incomeValue, incomeLabel) {
    const series = Array.isArray(rows) ? rows : [];
    const values = series.map((item) => Number(item.total) || 0);
    const first = values[0] || 0;
    const last = values[values.length - 1] || 0;
    const diff = last - first;
    const pct = first > 0 ? (diff / first) * 100 : (last > 0 ? 100 : 0);
    const arrow = diff > 0 ? '↗' : diff < 0 ? '↘' : '→';
    const trendClass = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';

    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 0;
    const span = Math.max(1, max - min);
    const points = values
      .map((value, index) => {
        const x = values.length <= 1 ? 0 : Math.round((index / (values.length - 1)) * 180);
        const y = 40 - Math.round(((value - min) / span) * 34);
        return `${x},${y}`;
      })
      .join(' ');

    return `
      <div class="eco-card">
        <div class="eco-card-title">Tržba 6 měsíců</div>
        <div class="eco-trend ${trendClass}">
          <span class="eco-trend-arrow">${arrow}</span>
          <span>${diff >= 0 ? '+' : ''}${pct.toFixed(1)}%</span>
        </div>
        <div class="eco-trend-value">${incomeLabel}: ${formatCzk(incomeValue)}</div>
        <svg class="eco-sparkline" viewBox="0 0 180 44" aria-hidden="true">
          <polyline points="${points}" />
        </svg>
        <div class="eco-trend-months">
          ${(series[0]?.label || '')} - ${(series[series.length - 1]?.label || '')}
        </div>
      </div>
    `;
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
    const hasGlobalIncome = Number.isFinite(Number(data.totals_all_income));
    const trendIncomeValue = hasGlobalIncome ? Number(data.totals_all_income) : Number(data.totals?.income || 0);
    const trendIncomeLabel = hasGlobalIncome ? 'Celková tržba' : 'Tržba';
    const summary = document.getElementById('ecoSummary');
    let summaryHtml = `
      <div class="eco-overview">
        ${economyDonutHtml(data.totals)}
        ${trendHtml(data.monthly_income_last6, trendIncomeValue, trendIncomeLabel)}
      </div>
      <div class="stats">
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
            <span>${expense.date} • ${expense.title}${expense.worker_name ? ` • ${expense.worker_name}` : ''}${expense.vat_rate ? ` • DPH ${expense.vat_rate}%` : ''}${expense.recurring_type && expense.recurring_type !== 'none' ? ` • ${recurringTypeLabel(expense.recurring_type)}` : ''}</span>
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
    const recurringType = document.getElementById('expenseRecurring').value || 'none';
    await api.post('/api/expenses', {
      title,
      amount,
      vat_rate: vatRate,
      recurring_type: recurringType,
      date: document.getElementById('expenseDate').value,
      note: document.getElementById('expenseNote').value.trim()
    });
    document.getElementById('expenseTitle').value = '';
    document.getElementById('expenseAmount').value = '';
    document.getElementById('expenseVat').value = '0';
    document.getElementById('expenseRecurring').value = 'none';
    document.getElementById('expenseNote').value = '';
    await loadEconomy();
    await loadSummary();
  });

  await loadEconomy();
}

function openBillingModal() {
  openModal(`
    <div class="modal-header">
      <div>
        <h2>Fakturace</h2>
        <div class="meta">Modul pro vystavení faktur a evidenci plateb.</div>
      </div>
      <button class="ghost" id="closeModal">Zavřít</button>
    </div>
    <div class="modal-grid">
      <div class="settings-section">
        <h3>Funkce PRO verze</h3>
        <div class="settings-list">
          <div class="settings-item"><span>Vystavení faktury z návštěvy</span><span>Aktivní v PRO</span></div>
          <div class="settings-item"><span>Evidování úhrad</span><span>Aktivní v PRO</span></div>
          <div class="settings-item"><span>Export dokladů</span><span>Aktivní v PRO</span></div>
        </div>
      </div>
    </div>
  `);

  document.getElementById('closeModal').addEventListener('click', closeModal);
}

function openNotificationsModal() {
  openModal(`
    <div class="modal-header">
      <div>
        <h2>Notifikace</h2>
        <div class="meta">Přehled funkčních upozornění e-mail/SMS v PRO verzi.</div>
      </div>
      <button class="ghost" id="closeModal">Zavřít</button>
    </div>
    <div class="modal-grid">
      <div class="settings-section">
        <h3>E-mailové notifikace</h3>
        <div class="meta">Možnost zapnutí/vypnutí jednotlivých typů upozornění.</div>
        <div class="settings-list">
          <div class="settings-item"><span>Připomenutí rezervace</span><span>Funkční v PRO verzi</span></div>
          <div class="settings-item"><span>Potvrzení o zrušení rezervace</span><span>Funkční v PRO verzi</span></div>
          <div class="settings-item"><span>Zaslání dokladu na e-mail</span><span>Funkční v PRO verzi</span></div>
        </div>
        <div class="field">
          <label>Další možnosti</label>
          <input type="text" value="Lze přidávat další vlastní e-mailové notifikace." readonly />
        </div>
      </div>
      <div class="settings-section">
        <h3>SMS notifikace</h3>
        <div class="meta">Automatické SMS podle stavu rezervace.</div>
        <div class="settings-list">
          <div class="settings-item"><span>Připomenutí rezervace den předem</span><span>Funkční v PRO verzi</span></div>
          <div class="settings-item"><span>Potvrzení změny termínu</span><span>Funkční v PRO verzi</span></div>
          <div class="settings-item"><span>Potvrzení zrušení rezervace</span><span>Funkční v PRO verzi</span></div>
        </div>
        <div class="field">
          <label>Další možnosti</label>
          <input type="text" value="Lze přidávat další vlastní SMS notifikace." readonly />
        </div>
      </div>
    </div>
  `);

  document.getElementById('closeModal').addEventListener('click', closeModal);
}

function brandingSectionTemplate() {
  return `
    <div class="settings-section" data-form="branding">
      <div class="panel-header">
        <div>
          <h3>Logo klonu</h3>
          <div class="meta">Logo se zobrazuje vlevo nahoře v aplikaci i ve veřejné rezervaci.</div>
        </div>
      </div>
      <div class="brand-settings">
        <div>
          <img id="tenantLogoPreview" class="tenant-logo-preview hidden" alt="Logo" />
          <div id="tenantLogoPlaceholder" class="tenant-logo-placeholder">Bez loga</div>
        </div>
        <div style="flex:1; min-width: 260px;">
          <div class="field">
            <label>Nahrát logo (PNG/JPG)</label>
            <input type="file" id="tenantLogoInput" accept="image/*" />
          </div>
          <div class="actions-row">
            <button class="ghost" id="tenantLogoClear" type="button">Smazat logo</button>
            <button class="primary" id="tenantLogoSave" type="button">Uložit logo</button>
          </div>
          <div class="hint">Doporučení: malé logo (např. do 200 KB).</div>
        </div>
      </div>
    </div>
  `;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Nelze načíst soubor.'));
    reader.readAsDataURL(file);
  });
}

function updateTenantLogoPreview(logoData) {
  const preview = document.getElementById('tenantLogoPreview');
  const placeholder = document.getElementById('tenantLogoPlaceholder');
  if (!preview || !placeholder) return;

  if (logoData) {
    preview.src = logoData;
    preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
  } else {
    preview.removeAttribute('src');
    preview.classList.add('hidden');
    placeholder.classList.remove('hidden');
  }
}

function wireBrandSettings() {
  const input = document.getElementById('tenantLogoInput');
  const btnSave = document.getElementById('tenantLogoSave');
  const btnClear = document.getElementById('tenantLogoClear');
  if (!input || !btnSave || !btnClear) return;

  pendingTenantLogoData = null;
  updateTenantLogoPreview(state.tenant?.logo_data || null);

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 200 * 1024) {
      alert('Logo je příliš velké. Zmenši ho (doporučeno do 200 KB).');
      input.value = '';
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      pendingTenantLogoData = dataUrl;
      updateTenantLogoPreview(dataUrl);
    } catch (err) {
      alert('Nelze načíst logo.');
    }
  });

  btnSave.addEventListener('click', async () => {
    if (!pendingTenantLogoData) {
      alert('Vyber logo (soubor), které chceš uložit.');
      return;
    }
    const result = await api.put('/api/tenant/logo', { logo_data: pendingTenantLogoData });
    state.tenant = result.tenant || state.tenant;
    pendingTenantLogoData = null;
    renderBrand();
    updateTenantLogoPreview(state.tenant?.logo_data || null);
    input.value = '';
  });

  btnClear.addEventListener('click', async () => {
    const ok = confirm('Opravdu smazat logo?');
    if (!ok) return;
    const result = await api.put('/api/tenant/logo', { clear: true });
    state.tenant = result.tenant || state.tenant;
    pendingTenantLogoData = null;
    renderBrand();
    updateTenantLogoPreview(null);
    input.value = '';
  });
}


function settingsSectionTemplate({
  title,
  subtitle,
  formId,
  fields,
  listId,
  headerActionsHtml = ''
}) {
  return `
    <div class="settings-section" data-form="${formId}">
      <div class="panel-header">
        <div>
          <h3>${title}</h3>
          <div class="meta">${subtitle}</div>
        </div>
        ${headerActionsHtml ? `<div class="actions-row">${headerActionsHtml}</div>` : ''}
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

function featureMatrixSectionTemplate() {
  return `
    <div class="settings-section">
      <div class="panel-header">
        <div>
          <h3>Feature Matrix klonů</h3>
          <div class="meta">Balíček + výjimky. Přepínač určuje, zda je funkce aktivní pro daný klon.</div>
        </div>
      </div>
      <div id="featureMatrixBox"></div>
    </div>
  `;
}

function buildFeatureMatrixHtml() {
  const features = state.featureMatrix.features || [];
  const tenants = state.featureMatrix.tenants || [];
  if (!features.length || !tenants.length) {
    return '<div class="hint">Zatím nejsou dostupná data pro feature matrix.</div>';
  }

  const header = features.map((feature) => `<th>${feature.label}</th>`).join('');
  const rows = tenants
    .map((tenant) => {
      const planLabel = clonePlanLabel(tenant.plan);
      const statusLabel = cloneStatusLabel(tenant.status);
      const featureCells = features
        .map((feature) => {
          const enabled = !!tenant.features?.[feature.key];
          const hasOverride = tenant.overrides?.[feature.key] !== null && tenant.overrides?.[feature.key] !== undefined;
          return `
            <td>
              <label class="matrix-toggle${hasOverride ? ' override' : ''}">
                <input
                  type="checkbox"
                  data-action="feature-toggle"
                  data-tenant-id="${tenant.tenant_id}"
                  data-feature-key="${feature.key}"
                  ${enabled ? 'checked' : ''}
                />
                <span>${enabled ? 'Zapnuto' : 'Vypnuto'}</span>
              </label>
            </td>
          `;
        })
        .join('');

      return `
        <tr>
          <td class="tenant-cell">
            <div class="tenant-name">${tenant.name}${tenant.is_default ? ' (hlavní tenant)' : ''}</div>
            <div class="tenant-meta">${tenant.slug}${tenant.domain ? ` • ${tenant.domain}` : ''}</div>
          </td>
          <td>${planLabel}</td>
          <td>${statusLabel}</td>
          ${featureCells}
        </tr>
      `;
    })
    .join('');

  return `
    <div class="feature-matrix-wrap">
      <table class="feature-matrix">
        <thead>
          <tr>
            <th>Klon / tenant</th>
            <th>Balíček</th>
            <th>Stav</th>
            ${header}
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function renderFeatureMatrix() {
  const box = document.getElementById('featureMatrixBox');
  if (!box) return;
  box.innerHTML = buildFeatureMatrixHtml();
  box.querySelectorAll('input[data-action="feature-toggle"]').forEach((input) => {
    input.addEventListener('change', async () => {
      const tenantId = input.dataset.tenantId;
      const featureKey = input.dataset.featureKey;
      const enabled = input.checked;
      input.disabled = true;
      try {
        await api.put('/api/admin/feature-matrix', {
          tenant_id: tenantId,
          feature_key: featureKey,
          enabled
        });
        await loadFeatureMatrix();
        renderFeatureMatrix();
        await loadFeatureAccess();
        updateUserUi();
      } finally {
        input.disabled = false;
      }
    });
  });
}

async function openSubserviceDetailModal(service, parentService) {
  const parentName = parentService?.name || 'hlavní služba';

  openModal(`
    <div class="modal-header">
      <div>
        <h2>${escapeHtml(service.name || '')}</h2>
        <div class="meta">Podslužba • karta (formulář) se dědí z hlavní služby: ${escapeHtml(parentName)}.</div>
      </div>
      <div class="actions-row">
        ${parentService ? `<button class="ghost" id="editParentService">Upravit hlavní službu</button>` : ''}
        <button class="ghost" id="backToSettings">Zpět</button>
        <button class="ghost" id="closeModal">Zavřít</button>
      </div>
    </div>
    <div class="modal-grid">
      <div class="settings-section" data-service-edit>
        <div class="panel-header">
          <div>
            <h3>Základní údaje</h3>
            <div class="meta">Název a délka podslužby.</div>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Název</label>
            <input id="subserviceEditName" type="text" />
          </div>
          <div class="field">
            <label>Délka (min)</label>
            <select id="subserviceEditDuration">
              ${durationOptions().map((value) => `<option value="${value}">${value}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="meta">Kartu služby upravíš v hlavní službě: <strong>${escapeHtml(parentName)}</strong>.</div>
        <div class="actions-row">
          <button class="primary" id="subserviceSave">Uložit</button>
        </div>
      </div>
    </div>
  `);

  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('backToSettings').addEventListener('click', () => {
    openSettingsModal('services').catch(() => {});
  });
  const editParentBtn = document.getElementById('editParentService');
  if (editParentBtn && parentService) {
    editParentBtn.addEventListener('click', () => openServiceDetailModal(parentService.id));
  }

  const nameInput = document.getElementById('subserviceEditName');
  const durationSelect = document.getElementById('subserviceEditDuration');
  nameInput.value = service.name || '';
  durationSelect.value = String(service.duration_minutes || 30);

  document.getElementById('subserviceSave').addEventListener('click', async () => {
    const saveBtn = document.getElementById('subserviceSave');
    if (saveBtn) saveBtn.disabled = true;
    try {
      const payload = {
        name: nameInput.value.trim(),
        duration_minutes: durationSelect.value
      };
      if (!payload.name) {
        alert('Vyplň název podslužby.');
        return;
      }
      await api.put(`/api/services/${service.id}`, payload);
      await loadSettings();
      closeModal();
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });
}

async function openServiceDetailModal(serviceId) {
  const service = state.settings.services.find((item) => item.id === serviceId);
  if (!service) return;

  const parentId = (service.parent_id || '').toString().trim();
  if (parentId) {
    const parentService = state.settings.services.find((item) => item.id === parentId) || null;
    await openSubserviceDetailModal(service, parentService);
    return;
  }

  let schemaDraft = normalizeSchemaDraft(parseServiceSchemaJson(service.form_schema_json));

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
            <div class="meta">Název a délka služby.</div>
          </div>
        </div>
      <div class="field-row">
        <div class="field">
          <label>Název</label>
          <input id="serviceEditName" type="text" />
        </div>
        <div class="field">
          <label>Délka (min)</label>
          <select id="serviceEditDuration">
            ${durationOptions().map((value) => `<option value="${value}">${value}</option>`).join('')}
          </select>
          <div class="meta hidden" id="serviceDurationLockedHint">Délka se nastavuje u podslužeb.</div>
        </div>
      </div>
      <div class="divider"></div>
      <label class="checkbox-row">
        <input type="checkbox" id="serviceUseSubservices" />
        Přidat podslužby
      </label>
      <div class="meta">Podslužby jsou konkrétní varianty služby (např. depilace nohou). Čas se nastavuje u podslužeb.</div>
        <div class="actions-row">
          <button class="primary" id="serviceSave">Uložit službu</button>
        </div>
      </div>
      <div class="settings-section hidden" id="serviceSubservicesSection">
        <div class="panel-header">
          <div>
            <h3>Podslužby</h3>
            <div class="meta" id="serviceSubservicesMeta">Nastav podslužby a jejich časovou dotaci.</div>
          </div>
        </div>
        <div class="subservice-edit-list" id="serviceSubRows"></div>
        <div class="actions-row services-actions">
          <button type="button" class="ghost" id="serviceSubRowAdd">+ Přidat podslužbu</button>
        </div>
      </div>
      <div class="settings-section">
        <div class="panel-header">
          <div>
            <h3>Karta služby</h3>
            <div class="meta">Sestav vlastní formulář. Vpravo vidíš náhled, jak to uvidí uživatel v kartě klientky.</div>
          </div>
        </div>
        <div class="schema-split">
          <div>
            <div class="actions-row schema-split-actions">
              <button type="button" class="ghost" id="schemaAddField">Nové pole</button>
            </div>
            <div id="schemaBuilder" class="schema-builder"></div>
          </div>
          <div class="schema-preview">
            <div class="meta">Náhled karty (jen pro zobrazení).</div>
            <div id="schemaPreviewFields" class="custom-fields"></div>
            <div class="field-row">
              <div class="field">
                <label>Cena z karty (automaticky)</label>
                <input type="text" value="0 Kč" readonly disabled />
              </div>
              <div class="field">
                <label>Celkem (ručně)</label>
                <input type="text" placeholder="Finální cena" readonly disabled />
              </div>
            </div>
            <div class="actions-row">
              <button type="button" class="primary" disabled>Uložit službu</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `);

  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('backToSettings').addEventListener('click', () => {
    openSettingsModal('services').catch(() => {});
  });

  const nameInput = document.getElementById('serviceEditName');
  const durationSelect = document.getElementById('serviceEditDuration');
  const durationLockedHint = document.getElementById('serviceDurationLockedHint');
  const useSubservicesToggle = document.getElementById('serviceUseSubservices');
  nameInput.value = service.name || '';
  durationSelect.value = String(service.duration_minutes || 30);

  const subSection = document.getElementById('serviceSubservicesSection');
  const subMeta = document.getElementById('serviceSubservicesMeta');
  const subRows = document.getElementById('serviceSubRows');
  const subAddRowBtn = document.getElementById('serviceSubRowAdd');
  const removedSubserviceIds = new Set();

  const getServiceChildren = () => {
    const parentId = String(service.id);
    return state.settings.services.filter((item) => String(item.parent_id || '') === parentId);
  };

  const durationSelectHtml = (selected) =>
    durationOptions()
      .map((value) => `<option value="${value}"${String(value) === String(selected) ? ' selected' : ''}>${value}</option>`)
      .join('');

  const subRowTemplate = (row) => {
    const id = row?.id ? String(row.id) : '';
    const name = row?.name || '';
    const duration = row?.duration_minutes || 30;
    return `
      <div class="subservice-edit-item" data-sub-id="${escapeHtml(id)}">
        <div class="field-row">
          <div class="field">
            <label>Název podslužby</label>
            <input type="text" data-sub-field="name" value="${escapeHtml(name)}" placeholder="Např. Depilace nohou" />
          </div>
          <div class="field">
            <label>Délka (min)</label>
            <select data-sub-field="duration_minutes">${durationSelectHtml(duration)}</select>
          </div>
        </div>
        <div class="actions-row">
          <button type="button" class="ghost" data-action="remove-subservice">Smazat podslužbu</button>
        </div>
      </div>
    `;
  };

  const wireSubRowActions = () => {
    if (!subRows) return;
    subRows.querySelectorAll('button[data-action="remove-subservice"]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = button.closest('.subservice-edit-item');
        if (!item) return;
        const id = (item.dataset.subId || '').toString();
        if (id) removedSubserviceIds.add(id);
        item.remove();
      });
    });
  };

  const addBlankSubRow = () => {
    if (!subRows) return;
    subRows.insertAdjacentHTML('beforeend', subRowTemplate({ id: '', name: '', duration_minutes: 30 }));
    wireSubRowActions();
  };

  const setSubservicesEnabled = (enabled) => {
    if (!subSection) return;
    subSection.classList.toggle('hidden', !enabled);
    durationSelect.disabled = enabled;
    if (durationLockedHint) durationLockedHint.classList.toggle('hidden', !enabled);
    if (!enabled && subRows) {
      subRows.innerHTML = '';
    }
    if (enabled && subRows && !subRows.children.length) {
      addBlankSubRow();
    }
  };

  const initialChildren = getServiceChildren();
  const hasChildren = initialChildren.length > 0;

  if (subRows) {
    subRows.innerHTML = initialChildren.map((child) => subRowTemplate(child)).join('');
    wireSubRowActions();
  }
  if (subMeta) {
    subMeta.textContent = hasChildren ? `Podslužby pro "${service.name}".` : 'Nastav podslužby a jejich časovou dotaci.';
  }

  if (useSubservicesToggle) {
    useSubservicesToggle.checked = hasChildren;
    useSubservicesToggle.disabled = hasChildren;
    useSubservicesToggle.addEventListener('change', () => {
      setSubservicesEnabled(Boolean(useSubservicesToggle.checked));
    });
  }
  if (subAddRowBtn) {
    subAddRowBtn.addEventListener('click', () => {
      if (useSubservicesToggle && !useSubservicesToggle.checked) {
        useSubservicesToggle.checked = true;
        setSubservicesEnabled(true);
      }
      addBlankSubRow();
    });
  }

  setSubservicesEnabled(Boolean(useSubservicesToggle?.checked));

  const schemaBuilder = document.getElementById('schemaBuilder');
  const schemaPreview = document.getElementById('schemaPreviewFields');
  const renderSchemaPreview = () => {
    if (!schemaPreview) return;
    renderSchemaFields(schemaPreview, schemaDraft, null);
    schemaPreview.querySelectorAll('input, textarea, select').forEach((el) => {
      el.disabled = true;
    });
  };

  const onSchemaDraftChange = (force = false) => {
    if (force) {
      renderSchemaBuilder(schemaBuilder, schemaDraft, onSchemaDraftChange);
    }
    renderSchemaPreview();
  };

  renderSchemaBuilder(schemaBuilder, schemaDraft, onSchemaDraftChange);
  renderSchemaPreview();

  document.getElementById('schemaAddField').addEventListener('click', () => {
    const nextLabel = `Pole ${schemaDraft.fields.length + 1}`;
    const baseId = slugifySchemaId(nextLabel) || `pole-${schemaDraft.fields.length + 1}`;
    const id = ensureUniqueSchemaId(schemaDraft.fields, baseId);
    schemaDraft.fields = [
      ...schemaDraft.fields,
      { id, type: 'text', label: nextLabel, required: false, price_delta: 0, options: [] }
    ];
    onSchemaDraftChange(true);
  });

  document.getElementById('serviceSave').addEventListener('click', async () => {
    const saveBtn = document.getElementById('serviceSave');
    if (saveBtn) saveBtn.disabled = true;
    try {
      const useSubservices = Boolean(useSubservicesToggle?.checked);

      const payload = {
        name: nameInput.value.trim(),
        duration_minutes: durationSelect.value,
        form_type: service.form_type || 'generic'
      };
    if (!payload.name) {
      alert('Vyplň název služby.');
      return;
    }

      const subserviceItems = useSubservices
        ? Array.from(subRows?.querySelectorAll('.subservice-edit-item') || []).map((item) => {
            const id = (item.dataset.subId || '').toString().trim();
            const name = (item.querySelector('[data-sub-field="name"]')?.value || '').trim();
            const duration = (item.querySelector('[data-sub-field="duration_minutes"]')?.value || '').toString().trim() || '30';
            return { id, name, duration_minutes: duration };
          })
        : [];

      if (useSubservices) {
        if (!subserviceItems.length) {
          if (!hasChildren) {
            alert('Přidej alespoň jednu podslužbu.');
            return;
          }
          const ok = confirm('Odstranit všechny podslužby?');
          if (!ok) return;
        }
        if (subserviceItems.some((item) => !item.name)) {
          alert('Vyplň název u každé podslužby (nebo ji smaž).');
          return;
        }
      }

    const schemaFields = Array.isArray(schemaDraft.fields) ? schemaDraft.fields : [];
    if (schemaFields.length) {
      for (const field of schemaFields) {
        field.label = (field.label || '').toString().trim();
        if (!field.label) {
          alert('Vyplň popis u každého pole v kartě služby.');
          return;
        }
        if (!field.id) {
          field.id = ensureUniqueSchemaId(schemaDraft.fields, slugifySchemaId(field.label));
        }
        if (field.type === 'select' || field.type === 'multiselect') {
          const options = Array.isArray(field.options) ? field.options : [];
          const filtered = options.filter((opt) => (opt.label || '').toString().trim());
          if (!filtered.length) {
            alert(`Pole "${field.label}" musí mít alespoň jednu možnost.`);
            return;
          }
          const used = new Set();
          filtered.forEach((opt) => {
            opt.label = (opt.label || '').toString().trim();
            if (!opt.id) opt.id = slugifySchemaId(opt.label) || randomId('opt');
            if (used.has(opt.id)) opt.id = randomId('opt');
            used.add(opt.id);
            opt.price_delta = Number(opt.price_delta) || 0;
          });
          field.options = filtered;
        } else {
          field.options = [];
        }
        field.required = field.required === true;
        field.price_delta = field.type === 'checkbox' ? Number(field.price_delta) || 0 : 0;
      }
      payload.form_schema = schemaDraft;
    } else {
      payload.form_schema = null;
    }

      await api.put(`/api/services/${service.id}`, payload);

      if (useSubservices) {
        for (const id of removedSubserviceIds) {
          await api.del(`/api/services/${id}`);
        }
        for (const sub of subserviceItems) {
          if (sub.id) {
            const existingChild = state.settings.services.find((item) => item.id === sub.id);
            await api.put(`/api/services/${sub.id}`, {
              name: sub.name,
              duration_minutes: sub.duration_minutes,
              form_type: existingChild?.form_type || service.form_type || 'generic'
            });
          } else {
            await api.post('/api/services', {
              name: sub.name,
              duration_minutes: sub.duration_minutes,
              parent_id: service.id
            });
          }
        }
      }

      await loadSettings();
      closeModal();
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });
}

function canManageClonesSettings() {
  return state.auth.user?.role === 'admin' && state.auth.user?.is_superadmin && state.tenant?.slug === 'default';
}

function getSettingsTabs() {
  if (state.auth.user?.role !== 'admin') return [];
  const tabs = [
    { key: 'logo', label: 'Logo' },
    { key: 'services', label: 'Služby' },
    { key: 'users', label: 'Uživatelé' }
  ];
  if (canManageClonesSettings()) {
    tabs.push({ key: 'clones', label: 'Klony' });
  }
  return tabs;
}

function settingsTabsTemplate(tabs, activeKey) {
  return `
    <nav class="settings-tabs" id="settingsTabs" aria-label="Podstránky nastavení">
      ${tabs
        .map(
          (tab) => `
            <button type="button" class="settings-tab${tab.key === activeKey ? ' active' : ''}" data-tab="${tab.key}">
              ${tab.label}
            </button>
          `
        )
        .join('')}
    </nav>
  `;
}

function setActiveSettingsTab(tabKey) {
  document.querySelectorAll('#settingsTabs [data-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabKey);
  });
}

function clonesSubtabsTemplate(activeKey) {
  return `
    <div class="settings-subtabs" aria-label="Podmenu klonů">
      <button type="button" class="settings-subtab${activeKey === 'clones' ? ' active' : ''}" data-clones-tab="clones">Klony</button>
      <button type="button" class="settings-subtab${activeKey === 'matrix' ? ' active' : ''}" data-clones-tab="matrix">Feature Matrix</button>
    </div>
  `;
}

function clonesSettingsPageTemplate() {
  const activeTab = state.ui.clonesTab || 'clones';
  const body =
    activeTab === 'matrix'
      ? featureMatrixSectionTemplate()
      : settingsSectionTemplate({
          title: 'Klony (MVP)',
          subtitle: 'Správa klonů aplikace pro další subjekty.',
          formId: 'clones',
          listId: 'cloneList',
          headerActionsHtml: '<button type="button" class="ghost" id="btnCloneUsers">UŽIVATELÉ</button>',
          fields: [
            '<div class="field"><label>Název klonu</label><input type="text" data-field="name" placeholder="Např. Salon Brno" /></div>',
            '<div class="field"><label>Slug</label><input type="text" data-field="slug" placeholder="napr-salon-brno" /></div>',
            '<div class="field"><label>Doména</label><input type="text" data-field="domain" placeholder="brno.prettyvisage.cz" /></div>',
            '<div class="field"><label>Tarif</label><select data-field="plan"><option value="basic">Basic</option><option value="pro">PRO</option><option value="enterprise">Enterprise</option></select></div>',
            '<div class="field"><label>Stav</label><select data-field="status"><option value="draft">Návrh</option><option value="active">Aktivní</option><option value="suspended">Pozastavený</option></select></div>',
            '<div class="field"><label>Admin jméno</label><input type="text" data-field="admin_name" placeholder="Jméno administrátora" /></div>',
            '<div class="field"><label>Admin e-mail</label><input type="email" data-field="admin_email" placeholder="admin@domena.cz" /></div>',
            '<div class="field"><label>Poznámka</label><input type="text" data-field="note" placeholder="Interní poznámka" /></div>'
          ]
        });

  return `${clonesSubtabsTemplate(activeTab)}${body}`;
}

function servicesSettingsPageTemplate() {
  return `
    <div class="settings-section" data-form="services">
      <div class="panel-header">
        <div>
          <h3>Služby</h3>
          <div class="meta">Služby pro výběr v kartě klientky. V detailu služby si poskládáš vlastní kartu (formulář).</div>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>Název</label><input type="text" data-field="name" placeholder="Např. Depilace" /></div>
        <div class="field"><label>Délka (min)</label><select data-field="duration_minutes">${durationOptions()
          .map((value) => `<option value="${value}">${value}</option>`)
          .join('')}</select></div>
      </div>
      <div class="actions-row services-actions">
        <button class="ghost" data-action="reset">Nový</button>
        <button class="primary" data-action="save">Uložit</button>
      </div>

      <div class="settings-list" id="serviceList"></div>
    </div>
  `;
}

function renderSettingsTabContent(tabKey) {
  const content = document.getElementById('settingsContent');
  if (!content) return;

  let html = '';

  if (tabKey === 'logo') {
    html = brandingSectionTemplate();
  } else if (tabKey === 'services') {
    html = servicesSettingsPageTemplate();
  } else if (tabKey === 'users') {
    html = settingsSectionTemplate({
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
    });
  } else if (tabKey === 'clones' && canManageClonesSettings()) {
    html = clonesSettingsPageTemplate();
  }

  content.innerHTML = `<div class="modal-grid">${html}</div>`;

  renderSettingsLists();
  wireSettingsForms();
  if (tabKey === 'services') {
    wireServicesSubservices();
    refreshServiceSubservicesPanel();
  }
  wireBrandSettings();

  document.querySelectorAll('[data-clones-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.ui.clonesTab = button.dataset.clonesTab || 'clones';
      renderSettingsTabContent('clones');
    });
  });

  const btnCloneUsers = document.getElementById('btnCloneUsers');
  if (btnCloneUsers) {
    btnCloneUsers.addEventListener('click', () => {
      switchSettingsTab('users');
    });
  }
}

function switchSettingsTab(tabKey) {
  state.ui.settingsTab = tabKey;
  setActiveSettingsTab(tabKey);
  renderSettingsTabContent(tabKey);
}

async function openSettingsModal(initialTab = '') {
  if (state.auth.user?.role === 'admin') {
    await loadUsers();
    if (canManageClonesSettings()) {
      await loadClones();
      await loadFeatureMatrix();
    }
  }

  const tabs = getSettingsTabs();
  const allowed = new Set(tabs.map((tab) => tab.key));
  const desired = (initialTab || state.ui.settingsTab || 'services').toString();
  const resolved = allowed.has(desired) ? desired : allowed.has('services') ? 'services' : tabs[0]?.key || 'services';

  openModal(`
    <div class="modal-header">
      <div>
        <h2>Nastavení</h2>
        <div class="meta">Logo • služby • uživatelé${canManageClonesSettings() ? ' • klony' : ''}.</div>
      </div>
      <button class="ghost" id="closeModal">Zavřít</button>
    </div>
    ${settingsTabsTemplate(tabs, resolved)}
    <div id="settingsContent"></div>
  `);

  document.getElementById('closeModal').addEventListener('click', closeModal);

  document.querySelectorAll('#settingsTabs [data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      switchSettingsTab(button.dataset.tab);
    });
  });

  switchSettingsTab(resolved);
}

function renderSettingsLists() {
  const serviceList = document.getElementById('serviceList');
  if (serviceList) {
    const services = Array.isArray(state.settings.services) ? state.settings.services : [];
    const collator = new Intl.Collator('cs', { sensitivity: 'base' });
    const childrenByParent = new Map();
    services.forEach((service) => {
      const key = service.parent_id ? String(service.parent_id) : '';
      if (!childrenByParent.has(key)) childrenByParent.set(key, []);
      childrenByParent.get(key).push(service);
    });
    for (const list of childrenByParent.values()) {
      list.sort((a, b) => collator.compare(a.name || '', b.name || ''));
    }

    const parentIds = new Set(services.filter((s) => s.parent_id).map((s) => String(s.parent_id)));

    const rowHtml = (item, level = 0) => {
      const schema = parseServiceSchemaJson(item.form_schema_json);
      const fieldsCount = schema?.fields?.filter((field) => field.type !== 'heading').length || 0;
      const inherits = Boolean(item.parent_id) && (item.inherits_form === 1 || item.inherits_form === true || item.inherits_form === '1');
      const schemaLabel = inherits
        ? fieldsCount
          ? `karta: ${fieldsCount} polí (dědí)`
          : 'bez karty (dědí)'
        : fieldsCount
          ? `karta: ${fieldsCount} polí`
          : 'bez karty';
      const hasChildren = parentIds.has(String(item.id));
      const durationLabel = hasChildren ? 'podslužby' : `${item.duration_minutes || 30} min`;
      const indent = Math.max(0, level) * 18;
      return `
        <div class="settings-item service-tree-item${hasChildren ? ' is-parent' : ''}">
          <span class="service-tree-label">
            <span class="service-tree-indent" style="width:${indent}px"></span>
            <span class="service-tree-name">${escapeHtml(item.name)} • ${escapeHtml(durationLabel)} • ${escapeHtml(schemaLabel)}</span>
          </span>
          <div class="settings-actions">
            <button class="ghost" data-action="edit" data-section="services" data-id="${item.id}">Upravit</button>
            <button class="ghost" data-action="delete" data-section="services" data-id="${item.id}">Smazat</button>
          </div>
        </div>
      `;
    };

    const visited = new Set();
    const renderTree = (parentKey, level) => {
      const list = childrenByParent.get(parentKey) || [];
      return list
        .map((item) => {
          if (visited.has(item.id)) return '';
          visited.add(item.id);
          const children = renderTree(String(item.id), level + 1);
          return rowHtml(item, level) + children;
        })
        .join('');
    };

    let html = renderTree('', 0);
    // Append orphans (bad parent_id).
    services.forEach((item) => {
      if (!visited.has(item.id)) {
        html += rowHtml(item, 0);
      }
    });
    serviceList.innerHTML = html;
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

  const cloneList = document.getElementById('cloneList');
  if (cloneList) {
    cloneList.innerHTML = state.clones
      .map((clone) => cloneItemTemplate(clone))
      .join('');
  }

  renderFeatureMatrix();

  document.querySelectorAll('.settings-item button[data-action="edit"]').forEach((button) => {
    if (button.dataset.section === 'users') {
      button.addEventListener('click', () => startEditUser(button.dataset.id));
    } else if (button.dataset.section === 'services') {
      button.addEventListener('click', () => openServiceDetailModal(button.dataset.id));
    } else {
      button.addEventListener('click', () => startEditSetting(button.dataset.section, button.dataset.id));
    }
  });
  document.querySelectorAll('.settings-item button[data-action="template"]').forEach((button) => {
    button.addEventListener('click', () => openCloneTemplateModal(button.dataset.id));
  });
  document.querySelectorAll('.settings-item button[data-action="recover"]').forEach((button) => {
    button.addEventListener('click', () => recoverCloneAdminAccess(button.dataset.id));
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
  const superLabel = user.is_superadmin ? ' • Super admin' : '';
  return `
    <div class="settings-item">
      <span>${user.full_name} • ${user.username} • ${roleLabel}${superLabel}</span>
      <div class="settings-actions">
        <button class="ghost" data-action="edit" data-section="users" data-id="${user.id}">Upravit</button>
        <button class="ghost" data-action="delete" data-section="users" data-id="${user.id}">Smazat</button>
      </div>
    </div>
  `;
}

function clonePlanLabel(plan) {
  if (plan === 'pro') return 'PRO';
  if (plan === 'enterprise') return 'Enterprise';
  return 'Basic';
}

function cloneStatusLabel(status) {
  if (status === 'active') return 'Aktivní';
  if (status === 'suspended') return 'Pozastavený';
  return 'Návrh';
}

function cloneItemTemplate(clone) {
  return `
    <div class="settings-item">
      <span>
        ${clone.name} • ${clone.slug} • ${clonePlanLabel(clone.plan)} • ${cloneStatusLabel(clone.status)}
        ${clone.domain ? ` • ${clone.domain}` : ''}
      </span>
      <div class="settings-actions">
        <button class="ghost" data-action="template" data-id="${clone.id}">Šablona</button>
        <button class="ghost" data-action="recover" data-id="${clone.id}">Obnova přístupu</button>
        <button class="ghost" data-action="edit" data-section="clones" data-id="${clone.id}">Upravit</button>
        <button class="ghost" data-action="delete" data-section="clones" data-id="${clone.id}">Smazat</button>
      </div>
    </div>
  `;
}

async function recoverCloneAdminAccess(cloneId) {
  const clone = state.clones.find((item) => item.id === cloneId);
  if (!clone) return;

  const ok = confirm(`Obnovit přístup administrátora pro klon "${clone.name}"?`);
  if (!ok) return;

  const data = await api.post(`/api/clones/${cloneId}/recover-admin`, {});
  const recovery = data.recovery || {};
  const domainLabel = recovery.domain || clone.domain || '(není nastavená doména)';

  openModal(`
    <div class="modal-header">
      <div>
        <h2>Obnova přístupu: ${clone.name}</h2>
        <div class="meta">Jednorázově vygenerované přihlašovací údaje pro recovery admina.</div>
      </div>
      <button class="ghost" id="closeModal">Zavřít</button>
    </div>
    <div class="modal-grid">
      <div class="panel">
        <div class="field"><label>Doména klonu</label><input type="text" readonly value="${escapeHtml(domainLabel)}" /></div>
        <div class="field"><label>Uživatelské jméno</label><input type="text" readonly value="${escapeHtml(recovery.username || '')}" /></div>
        <div class="field"><label>Dočasné heslo</label><input type="text" readonly value="${escapeHtml(recovery.temporary_password || '')}" /></div>
        <div class="meta">Po přihlášení heslo ihned změňte v nastavení uživatele.</div>
      </div>
    </div>
  `);
  document.getElementById('closeModal').addEventListener('click', closeModal);
}

async function openCloneTemplateModal(cloneId) {
  const clone = state.clones.find((item) => item.id === cloneId);
  if (!clone) return;
  const data = await api.get(`/api/clones/${cloneId}/template`);
  const formatted = JSON.stringify(data.template || {}, null, 2);
  openModal(`
    <div class="modal-header">
      <div>
        <h2>Šablona klonu: ${clone.name}</h2>
        <div class="meta">Výchozí data pro nový klon.</div>
      </div>
      <div class="actions-row">
        <button class="ghost" id="cloneTemplateRefresh">Aktualizovat šablonu</button>
        <button class="ghost" id="closeModal">Zavřít</button>
      </div>
    </div>
    <div class="modal-grid">
      <pre class="template-pre">${escapeHtml(formatted)}</pre>
    </div>
  `);
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('cloneTemplateRefresh').addEventListener('click', async () => {
    await api.post(`/api/clones/${cloneId}/template-refresh`, {});
    await loadClones();
    await openCloneTemplateModal(cloneId);
  });
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
    if (state.auth.user?.is_superadmin) {
      sections.clones = {
        list: state.clones,
        resource: 'clones'
      };
    }
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
      if (key === 'services') {
        refreshServiceSubservicesPanel();
      }
    });

  });
}

function wireServicesSubservices() {
  const form = document.querySelector('[data-form="services"]');
  if (!form) return;
  const addBtn = document.getElementById('subServiceAdd');
  if (!addBtn) return;

  addBtn.addEventListener('click', async () => {
    const parentId = (form.dataset.editing || '').toString();
    if (!parentId) {
      alert('Pro podslužbu nejdřív ulož službu a poté ji vyber přes „Upravit“ v seznamu.');
      return;
    }
    const nameInput = document.getElementById('subServiceName');
    const durationSelect = document.getElementById('subServiceDuration');
    const name = (nameInput?.value || '').trim();
    const duration = (durationSelect?.value || '').trim() || '30';
    if (!name) {
      alert('Vyplň název podslužby.');
      return;
    }
    addBtn.disabled = true;
    try {
      await api.post('/api/services', {
        name,
        duration_minutes: duration,
        parent_id: parentId
      });
      if (nameInput) nameInput.value = '';
      await loadSettings();
      renderSettingsLists();
      refreshServiceSubservicesPanel();
    } finally {
      addBtn.disabled = false;
    }
  });
}

function refreshServiceSubservicesPanel() {
  const form = document.querySelector('[data-form="services"]');
  const list = document.getElementById('subServiceList');
  const meta = document.getElementById('subserviceMeta');
  const addBtn = document.getElementById('subServiceAdd');
  const nameInput = document.getElementById('subServiceName');
  const durationSelect = document.getElementById('subServiceDuration');
  const parentDurationSelect = form?.querySelector('[data-field="duration_minutes"]');
  if (!form || !list || !meta || !addBtn) return;

  const parentId = (form.dataset.editing || '').toString();
  const parent = parentId ? state.settings.services.find((service) => service.id === parentId) : null;
  const children = parentId
    ? state.settings.services.filter((service) => (service.parent_id || '') === parentId)
    : [];

  const disabled = !parentId;
  addBtn.disabled = disabled;
  if (nameInput) nameInput.disabled = disabled;
  if (durationSelect) durationSelect.disabled = disabled;

  if (!parentId || !parent) {
    meta.textContent = 'Pro podslužby nejdřív ulož službu a poté klikni v seznamu na „Upravit“.';
    list.innerHTML = '';
    if (parentDurationSelect) parentDurationSelect.disabled = false;
    return;
  }

  if (parentDurationSelect) parentDurationSelect.disabled = children.length > 0;

  meta.textContent = children.length
    ? `Podslužby pro "${parent.name}".`
    : `Zatím bez podslužeb pro "${parent.name}".`;

  list.innerHTML = children
    .map((child) => {
      const durationLabel = `${child.duration_minutes || 30} min`;
      const schema = parseServiceSchemaJson(child.form_schema_json);
      const fieldsCount = schema?.fields?.filter((field) => field.type !== 'heading').length || 0;
      const schemaLabel = fieldsCount ? `karta: ${fieldsCount} polí` : 'bez karty';
      return `
        <div class="settings-item">
          <span>${escapeHtml(child.name)} • ${escapeHtml(durationLabel)} • ${escapeHtml(schemaLabel)}</span>
          <div class="settings-actions">
            <button class="ghost" data-action="edit" data-id="${child.id}">Upravit</button>
            <button class="ghost" data-action="delete" data-id="${child.id}">Smazat</button>
          </div>
        </div>
      `;
    })
    .join('');

  list.querySelectorAll('button[data-action="edit"]').forEach((button) => {
    button.addEventListener('click', () => openServiceDetailModal(button.dataset.id));
  });
  list.querySelectorAll('button[data-action="delete"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.id;
      if (!id) return;
      const ok = confirm('Opravdu smazat podslužbu?');
      if (!ok) return;
      button.disabled = true;
      try {
        await api.del(`/api/services/${id}`);
        await loadSettings();
        renderSettingsLists();
        refreshServiceSubservicesPanel();
      } finally {
        button.disabled = false;
      }
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
          : section === 'clones'
            ? state.clones
          : [];

  const item = list.find((entry) => entry.id === id);
  if (!item) return;

  form.dataset.editing = id;
  form.querySelectorAll('[data-field]').forEach((input) => {
    const value = item[input.dataset.field] ?? '';
    input.value = value;
  });

  if (section === 'services') {
    refreshServiceSubservicesPanel();
  }
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
        : section === 'clones'
          ? 'clones'
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
  dom.btnEconomy.addEventListener('click', async () => {
    await runProFeature('economy', openEconomyModal);
  });
  if (dom.btnCalendar) {
    dom.btnCalendar.addEventListener('click', async () => {
      await runProFeature('calendar', openCalendarModal);
    });
  }
  if (dom.btnBilling) {
    dom.btnBilling.addEventListener('click', async () => {
      await runProFeature('billing', openBillingModal);
    });
  }
  if (dom.btnNotifications) {
    dom.btnNotifications.addEventListener('click', async () => {
      await runProFeature('notifications', openNotificationsModal);
    });
  }
  dom.btnLogout.addEventListener('click', handleLogout);
  dom.genPrice.addEventListener('input', updateGenericPricePreview);
  document.addEventListener('click', (event) => {
    if (!dom.servicePicker) return;
    if (!dom.servicePicker.contains(event.target)) {
      closeAllServiceParentMenus();
    }
  });
}

async function init() {
  dom.genDate.value = todayLocal();
  setClientDetailsOpen(false);
  wireEvents();
  updateUserUi();
  startServerMonitor();
  await bootstrapAuth();
}

init();
