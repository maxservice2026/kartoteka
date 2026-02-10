const dom = {
  service: document.getElementById('publicService'),
  date: document.getElementById('publicDate'),
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
  selectedSlot: null,
  duration: 30
};

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

async function fetchServices() {
  const response = await fetch('/api/public/services');
  const data = await response.json();
  state.services = data.services || [];
  dom.service.innerHTML =
    '<option value="">Vyber službu</option>' +
    state.services
      .map(
        (service) =>
          `<option value="${service.id}" data-duration="${service.duration_minutes || 30}">${service.name} (${service.duration_minutes || 30} minut)</option>`
      )
      .join('');
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
    document.querySelectorAll('.slot-button.is-selected').forEach((cell) => {
      cell.classList.add(ok ? 'is-valid' : 'is-invalid');
    });
    return ok;
  };

  baseSlots.forEach((slot) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ghost slot-button';
    button.innerHTML = slot.reserved
      ? `<span class="slot-main">${slot.time_slot} • <span class="slot-status">Obsazeno</span></span>`
      : `<span class="slot-main">${slot.time_slot} • ${slot.worker_name}</span>`;
    button.dataset.workerId = slot.worker_id;
    button.dataset.time = slot.time_slot;
    if (slot.reserved) {
      button.classList.add('is-reserved');
      button.disabled = true;
    } else if (startByWorker.get(slot.worker_id)?.has(slot.time_slot)) {
      button.classList.add('is-start');
    }
    button.addEventListener('click', () => {
      if (slot.reserved) return;
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
  const serviceId = dom.service.value;
  const date = dom.date.value;
  dom.submit.disabled = true;
  state.selectedSlot = null;
  if (!serviceId || !date) {
    renderSlots([], [], 'Zvol službu a datum.');
    return;
  }

  const response = await fetch(`/api/public/availability?date=${encodeURIComponent(date)}&service_id=${serviceId}`);
  const data = await response.json();
  state.duration = Number(data.duration) || 30;
  renderSlots(data.base_slots || [], data.slots || []);
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
    service_id: dom.service.value,
    date: dom.date.value,
    time: state.selectedSlot?.time,
    worker_id: state.selectedSlot?.worker_id,
    client_name: dom.name.value.trim(),
    phone: dom.phone.value.trim(),
    email: dom.email.value.trim(),
    note: dom.note.value.trim()
  };

  if (!payload.service_id || !payload.date || !payload.time || !payload.worker_id || !payload.client_name) {
    setResult('Doplň službu, termín a jméno.', true);
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
  dom.date.value = todayLocal();
  await fetchServices();
  await loadSlots();

  dom.service.addEventListener('change', () => {
    const selected = dom.service.options[dom.service.selectedIndex];
    state.duration = Number(selected?.dataset?.duration || 30);
    loadSlots();
  });
  dom.date.addEventListener('change', loadSlots);
  dom.submit.addEventListener('click', submitReservation);
}

init();
