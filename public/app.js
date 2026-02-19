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
  genSelectedServices: document.getElementById('genSelectedServices'),
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
  btnAddGenericCalendar: document.getElementById('btnAddGenericCalendar'),
  btnSettings: document.getElementById('btnSettings'),
  btnEconomy: document.getElementById('btnEconomy'),
  btnInventory: document.getElementById('btnInventory'),
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
    workers: [],
    stockItems: []
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
  currentServiceTouched: false,
  pendingServiceOrder: [],
  pendingServiceDrafts: {},
  openVisitGroups: {},
  visitWorkerChanges: {},
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
  inventory: {
    title: 'Sklad - náhled',
    description: 'Náhled funkcí PRO verze. V tomto režimu nejde nic upravovat ani odepisovat ze skladu.',
    images: [
      { src: '/previews/economy-2.svg', alt: 'Náhled skladu', caption: 'Správa skladových položek a pohybů' }
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

function normalizeDurationMinutes(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return numeric;
}

const SERVICE_FIELD_TYPES = new Set(['text', 'textarea', 'number', 'checkbox', 'select', 'multiselect', 'heading']);

function defaultSchemaFieldLabel(type, index = 1) {
  const labels = {
    text: 'Text',
    textarea: 'Text',
    number: 'Číslo',
    checkbox: 'Zaškrtávací políčko',
    select: 'Výběr',
    multiselect: 'Výběr',
    heading: 'Nadpis'
  };
  const base = labels[type] || 'Pole';
  return `${base} ${index}`;
}

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
      .map((field, index) => {
        const type = SERVICE_FIELD_TYPES.has(field.type) ? field.type : 'text';
        const label = (field.label || '').toString().trim() || defaultSchemaFieldLabel(type, index + 1);
        return {
          id: (field.id || '').toString().trim(),
          type,
          label,
        required: field.required === true || field.required === 1 || field.required === '1',
        price_delta: Number(field.price_delta) || 0,
        options: Array.isArray(field.options) ? field.options : []
      };
      })
      .filter((field) => field.id && SERVICE_FIELD_TYPES.has(field.type));

    normalizedFields.forEach((field) => {
      if (field.type === 'select' || field.type === 'multiselect') {
        field.options = field.options
          .map((opt) => ({
            id: (opt.id || '').toString().trim(),
            label: (opt.label || '').toString().trim(),
            price_delta: Number(opt.price_delta) || 0,
            duration_minutes: (() => {
              const value = Number(opt.duration_minutes);
              if (!Number.isFinite(value)) return 0;
              if (value === 0) return 0;
              if (value >= 15 && value <= 360 && value % 15 === 0) return value;
              return 0;
            })()
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
  return numeric < 0 ? `-${formatted}` : formatted;
}

function formatOptionLabel(option) {
  const bits = [];
  const price = formatSignedCzk(option?.price_delta);
  if (price) bits.push(price);
  const duration = Number(option?.duration_minutes) || 0;
  if (duration > 0) bits.push(`${duration} min`);
  const label = option?.label || '';
  return bits.length ? `${label} (${bits.join(' • ')})` : label;
}

function renderSchemaFields(container, schema, onChange, initialValues = {}) {
  if (!container) return;
  container.innerHTML = '';
  if (!schema || !Array.isArray(schema.fields) || !schema.fields.length) return;

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
      input.checked = Boolean(initialValues[field.id]);

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
        const optionText = formatOptionLabel(opt);
        left.textContent = optionText;
        if ((optionText || '').length > 43) {
          item.classList.add('addon-item-long');
        }
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.schemaField = field.id;
        checkbox.dataset.schemaOption = opt.id;
        const selected = Array.isArray(initialValues[field.id]) ? initialValues[field.id] : [];
        checkbox.checked = selected.includes(opt.id);
        checkbox.addEventListener('change', () => onChange && onChange());
        item.appendChild(checkbox);
        item.appendChild(left);
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
      textarea.value = initialValues[field.id] ?? '';
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
        option.textContent = formatOptionLabel(opt);
        select.appendChild(option);
      });
      select.addEventListener('change', () => onChange && onChange());
      const preset = initialValues[field.id];
      if (preset !== undefined && preset !== null) {
        select.value = String(preset);
      }
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
    if (field.type === 'number') {
      const preset = initialValues[field.id];
      input.value = preset === undefined || preset === null ? '' : String(preset);
    } else {
      input.value = initialValues[field.id] ?? '';
    }
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
    { value: 'checkbox', label: 'Zaškrtávací políčko' },
    { value: 'select', label: 'Výběr (1 možnost)' },
    { value: 'multiselect', label: 'Výběr (více možností)' },
    { value: 'heading', label: 'Nadpis / oddělovač' }
  ];
}

function normalizeSchemaDraft(schema) {
  if (!schema || !Array.isArray(schema.fields)) return { version: 1, fields: [] };
  return {
    version: 1,
    fields: schema.fields.map((field, index) => {
      const type = SERVICE_FIELD_TYPES.has(field.type) ? field.type : 'text';
      return {
      id: (field.id || '').toString().trim(),
      type,
      label: (field.label || '').toString().trim() || defaultSchemaFieldLabel(type, index + 1),
      required: field.required === true || field.required === 1 || field.required === '1',
      price_delta: Number(field.price_delta) || 0,
      options: Array.isArray(field.options) ? field.options.map((opt) => ({
        id: (opt.id || '').toString().trim(),
        label: (opt.label || '').toString().trim(),
        price_delta: Number(opt.price_delta) || 0,
        duration_minutes: Number(opt.duration_minutes) || 0
      })) : []
    };
    })
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
            { id: 'a', label: 'Možnost A', price_delta: 0, duration_minutes: 0 },
            { id: 'b', label: 'Možnost B', price_delta: 0, duration_minutes: 0 }
          ];
        }
      } else {
        field.options = [];
      }
      onChange && onChange(true);
    });
    typeWrap.appendChild(typeLabel);
    typeWrap.appendChild(typeSelect);

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

    rowTop.appendChild(typeWrap);
    rowTop.appendChild(reqWrap);

    card.appendChild(rowTop);

    if (field.type === 'select' || field.type === 'multiselect') {
      const optionsWrap = document.createElement('div');
      optionsWrap.className = 'schema-options';

      const optionTitle = document.createElement('div');
      optionTitle.className = 'custom-title';
      optionTitle.textContent = 'Možnosti (s cenou)';
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
        optPriceLabel.textContent = 'Cena (Kč)';
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

        const optDurationWrap = document.createElement('div');
        optDurationWrap.className = 'field';
        const optDurationLabel = document.createElement('label');
        optDurationLabel.textContent = 'Čas (min)';
        const optDurationSelect = document.createElement('select');
        optDurationSelect.innerHTML = durationOptions()
          .map((value) => `<option value="${value}">${value}</option>`)
          .join('');
        optDurationSelect.value = String(Number(opt.duration_minutes) || 0);
        optDurationSelect.addEventListener('change', () => {
          opt.duration_minutes = Number(optDurationSelect.value) || 0;
          onChange && onChange();
        });
        optDurationWrap.appendChild(optDurationLabel);
        optDurationWrap.appendChild(optDurationSelect);

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
        row.appendChild(optDurationWrap);
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
        field.options = [...(field.options || []), { id: nextId, label: nextLabel, price_delta: 0, duration_minutes: 0 }];
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

function formatTimeOnly(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString('cs-CZ', {
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
  const canInventory = isAdmin && isFeatureEnabled('inventory');
  const canCalendar = !!state.auth.user && isFeatureEnabled('calendar');
  const canBilling = !!state.auth.user && isFeatureEnabled('billing');
  const canNotifications = !!state.auth.user && isFeatureEnabled('notifications');

  if (dom.btnEconomy) dom.btnEconomy.textContent = 'Ekonomika';
  if (dom.btnInventory) dom.btnInventory.textContent = 'Sklad';
  if (dom.btnCalendar) dom.btnCalendar.textContent = 'Kalendář';
  if (dom.btnBilling) dom.btnBilling.textContent = 'Fakturace';
  if (dom.btnNotifications) dom.btnNotifications.textContent = 'Notifikace';

  dom.btnEconomy.classList.toggle('hidden', !canEconomy || isReception);
  if (dom.btnInventory) {
    dom.btnInventory.classList.toggle('hidden', !canInventory);
  }
  dom.btnCalendar.classList.toggle('hidden', !canCalendar);
  dom.btnBilling.classList.toggle('hidden', !canBilling);
  dom.btnNotifications.classList.toggle('hidden', !canNotifications);
  dom.summaryStats.classList.toggle('hidden', !isAdmin);
  dom.btnLogout.classList.toggle('hidden', !state.auth.user);
  [dom.btnEconomy, dom.btnInventory, dom.btnCalendar, dom.btnBilling, dom.btnNotifications].forEach((button) => {
    if (!button) return;
    button.classList.remove('pro-button');
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
    workers: data.workers || [],
    stockItems: data.stockItems || []
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
  state.openVisitGroups = {};
  state.visitWorkerChanges = {};
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

  const selectedAncestorIds = new Set();
  if (state.selectedServiceId) {
    let cursor = serviceById.get(String(state.selectedServiceId));
    while (cursor && cursor.parent_id) {
      selectedAncestorIds.add(String(cursor.parent_id));
      cursor = serviceById.get(String(cursor.parent_id));
    }
  }

  const renderNestedTree = (parentKey) => {
    const list = childrenByParent.get(parentKey) || [];
    return list
      .map((service) => {
        const id = String(service.id);
        const hasChildren = parentIds.has(String(service.id));
        if (hasChildren) {
          const isOpen = selectedAncestorIds.has(id);
          const parentActive = selectedAncestorIds.has(id) ? 'active' : '';
          return `
            <div class="service-submenu-node ${isOpen ? 'open' : ''}" data-node-id="${id}">
              <button type="button" class="service-button service-submenu-parent-toggle ${parentActive}" data-service-sub-toggle="${id}" aria-expanded="${isOpen ? 'true' : 'false'}">
                <span class="service-dropdown-label">${escapeHtml(service.name)}</span>
                <span class="service-submenu-chevron" aria-hidden="true">▾</span>
              </button>
              <div class="service-submenu-nested">
                ${renderNestedTree(id)}
              </div>
            </div>
          `;
        }
        const active = service.id === state.selectedServiceId ? 'active' : '';
        return `<button type="button" class="service-button ${active}" data-id="${service.id}">${escapeHtml(service.name)}</button>`;
      })
      .join('');
  };

  const renderRootTree = () => {
    const list = childrenByParent.get('') || [];
    return list
      .map((service) => {
        const id = String(service.id);
        const hasChildren = parentIds.has(id);
        if (!hasChildren) {
          const active = service.id === state.selectedServiceId ? 'active' : '';
          return `<button type="button" class="service-button ${active}" data-id="${service.id}">${escapeHtml(service.name)}</button>`;
        }
        const isOpen = selectedAncestorIds.has(id);
        const parentActive = selectedAncestorIds.has(id) ? 'active' : '';
        return `
          <div class="service-dropdown-wrap ${isOpen ? 'open' : ''}" data-parent-id="${id}">
            <button type="button" class="service-button service-parent-toggle ${parentActive}" data-service-parent-toggle="${id}" aria-expanded="${isOpen ? 'true' : 'false'}">
              <span class="service-dropdown-label">${escapeHtml(service.name)}</span>
              <span class="service-dropdown-chevron" aria-hidden="true">▾</span>
            </button>
            <div class="service-dropdown-children">
              ${renderNestedTree(id)}
            </div>
          </div>
        `;
      })
      .join('');
  };

  dom.servicePicker.innerHTML = renderRootTree();

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
    if (button.dataset.serviceSubToggle) {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const node = button.closest('.service-submenu-node');
        if (!node) return;
        const willOpen = !node.classList.contains('open');
        node.classList.toggle('open', willOpen);
        button.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      });
      return;
    }
    if (!button.dataset.id) return;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      selectService(button.dataset.id, { userTriggered: true });
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
      selectService(firstLeaf.id, { userTriggered: false });
    }
  } else if (state.selectedServiceId) {
    selectService(state.selectedServiceId, { userTriggered: false });
  } else {
    dom.serviceFormGeneric.classList.add('hidden');
  }
}

function selectService(id, options = {}) {
  const previous = state.selectedServiceId;
  if (previous && previous !== id) {
    storeCurrentServiceDraft();
  }

  state.selectedServiceId = id;
  const service = state.settings.services.find((item) => item.id === id);
  if (!service) return;
  const schemaJson = (service.form_schema_json || '').toString();
  state.selectedServiceSchemaJson = schemaJson;
  state.selectedServiceSchema = parseServiceSchemaJson(schemaJson);
  const draft = getPendingServiceDraft(id);
  state.currentServiceTouched = Boolean(draft) || Boolean(options.userTriggered);

  dom.servicePicker.querySelectorAll('.service-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.id === id);
  });

  dom.serviceFormGeneric.classList.remove('hidden');
  renderActiveSchemaFields(draft?.service_data || {});
  updateGenericPricePreview();
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

  const grouped = [];
  const byKey = new Map();
  state.visits.forEach((visit) => {
    const key = visit.batch_id ? `batch:${visit.batch_id}` : `single:${visit.id}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        visits: [],
        total: 0,
        date: visit.date || '',
        created_at: visit.created_at || '',
        payment_method: visit.payment_method || 'cash',
        worker_id: visit.worker_id || '',
        worker_name: visit.worker_name || '',
        worker_mixed: false,
        note: visit.note || '',
        titles: []
      };
      byKey.set(key, group);
      grouped.push(group);
    }

    group.visits.push(visit);
    group.total += Math.max(0, Number(visit.total) || 0);
    const visitWorkerId = (visit.worker_id || '').toString().trim();
    const visitWorkerName = (visit.worker_name || '').toString().trim();
    if (!group.worker_id && visitWorkerId) group.worker_id = visitWorkerId;
    if (!group.worker_name && visitWorkerName) group.worker_name = visitWorkerName;
    if (visitWorkerId && group.worker_id && visitWorkerId !== group.worker_id) group.worker_mixed = true;
    if (visitWorkerName && group.worker_name && visitWorkerName !== group.worker_name) group.worker_mixed = true;
    if (group.worker_mixed) {
      group.worker_id = '';
      group.worker_name = 'Více pracovníků';
    }
    if (visit.created_at) {
      const current = Date.parse(group.created_at || '') || 0;
      const incoming = Date.parse(visit.created_at) || 0;
      if (incoming >= current) {
        group.created_at = visit.created_at;
      }
    }

    const serviceName = visit.service_name || 'Služba';
    const treatment = visit.treatment_name ? ` • ${visit.treatment_name}` : '';
    const visitTitle = `${serviceName}${treatment}`.trim();
    if (visitTitle && !group.titles.includes(visitTitle)) {
      group.titles.push(visitTitle);
    }
  });

  dom.visitsList.innerHTML = grouped
    .map((group) => {
      const changeInfo = state.visitWorkerChanges[group.key];
      if (changeInfo && changeInfo.new_worker_id !== group.worker_id) {
        delete state.visitWorkerChanges[group.key];
      }
      const baselineInfo = state.visitWorkerChanges[group.key];
      if (baselineInfo && baselineInfo.base_worker_id && baselineInfo.base_worker_id === group.worker_id) {
        delete state.visitWorkerChanges[group.key];
      }
      const activeChange = state.visitWorkerChanges[group.key] || null;
      const title = group.titles.join(' + ') || 'Služba';
      const worker = activeChange
        ? ` • <span class="history-worker-old">${escapeHtml(activeChange.old_worker_name || 'Neurčeno')}</span> <span class="history-worker-arrow">→</span> <span class="history-worker-new">${escapeHtml(activeChange.new_worker_name || 'Neurčeno')}</span>`
        : group.worker_name
          ? ` • ${escapeHtml(group.worker_name)}`
          : '';
      const payment = group.payment_method === 'transfer' ? 'Převodem' : 'Hotově';
      const savedTime = formatTimeOnly(group.created_at);
      const savedTimeLabel = savedTime ? ` • uloženo ${savedTime}` : '';
      const note = group.note ? `Poznámka: ${group.note}` : '';
      const noteLine = note ? `<div class="history-meta">${note}</div>` : '';
      const isOpen = Boolean(state.openVisitGroups[group.key]);
      const toggleLabel = isOpen ? 'Skrýt detail' : 'Otevřít detail';
      const workerSelect = isOpen && state.auth.user?.role === 'admin'
        ? `<label class="history-worker-select">
            <span>Pracovník</span>
            <select data-history-worker-group="${escapeHtml(group.key)}">
              <option value="" ${group.worker_id ? '' : 'selected'}>— vyber pracovníka —</option>
              ${state.settings.workers
                .map((workerItem) => {
                  const selected = workerItem.id === group.worker_id ? 'selected' : '';
                  return `<option value="${workerItem.id}" ${selected}>${escapeHtml(workerItem.name)}</option>`;
                })
                .join('')}
            </select>
          </label>`
        : '';
      return `
        <div class="history-card">
          <div class="history-title">
            <span>${title}</span>
            <span>${formatCzk(group.total)}</span>
          </div>
          <div class="history-meta">${group.date}${savedTimeLabel} • ${payment}${worker}</div>
          ${noteLine}
          <div class="history-actions">
            <button type="button" class="ghost history-toggle" data-history-group="${escapeHtml(group.key)}">${toggleLabel}</button>
            ${workerSelect}
          </div>
          ${isOpen ? renderVisitGroupDetails(group) : ''}
        </div>
      `;
    })
    .join('');

  dom.visitsList.querySelectorAll('.history-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.historyGroup || '';
      if (!key) return;
      state.openVisitGroups[key] = !state.openVisitGroups[key];
      renderVisits();
    });
  });

  dom.visitsList.querySelectorAll('[data-history-worker-group]').forEach((selectEl) => {
    selectEl.addEventListener('change', async () => {
      const groupKey = selectEl.dataset.historyWorkerGroup || '';
      const group = grouped.find((item) => item.key === groupKey);
      if (!group) return;
      const nextWorkerId = (selectEl.value || '').toString().trim();
      if (!nextWorkerId) return;
      const currentWorkerId = (group.worker_id || '').toString();
      if (nextWorkerId === currentWorkerId) return;

      const nextWorker = state.settings.workers.find((worker) => worker.id === nextWorkerId);
      if (!nextWorker) return;

      const existingChange = state.visitWorkerChanges[groupKey] || null;
      const baseWorkerId = (existingChange?.base_worker_id || currentWorkerId || '').toString();
      const baseWorkerName = existingChange?.base_worker_name || group.worker_name || 'Neurčeno';
      const visitIds = group.visits.map((visit) => visit.id).filter(Boolean);
      if (!visitIds.length) return;

      selectEl.disabled = true;
      try {
        await api.put('/api/visits/worker', { visit_ids: visitIds, worker_id: nextWorkerId });
        const visitIdSet = new Set(visitIds);
        state.visits = state.visits.map((visit) => {
          if (!visitIdSet.has(visit.id)) return visit;
          return {
            ...visit,
            worker_id: nextWorkerId,
            worker_name: nextWorker.name
          };
        });
        if (baseWorkerId && nextWorkerId === baseWorkerId) {
          delete state.visitWorkerChanges[groupKey];
        } else {
          state.visitWorkerChanges[groupKey] = {
            base_worker_id: baseWorkerId,
            base_worker_name: baseWorkerName,
            old_worker_name: baseWorkerName,
            new_worker_name: nextWorker.name,
            new_worker_id: nextWorkerId
          };
        }
        renderVisits();
      } catch (err) {
        selectEl.disabled = false;
        selectEl.value = currentWorkerId;
      }
    });
  });
}

function parseJsonSafe(value, fallback = null) {
  try {
    const parsed = JSON.parse((value || '').toString());
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (err) {
    return fallback;
  }
}

function isEmptyServiceValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'boolean') return value === false;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

function formatServiceFieldValue(field, value) {
  if (field.type === 'checkbox') {
    return value ? 'Ano' : 'Ne';
  }
  if (field.type === 'select') {
    const option = (field.options || []).find((opt) => opt.id === String(value));
    return option ? option.label : String(value);
  }
  if (field.type === 'multiselect') {
    const values = Array.isArray(value) ? value : [];
    if (!values.length) return '';
    const labels = values.map((id) => {
      const option = (field.options || []).find((opt) => opt.id === String(id));
      return option ? option.label : String(id);
    });
    return labels.join(', ');
  }
  return String(value);
}

function buildVisitDetailSections(visit) {
  const data = parseJsonSafe(visit.service_data, {});
  if (!data || typeof data !== 'object') {
    return { steps: [], extras: [] };
  }
  const schema = parseServiceSchemaJson(visit.service_schema_json);
  const steps = [];
  const extras = [];
  const usedKeys = new Set();

  if (schema && Array.isArray(schema.fields)) {
    schema.fields.forEach((field) => {
      if (!field || !field.id || field.type === 'heading') return;
      const raw = data[field.id];
      if (isEmptyServiceValue(raw)) return;
      const value = formatServiceFieldValue(field, raw);
      if (!value) return;
      steps.push({
        key: field.label || field.id,
        value
      });

      if ((field.type === 'checkbox' || field.type === 'number' || field.type === 'text' || field.type === 'textarea') && Number(field.price_delta) > 0) {
        extras.push({
          label: field.label || field.id,
          amount: Number(field.price_delta) || 0
        });
      }

      if (field.type === 'select') {
        const option = (field.options || []).find((opt) => opt.id === String(raw));
        if (option && Number(option.price_delta) > 0) {
          extras.push({
            label: `${field.label || field.id}: ${option.label}`,
            amount: Number(option.price_delta) || 0
          });
        }
      }

      if (field.type === 'multiselect') {
        const selected = Array.isArray(raw) ? raw : [];
        selected.forEach((id) => {
          const option = (field.options || []).find((opt) => opt.id === String(id));
          if (option && Number(option.price_delta) > 0) {
            extras.push({
              label: `${field.label || field.id}: ${option.label}`,
              amount: Number(option.price_delta) || 0
            });
          }
        });
      }

      usedKeys.add(field.id);
    });
  }

  Object.entries(data).forEach(([key, raw]) => {
    if (usedKeys.has(key) || isEmptyServiceValue(raw)) return;
    const value = Array.isArray(raw) ? raw.join(', ') : String(raw);
    if (!value.trim()) return;
    steps.push({
      key,
      value
    });
  });

  return { steps, extras };
}

function renderVisitGroupDetails(group) {
  const visits = Array.isArray(group.visits) ? group.visits : [];
  if (!visits.length) return '';

  const items = visits.map((visit) => {
    const serviceName = visit.service_name || 'Služba';
    const treatment = visit.treatment_name ? ` • ${visit.treatment_name}` : '';
    const title = `${serviceName}${treatment}`.trim();
    const detailSections = buildVisitDetailSections(visit);
    const stepsHtml = detailSections.steps.length
      ? `<div class="history-detail-grid">${detailSections.steps
        .map((row) => `
          <div class="history-detail-row">
            <span class="history-detail-key">${escapeHtml(row.key)}</span>
            <span>${escapeHtml(row.value)}</span>
          </div>
        `)
        .join('')}</div>`
      : '<div class="history-detail-empty">Bez zadaných kroků.</div>';
    const note = (visit.note || '').toString().trim();
    const noteHtml = note
      ? `<div class="history-detail-note">${escapeHtml(note)}</div>`
      : '<div class="history-detail-empty">Bez poznámky.</div>';
    return `
      <div class="history-detail-item">
        <div class="history-detail-head">
          <span>${escapeHtml(title)}</span>
          <span>${formatCzk(visit.total)}</span>
        </div>
        <div class="history-detail-section">
          <div class="history-detail-section-title">Použité kroky</div>
          ${stepsHtml}
        </div>
        <div class="history-detail-section">
          <div class="history-detail-section-title">Poznámka</div>
          ${noteHtml}
        </div>
      </div>
    `;
  });

  return `<div class="history-detail-wrap">${items.join('')}</div>`;
}

function setFormValues(client) {
  dom.fullName.value = client?.full_name || '';
  dom.phone.value = client?.phone || '';
  dom.email.value = client?.email || '';
  dom.skinType.value = client?.skin_type_id || '';
  dom.skinNotes.value = client?.skin_notes || '';
  dom.cream.value = client?.cream || '';
}

function getSelectedService() {
  if (!state.selectedServiceId) return null;
  return state.settings.services.find((item) => item.id === state.selectedServiceId) || null;
}

function getPendingServiceDraft(serviceId) {
  return state.pendingServiceDrafts[String(serviceId)] || null;
}

function upsertPendingServiceDraft(draft) {
  if (!draft || !draft.service_id) return;
  const key = String(draft.service_id);
  if (!state.pendingServiceOrder.includes(key)) {
    state.pendingServiceOrder.push(key);
  }
  state.pendingServiceDrafts[key] = draft;
}

function removePendingServiceDraft(serviceId) {
  const key = String(serviceId || '');
  if (!key) return;
  delete state.pendingServiceDrafts[key];
  state.pendingServiceOrder = state.pendingServiceOrder.filter((id) => id !== key);
}

function clearPendingServiceDrafts() {
  state.pendingServiceDrafts = {};
  state.pendingServiceOrder = [];
  state.currentServiceTouched = false;
}

function isBillableDraft(draft) {
  if (!draft) return false;
  return Math.max(0, Number(draft.auto_total) || 0) > 0;
}

function buildCurrentServiceDraft() {
  const selectedService = getSelectedService();
  if (!selectedService) return null;
  const schemaValues = collectSchemaValues(dom.genericSchemaFields, state.selectedServiceSchema);
  const schemaPrice = computeSchemaExtras(state.selectedServiceSchema, schemaValues);
  const basePrice = Math.max(0, Number(selectedService.price) || 0);
  return {
    service_id: selectedService.id,
    service_name: selectedService.name || 'Služba',
    service_data: schemaValues,
    auto_total: basePrice + schemaPrice
  };
}

function shouldStoreCurrentDraft(draft) {
  return isBillableDraft(draft);
}

function storeCurrentServiceDraft({ force = false } = {}) {
  const draft = buildCurrentServiceDraft();
  if (!draft) return;
  if (force || shouldStoreCurrentDraft(draft)) {
    upsertPendingServiceDraft(draft);
    return;
  }
  removePendingServiceDraft(draft.service_id);
}

function getPendingServiceDraftsWithCurrent() {
  const seen = new Set();
  const drafts = [];

  state.pendingServiceOrder.forEach((serviceId) => {
    const draft = state.pendingServiceDrafts[serviceId];
    if (!shouldStoreCurrentDraft(draft)) return;
    drafts.push(draft);
    seen.add(String(draft.service_id));
  });

  const currentDraft = buildCurrentServiceDraft();
  if (currentDraft && shouldStoreCurrentDraft(currentDraft)) {
    const key = String(currentDraft.service_id);
    if (seen.has(key)) {
      const index = drafts.findIndex((item) => String(item.service_id) === key);
      if (index >= 0) drafts[index] = currentDraft;
    } else {
      drafts.push(currentDraft);
    }
  }

  return drafts;
}

function renderSelectedServicesSummary(drafts) {
  if (!dom.genSelectedServices) return;
  if (!drafts.length) {
    dom.genSelectedServices.textContent = 'Vybrané služby: žádné';
    return;
  }
  const labels = drafts.map((draft) => draft.service_name).join(' + ');
  dom.genSelectedServices.textContent = `Vybrané služby: ${labels}`;
}

function resetVisitFields({ clearPending = true } = {}) {
  if (clearPending) {
    clearPendingServiceDrafts();
  }
  dom.genPrice.value = '';
  dom.genPrice.dataset.manual = '0';
  dom.genDate.value = todayLocal();
  dom.genWorker.value = getDefaultWorkerId();
  dom.genPaymentMethod.value = 'cash';
  dom.genNote.value = '';
  if (dom.genericSchemaFields) {
    dom.genericSchemaFields.innerHTML = '';
  }
  dom.genSchemaExtras.value = '';
  renderSelectedServicesSummary([]);
  renderActiveSchemaFields({});
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
  const drafts = getPendingServiceDraftsWithCurrent();
  const autoPrice = drafts.reduce((sum, item) => sum + Math.max(0, Number(item.auto_total) || 0), 0);
  dom.genSchemaExtras.value = formatCzk(autoPrice);
  renderSelectedServicesSummary(drafts);

  const manualMode = dom.genPrice.dataset.manual === '1';
  if (!manualMode) {
    dom.genPrice.value = drafts.length ? String(autoPrice) : '';
    dom.genPrice.dataset.manual = '0';
  }
}

function renderActiveSchemaFields(initialValues = {}) {
  const schema = state.selectedServiceSchema;
  renderSchemaFields(dom.genericSchemaFields, schema, () => {
    state.currentServiceTouched = true;
    updateGenericPricePreview();
  }, initialValues);
}

async function addGenericVisit() {
  if (!state.selectedServiceId && state.pendingServiceOrder.length === 0) {
    alert('Vyber službu.');
    return null;
  }

  const clientId = await saveClient();
  if (!clientId) return null;
  const clientName = (dom.fullName.value || '').toString().trim();
  const clientPhone = (dom.phone.value || '').toString().trim();
  const clientEmail = (dom.email.value || '').toString().trim();

  if (!dom.genWorker.value) {
    alert('Vyber pracovníka pro ekonomiku.');
    return null;
  }

  storeCurrentServiceDraft();
  const drafts = getPendingServiceDraftsWithCurrent();
  if (!drafts.length) {
    alert('Vyber alespoň jednu účtovanou službu.');
    return null;
  }

  const totalAuto = drafts.reduce((sum, item) => sum + Math.max(0, Number(item.auto_total) || 0), 0);
  const finalTotalRaw = (dom.genPrice.value || '').toString().trim();
  const finalTotal = finalTotalRaw === '' ? totalAuto : Number(finalTotalRaw);
  if (!Number.isFinite(finalTotal) || finalTotal < 0) {
    alert('Celková cena musí být číslo 0 nebo vyšší.');
    return null;
  }

  const totals = drafts.map((item) => Math.max(0, Number(item.auto_total) || 0));
  const diff = finalTotal - totalAuto;
  if (totals.length) {
    const adjustedFirst = totals[0] + diff;
    if (adjustedFirst < 0) {
      alert('Celková cena je příliš nízká vůči vybraným službám.');
      return null;
    }
    totals[0] = adjustedFirst;
  }

  const batchId = drafts.length > 1 ? randomId('batch') : null;

  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index];
    await api.post(`/api/clients/${clientId}/visits`, {
      date: dom.genDate.value || todayLocal(),
      batch_id: batchId,
      service_id: draft.service_id,
      manual_total: Math.round(totals[index]),
      note: dom.genNote.value.trim(),
      worker_id: dom.genWorker.value,
      payment_method: dom.genPaymentMethod.value,
      service_data: draft.service_data || {}
    });
  }

  resetVisitFields();
  await loadVisits(clientId);
  await loadSummary();
  return { clientId, clientName, clientPhone, clientEmail };
}

async function addGenericVisitAndPickCalendar() {
  const result = await addGenericVisit();
  if (!result) return;
  await runProFeature('calendar', () =>
    openCalendarModal({
      prefillClientName: result.clientName,
      prefillClientId: result.clientId,
      prefillClientPhone: result.clientPhone,
      prefillClientEmail: result.clientEmail
    })
  );
}

function openModal(contentHtml, modalClass = '') {
  const className = ['modal', modalClass].filter(Boolean).join(' ');
  dom.modalRoot.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true">
      <div class="${className}">${contentHtml}</div>
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
  const options = [0];
  for (let minutes = 15; minutes <= 360; minutes += 15) {
    options.push(minutes);
  }
  return options;
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

function buildCalendarHtml(year, month, reservationStats) {
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
    const stat = reservationStats.get(dateKey) || null;
    const reservationsCount = Math.max(0, toInt(stat?.reservations_count, 0));
    const clientsCount = Math.max(0, toInt(stat?.clients_count, reservationsCount));
    const hasReservation = reservationsCount > 0;
    const title = hasReservation ? ` title="${reservationsCount} rezervací • ${clientsCount} zákaznic"` : '';
    cells.push(`
      <div class="calendar-day${hasReservation ? ' has-reservation' : ''}"${title}>
        <div class="calendar-day-number">${dayNumber}</div>
        ${hasReservation ? `<span class="calendar-day-count">${reservationsCount}</span>` : ''}
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

async function openCalendarModal(options = {}) {
  const prefillClientName = (options.prefillClientName || '').toString().trim();
  const prefillClientId = (options.prefillClientId || '').toString().trim();
  const prefillClientPhone = (options.prefillClientPhone || '').toString().trim();
  const prefillClientEmail = (options.prefillClientEmail || '').toString().trim();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthNumber = month + 1;
  let reservationStats = new Map();
  try {
    const data = await api.get(`/api/reservations/calendar?year=${year}&month=${monthNumber}`);
    const rows = Array.isArray(data.counts)
      ? data.counts
      : (Array.isArray(data.days) ? data.days.map((date) => ({ date, reservations_count: 1, clients_count: 1 })) : []);
    reservationStats = new Map(
      rows
        .map((row) => {
          const date = String(row.date || '').trim();
          if (!date) return null;
          return [
            date,
            {
              reservations_count: Math.max(0, toInt(row.reservations_count, 0)),
              clients_count: Math.max(0, toInt(row.clients_count, 0))
            }
          ];
        })
        .filter(Boolean)
    );
  } catch (err) {
    reservationStats = new Map();
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
  const overrideTimeCheckboxes = timeSlots()
    .map(
      (time) => `
        <label class="checkbox-pill">
          <input type="checkbox" class="availability-override-time" value="${time}" />
          ${time}
        </label>
      `
    )
    .join('');

  let servicesSource = Array.isArray(state.settings.services) ? state.settings.services : [];
  if (!servicesSource.length) {
    try {
      const data = await api.get('/api/public/services');
      servicesSource = Array.isArray(data.services) ? data.services : [];
    } catch (err) {
      servicesSource = [];
    }
  }
  const parentIds = new Set(servicesSource.filter((service) => service.parent_id).map((service) => String(service.parent_id)));
  const leafServices = servicesSource
    .filter((service) => !parentIds.has(String(service.id)))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'cs'));
  const bookingCatalog = leafServices.map((service) => {
    const schema = parseServiceSchemaJson(service.form_schema_json);
    const rawMiniOptions = [];
    if (schema && Array.isArray(schema.fields)) {
      schema.fields.forEach((field) => {
        if (field.type !== 'select' && field.type !== 'multiselect') return;
        (field.options || []).forEach((option) => {
          const optionId = (option.id || '').toString().trim();
          const optionLabel = (option.label || '').toString().trim();
          if (!optionId || !optionLabel) return;
          rawMiniOptions.push({
            key: `${field.id}::${optionId}`,
            field_label: (field.label || '').toString().trim(),
            option_label: optionLabel,
            duration_minutes: normalizeDurationMinutes(option.duration_minutes, 0)
          });
        });
      });
    }
    const distinctFieldLabels = new Set(rawMiniOptions.map((item) => item.field_label).filter(Boolean));
    const miniOptions = rawMiniOptions.map((option) => ({
      key: option.key,
      label:
        distinctFieldLabels.size > 1 && option.field_label
          ? `${option.field_label}: ${option.option_label}`
          : option.option_label,
      duration_minutes: option.duration_minutes
    }));
    return {
      id: service.id,
      name: service.name || 'Služba',
      duration_minutes: normalizeDurationMinutes(service.duration_minutes, 0),
      miniOptions
    };
  });
  const bookingCatalogById = new Map(bookingCatalog.map((item) => [String(item.id), item]));
  const bookingServiceOptions = [
    '<option value="">Vyber službu (v dalším kroku vyberete konkrétní druh ošetření)</option>',
    ...bookingCatalog.map(
      (service) =>
        `<option value="${service.id}">${escapeHtml(service.name)} • ${normalizeDurationMinutes(service.duration_minutes, 0)} min</option>`
    )
  ].join('');
  const availabilityServiceCheckboxes = bookingCatalog.length
    ? bookingCatalog
      .map(
        (service) => `
          <label class="checkbox-pill checkbox-pill-service">
            <input type="checkbox" class="availability-service" value="${service.id}" />
            <span>${escapeHtml(service.name)}</span>
          </label>
        `
      )
      .join('')
    : '<div class="hint">Nejsou dostupné žádné služby.</div>';
  const overrideServiceCheckboxes = bookingCatalog.length
    ? bookingCatalog
      .map(
        (service) => `
          <label class="checkbox-pill checkbox-pill-service">
            <input type="checkbox" class="availability-override-service" value="${service.id}" />
            <span>${escapeHtml(service.name)}</span>
          </label>
        `
      )
      .join('')
    : '<div class="hint">Nejsou dostupné žádné služby.</div>';

  openModal(`
    <div class="modal-header">
      <div>
        <h2>Kalendář</h2>
        <div class="meta">Rezervace pro ${monthName(month)} ${year}</div>
      </div>
      <button class="ghost" id="closeModal">Zavřít</button>
    </div>
    <div class="modal-grid">
      <div class="settings-section">
        <h3>Nová rezervace</h3>
        <div class="meta">Nejprve vyber službu, případně zaškrtni minislužby (chatbox), pak den a čas.</div>
        <div class="field-row">
          <div class="field">
            <label>Služba</label>
            <select id="calendarBookingService">${bookingServiceOptions}</select>
          </div>
          <div class="field">
            <label>Celkový čas</label>
            <input type="text" id="calendarBookingDuration" value="0 min" readonly />
          </div>
        </div>
        <div class="field">
          <label>Minislužby (chatbox)</label>
          <div id="calendarBookingVariants" class="addon-block hidden"></div>
          <div class="meta" id="calendarBookingVariantHint">Vyber službu.</div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Vybraný termín</label>
            <input type="text" id="calendarBookingPicked" value="" placeholder="Zatím nevybráno" readonly />
          </div>
        </div>
        <div id="calendarBookingDateMap" class="date-availability hidden"></div>
        <div id="calendarBookingSlots" class="slot-grid"></div>
        <div id="calendarBookingSlotsHint" class="hint">Vyber službu.</div>
        <div class="field-row">
          <div class="field">
            <label>Jméno klientky</label>
            <input type="text" id="calendarBookingName" placeholder="Např. Jana Nováková" list="calendarBookingClientList" autocomplete="off" />
            <datalist id="calendarBookingClientList"></datalist>
          </div>
          <div class="field">
            <label>Telefon</label>
            <input type="text" id="calendarBookingPhone" />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>E-mail</label>
            <input type="email" id="calendarBookingEmail" />
          </div>
          <div class="field">
            <label>Poznámka</label>
            <input type="text" id="calendarBookingNote" />
          </div>
        </div>
        <div class="actions-row">
          <button class="primary" id="calendarBookingSave" disabled>Uložit rezervaci</button>
        </div>
      </div>

      ${buildCalendarHtml(year, month, reservationStats)}
      <div class="hint">Oranžové pole značí den s rezervací. Číslo je počet rezervací v daný den.</div>

      <div class="settings-section">
        <h3 id="calendarReservationsTitle">Rezervace v měsíci</h3>
        <div class="meta" id="calendarReservationsMeta">Klikni na konkrétní datum v kalendáři pro detail dne.</div>
        <div id="calendarReservations" class="settings-list"></div>
      </div>
      ${
        canEditAvailability
          ? `
            <div class="settings-section availability-section">
              <h3>Moje dostupnost</h3>
              <div class="meta">Pracovník: ${escapeHtml(state.auth.user?.full_name || '')}</div>
              <div class="meta">Vyber pracovní dny, časy a služby, které provádíš (platí každý týden).</div>
              <div class="availability-services">
                ${availabilityServiceCheckboxes}
              </div>
              <div class="availability-days">${dayCheckboxes}</div>
              <div class="availability-times">${timeCheckboxes}</div>
              <div class="actions-row">
                <button class="primary" id="availabilitySave">Uložit dostupnost</button>
              </div>
              <div class="availability-override">
                <h4>Výjimka pro konkrétní den</h4>
                <div class="meta">Toto nastavení má prioritu před týdenním plánem (jen pro vybraný den).</div>
                <div class="field-row">
                  <div class="field">
                    <label>Datum výjimky</label>
                    <input type="date" id="availabilityOverrideDate" />
                  </div>
                </div>
                <div class="availability-services">
                  ${overrideServiceCheckboxes}
                </div>
                <div class="availability-times">
                  ${overrideTimeCheckboxes}
                </div>
                <div class="actions-row">
                  <button class="primary" id="availabilityOverrideSave">Uložit výjimku dne</button>
                  <button class="ghost" id="availabilityOverrideDelete">Smazat výjimku</button>
                </div>
                <div class="meta" id="availabilityOverrideHint">Vyber datum a uprav služby/časy.</div>
                <div id="availabilityOverrideList" class="settings-list"></div>
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
    const data = await api.get(`/api/reservations?year=${year}&month=${monthNumber}`);
    monthReservations = data.reservations || [];
  } catch (err) {
    monthReservations = [];
  }

  const listEl = document.getElementById('calendarReservations');
  const listTitleEl = document.getElementById('calendarReservationsTitle');
  const listMetaEl = document.getElementById('calendarReservationsMeta');
  const formatDateCz = (isoDate) => {
    const [yy, mm, dd] = String(isoDate || '').split('-');
    if (!yy || !mm || !dd) return '';
    return `${dd}.${mm}.${yy}`;
  };
  const normalizeWorkerName = (value) => {
    const name = (value || '').toString().trim();
    return name || 'Bez přiřazeného pracovníka';
  };
  const sortByTime = (a, b) => String(a.time_slot || '').localeCompare(String(b.time_slot || ''), 'cs');
  const renderDayGroupedList = (items) => {
    const groups = new Map();
    items.forEach((item) => {
      const workerName = normalizeWorkerName(item.worker_name);
      if (!groups.has(workerName)) groups.set(workerName, []);
      groups.get(workerName).push(item);
    });
    const sortedGroups = Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'cs'))
      .map(([workerName, rows]) => ({
        workerName,
        rows: rows.sort(sortByTime)
      }));

    listEl.innerHTML = sortedGroups
      .map(
        (group) => `
          <section class="calendar-res-group">
            <header class="calendar-res-group-title">
              <span>${escapeHtml(group.workerName)}</span>
              <span>${group.rows.length}x</span>
            </header>
            ${group.rows
              .map(
                (item) => `
                  <div class="calendar-res-entry">
                    <span class="calendar-res-entry-main">${escapeHtml(item.time_slot || '--:--')} • ${escapeHtml(
                  item.service_name || 'Služba'
                )} • ${escapeHtml(item.client_name || 'Klientka')}</span>
                    <span class="calendar-res-entry-side">${escapeHtml(item.phone || item.email || '')}</span>
                  </div>
                `
              )
              .join('')}
          </section>
        `
      )
      .join('');
  };
  const renderReservationList = (dateFilter = '') => {
    const filtered = dateFilter
      ? monthReservations.filter((item) => item.date === dateFilter)
      : monthReservations;
    if (dateFilter) {
      listTitleEl.textContent = `Rezervace ${formatDateCz(dateFilter)}`;
      listMetaEl.textContent = 'Seřazeno podle pracovníků a časů.';
    } else {
      listTitleEl.textContent = 'Rezervace v měsíci';
      listMetaEl.textContent = `Přehled pro ${monthName(month)} ${year}. Klikni na datum pro detail dne.`;
    }
    if (!filtered.length) {
      listEl.innerHTML = dateFilter
        ? '<div class="hint">V tento den zatím žádné rezervace.</div>'
        : '<div class="hint">Zatím žádné rezervace.</div>';
      return;
    }
    if (dateFilter) {
      renderDayGroupedList(filtered);
      return;
    }
    listEl.innerHTML = filtered
      .sort((a, b) => String(a.date).localeCompare(String(b.date), 'cs') || sortByTime(a, b))
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

  const bookingState = {
    serviceId: '',
    optionKeys: [],
    optionLabels: [],
    selectedDate: '',
    selectedSlot: null,
    mapYear: year,
    mapMonth: monthNumber,
    duration: 0
  };
  const bookingServiceSelect = document.getElementById('calendarBookingService');
  const bookingVariantWrap = document.getElementById('calendarBookingVariants');
  const bookingVariantHint = document.getElementById('calendarBookingVariantHint');
  const bookingDuration = document.getElementById('calendarBookingDuration');
  const bookingDateMap = document.getElementById('calendarBookingDateMap');
  const bookingSlots = document.getElementById('calendarBookingSlots');
  const bookingSlotsHint = document.getElementById('calendarBookingSlotsHint');
  const bookingPicked = document.getElementById('calendarBookingPicked');
  const bookingSave = document.getElementById('calendarBookingSave');
  const bookingName = document.getElementById('calendarBookingName');
  const bookingClientList = document.getElementById('calendarBookingClientList');
  const bookingPhone = document.getElementById('calendarBookingPhone');
  const bookingEmail = document.getElementById('calendarBookingEmail');
  const bookingNote = document.getElementById('calendarBookingNote');
  const bookingClientState = {
    lockedFromVisit: Boolean(prefillClientName),
    selectedClientId: prefillClientId || '',
    suggestions: [],
    searchTimer: null,
    searchSeq: 0
  };

  const normalizedName = (value) => (value || '').toString().trim().replace(/\s+/g, ' ').toLocaleLowerCase('cs');
  const findExactClientMatch = (list, name) => {
    const needle = normalizedName(name);
    if (!needle) return null;
    return (Array.isArray(list) ? list : []).find((item) => normalizedName(item.full_name) === needle) || null;
  };
  const renderClientSuggestions = (rows = []) => {
    bookingClientState.suggestions = Array.isArray(rows) ? rows : [];
    if (!bookingClientList) return;
    bookingClientList.innerHTML = bookingClientState.suggestions
      .slice(0, 25)
      .map((client) => `<option value="${escapeHtml(client.full_name || '')}"></option>`)
      .join('');
  };
  const applyMatchedClient = (client) => {
    bookingClientState.selectedClientId = client?.id || '';
    if (!client) return;
    if (!bookingPhone.value.trim() && client.phone) bookingPhone.value = client.phone;
    if (!bookingEmail.value.trim() && client.email) bookingEmail.value = client.email;
  };
  const queueClientSearch = () => {
    if (bookingClientState.lockedFromVisit) return;
    const query = bookingName.value.trim();
    if (bookingClientState.searchTimer) clearTimeout(bookingClientState.searchTimer);
    if (!query) {
      bookingClientState.selectedClientId = '';
      renderClientSuggestions([]);
      updateBookingSaveState();
      return;
    }
    bookingClientState.searchTimer = setTimeout(async () => {
      const seq = ++bookingClientState.searchSeq;
      try {
        const rows = await api.get(`/api/clients?search=${encodeURIComponent(query)}`);
        if (seq !== bookingClientState.searchSeq) return;
        renderClientSuggestions(rows);
        const exact = findExactClientMatch(rows, bookingName.value);
        applyMatchedClient(exact);
      } catch (err) {
        if (seq !== bookingClientState.searchSeq) return;
        renderClientSuggestions([]);
        bookingClientState.selectedClientId = '';
      } finally {
        updateBookingSaveState();
      }
    }, 180);
  };

  if (prefillClientName) {
    bookingName.value = prefillClientName;
    bookingName.readOnly = true;
    bookingName.classList.add('input-readonly');
    bookingName.removeAttribute('list');
    if (bookingClientList) bookingClientList.remove();
    if (prefillClientPhone) bookingPhone.value = prefillClientPhone;
    if (prefillClientEmail) bookingEmail.value = prefillClientEmail;
  }

  const displayDate = (isoDate) => {
    const [yy, mm, dd] = String(isoDate || '').split('-');
    if (!yy || !mm || !dd) return '';
    return `${dd}.${mm}.${yy}`;
  };

  const getSelectedBookingService = () => bookingCatalogById.get(String(bookingState.serviceId)) || null;

  const getSelectedBookingOptions = (service = null) => {
    const selectedService = service || getSelectedBookingService();
    if (!selectedService) return [];
    const keySet = new Set(bookingState.optionKeys || []);
    return (selectedService.miniOptions || []).filter((option) => keySet.has(option.key));
  };

  const updateBookingDuration = () => {
    const selectedService = getSelectedBookingService();
    if (!selectedService) {
      bookingState.duration = 0;
      bookingDuration.value = '0 min';
      return;
    }
    const selectedOptions = getSelectedBookingOptions(selectedService);
    if (!selectedOptions.length) {
      bookingState.duration = normalizeDurationMinutes(selectedService.duration_minutes, 0);
      bookingDuration.value = `${bookingState.duration} min`;
      return;
    }
    const optionsDuration = selectedOptions.reduce(
      (sum, option) => sum + normalizeDurationMinutes(option.duration_minutes, 0),
      0
    );
    bookingState.duration =
      optionsDuration > 0 ? optionsDuration : normalizeDurationMinutes(selectedService.duration_minutes, 0);
    bookingDuration.value = `${bookingState.duration} min`;
  };

  const syncVariantChoices = () => {
    const selectedService = getSelectedBookingService();
    if (!selectedService) {
      bookingVariantWrap.classList.add('hidden');
      bookingVariantWrap.innerHTML = '';
      bookingVariantHint.textContent = 'Vyber službu.';
      bookingState.optionKeys = [];
      bookingState.optionLabels = [];
      updateBookingDuration();
      return;
    }

    const options = Array.isArray(selectedService.miniOptions) ? selectedService.miniOptions : [];
    if (!options.length) {
      bookingVariantWrap.classList.add('hidden');
      bookingVariantWrap.innerHTML = '';
      bookingVariantHint.textContent = 'Pro tuto službu nejsou nastavené minislužby.';
      bookingState.optionKeys = [];
      bookingState.optionLabels = [];
      updateBookingDuration();
      return;
    }

    bookingVariantWrap.classList.remove('hidden');
    bookingVariantHint.textContent = 'Zaškrtni minislužby stejně jako v kartě klientky.';

    const selectedKeys = new Set(bookingState.optionKeys || []);
    const listHtml = options
      .map((option) => {
        const duration = normalizeDurationMinutes(option.duration_minutes, 0);
        const durationLabel = duration > 0 ? ` (${duration} min)` : '';
        const optionText = `${option.label}${durationLabel}`;
        const longClass = optionText.length > 43 ? ' addon-item-long' : '';
        return `
          <label class="addon-item${longClass}">
            <input type="checkbox" class="calendar-booking-option" value="${escapeHtml(option.key)}" ${
          selectedKeys.has(option.key) ? 'checked' : ''
        } />
            <span>${escapeHtml(optionText)}</span>
          </label>
        `;
      })
      .join('');

    bookingVariantWrap.innerHTML = `<div class="addon-list">${listHtml}</div>`;
    const optionInputs = bookingVariantWrap.querySelectorAll('.calendar-booking-option');
    optionInputs.forEach((input) => {
      input.addEventListener('change', async () => {
        const checkedKeys = Array.from(optionInputs)
          .filter((item) => item.checked)
          .map((item) => item.value);
        const keySet = new Set(checkedKeys);
        bookingState.optionKeys = checkedKeys;
        bookingState.optionLabels = options.filter((item) => keySet.has(item.key)).map((item) => item.label);
        bookingState.selectedDate = '';
        bookingState.selectedSlot = null;
        updateBookingDuration();
        updatePickedLabel();
        updateBookingSaveState();
        await loadBookingDays();
      });
    });
    const keySet = new Set(bookingState.optionKeys || []);
    bookingState.optionLabels = options.filter((item) => keySet.has(item.key)).map((item) => item.label);
    updateBookingDuration();
  };

  const updatePickedLabel = () => {
    if (!bookingState.selectedDate || !bookingState.selectedSlot) {
      bookingPicked.value = '';
      return;
    }
    const variantLabel = bookingState.optionLabels.length ? ` • ${bookingState.optionLabels.join(', ')}` : '';
    const durationLabel = bookingState.duration > 0 ? ` • ${bookingState.duration} min` : '';
    bookingPicked.value =
      `${displayDate(bookingState.selectedDate)} ${bookingState.selectedSlot.time_slot} • ${bookingState.selectedSlot.worker_name}${durationLabel}${variantLabel}`;
  };

  const updateBookingSaveState = () => {
    bookingSave.disabled = !(
      bookingState.serviceId &&
      bookingState.duration > 0 &&
      bookingState.selectedDate &&
      bookingState.selectedSlot &&
      bookingName.value.trim()
    );
  };

  const renderBookingSlots = (baseSlots, startSlots, blockedStarts, hintText = '') => {
    bookingSlots.innerHTML = '';
    const base = Array.isArray(baseSlots) ? baseSlots : [];
    const starts = Array.isArray(startSlots) ? startSlots : [];
    const blocked = Array.isArray(blockedStarts) ? blockedStarts : [];
    if (!base.length) {
      bookingSlotsHint.textContent = hintText || 'Pro vybraný den nejsou dostupné časy.';
      bookingSave.disabled = true;
      updatePickedLabel();
      return;
    }

    bookingSlotsHint.textContent = '';

    const baseByWorker = new Map();
    base.forEach((slot) => {
      if (!baseByWorker.has(slot.worker_id)) {
        baseByWorker.set(slot.worker_id, {
          worker_name: slot.worker_name,
          slots: new Map()
        });
      }
      baseByWorker.get(slot.worker_id).slots.set(slot.time_slot, {
        reserved: Boolean(slot.reserved)
      });
    });

    const startByWorker = new Map();
    starts.forEach((slot) => {
      if (!startByWorker.has(slot.worker_id)) {
        startByWorker.set(slot.worker_id, new Set());
      }
      startByWorker.get(slot.worker_id).add(slot.time_slot);
    });

    const workers = Array.from(baseByWorker.entries())
      .map(([id, value]) => ({
        id,
        name: value.worker_name || 'Pracovník'
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'cs'));

    const blockedSet = new Set(blocked.map((item) => `${item.worker_id}:${item.time_slot}`));
    const slotList = timeSlots();
    const requiredSlots = Math.max(1, Math.ceil(Math.max(0, Number(bookingState.duration) || 0) / 30));

    const clearSelectionHighlight = () => {
      bookingSlots.querySelectorAll('.slot-entry').forEach((entry) => {
        entry.classList.remove('active', 'is-selected', 'is-valid', 'is-invalid');
      });
      bookingSlots.querySelectorAll('.slot-button').forEach((button) => {
        button.classList.remove('active', 'is-selected', 'is-valid', 'is-invalid');
      });
      bookingSlots.querySelectorAll('.slot-worker-select').forEach((select) => {
        select.classList.remove('active', 'is-selected', 'is-valid', 'is-invalid');
      });
    };

    const highlightSelection = (workerId, startTime) => {
      clearSelectionHighlight();

      const startIndex = slotList.indexOf(startTime);
      if (startIndex === -1) return false;

      const workerSlots = baseByWorker.get(workerId)?.slots || new Map();
      const markedEntries = [];
      let ok = true;
      for (let i = 0; i < requiredSlots; i += 1) {
        const slot = slotList[startIndex + i];
        const slotMeta = slot ? workerSlots.get(slot) : null;
        if (!slot || !slotMeta || slotMeta.reserved) {
          ok = false;
          break;
        }
        const entry = bookingSlots.querySelector(`.slot-entry[data-time="${slot}"]`);
        if (entry) {
          entry.classList.add('is-selected');
          markedEntries.push(entry);
          const select = entry.querySelector('.slot-worker-select');
          if (select) {
            const hasOption = Array.from(select.options).some((option) => option.value === workerId);
            if (hasOption) {
              select.value = workerId;
            }
          }
        }
      }

      if (blockedSet.has(`${workerId}:${startTime}`)) {
        ok = false;
      }
      if (!startByWorker.get(workerId)?.has(startTime)) {
        ok = false;
      }

      markedEntries.forEach((entry, index) => {
        entry.classList.add(ok ? 'is-valid' : 'is-invalid');
        if (index === 0) {
          entry.classList.add('active');
        }
        const button = entry.querySelector('.slot-button');
        if (button) {
          button.classList.add('is-selected', ok ? 'is-valid' : 'is-invalid');
          if (index === 0) {
            button.classList.add('active');
          }
        }
        const select = entry.querySelector('.slot-worker-select');
        if (select) {
          select.classList.add('is-selected', ok ? 'is-valid' : 'is-invalid');
          if (index === 0) {
            select.classList.add('active');
          }
        }
      });
      return ok;
    };

    const visibleTimes = slotList.filter((timeSlot) =>
      workers.some((worker) => baseByWorker.get(worker.id)?.slots.has(timeSlot))
    );

    if (!visibleTimes.length) {
      bookingSlotsHint.textContent = hintText || 'Pro vybraný den nejsou dostupné časy.';
      bookingSave.disabled = true;
      updatePickedLabel();
      return;
    }

    visibleTimes.forEach((timeSlot) => {
      const group = document.createElement('div');
      group.className = 'slot-time-group';
      const entry = document.createElement('div');
      entry.className = 'slot-entry';
      entry.dataset.time = timeSlot;

      const workersAtTime = workers
        .map((worker) => {
          const slotMeta = baseByWorker.get(worker.id)?.slots.get(timeSlot);
          if (!slotMeta) {
            return null;
          }
          const key = `${worker.id}:${timeSlot}`;
          const isStart = Boolean(startByWorker.get(worker.id)?.has(timeSlot));
          const blockedByRule = blockedSet.has(key) || !isStart;
          const isReserved = Boolean(slotMeta.reserved);
          return {
            worker,
            isReserved,
            blockedByRule,
            selectable: !isReserved && !blockedByRule
          };
        })
        .filter(Boolean);

      if (workersAtTime.length <= 1) {
        const single = workersAtTime[0];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ghost slot-button';
        button.dataset.time = timeSlot;

        if (!single) {
          button.innerHTML = `<span class="slot-main">${timeSlot} • Není dostupné</span>`;
          button.classList.add('is-unavailable');
          button.disabled = true;
          entry.appendChild(button);
        } else {
          const { worker, isReserved, blockedByRule, selectable } = single;
          button.dataset.workerId = worker.id;
          if (isReserved) {
            button.innerHTML = `<span class="slot-main">${timeSlot} • <span class="slot-status">Obsazeno</span></span>`;
            button.classList.add('is-reserved');
            button.disabled = true;
          } else {
            button.innerHTML = `<span class="slot-main">${timeSlot} • ${worker.name}</span>`;
            if (blockedByRule) {
              button.classList.add('is-buffer');
              button.disabled = true;
            }
          }
          if (selectable) {
            button.addEventListener('click', () => {
              if (button.disabled) return;
              bookingState.selectedSlot = {
                worker_id: worker.id,
                time_slot: timeSlot,
                worker_name: worker.name
              };
              const valid = highlightSelection(worker.id, timeSlot);
              updatePickedLabel();
              bookingSave.disabled = !valid || !bookingName.value.trim();
              bookingSlotsHint.textContent = valid ? '' : 'Vybraný čas nevyhovuje délce služby.';
            });
          }
          entry.appendChild(button);
        }
      } else {
        const select = document.createElement('select');
        select.className = 'slot-worker-select';
        select.dataset.time = timeSlot;

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = `${timeSlot} • Výběr pracovníka`;
        placeholder.selected = true;
        select.appendChild(placeholder);

        let hasSelectable = false;
        workersAtTime.forEach(({ worker, isReserved, blockedByRule, selectable }) => {
          const option = document.createElement('option');
          option.value = worker.id;
          if (isReserved) {
            option.textContent = `${timeSlot} • ${worker.name} — Obsazeno`;
            option.disabled = true;
          } else if (blockedByRule) {
            option.textContent = `${timeSlot} • ${worker.name} — Nedostupné`;
            option.disabled = true;
          } else {
            option.textContent = `${timeSlot} • ${worker.name}`;
            hasSelectable = true;
          }
          select.appendChild(option);
        });

        if (!hasSelectable) {
          select.disabled = true;
          entry.classList.add('is-buffer');
        }

        select.addEventListener('change', () => {
          const workerId = select.value;
          if (!workerId) {
            bookingState.selectedSlot = null;
            clearSelectionHighlight();
            updatePickedLabel();
            updateBookingSaveState();
            bookingSlotsHint.textContent = '';
            return;
          }
          const worker = workers.find((item) => item.id === workerId);
          bookingState.selectedSlot = {
            worker_id: workerId,
            time_slot: timeSlot,
            worker_name: worker?.name || 'Pracovník'
          };
          const valid = highlightSelection(workerId, timeSlot);
          updatePickedLabel();
          bookingSave.disabled = !valid || !bookingName.value.trim();
          bookingSlotsHint.textContent = valid ? '' : 'Vybraný čas nevyhovuje délce služby.';
        });

        entry.appendChild(select);
      }

      group.appendChild(entry);

      bookingSlots.appendChild(group);
    });
  };

  const renderBookingDateMap = (dayValues = []) => {
    if (!bookingState.serviceId) {
      bookingDateMap.classList.add('hidden');
      bookingDateMap.innerHTML = '';
      bookingSlots.innerHTML = '';
      bookingSlotsHint.textContent = 'Vyber službu.';
      return;
    }

    const availableDays = new Set((dayValues || []).map((day) => Number(day)));
    const [selectedYear, selectedMonth, selectedDay] = String(bookingState.selectedDate || '').split('-').map(Number);
    const selectedInThisMonth = selectedYear === bookingState.mapYear && selectedMonth === bookingState.mapMonth;
    const daysInMonth = new Date(bookingState.mapYear, bookingState.mapMonth, 0).getDate();
    const jsWeekday = new Date(bookingState.mapYear, bookingState.mapMonth - 1, 1).getDay();
    const mondayOffset = (jsWeekday + 6) % 7;

    const dayButtons = [];
    for (let i = 0; i < mondayOffset; i += 1) {
      dayButtons.push('<div class="date-availability-day empty" aria-hidden="true"></div>');
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const isAvailable = availableDays.has(day);
      const isSelected = selectedInThisMonth && selectedDay === day;
      dayButtons.push(
        `<button type="button" class="date-availability-day${isAvailable ? ' available' : ''}${isSelected ? ' selected' : ''}" data-day="${day}" ${isAvailable ? '' : 'disabled'}>${day}</button>`
      );
    }

    bookingDateMap.innerHTML = `
      <div class="date-availability-header">
        <button type="button" class="ghost date-availability-nav" data-nav="-1">‹</button>
        <div class="date-availability-title">${monthName(bookingState.mapMonth - 1)} ${bookingState.mapYear}</div>
        <button type="button" class="ghost date-availability-nav" data-nav="1">›</button>
      </div>
      <div class="date-availability-weekdays">
        <span>Po</span><span>Út</span><span>St</span><span>Čt</span><span>Pá</span><span>So</span><span>Ne</span>
      </div>
      <div class="date-availability-grid">${dayButtons.join('')}</div>
    `;
    bookingDateMap.classList.remove('hidden');

    bookingDateMap.querySelectorAll('.date-availability-nav').forEach((button) => {
      button.addEventListener('click', async () => {
        const delta = Number(button.dataset.nav || 0);
        let nextMonth = bookingState.mapMonth + delta;
        let nextYear = bookingState.mapYear;
        if (nextMonth < 1) {
          nextMonth = 12;
          nextYear -= 1;
        } else if (nextMonth > 12) {
          nextMonth = 1;
          nextYear += 1;
        }
        bookingState.mapYear = nextYear;
        bookingState.mapMonth = nextMonth;
        bookingState.selectedDate = '';
        bookingState.selectedSlot = null;
        updatePickedLabel();
        updateBookingSaveState();
        await loadBookingDays();
      });
    });

    bookingDateMap.querySelectorAll('.date-availability-day.available').forEach((button) => {
      button.addEventListener('click', async () => {
        const day = Number(button.dataset.day);
        bookingState.selectedDate = `${bookingState.mapYear}-${String(bookingState.mapMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        bookingState.selectedSlot = null;
        updatePickedLabel();
        updateBookingSaveState();
        await loadBookingSlots();
      });
    });
  };

  const loadBookingDays = async () => {
    if (!bookingState.serviceId) {
      renderBookingDateMap([]);
      return;
    }
    if (bookingState.duration <= 0) {
      bookingDateMap.classList.add('hidden');
      bookingDateMap.innerHTML = '';
      bookingSlots.innerHTML = '';
      bookingSlotsHint.textContent = 'Vyber službu/minislužby s časovou dotací.';
      updateBookingSaveState();
      return;
    }
    const params = new URLSearchParams({
      year: String(bookingState.mapYear),
      month: String(bookingState.mapMonth),
      service_id: bookingState.serviceId
    });
    if (bookingState.optionKeys.length) {
      params.set('option_keys', bookingState.optionKeys.join(','));
    }
    const response = await fetch(`/api/public/availability-days?${params.toString()}`);
    if (!response.ok) {
      renderBookingDateMap([]);
      bookingSlots.innerHTML = '';
      bookingSlotsHint.textContent = 'Nepodařilo se načíst dostupné dny.';
      return;
    }
    const data = await response.json();
    bookingState.mapYear = Number(data.year) || bookingState.mapYear;
    bookingState.mapMonth = Number(data.month) || bookingState.mapMonth;

    const availableDays = Array.isArray(data.days) ? data.days.map((day) => Number(day)) : [];
    if (bookingState.selectedDate) {
      const [yy, mm, dd] = bookingState.selectedDate.split('-').map(Number);
      const stillVisible = yy === bookingState.mapYear && mm === bookingState.mapMonth && availableDays.includes(dd);
      if (!stillVisible) {
        bookingState.selectedDate = '';
        bookingState.selectedSlot = null;
      }
    }

    renderBookingDateMap(availableDays);
    await loadBookingSlots();
  };

  const loadBookingSlots = async () => {
    if (!bookingState.serviceId) {
      bookingSlots.innerHTML = '';
      bookingSlotsHint.textContent = 'Vyber službu.';
      updateBookingSaveState();
      return;
    }
    if (bookingState.duration <= 0) {
      bookingSlots.innerHTML = '';
      bookingSlotsHint.textContent = 'Vyber službu/minislužby s časovou dotací.';
      updateBookingSaveState();
      return;
    }
    if (!bookingState.selectedDate) {
      bookingSlots.innerHTML = '';
      bookingSlotsHint.textContent = 'Vyber den.';
      updateBookingSaveState();
      return;
    }
    const params = new URLSearchParams({
      date: bookingState.selectedDate,
      service_id: bookingState.serviceId
    });
    if (bookingState.optionKeys.length) {
      params.set('option_keys', bookingState.optionKeys.join(','));
    }
    const response = await fetch(`/api/public/availability?${params.toString()}`);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      bookingState.selectedSlot = null;
      updatePickedLabel();
      updateBookingSaveState();
      renderBookingSlots([], [], [], data.error || 'Nepodařilo se načíst dostupné časy.');
      return;
    }
    const data = await response.json();
    bookingState.selectedSlot = null;
    updatePickedLabel();
    updateBookingSaveState();
    renderBookingSlots(
      data.base_slots || data.slots || [],
      data.slots || [],
      data.blocked_starts || [],
      'Pro vybraný den nejsou dostupné časy.'
    );
  };

  bookingServiceSelect.addEventListener('change', async () => {
    bookingState.serviceId = bookingServiceSelect.value || '';
    bookingState.optionKeys = [];
    bookingState.optionLabels = [];
    syncVariantChoices();
    bookingState.selectedDate = '';
    bookingState.selectedSlot = null;
    updatePickedLabel();
    updateBookingSaveState();
    await loadBookingDays();
  });
  bookingName.addEventListener('input', () => {
    if (!bookingClientState.lockedFromVisit) {
      bookingClientState.selectedClientId = '';
      queueClientSearch();
    }
    updateBookingSaveState();
  });
  bookingName.addEventListener('change', () => {
    if (bookingClientState.lockedFromVisit) return;
    const exact = findExactClientMatch(bookingClientState.suggestions, bookingName.value);
    applyMatchedClient(exact);
    updateBookingSaveState();
  });

  const resolveOrCreateBookingClient = async (clientName) => {
    if (bookingClientState.selectedClientId) {
      return bookingClientState.selectedClientId;
    }

    if (bookingClientState.lockedFromVisit && clientName) {
      try {
        const rows = await api.get(`/api/clients?search=${encodeURIComponent(clientName)}`);
        const exact = findExactClientMatch(rows, clientName);
        if (exact?.id) {
          bookingClientState.selectedClientId = exact.id;
          return exact.id;
        }
      } catch (err) {
        // fallback: create below
      }
    }

    if (!bookingClientState.lockedFromVisit && clientName) {
      try {
        const rows = await api.get(`/api/clients?search=${encodeURIComponent(clientName)}`);
        const exact = findExactClientMatch(rows, clientName);
        if (exact?.id) {
          bookingClientState.selectedClientId = exact.id;
          return exact.id;
        }
      } catch (err) {
        // fallback: create below
      }
    }

    const created = await api.post('/api/clients', {
      full_name: clientName,
      phone: bookingPhone.value.trim(),
      email: bookingEmail.value.trim()
    });
    bookingClientState.selectedClientId = created?.id || '';
    return bookingClientState.selectedClientId;
  };

  bookingSave.addEventListener('click', async () => {
    const clientName = bookingName.value.trim();
    if (!bookingState.serviceId || !bookingState.selectedDate || !bookingState.selectedSlot || !clientName) {
      alert('Vyber službu, den, čas a vyplň jméno klientky.');
      return;
    }

    try {
      await resolveOrCreateBookingClient(clientName);
    } catch (err) {
      const message = err?.message || 'Nepodařilo se uložit klientku.';
      alert(message);
      return;
    }

    await api.post('/api/public/reservations', {
      service_id: bookingState.serviceId,
      option_keys: bookingState.optionKeys,
      date: bookingState.selectedDate,
      time: bookingState.selectedSlot.time_slot,
      worker_id: bookingState.selectedSlot.worker_id,
      client_name: clientName,
      phone: bookingPhone.value.trim(),
      email: bookingEmail.value.trim(),
      note: bookingNote.value.trim()
    });

    alert('Rezervace byla uložena.');
    await loadSummary();
    await openCalendarModal();
  });

  updateBookingDuration();

  if (canEditAvailability) {
    const availabilityDayInputs = Array.from(document.querySelectorAll('.availability-day'));
    const availabilityTimeInputs = Array.from(document.querySelectorAll('.availability-time'));
    const availabilityServiceInputs = Array.from(document.querySelectorAll('.availability-service'));
    const overrideTimeInputs = Array.from(document.querySelectorAll('.availability-override-time'));
    const overrideServiceInputs = Array.from(document.querySelectorAll('.availability-override-service'));
    const overrideDateInput = document.getElementById('availabilityOverrideDate');
    const overrideHint = document.getElementById('availabilityOverrideHint');
    const overrideList = document.getElementById('availabilityOverrideList');
    const overrideSaveButton = document.getElementById('availabilityOverrideSave');
    const overrideDeleteButton = document.getElementById('availabilityOverrideDelete');
    const allLeafServiceIds = overrideServiceInputs.map((input) => String(input.value || '')).filter(Boolean);

    let weeklyDaySet = new Set();
    let weeklyTimeSet = new Set();
    let weeklyServiceIds = new Set();
    let weeklyServicesConfigured = true;
    let overrideMap = new Map();

    const parseIsoDateForDisplay = (isoDate) => {
      const [yy, mm, dd] = String(isoDate || '').split('-');
      if (!yy || !mm || !dd) return isoDate;
      return `${dd}.${mm}.${yy}`;
    };
    const weekdayForIsoDate = (isoDate) => {
      const [yy, mm, dd] = String(isoDate || '').split('-').map(Number);
      if (!yy || !mm || !dd) return null;
      const jsDay = new Date(yy, mm - 1, dd).getDay();
      return (jsDay + 6) % 7;
    };
    const readCheckedValues = (inputs) =>
      inputs.filter((input) => input.checked).map((input) => String(input.value || '')).filter(Boolean);
    const applyWeeklyCheckboxes = () => {
      availabilityDayInputs.forEach((input) => {
        input.checked = weeklyDaySet.has(Number(input.value));
      });
      availabilityTimeInputs.forEach((input) => {
        input.checked = weeklyTimeSet.has(String(input.value));
      });
      availabilityServiceInputs.forEach((input) => {
        const serviceId = String(input.value || '');
        input.checked = weeklyServicesConfigured ? weeklyServiceIds.has(serviceId) : true;
      });
    };
    const setOverrideCheckboxes = (times, serviceIds, servicesConfigured = true) => {
      const timeSet = new Set((times || []).map((value) => String(value)));
      const serviceSet = new Set((serviceIds || []).map((value) => String(value)));
      overrideTimeInputs.forEach((input) => {
        input.checked = timeSet.has(String(input.value));
      });
      overrideServiceInputs.forEach((input) => {
        const serviceId = String(input.value || '');
        input.checked = servicesConfigured ? serviceSet.has(serviceId) : true;
      });
    };
    const defaultOverrideForDate = (isoDate) => {
      const weekday = weekdayForIsoDate(isoDate);
      const shouldWorkThatDay = weekday !== null && weeklyDaySet.has(weekday);
      const defaultTimes = shouldWorkThatDay ? Array.from(weeklyTimeSet) : [];
      const defaultServiceIds = weeklyServicesConfigured ? Array.from(weeklyServiceIds) : allLeafServiceIds.slice();
      return {
        date: isoDate,
        times: defaultTimes,
        service_ids: defaultServiceIds,
        services_configured: true
      };
    };
    const renderOverrideList = () => {
      if (!overrideList) return;
      const items = Array.from(overrideMap.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      if (!items.length) {
        overrideList.innerHTML = '<div class="hint">Zatím nejsou uložené žádné výjimky.</div>';
        return;
      }
      overrideList.innerHTML = items
        .map((item) => {
          const serviceCount = item.services_configured ? (item.service_ids || []).length : allLeafServiceIds.length;
          return `
            <div class="settings-item availability-override-item">
              <span>${parseIsoDateForDisplay(item.date)} • ${item.times.length} časů • ${serviceCount} služeb</span>
              <button type="button" class="ghost availability-override-load" data-date="${item.date}">Načíst</button>
            </div>
          `;
        })
        .join('');
      overrideList.querySelectorAll('.availability-override-load').forEach((button) => {
        button.addEventListener('click', () => {
          const dateValue = String(button.dataset.date || '');
          if (!dateValue || !overrideDateInput) return;
          overrideDateInput.value = dateValue;
          syncOverrideByDate(dateValue);
        });
      });
    };
    const syncOverrideByDate = (dateValue) => {
      if (!overrideDateInput || !overrideHint) return;
      if (!dateValue) {
        overrideDeleteButton.disabled = true;
        overrideHint.textContent = 'Vyber datum a uprav služby/časy.';
        setOverrideCheckboxes([], []);
        return;
      }
      const existingOverride = overrideMap.get(dateValue);
      if (existingOverride) {
        setOverrideCheckboxes(
          existingOverride.times || [],
          existingOverride.service_ids || [],
          Boolean(existingOverride.services_configured)
        );
        overrideHint.textContent = 'Načtena uložená výjimka pro vybraný den.';
        overrideDeleteButton.disabled = false;
        return;
      }
      const fallback = defaultOverrideForDate(dateValue);
      setOverrideCheckboxes(fallback.times, fallback.service_ids, true);
      overrideHint.textContent = 'Pro tento den není výjimka. Uložením vytvoříš nový záznam.';
      overrideDeleteButton.disabled = true;
    };
    const fetchAvailabilityProfile = async () => {
      const data = await api.get('/api/availability');
      weeklyDaySet = new Set((data.days || []).map((value) => Number(value)));
      weeklyTimeSet = new Set((data.times || []).map((value) => String(value)));
      weeklyServiceIds = new Set((data.service_ids || []).map((id) => String(id)));
      weeklyServicesConfigured = Boolean(data.services_configured);
      applyWeeklyCheckboxes();

      overrideMap = new Map();
      (Array.isArray(data.overrides) ? data.overrides : []).forEach((item) => {
        const dateValue = String(item.date || '').trim();
        if (!dateValue) return;
        overrideMap.set(dateValue, {
          date: dateValue,
          times: Array.from(new Set((item.times || []).map((value) => String(value)))).sort(),
          service_ids: Array.from(new Set((item.service_ids || []).map((value) => String(value)))),
          services_configured: Boolean(item.services_configured)
        });
      });
      renderOverrideList();
      if (overrideDateInput?.value) {
        syncOverrideByDate(overrideDateInput.value);
      } else if (overrideDateInput) {
        syncOverrideByDate('');
      }
    };

    await fetchAvailabilityProfile();

    document.getElementById('availabilitySave').addEventListener('click', async () => {
      const selectedDays = readCheckedValues(availabilityDayInputs).map((value) => Number(value));
      const selectedTimes = readCheckedValues(availabilityTimeInputs);
      const selectedServices = readCheckedValues(availabilityServiceInputs);
      await api.post('/api/availability', {
        days: selectedDays,
        times: selectedTimes,
        service_ids: selectedServices
      });
      await fetchAvailabilityProfile();
      await loadBookingDays();
      alert('Dostupnost uložena.');
    });

    overrideDateInput.addEventListener('change', async () => {
      syncOverrideByDate(overrideDateInput.value || '');
      bookingState.selectedSlot = null;
      updatePickedLabel();
      updateBookingSaveState();
      await loadBookingDays();
    });

    overrideSaveButton.addEventListener('click', async () => {
      const dateValue = String(overrideDateInput.value || '').trim();
      if (!dateValue) {
        alert('Vyber datum výjimky.');
        return;
      }
      const selectedTimes = readCheckedValues(overrideTimeInputs);
      const selectedServices = readCheckedValues(overrideServiceInputs);
      await api.post('/api/availability/override', {
        date: dateValue,
        times: selectedTimes,
        service_ids: selectedServices
      });
      await fetchAvailabilityProfile();
      syncOverrideByDate(dateValue);
      await loadBookingDays();
      alert('Výjimka dne byla uložena.');
    });

    overrideDeleteButton.addEventListener('click', async () => {
      const dateValue = String(overrideDateInput.value || '').trim();
      if (!dateValue) {
        alert('Vyber datum výjimky.');
        return;
      }
      if (!overrideMap.has(dateValue)) {
        alert('Pro vybraný den není uložená výjimka.');
        return;
      }
      await api.delete(`/api/availability/override?date=${encodeURIComponent(dateValue)}`);
      await fetchAvailabilityProfile();
      syncOverrideByDate(dateValue);
      await loadBookingDays();
      alert('Výjimka dne byla smazána.');
    });
  }

  syncVariantChoices();
  await loadBookingDays();
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
        <h3 class="section-title-with-pill">Přidat výdaj <span class="pro-pill">PRO</span></h3>
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
        <h3 class="section-title-with-pill">Přidat příjem <span class="pro-pill">PRO</span></h3>
        <div class="meta">Příjmy z ošetření</div>
        <div id="ecoVisits"></div>
      </div>
      ${isAdmin
        ? `<div class="settings-section">
            <h3>Podle uživatele</h3>
            <div id="ecoByWorker"></div>
          </div>`
        : ''}
      <div class="settings-section">
        <h3 class="section-title-with-pill">Výdaje <span class="pro-pill">PRO</span></h3>
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

  const formatDisplayDate = (isoDate) => {
    const [year, month, day] = String(isoDate || '').split('-');
    if (!year || !month || !day) return isoDate || '';
    return `${day}.${month}.${year}`;
  };

  function visitAmountByField(visit, amountField = 'total') {
    const fromField = Number(visit?.[amountField]);
    if (Number.isFinite(fromField)) return fromField;
    const fallback = Number(visit?.total);
    return Number.isFinite(fallback) ? fallback : 0;
  }

  function visitShareLabel(visit, amountField = 'total') {
    const workerShare = Math.max(0, Math.min(100, Number.parseInt(visit?.worker_share_percent, 10) || 100));
    const workerRole = String(visit?.worker_role || 'worker').toLowerCase();
    const currentUserRole = String(state.auth?.user?.role || '');
    const currentUserId = String(state.auth?.user?.id || '');
    const visitWorkerId = String(visit?.worker_id || '');

    if (amountField === 'worker_amount') {
      return `Podíl ${workerShare}%`;
    }

    if (amountField === 'income_for_current_user' && currentUserRole === 'admin') {
      if (workerRole === 'worker' && visitWorkerId && visitWorkerId !== currentUserId) {
        return `Podíl ${100 - workerShare}%`;
      }
      return 'Podíl 100%';
    }

    if (workerRole === 'worker') {
      return `Podíl ${workerShare}%`;
    }
    return 'Podíl 100%';
  }

  function incomeAmountColumnHtml(grossAmount, splitAmount, splitLabel = 'Podíl') {
    return `
      <span class="eco-amount-column">
        <span class="eco-amount-main">${formatCzk(grossAmount)}</span>
        <span class="eco-amount-sub">${splitLabel}: ${formatCzk(splitAmount)}</span>
      </span>
    `;
  }

  function buildVisitsByDayAndWorker(visits, amountField = 'total') {
    const dayMap = new Map();
    for (const visit of visits || []) {
      const dayKey = String(visit.date || '');
      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, { date: dayKey, total: 0, total_gross: 0, workers: new Map() });
      }
      const dayGroup = dayMap.get(dayKey);
      const visitTotal = visitAmountByField(visit, amountField);
      const visitGross = visitAmountByField(visit, 'total');
      dayGroup.total += visitTotal;
      dayGroup.total_gross += visitGross;

      const workerName = visit.worker_name || 'Neurčeno';
      if (!dayGroup.workers.has(workerName)) {
        dayGroup.workers.set(workerName, { worker_name: workerName, total: 0, total_gross: 0, visits: [] });
      }
      const workerGroup = dayGroup.workers.get(workerName);
      workerGroup.total += visitTotal;
      workerGroup.total_gross += visitGross;
      workerGroup.visits.push(visit);
    }

    return Array.from(dayMap.values())
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .map((day) => ({
        date: day.date,
        total: day.total,
        total_gross: day.total_gross,
        workers: Array.from(day.workers.values()).sort((a, b) =>
          String(a.worker_name).localeCompare(String(b.worker_name), 'cs')
        )
      }));
  }

  function buildVisitsByWorkerAndDay(visits, amountField = 'total') {
    const workerMap = new Map();
    for (const visit of visits || []) {
      const workerName = visit.worker_name || 'Neurčeno';
      if (!workerMap.has(workerName)) {
        workerMap.set(workerName, { worker_name: workerName, total: 0, total_gross: 0, days: new Map() });
      }
      const worker = workerMap.get(workerName);
      const amount = visitAmountByField(visit, amountField);
      const amountGross = visitAmountByField(visit, 'total');
      worker.total += amount;
      worker.total_gross += amountGross;

      const dayKey = String(visit.date || '');
      if (!worker.days.has(dayKey)) {
        worker.days.set(dayKey, { date: dayKey, total: 0, total_gross: 0, visits: [] });
      }
      const day = worker.days.get(dayKey);
      day.total += amount;
      day.total_gross += amountGross;
      day.visits.push(visit);
    }

    return Array.from(workerMap.values())
      .sort((a, b) => String(a.worker_name).localeCompare(String(b.worker_name), 'cs'))
      .map((worker) => ({
        worker_name: worker.worker_name,
        total: worker.total,
        total_gross: worker.total_gross,
        days: Array.from(worker.days.values()).sort((a, b) => String(b.date).localeCompare(String(a.date)))
      }));
  }

  function buildExpensesByDay(expenses) {
    const dayMap = new Map();
    for (const expense of expenses || []) {
      const dayKey = String(expense.date || '');
      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, { date: dayKey, total: 0, items: [] });
      }
      const day = dayMap.get(dayKey);
      const amount = Number(expense.amount) || 0;
      day.total += amount;
      day.items.push(expense);
    }
    return Array.from(dayMap.values()).sort((a, b) => String(b.date).localeCompare(String(a.date)));
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
      const grouped = buildVisitsByDayAndWorker(data.visits, 'income_for_current_user');
      visits.innerHTML = grouped
        .map(
          (dayGroup) => `
            <details class="eco-collapsible">
              <summary class="settings-item eco-day-header">
                <span>${formatDisplayDate(dayGroup.date)}</span>
                ${incomeAmountColumnHtml(dayGroup.total_gross, dayGroup.total)}
              </summary>
              <div class="eco-collapse-body">
              ${dayGroup.workers
                .map(
                  (workerGroup) => `
                    <details class="eco-collapsible eco-collapsible-nested">
                      <summary class="settings-item eco-worker-header">
                        <span>${workerGroup.worker_name}</span>
                        ${incomeAmountColumnHtml(workerGroup.total_gross, workerGroup.total)}
                      </summary>
                      <div class="eco-collapse-body">
                    ${workerGroup.visits
                      .map(
                        (visit) => `
                          <div class="settings-item eco-visit-item">
                            <span>${visit.client_name || 'Klientka'} • ${visit.service_name || 'Služba'}${visit.treatment_name ? ` • ${visit.treatment_name}` : ''}</span>
                            ${incomeAmountColumnHtml(
                              visitAmountByField(visit, 'total'),
                              visitAmountByField(visit, 'income_for_current_user'),
                              visitShareLabel(visit, 'income_for_current_user')
                            )}
                          </div>
                        `
                      )
                      .join('')}
                      </div>
                    </details>
                  `
                )
                .join('')}
              </div>
            </details>
          `
        )
        .join('');
    }

    const expenses = document.getElementById('ecoExpenses');
    if (!data.expenses.length) {
      expenses.innerHTML = '<div class="hint">V tomto období nejsou žádné výdaje.</div>';
    } else {
      const groupedExpenses = buildExpensesByDay(data.expenses);
      expenses.innerHTML = groupedExpenses
        .map(
          (day) => `
            <details class="eco-collapsible">
              <summary class="settings-item eco-day-header">
                <span>${formatDisplayDate(day.date)}</span>
                <span>${formatCzk(day.total)}</span>
              </summary>
              <div class="eco-collapse-body">
                ${day.items
                  .map(
                    (expense) => `
                      <div class="settings-item eco-expense-item">
                        <span>${expense.title}${expense.worker_name ? ` • ${expense.worker_name}` : ''}${expense.vat_rate ? ` • DPH ${expense.vat_rate}%` : ''}${expense.recurring_type && expense.recurring_type !== 'none' ? ` • ${recurringTypeLabel(expense.recurring_type)}` : ''}</span>
                        <span>${formatCzk(expense.amount)}</span>
                      </div>
                    `
                  )
                  .join('')}
              </div>
            </details>
          `
        )
        .join('');
    }

    const byWorker = document.getElementById('ecoByWorker');
    if (byWorker) {
      const groupedByWorker = buildVisitsByWorkerAndDay(data.visits, 'worker_amount');
      if (!groupedByWorker.length) {
        byWorker.innerHTML = '<div class="hint">Zatím žádná data podle pracovníka.</div>';
      } else {
        byWorker.innerHTML = groupedByWorker
          .map((row) => `
            <details class="eco-collapsible">
              <summary class="settings-item eco-worker-header">
                <span>${row.worker_name || 'Neurčeno'}</span>
                ${incomeAmountColumnHtml(row.total_gross, row.total)}
              </summary>
              <div class="eco-collapse-body">
                ${row.days
                  .map(
                    (day) => `
                      <details class="eco-collapsible eco-collapsible-nested">
                        <summary class="settings-item eco-day-header">
                          <span>${formatDisplayDate(day.date)}</span>
                          ${incomeAmountColumnHtml(day.total_gross, day.total)}
                        </summary>
                        <div class="eco-collapse-body">
                          ${day.visits
                            .map(
                              (visit) => `
                                <div class="settings-item eco-visit-item">
                                  <span>${visit.client_name || 'Klientka'} • ${visit.service_name || 'Služba'}${visit.treatment_name ? ` • ${visit.treatment_name}` : ''}</span>
                                  ${incomeAmountColumnHtml(
                                    visitAmountByField(visit, 'total'),
                                    visitAmountByField(visit, 'worker_amount'),
                                    visitShareLabel(visit, 'worker_amount')
                                  )}
                                </div>
                              `
                            )
                            .join('')}
                        </div>
                      </details>
                    `
                  )
                  .join('')}
              </div>
            </details>
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
          <div class="settings-item"><span>Vystavování faktur klientům z konkrétní návštěvy, odeslání na e-mail</span><span>Aktivní v PRO</span></div>
          <div class="settings-item"><span>Vystavení faktur pracovníkům salonu</span><span>Aktivní v PRO</span></div>
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
  const servicesById = new Map((state.settings.services || []).map((item) => [String(item.id), item]));
  const resolveRootService = (source) => {
    let cursor = source;
    let root = source;
    const seen = new Set();
    while (cursor?.parent_id && !seen.has(String(cursor.id))) {
      seen.add(String(cursor.id));
      const parent = servicesById.get(String(cursor.parent_id));
      if (!parent) break;
      root = parent;
      cursor = parent;
    }
    return root;
  };

  const rootService = resolveRootService(service);
  const directParent = service.parent_id ? servicesById.get(String(service.parent_id)) || parentService || null : null;
  const cardOwner = directParent || rootService || parentService || null;
  const cardOwnerName = cardOwner?.name || 'nadřazená služba';
  let schemaDraft = normalizeSchemaDraft(parseServiceSchemaJson(service.form_schema_json));
  const initialInheritForm =
    Boolean(service.parent_id) &&
    (service.inherits_form === 1 || service.inherits_form === true || service.inherits_form === '1');

  openModal(`
    <div class="modal-header">
      <div>
        <h2>${escapeHtml(service.name || '')}</h2>
        <div class="meta">Podslužba • může dědit kartu z nadřazené služby (${escapeHtml(cardOwnerName)}) nebo mít vlastní kartu.</div>
      </div>
      <div class="actions-row">
        ${cardOwner ? `<button class="ghost" id="editParentService">Upravit nadřazenou službu</button>` : ''}
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
            <div class="meta hidden" id="subserviceDurationLockedHint">Délka se nastavuje u podslužeb této položky.</div>
          </div>
          <div class="field">
            <label>Cena (Kč)</label>
            <input id="subserviceEditPrice" type="number" min="0" step="1" />
            <div class="meta hidden" id="subservicePriceLockedHint">Cena se nastavuje u podslužeb této položky.</div>
          </div>
        </div>
        <div class="divider"></div>
        <label class="checkbox-row">
          <input type="checkbox" id="subserviceUseSubservices" />
          Přidat podslužby
        </label>
        <div class="meta">Podslužby mohou mít další podslužby. Čas i cena se nastavují na nejnižší úrovni.</div>
        <div class="divider"></div>
        <label class="checkbox-row">
          <input type="checkbox" id="subserviceInheritForm" />
          Dědit kartu z nadřazené služby
        </label>
        <div class="meta">Vypni dědění, pokud chceš pro tuto podslužbu sestavit vlastní kartu.</div>
        <div class="actions-row">
          <button class="primary" id="subserviceSave">Uložit</button>
        </div>
      </div>
      <div class="settings-section hidden" id="subserviceChildrenSection">
        <div class="panel-header">
          <div>
            <h3>Podslužby</h3>
            <div class="meta" id="subserviceChildrenMeta">Nastav podslužby a jejich časovou dotaci.</div>
          </div>
        </div>
        <div class="subservice-edit-list" id="subserviceChildrenRows"></div>
        <div class="actions-row services-actions">
          <button type="button" class="ghost" id="subserviceChildrenAdd">+ Přidat podslužbu</button>
        </div>
      </div>
      <div class="settings-section" id="subserviceSchemaSection">
        <div class="panel-header">
          <div>
            <h3>Karta podslužby</h3>
            <div class="meta">Sestav vlastní formulář. Vpravo vidíš náhled, jak to uvidí uživatel v kartě klientky.</div>
          </div>
        </div>
        <div class="schema-split">
          <div>
            <div class="actions-row schema-split-actions">
              <button type="button" class="ghost" id="subserviceSchemaAddField">Nové pole</button>
            </div>
            <div id="subserviceSchemaBuilder" class="schema-builder"></div>
          </div>
          <div class="schema-preview">
            <div class="meta">Náhled karty (jen pro zobrazení).</div>
            <div id="subserviceSchemaPreviewFields" class="custom-fields"></div>
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
          </div>
        </div>
      </div>
    </div>
  `, 'modal-settings modal-service-editor');

  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('backToSettings').addEventListener('click', () => {
    openSettingsModal('services').catch(() => {});
  });
  const editParentBtn = document.getElementById('editParentService');
  if (editParentBtn && cardOwner) {
    editParentBtn.addEventListener('click', () => openServiceDetailModal(cardOwner.id));
  }

  const nameInput = document.getElementById('subserviceEditName');
  const durationSelect = document.getElementById('subserviceEditDuration');
  const durationLockedHint = document.getElementById('subserviceDurationLockedHint');
  const priceInput = document.getElementById('subserviceEditPrice');
  const priceLockedHint = document.getElementById('subservicePriceLockedHint');
  const useSubservicesToggle = document.getElementById('subserviceUseSubservices');
  const inheritFormToggle = document.getElementById('subserviceInheritForm');
  const childrenSection = document.getElementById('subserviceChildrenSection');
  const childrenMeta = document.getElementById('subserviceChildrenMeta');
  const childrenRows = document.getElementById('subserviceChildrenRows');
  const childrenAddBtn = document.getElementById('subserviceChildrenAdd');
  const schemaSection = document.getElementById('subserviceSchemaSection');
  const schemaBuilder = document.getElementById('subserviceSchemaBuilder');
  const schemaPreview = document.getElementById('subserviceSchemaPreviewFields');
  const schemaAddFieldBtn = document.getElementById('subserviceSchemaAddField');

  nameInput.value = service.name || '';
  durationSelect.value = String(normalizeDurationMinutes(service.duration_minutes, 0));
  priceInput.value = String(Math.max(0, Number(service.price) || 0));

  const removedChildIds = new Set();
  const getChildren = () => {
    const parentId = String(service.id);
    return state.settings.services.filter((item) => String(item.parent_id || '') === parentId);
  };
  const initialChildren = getChildren();
  const hasChildren = initialChildren.length > 0;

  const durationSelectHtml = (selected) =>
    durationOptions()
      .map((value) => `<option value="${value}"${String(value) === String(selected) ? ' selected' : ''}>${value}</option>`)
      .join('');

  const childRowTemplate = (row) => {
    const id = row?.id ? String(row.id) : '';
    const name = row?.name || '';
    const duration = normalizeDurationMinutes(row?.duration_minutes, 0);
    const price = Math.max(0, Number(row?.price) || 0);
    return `
      <div class="subservice-edit-item" data-sub-id="${escapeHtml(id)}">
        <div class="field-row">
          <div class="field">
            <label>Název podslužby</label>
            <input type="text" data-sub-field="name" value="${escapeHtml(name)}" placeholder="Např. Varianta služby" />
          </div>
          <div class="field">
            <label>Délka (min)</label>
            <select data-sub-field="duration_minutes">${durationSelectHtml(duration)}</select>
          </div>
          <div class="field">
            <label>Cena (Kč)</label>
            <input type="number" data-sub-field="price" min="0" step="1" value="${escapeHtml(String(price))}" />
          </div>
        </div>
        <div class="actions-row">
          <button type="button" class="ghost" data-action="remove-subservice">Smazat podslužbu</button>
        </div>
      </div>
    `;
  };

  const wireChildRowActions = () => {
    if (!childrenRows) return;
    childrenRows.querySelectorAll('button[data-action="remove-subservice"]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = button.closest('.subservice-edit-item');
        if (!item) return;
        const id = (item.dataset.subId || '').toString();
        if (id) removedChildIds.add(id);
        item.remove();
      });
    });
  };

  const addBlankChildRow = () => {
    if (!childrenRows) return;
    childrenRows.insertAdjacentHTML('beforeend', childRowTemplate({ id: '', name: '', duration_minutes: 0, price: 0 }));
    wireChildRowActions();
  };

  const setChildrenEnabled = (enabled) => {
    if (!childrenSection) return;
    childrenSection.classList.toggle('hidden', !enabled);
    durationSelect.disabled = enabled;
    priceInput.disabled = enabled;
    if (durationLockedHint) durationLockedHint.classList.toggle('hidden', !enabled);
    if (priceLockedHint) priceLockedHint.classList.toggle('hidden', !enabled);
    if (!enabled && childrenRows) {
      childrenRows.innerHTML = '';
    }
    if (enabled && childrenRows && !childrenRows.children.length) {
      addBlankChildRow();
    }
  };

  if (childrenRows) {
    childrenRows.innerHTML = initialChildren.map((child) => childRowTemplate(child)).join('');
    wireChildRowActions();
  }
  if (childrenMeta) {
    childrenMeta.textContent = hasChildren
      ? `Podslužby pro "${service.name}".`
      : 'Nastav podslužby a jejich časovou dotaci.';
  }
  if (useSubservicesToggle) {
    useSubservicesToggle.checked = hasChildren;
    useSubservicesToggle.disabled = hasChildren;
    useSubservicesToggle.addEventListener('change', () => {
      setChildrenEnabled(Boolean(useSubservicesToggle.checked));
    });
  }
  if (childrenAddBtn) {
    childrenAddBtn.addEventListener('click', () => {
      if (useSubservicesToggle && !useSubservicesToggle.checked) {
        useSubservicesToggle.checked = true;
        setChildrenEnabled(true);
      }
      addBlankChildRow();
    });
  }

  setChildrenEnabled(Boolean(useSubservicesToggle?.checked));

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

  const setSchemaInheritanceMode = (inherit) => {
    if (schemaSection) schemaSection.classList.toggle('hidden', inherit);
  };

  if (inheritFormToggle) {
    inheritFormToggle.checked = initialInheritForm;
    inheritFormToggle.addEventListener('change', () => {
      setSchemaInheritanceMode(Boolean(inheritFormToggle.checked));
    });
  }

  renderSchemaBuilder(schemaBuilder, schemaDraft, onSchemaDraftChange);
  renderSchemaPreview();
  setSchemaInheritanceMode(Boolean(inheritFormToggle?.checked));

  if (schemaAddFieldBtn) {
    schemaAddFieldBtn.addEventListener('click', () => {
      const nextLabel = `Pole ${schemaDraft.fields.length + 1}`;
      const baseId = slugifySchemaId(nextLabel) || `pole-${schemaDraft.fields.length + 1}`;
      const id = ensureUniqueSchemaId(schemaDraft.fields, baseId);
      schemaDraft.fields = [
        ...schemaDraft.fields,
        { id, type: 'text', label: nextLabel, required: false, price_delta: 0, options: [] }
      ];
      onSchemaDraftChange(true);
    });
  }

  document.getElementById('subserviceSave').addEventListener('click', async () => {
    const saveBtn = document.getElementById('subserviceSave');
    if (saveBtn) saveBtn.disabled = true;
    try {
      const inheritForm = Boolean(inheritFormToggle?.checked);
      const payload = {
        name: nameInput.value.trim(),
        duration_minutes: durationSelect.value,
        price: priceInput.value,
        form_type: service.form_type || 'generic',
        inherits_form: inheritForm ? 1 : 0
      };
      if (!payload.name) {
        alert('Vyplň název podslužby.');
        return;
      }

      const useSubservices = Boolean(useSubservicesToggle?.checked);
      const childItems = useSubservices
        ? Array.from(childrenRows?.querySelectorAll('.subservice-edit-item') || []).map((item) => {
            const id = (item.dataset.subId || '').toString().trim();
            const name = (item.querySelector('[data-sub-field="name"]')?.value || '').trim();
            const duration = (item.querySelector('[data-sub-field="duration_minutes"]')?.value || '').toString().trim() || '0';
            const price = (item.querySelector('[data-sub-field="price"]')?.value || '').toString().trim() || '0';
            return { id, name, duration_minutes: duration, price };
          })
        : [];

      if (useSubservices) {
        if (!childItems.length) {
          if (!hasChildren) {
            alert('Přidej alespoň jednu podslužbu.');
            return;
          }
          const ok = confirm('Odstranit všechny podslužby?');
          if (!ok) return;
        }
        if (childItems.some((item) => !item.name)) {
          alert('Vyplň název u každé podslužby (nebo ji smaž).');
          return;
        }
      }

      if (!inheritForm) {
        const schemaFields = Array.isArray(schemaDraft.fields) ? schemaDraft.fields : [];
        if (schemaFields.length) {
          for (const [fieldIndex, field] of schemaFields.entries()) {
            field.label = (field.label || '').toString().trim() || defaultSchemaFieldLabel(field.type, fieldIndex + 1);
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
                const duration = Number(opt.duration_minutes) || 0;
                opt.duration_minutes = duration === 0 ? 0 : Math.min(360, Math.max(15, duration - (duration % 15)));
              });
              field.options = filtered;
            } else {
              field.options = [];
            }
            field.required = field.required === true;
            field.price_delta = 0;
          }
          payload.form_schema = schemaDraft;
        } else {
          payload.form_schema = null;
        }
      }

      await api.put(`/api/services/${service.id}`, payload);

      if (useSubservices) {
        for (const id of removedChildIds) {
          await api.del(`/api/services/${id}`);
        }
        for (const child of childItems) {
          if (child.id) {
            await api.put(`/api/services/${child.id}`, {
              name: child.name,
              duration_minutes: child.duration_minutes,
              price: child.price
            });
          } else {
            await api.post('/api/services', {
              name: child.name,
              duration_minutes: child.duration_minutes,
              price: child.price,
              parent_id: service.id
            });
          }
        }
      }

      await loadSettings();
      await openSettingsModal('services');
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
        <div class="field">
          <label>Cena (Kč)</label>
          <input id="serviceEditPrice" type="number" min="0" step="1" />
          <div class="meta hidden" id="servicePriceLockedHint">Cena se nastavuje u podslužeb.</div>
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
          </div>
        </div>
      </div>
    </div>
  `, 'modal-settings modal-service-editor');

  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('backToSettings').addEventListener('click', () => {
    openSettingsModal('services').catch(() => {});
  });

  const nameInput = document.getElementById('serviceEditName');
  const durationSelect = document.getElementById('serviceEditDuration');
  const durationLockedHint = document.getElementById('serviceDurationLockedHint');
  const priceInput = document.getElementById('serviceEditPrice');
  const priceLockedHint = document.getElementById('servicePriceLockedHint');
  const useSubservicesToggle = document.getElementById('serviceUseSubservices');
  nameInput.value = service.name || '';
  durationSelect.value = String(normalizeDurationMinutes(service.duration_minutes, 0));
  priceInput.value = String(Math.max(0, Number(service.price) || 0));

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
    const duration = normalizeDurationMinutes(row?.duration_minutes, 0);
    const price = Math.max(0, Number(row?.price) || 0);
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
          <div class="field">
            <label>Cena (Kč)</label>
            <input type="number" data-sub-field="price" min="0" step="1" value="${escapeHtml(String(price))}" />
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
    subRows.insertAdjacentHTML('beforeend', subRowTemplate({ id: '', name: '', duration_minutes: 0, price: 0 }));
    wireSubRowActions();
  };

  const setSubservicesEnabled = (enabled) => {
    if (!subSection) return;
    subSection.classList.toggle('hidden', !enabled);
    durationSelect.disabled = enabled;
    priceInput.disabled = enabled;
    if (durationLockedHint) durationLockedHint.classList.toggle('hidden', !enabled);
    if (priceLockedHint) priceLockedHint.classList.toggle('hidden', !enabled);
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
        price: priceInput.value,
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
            const duration = (item.querySelector('[data-sub-field="duration_minutes"]')?.value || '').toString().trim() || '0';
            const price = (item.querySelector('[data-sub-field="price"]')?.value || '').toString().trim() || '0';
            return { id, name, duration_minutes: duration, price };
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
      for (const [fieldIndex, field] of schemaFields.entries()) {
        field.label = (field.label || '').toString().trim() || defaultSchemaFieldLabel(field.type, fieldIndex + 1);
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
            const duration = Number(opt.duration_minutes) || 0;
            opt.duration_minutes = duration === 0 ? 0 : Math.min(360, Math.max(15, duration - (duration % 15)));
          });
          field.options = filtered;
        } else {
          field.options = [];
        }
        field.required = field.required === true;
        field.price_delta = 0;
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
              price: sub.price,
              form_type: existingChild?.form_type || service.form_type || 'generic'
            });
          } else {
            await api.post('/api/services', {
              name: sub.name,
              duration_minutes: sub.duration_minutes,
              price: sub.price,
              parent_id: service.id
            });
          }
        }
      }

      await loadSettings();
      await openSettingsModal('services');
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
        <div class="field"><label>Cena (Kč)</label><input type="number" data-field="price" min="0" step="1" placeholder="0" /></div>
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
        '<div class="field"><label>Podíl pracovníka (%)</label><input type="number" data-field="income_share_percent" min="0" max="100" step="1" value="100" /></div>',
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
  `, 'modal-settings');

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
      const durationLabel = hasChildren ? 'podslužby' : `${normalizeDurationMinutes(item.duration_minutes, 0)} min`;
      const priceLabel = hasChildren ? 'cena dle podslužby' : formatCzk(Number(item.price) || 0);
      const indent = Math.max(0, level) * 18;
      return `
        <div class="settings-item service-tree-item${hasChildren ? ' is-parent' : ''}">
          <span class="service-tree-label">
            <span class="service-tree-indent" style="width:${indent}px"></span>
            <span class="service-tree-name">${escapeHtml(item.name)} • ${escapeHtml(durationLabel)} • ${escapeHtml(priceLabel)} • ${escapeHtml(schemaLabel)}</span>
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
  const shareLabel = user.role === 'worker'
    ? ` • podíl pracovníka ${Math.max(0, Math.min(100, Number.parseInt(user.income_share_percent, 10) || 100))}%`
    : '';
  return `
    <div class="settings-item">
      <span>${user.full_name} • ${user.username} • ${roleLabel}${shareLabel}${superLabel}</span>
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
        } else if (input.dataset.field === 'income_share_percent') {
          input.value = '100';
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
    const duration = (durationSelect?.value || '').trim() || '0';
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
      const durationLabel = `${normalizeDurationMinutes(child.duration_minutes, 0)} min`;
      const priceLabel = formatCzk(Number(child.price) || 0);
      const schema = parseServiceSchemaJson(child.form_schema_json);
      const fieldsCount = schema?.fields?.filter((field) => field.type !== 'heading').length || 0;
      const schemaLabel = fieldsCount ? `karta: ${fieldsCount} polí` : 'bez karty';
      return `
        <div class="settings-item">
          <span>${escapeHtml(child.name)} • ${escapeHtml(durationLabel)} • ${escapeHtml(priceLabel)} • ${escapeHtml(schemaLabel)}</span>
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
    if (input.dataset.field === 'income_share_percent') {
      input.value = String(Math.max(0, Math.min(100, Number.parseInt(user.income_share_percent, 10) || 100)));
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
  if (dom.btnAddGenericCalendar) {
    dom.btnAddGenericCalendar.addEventListener('click', addGenericVisitAndPickCalendar);
  }
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
  dom.genPrice.addEventListener('input', () => {
    const raw = (dom.genPrice.value || '').toString().trim();
    dom.genPrice.dataset.manual = raw ? '1' : '0';
    updateGenericPricePreview();
  });
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
