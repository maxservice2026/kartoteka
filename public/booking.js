const dom = {
  brandTitle: document.getElementById('bookingBrandTitle'),
  brandLogo: document.getElementById('bookingBrandLogo'),
  services: document.getElementById('publicServices'),
  durationHint: document.getElementById('publicDurationHint'),
  selectedDate: document.getElementById('publicSelectedDate'),
  dateMap: document.getElementById('publicDateMap'),
  slots: document.getElementById('publicSlots'),
  slotsHint: document.getElementById('publicSlotsHint'),
  name: document.getElementById('publicName'),
  phone: document.getElementById('publicPhone'),
  email: document.getElementById('publicEmail'),
  note: document.getElementById('publicNote'),
  submit: document.getElementById('publicSubmit'),
  result: document.getElementById('publicResult')
};

const state = {
  services: [],
  selectedServiceIds: [],
  selectedSlot: null,
  selectedDate: '',
  duration: 0,
  blockedStarts: new Set(),
  dateMapYear: null,
  dateMapMonth: null
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function todayLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function setResult(message, isError = false) {
  dom.result.textContent = message;
  if (!message) {
    dom.result.removeAttribute('style');
    return;
  }
  dom.result.style.color = isError ? '#d0422b' : '#1f9a4c';
}

async function loadBranding() {
  try {
    const response = await fetch('/api/bootstrap');
    const data = await response.json();
    const tenant = data.tenant || {};
    const title = tenant.slug === 'default' ? 'softmax.cz' : tenant.name || 'Kartotéka';
    const logoData = tenant.logo_data || null;

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

    document.title = `Rezervace – ${title}`;
  } catch (err) {
    // ignore
  }
}

async function fetchServices() {
  const response = await fetch('/api/public/services');
  const data = await response.json();
  state.services = data.services || [];

  const services = Array.isArray(state.services) ? state.services : [];
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

  const renderTree = (parentKey, level) => {
    const list = childrenByParent.get(parentKey) || [];
    return list
      .map((service) => {
        const hasChildren = parentIds.has(String(service.id));
        const indent = Math.max(0, level) * 16;
        if (hasChildren) {
          return `
            <div class="public-service-group" style="margin-left:${indent}px">${escapeHtml(service.name)}</div>
            ${renderTree(String(service.id), level + 1)}
          `;
        }
        return `
          <label class="service-pill" data-service-id="${service.id}" style="margin-left:${indent}px">
            <input type="checkbox" class="public-service-checkbox" value="${service.id}" />
            <span class="service-pill-name">${escapeHtml(service.name)}</span>
            <span class="service-pill-duration">${Number(service.duration_minutes) || 15} min</span>
          </label>
        `;
      })
      .join('');
  };

  dom.services.innerHTML = renderTree('', 0);

  document.querySelectorAll('.public-service-checkbox').forEach((input) => {
    input.addEventListener('change', () => {
      syncSelectedServices();
      loadSlots();
    });
  });

  syncSelectedServices();
}

function syncSelectedServices() {
  state.selectedServiceIds = Array.from(document.querySelectorAll('.public-service-checkbox:checked')).map(
    (input) => input.value
  );
  document.querySelectorAll('.service-pill').forEach((pill) => {
    const serviceId = pill.dataset.serviceId;
    pill.classList.toggle('active', state.selectedServiceIds.includes(serviceId));
  });

  const selected = state.services.filter((service) => state.selectedServiceIds.includes(service.id));
  const total = selected.reduce((sum, service) => sum + Math.max(15, Number(service.duration_minutes) || 15), 0);
  state.duration = total;

  dom.durationHint.textContent = state.selectedServiceIds.length
    ? `Vybráno: ${state.selectedServiceIds.length} • Celková délka: ${total} minut`
    : '';
}

function monthLabel(year, month) {
  const names = [
    'leden', 'únor', 'březen', 'duben', 'květen', 'červen',
    'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'
  ];
  return `${names[month - 1]} ${year}`;
}

function formatDateDisplay(dateStr) {
  const [year, month, day] = (dateStr || '').split('-');
  if (!year || !month || !day) return '';
  return `${day}.${month}.${year}`;
}

function setDateMapMonthFromSelection() {
  const [year, month] = (state.selectedDate || '').split('-').map(Number);
  if (!year || !month) return;
  state.dateMapYear = year;
  state.dateMapMonth = month;
}

function shiftDateMapMonth(delta) {
  if (!state.dateMapYear || !state.dateMapMonth) {
    setDateMapMonthFromSelection();
  }
  let year = state.dateMapYear;
  let month = state.dateMapMonth + delta;
  if (month < 1) {
    month = 12;
    year -= 1;
  } else if (month > 12) {
    month = 1;
    year += 1;
  }
  state.dateMapYear = year;
  state.dateMapMonth = month;
}

function renderDateMap(days) {
  if (!state.dateMapYear || !state.dateMapMonth) {
    dom.dateMap.classList.add('hidden');
    dom.dateMap.innerHTML = '';
    dom.selectedDate.textContent = '';
    return;
  }
  dom.selectedDate.textContent = state.selectedDate ? `Vybrané datum: ${formatDateDisplay(state.selectedDate)}` : '';
  const available = new Set(days || []);
  const [selectedYear, selectedMonth, selectedDay] = (state.selectedDate || '').split('-').map(Number);
  const selectedIsCurrentMonth = selectedYear === state.dateMapYear && selectedMonth === state.dateMapMonth;
  const lastDay = new Date(state.dateMapYear, state.dateMapMonth, 0).getDate();
  const dayButtons = [];
  for (let day = 1; day <= lastDay; day += 1) {
    const isAvailable = available.has(day);
    const isSelected = selectedIsCurrentMonth && selectedDay === day;
    dayButtons.push(
      `<button type="button" class="date-availability-day${isAvailable ? ' available' : ''}${isSelected ? ' selected' : ''}" data-day="${day}">${day}</button>`
    );
  }
  dom.dateMap.innerHTML = `
    <div class="date-availability-header">
      <button type="button" class="ghost date-availability-nav" data-nav="-1">‹</button>
      <div class="date-availability-title">${monthLabel(state.dateMapYear, state.dateMapMonth)}</div>
      <button type="button" class="ghost date-availability-nav" data-nav="1">›</button>
    </div>
    <div class="date-availability-grid">${dayButtons.join('')}</div>
  `;
  dom.dateMap.classList.remove('hidden');

  dom.dateMap.querySelectorAll('.date-availability-nav').forEach((button) => {
    button.addEventListener('click', async () => {
      shiftDateMapMonth(Number(button.dataset.nav || 0));
      await loadDateMap();
    });
  });
  dom.dateMap.querySelectorAll('.date-availability-day').forEach((button) => {
    button.addEventListener('click', async () => {
      const day = Number(button.dataset.day);
      state.selectedDate = `${state.dateMapYear}-${String(state.dateMapMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      await loadSlots();
    });
  });
}

async function loadDateMap() {
  if (!state.dateMapYear || !state.dateMapMonth) {
    setDateMapMonthFromSelection();
  }
  if (!state.selectedServiceIds.length) {
    renderDateMap([]);
    return;
  }
  const params = new URLSearchParams({
    year: String(state.dateMapYear),
    month: String(state.dateMapMonth),
    service_ids: state.selectedServiceIds.join(',')
  });
  const response = await fetch(`/api/public/availability-days?${params.toString()}`);
  if (!response.ok) {
    renderDateMap([]);
    return;
  }
  const data = await response.json();
  state.dateMapYear = Number(data.year) || state.dateMapYear;
  state.dateMapMonth = Number(data.month) || state.dateMapMonth;
  renderDateMap(data.days || []);
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

function renderSlots(baseSlots, startSlots, hintText = '') {
  dom.slots.innerHTML = '';
  dom.slotsHint.classList.toggle('hidden', Boolean(baseSlots.length));
  if (!baseSlots.length) {
    dom.slotsHint.textContent = hintText || 'Pro vybraný den nejsou volné termíny.';
    return;
  }

  const baseByWorker = new Map();
  baseSlots.forEach((slot) => {
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
  startSlots.forEach((slot) => {
    if (!startByWorker.has(slot.worker_id)) {
      startByWorker.set(slot.worker_id, new Set());
    }
    startByWorker.get(slot.worker_id).add(slot.time_slot);
  });

  const slotList = timeSlots();
  const requiredSlots = Math.max(1, Math.ceil(state.duration / 30));

  const highlightSelection = (workerId, startTime) => {
    document.querySelectorAll('.slot-button').forEach((item) => {
      item.classList.remove('is-selected', 'is-valid', 'is-invalid');
    });
    const startIndex = slotList.indexOf(startTime);
    if (startIndex === -1) return false;
    const workerSlots = baseByWorker.get(workerId)?.slots || new Map();
    let ok = true;
    for (let i = 0; i < requiredSlots; i += 1) {
      const slot = slotList[startIndex + i];
      const slotMeta = slot ? workerSlots.get(slot) : null;
      if (!slot || !slotMeta || slotMeta.reserved) {
        ok = false;
        break;
      }
      const cell = document.querySelector(`.slot-button[data-worker-id="${workerId}"][data-time="${slot}"]`);
      if (cell) {
        cell.classList.add('is-selected');
      }
    }
    if (state.blockedStarts.has(`${workerId}:${startTime}`)) {
      ok = false;
    }
    document.querySelectorAll('.slot-button.is-selected').forEach((cell) => {
      cell.classList.add(ok ? 'is-valid' : 'is-invalid');
    });
    return ok;
  };

  baseSlots.forEach((slot) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ghost slot-button';
    if (slot.reserved) {
      button.innerHTML = `<span class="slot-main">${slot.time_slot} • <span class="slot-status">Obsazeno</span></span>`;
    } else {
      button.innerHTML = `<span class="slot-main">${slot.time_slot} • ${slot.worker_name}</span>`;
    }
    button.dataset.workerId = slot.worker_id;
    button.dataset.time = slot.time_slot;
    if (slot.reserved) {
      button.classList.add('is-reserved');
      button.disabled = true;
    } else if (state.blockedStarts.has(`${slot.worker_id}:${slot.time_slot}`)) {
      button.classList.add('is-buffer');
      button.disabled = true;
    } else if (startByWorker.get(slot.worker_id)?.has(slot.time_slot)) {
      button.classList.add('is-start');
    }
    button.addEventListener('click', () => {
      if (slot.reserved || state.blockedStarts.has(`${slot.worker_id}:${slot.time_slot}`)) return;
      document.querySelectorAll('.slot-button').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      state.selectedSlot = {
        worker_id: slot.worker_id,
        time: slot.time_slot,
        worker_name: slot.worker_name
      };
      const valid = highlightSelection(slot.worker_id, slot.time_slot);
      dom.submit.disabled = !valid;
      if (!valid) {
        setResult('Vybraný termín nevyhovuje délce služby.', true);
      } else {
        setResult('', false);
      }
    });
    dom.slots.appendChild(button);
  });
}

async function loadSlots() {
  const serviceIds = state.selectedServiceIds;
  const date = state.selectedDate;
  dom.submit.disabled = true;
  state.selectedSlot = null;
  if (!serviceIds.length || !date) {
    renderSlots([], [], 'Zvol alespoň jednu službu a datum v kalendáři.');
    await loadDateMap();
    return;
  }

  const response = await fetch(
    `/api/public/availability?date=${encodeURIComponent(date)}&service_ids=${encodeURIComponent(serviceIds.join(','))}`
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    renderSlots([], [], data.error || 'Nepodařilo se načíst dostupnost.');
    return;
  }
  const data = await response.json();
  state.duration = Number(data.duration) || state.duration || 30;
  state.blockedStarts = new Set(
    (data.blocked_starts || []).map((item) => `${item.worker_id}:${item.time_slot}`)
  );
  renderSlots(data.base_slots || [], data.slots || []);
  await loadDateMap();
  if (state.selectedSlot) {
    const selectedButton = document.querySelector(
      `.slot-button[data-worker-id="${state.selectedSlot.worker_id}"][data-time="${state.selectedSlot.time}"]`
    );
    if (selectedButton) {
      selectedButton.click();
    }
  }
}

async function submitReservation() {
  if (dom.submit.disabled) {
    setResult('Vybraný termín není validní pro délku služby.', true);
    return;
  }
  const payload = {
    service_ids: state.selectedServiceIds,
    date: state.selectedDate,
    time: state.selectedSlot?.time,
    worker_id: state.selectedSlot?.worker_id,
    client_name: dom.name.value.trim(),
    phone: dom.phone.value.trim(),
    email: dom.email.value.trim(),
    note: dom.note.value.trim()
  };

  if (!payload.service_ids?.length || !payload.date || !payload.time || !payload.worker_id || !payload.client_name) {
    setResult('Doplň služby, termín a jméno.', true);
    return;
  }

  const response = await fetch('/api/public/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    setResult(data?.error || 'Rezervaci se nepodařilo uložit.', true);
    return;
  }

  setResult('Rezervace byla odeslána. Brzy se vám ozveme.', false);
  dom.name.value = '';
  dom.phone.value = '';
  dom.email.value = '';
  dom.note.value = '';
  dom.submit.disabled = true;
  await loadSlots();
}

async function init() {
  await loadBranding();
  state.selectedDate = todayLocal();
  setDateMapMonthFromSelection();
  await fetchServices();
  await loadSlots();
  dom.submit.addEventListener('click', submitReservation);
}

init();
