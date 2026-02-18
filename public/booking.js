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

function normalizeDurationMinutes(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return numeric;
}

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
            <span class="service-pill-duration">${normalizeDurationMinutes(service.duration_minutes, 0)} min</span>
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
  const total = selected.reduce((sum, service) => sum + normalizeDurationMinutes(service.duration_minutes, 0), 0);
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
  const available = new Set((days || []).map((day) => Number(day)));
  const [selectedYear, selectedMonth, selectedDay] = (state.selectedDate || '').split('-').map(Number);
  const selectedIsCurrentMonth = selectedYear === state.dateMapYear && selectedMonth === state.dateMapMonth;
  const lastDay = new Date(state.dateMapYear, state.dateMapMonth, 0).getDate();
  const jsWeekday = new Date(state.dateMapYear, state.dateMapMonth - 1, 1).getDay();
  const mondayOffset = (jsWeekday + 6) % 7;
  const dayButtons = [];
  for (let i = 0; i < mondayOffset; i += 1) {
    dayButtons.push('<div class="date-availability-day empty" aria-hidden="true"></div>');
  }
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
    <div class="date-availability-weekdays">
      <span>Po</span><span>Út</span><span>St</span><span>Čt</span><span>Pá</span><span>So</span><span>Ne</span>
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
  dom.dateMap.querySelectorAll('button.date-availability-day').forEach((button) => {
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

  const workers = Array.from(baseByWorker.entries())
    .map(([id, value]) => ({
      id,
      name: value.worker_name || 'Pracovník'
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'cs'));

  const slotList = timeSlots();
  const requiredSlots = Math.max(1, Math.ceil(state.duration / 30));

  const clearSelectionHighlight = () => {
    dom.slots.querySelectorAll('.slot-entry').forEach((entry) => {
      entry.classList.remove('active', 'is-selected', 'is-valid', 'is-invalid');
    });
    dom.slots.querySelectorAll('.slot-button').forEach((item) => {
      item.classList.remove('active', 'is-selected', 'is-valid', 'is-invalid');
    });
    dom.slots.querySelectorAll('.slot-worker-select').forEach((select) => {
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
      const entry = dom.slots.querySelector(`.slot-entry[data-time="${slot}"]`);
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
    if (state.blockedStarts.has(`${workerId}:${startTime}`)) {
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
        const blockedByRule = state.blockedStarts.has(key) || !isStart;
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
            state.selectedSlot = {
              worker_id: worker.id,
              time: timeSlot,
              worker_name: worker.name
            };
            const valid = highlightSelection(worker.id, timeSlot);
            dom.submit.disabled = !valid;
            if (!valid) {
              setResult('Vybraný termín nevyhovuje délce služby.', true);
            } else {
              setResult('', false);
            }
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
          state.selectedSlot = null;
          clearSelectionHighlight();
          dom.submit.disabled = true;
          setResult('', false);
          return;
        }
        const worker = workers.find((item) => item.id === workerId);
        state.selectedSlot = {
          worker_id: workerId,
          time: timeSlot,
          worker_name: worker?.name || 'Pracovník'
        };
        const valid = highlightSelection(workerId, timeSlot);
        dom.submit.disabled = !valid;
        if (!valid) {
          setResult('Vybraný termín nevyhovuje délce služby.', true);
        } else {
          setResult('', false);
        }
      });

      entry.appendChild(select);
    }

    group.appendChild(entry);

    dom.slots.appendChild(group);
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
  const durationFromApi = Number(data.duration);
  if (Number.isFinite(durationFromApi) && durationFromApi >= 0) {
    state.duration = durationFromApi;
  } else {
    state.duration = normalizeDurationMinutes(state.duration, 0);
  }
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
