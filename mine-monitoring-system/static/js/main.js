// AI-Enabled Mine Monitoring System - Client Controller Script

let selectedNode = 'NODE_01';
let currentMode = 'live'; // 'live' or 'demo'
let historyRange = '1h';
let previousTilt = {};
let sseEventSource = null;
let charts = {};

// Initialize application on DOM load
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  initCharts();
  fetchInitialStatus();
  startPollingStatus();
  connectSSE();
  loadHistoryData();

  // Set default server URL in ESP32 guide
  const host = window.location.host || 'localhost:5000';
  const guideUrlEl = document.getElementById('guide-server-url');
  if (guideUrlEl) {
    guideUrlEl.innerText = `http://${host}/api/sensor-data`;
  }
});

// Navigation Tab Switcher
function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));

  const targetPage = document.getElementById(`page-${tabId}`);
  if (targetPage) {
    targetPage.classList.remove('hidden');
  }

  const targetNav = document.getElementById(`nav-${tabId}`);
  if (targetNav) {
    targetNav.classList.add('active');
  }

  if (tabId === 'monitoring') {
    loadHistoryData();
  } else if (tabId === 'ml-analysis') {
    loadRiskHistory();
  }
}

// Select Active Node (NODE_01, NODE_02, NODE_03)
function selectNode(nodeId) {
  selectedNode = nodeId;
  document.querySelectorAll('.node-btn').forEach(btn => {
    btn.classList.remove('bg-blue-600', 'text-white', 'border-blue-500');
    btn.classList.add('bg-slate-800', 'text-slate-300', 'border-slate-700');
  });

  const activeBtn = document.getElementById(`btn-node-${nodeId}`);
  if (activeBtn) {
    activeBtn.classList.remove('bg-slate-800', 'text-slate-300', 'border-slate-700');
    activeBtn.classList.add('bg-blue-600', 'text-white', 'border-blue-500');
  }

  document.getElementById('ml-target-node').innerText = nodeId;

  fetchLatestNodeData(nodeId);
  loadHistoryData();
}

// Mode Selector (LIVE vs DEMO)
function setMode(mode) {
  currentMode = mode;
  const isDemo = mode === 'demo';

  const liveBtn = document.getElementById('btn-live-mode');
  const demoBtn = document.getElementById('btn-demo-mode');
  const scenarioBox = document.getElementById('demo-scenario-box');
  const demoBadge = document.getElementById('demo-mode-badge');

  if (isDemo) {
    liveBtn.className = "px-2.5 py-1 rounded-lg font-semibold transition text-slate-400";
    demoBtn.className = "px-2.5 py-1 rounded-lg font-semibold transition bg-amber-500 text-slate-950 shadow";
    scenarioBox.classList.remove('hidden');
    demoBadge.classList.remove('hidden');
  } else {
    liveBtn.className = "px-2.5 py-1 rounded-lg font-semibold transition bg-blue-600 text-white shadow";
    demoBtn.className = "px-2.5 py-1 rounded-lg font-semibold transition text-slate-400";
    scenarioBox.classList.add('hidden');
    demoBadge.classList.add('hidden');
  }

  const scenarioVal = document.getElementById('select-scenario').value;

  fetch('/api/demo/mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: isDemo, scenario: scenarioVal })
  });
}

function changeScenario(scenario) {
  fetch('/api/demo/mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true, scenario: scenario })
  });
}

// Fetch System Status
function fetchInitialStatus() {
  fetch('/api/status')
    .then(res => res.json())
    .then(data => {
      updateGlobalStatusPill(data.esp32_status, data.last_contact_seconds_ago);
      if (data.demo_mode) {
        setMode('demo');
        if (data.demo_scenario) {
          document.getElementById('select-scenario').value = data.demo_scenario;
        }
      } else {
        setMode('live');
      }

      if (data.nodes && data.nodes.length > 0) {
        data.nodes.forEach(nodeData => {
          updateNodeMatrixBadge(nodeData.node_id, nodeData.risk_level);
          if (nodeData.node_id === selectedNode) {
            updateDashboardCards(nodeData, {
              risk: nodeData.risk_level,
              confidence_pct: nodeData.confidence
            });
          }
        });
      }
    })
    .catch(err => console.error("Error fetching status:", err));
}

function startPollingStatus() {
  setInterval(() => {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        updateGlobalStatusPill(data.esp32_status, data.last_contact_seconds_ago);
      });
  }, 5000);
}

function updateGlobalStatusPill(statusStr, secondsAgo) {
  const dot = document.getElementById('global-status-dot');
  const text = document.getElementById('global-status-text');
  const monStatus = document.getElementById('mon-esp32-status');
  const monLastReceived = document.getElementById('mon-last-received');

  if (statusStr === 'ONLINE') {
    dot.className = "status-dot online";
    text.innerText = "ONLINE";
    text.className = "font-mono text-emerald-400";
    if (monStatus) {
      monStatus.innerHTML = `<span class="status-dot online"></span> ONLINE`;
      monStatus.className = "font-bold text-emerald-400 flex items-center gap-1";
    }
  } else {
    dot.className = "status-dot offline";
    text.innerText = "ESP32 OFFLINE";
    text.className = "font-mono text-rose-400";
    if (monStatus) {
      monStatus.innerHTML = `<span class="status-dot offline"></span> ESP32 OFFLINE`;
      monStatus.className = "font-bold text-rose-400 flex items-center gap-1";
    }
  }

  if (monLastReceived) {
    if (secondsAgo !== null && secondsAgo !== undefined) {
      monLastReceived.innerText = `${Math.round(secondsAgo)}s ago`;
    } else {
      monLastReceived.innerText = "No recent data";
    }
  }
}

// Connect Real-Time SSE Stream
function connectSSE() {
  if (sseEventSource) {
    sseEventSource.close();
  }

  sseEventSource = new EventSource('/api/stream');

  sseEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'connected') return;

      const reading = data.reading;
      const ml = data.ml;

      if (!reading || !reading.node_id) return;

      updateNodeMatrixBadge(reading.node_id, ml ? ml.risk : reading.risk_level);

      // Detect Anomaly
      detectAnomaly(reading.node_id, reading.tilt);

      if (reading.node_id === selectedNode) {
        updateDashboardCards(reading, ml);
        appendDataToCharts(reading, ml);
      }
    } catch (e) {
      console.error("Error parsing SSE:", e);
    }
  };

  sseEventSource.onerror = () => {
    setTimeout(connectSSE, 5000);
  };
}

// Detect Anomaly (Sudden Tilt Change)
function detectAnomaly(nodeId, newTilt) {
  if (previousTilt[nodeId] !== undefined) {
    const diff = Math.abs(newTilt - previousTilt[nodeId]);
    if (diff >= 4.0) {
      showAnomalyAlert(`Sudden tilt shift of ${diff.toFixed(1)}° detected on ${nodeId}!`);
    }
  }
  previousTilt[nodeId] = newTilt;
}

function showAnomalyAlert(msg) {
  const banner = document.getElementById('anomaly-alert-banner');
  const msgEl = document.getElementById('anomaly-alert-msg');
  if (banner && msgEl) {
    msgEl.innerText = msg;
    banner.classList.remove('hidden');
  }
}

function dismissAnomaly() {
  const banner = document.getElementById('anomaly-alert-banner');
  if (banner) banner.classList.add('hidden');
}

// Update UI Telemetry Cards
function updateDashboardCards(r, ml) {
  // MPU6050
  document.getElementById('val-tilt').innerText = (r.tilt || 0.0).toFixed(1);
  document.getElementById('val-accel-x').innerText = (r.accel_x || 0.0).toFixed(2);
  document.getElementById('val-accel-y').innerText = (r.accel_y || 0.0).toFixed(2);
  document.getElementById('val-accel-z').innerText = (r.accel_z || 9.8).toFixed(2);
  document.getElementById('val-gyro-x').innerText = (r.gyro_x || 0.0).toFixed(2);
  document.getElementById('val-gyro-y').innerText = (r.gyro_y || 0.0).toFixed(2);
  document.getElementById('val-gyro-z').innerText = (r.gyro_z || 0.0).toFixed(2);

  const mpuStatus = document.getElementById('card-mpu-status');
  if (r.tilt >= 8.0) {
    mpuStatus.innerText = "DANGER";
    mpuStatus.className = "text-xs font-semibold px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-500/30";
  } else if (r.tilt >= 4.0) {
    mpuStatus.innerText = "ELEVATED";
    mpuStatus.className = "text-xs font-semibold px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-500/30";
  } else {
    mpuStatus.innerText = "NORMAL";
    mpuStatus.className = "text-xs font-semibold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30";
  }

  // Vibration
  document.getElementById('val-vibration').innerText = Math.round(r.vibration || 0);
  document.getElementById('val-vib-events').innerText = r.vibration_events || (r.vibration > 25 ? 12 : 3);
  const vibStatus = document.getElementById('card-vib-status');
  if (r.vibration >= 60) {
    vibStatus.innerText = "HIGH VIB";
    vibStatus.className = "text-xs font-semibold px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-500/30";
  } else if (r.vibration >= 30) {
    vibStatus.innerText = "MODERATE";
    vibStatus.className = "text-xs font-semibold px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-500/30";
  } else {
    vibStatus.innerText = "NORMAL";
    vibStatus.className = "text-xs font-semibold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30";
  }

  // DHT Temp / Humidity
  document.getElementById('val-temp').innerText = (r.temperature || 0.0).toFixed(1);
  document.getElementById('val-humidity').innerText = Math.round(r.humidity || 0);

  // ML Risk Analysis Card
  const risk = ml ? ml.risk : (r.risk_level || 'LOW');
  const conf = ml ? (ml.confidence_pct || (ml.confidence ? ml.confidence * 100 : 90)) : (r.confidence || 90);

  const riskBadge = document.getElementById('badge-current-risk');
  const riskContainer = document.getElementById('card-risk-container');
  const confVal = document.getElementById('val-risk-confidence');
  const confBar = document.getElementById('bar-risk-confidence');

  confVal.innerText = `${conf.toFixed(1)}%`;
  confBar.style.width = `${Math.min(100, Math.max(0, conf))}%`;

  if (risk === 'HIGH') {
    riskBadge.className = "badge-risk badge-high text-base";
    riskBadge.innerText = "HIGH RISK";
    riskContainer.className = "card-glass p-6 space-y-4 border-l-4 border-l-rose-500 bg-rose-950/20";
    confBar.className = "bg-rose-500 h-1.5 rounded-full";
  } else if (risk === 'MEDIUM') {
    riskBadge.className = "badge-risk badge-medium text-base";
    riskBadge.innerText = "MEDIUM RISK";
    riskContainer.className = "card-glass p-6 space-y-4 border-l-4 border-l-amber-500 bg-amber-950/10";
    confBar.className = "bg-amber-500 h-1.5 rounded-full";
  } else {
    riskBadge.className = "badge-risk badge-low text-base";
    riskBadge.innerText = "LOW RISK";
    riskContainer.className = "card-glass p-6 space-y-4 border-l-4 border-l-emerald-500";
    confBar.className = "bg-emerald-500 h-1.5 rounded-full";
  }

  // Update ML Page metrics as well
  document.getElementById('ml-badge-large').className = riskBadge.className + " text-xl px-6 py-2";
  document.getElementById('ml-badge-large').innerText = riskBadge.innerText;
  document.getElementById('ml-confidence-large').innerText = `${conf.toFixed(1)}%`;
  document.getElementById('ml-factor-tilt').innerText = `${(r.tilt || 0.0).toFixed(1)}°`;
  document.getElementById('ml-factor-vib').innerText = Math.round(r.vibration || 0);
  document.getElementById('ml-factor-temp').innerText = `${(r.temperature || 0.0).toFixed(1)}°C`;
  document.getElementById('ml-factor-hum').innerText = `${Math.round(r.humidity || 0)}%`;
}

function updateNodeMatrixBadge(nodeId, riskLevel) {
  const badge = document.getElementById(`node-matrix-${nodeId}`);
  if (!badge) return;

  if (riskLevel === 'HIGH') {
    badge.className = "badge-risk badge-high text-xs";
    badge.innerText = "HIGH";
  } else if (riskLevel === 'MEDIUM') {
    badge.className = "badge-risk badge-medium text-xs";
    badge.innerText = "MEDIUM";
  } else {
    badge.className = "badge-risk badge-low text-xs";
    badge.innerText = "LOW";
  }
}

// Chart.js Setup
function initCharts() {
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        grid: { color: 'rgba(51, 65, 85, 0.3)' },
        ticks: { color: '#94a3b8', font: { size: 10 } }
      },
      y: {
        grid: { color: 'rgba(51, 65, 85, 0.3)' },
        ticks: { color: '#94a3b8', font: { size: 10 } }
      }
    }
  };

  // 1. Tilt Chart
  const ctxTilt = document.getElementById('chart-tilt').getContext('2d');
  charts.tilt = new Chart(ctxTilt, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Tilt (°)',
        data: [],
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56, 189, 248, 0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true
      }]
    },
    options: commonOptions
  });

  // 2. Vibration Chart
  const ctxVib = document.getElementById('chart-vibration').getContext('2d');
  charts.vibration = new Chart(ctxVib, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Vibration',
        data: [],
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true
      }]
    },
    options: commonOptions
  });

  // 3. Temp Chart
  const ctxTemp = document.getElementById('chart-temperature').getContext('2d');
  charts.temperature = new Chart(ctxTemp, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Temp (°C)',
        data: [],
        borderColor: '#f43f5e',
        backgroundColor: 'rgba(244, 63, 94, 0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true
      }]
    },
    options: commonOptions
  });

  // 4. Humidity Chart
  const ctxHum = document.getElementById('chart-humidity').getContext('2d');
  charts.humidity = new Chart(ctxHum, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Humidity (%)',
        data: [],
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6, 182, 212, 0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true
      }]
    },
    options: commonOptions
  });

  // 5. ML Risk Timeline Chart
  const ctxRisk = document.getElementById('chart-risk-history').getContext('2d');
  charts.riskHistory = new Chart(ctxRisk, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Risk Score (1:LOW, 2:MED, 3:HIGH)',
        data: [],
        borderColor: '#ec4899',
        backgroundColor: 'rgba(236, 72, 153, 0.15)',
        borderWidth: 2,
        stepped: true,
        fill: true
      }]
    },
    options: {
      ...commonOptions,
      scales: {
        ...commonOptions.scales,
        y: {
          min: 0.5,
          max: 3.5,
          ticks: {
            stepSize: 1,
            color: '#94a3b8',
            callback: (val) => val === 1 ? 'LOW' : val === 2 ? 'MEDIUM' : val === 3 ? 'HIGH' : ''
          }
        }
      }
    }
  });
}

function setHistoryRange(range) {
  historyRange = range;
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.className = "range-btn px-3 py-1 rounded-lg font-semibold transition text-slate-400 hover:text-white";
  });
  const activeBtn = document.getElementById(`btn-range-${range}`);
  if (activeBtn) {
    activeBtn.className = "range-btn px-3 py-1 rounded-lg font-semibold transition bg-blue-600 text-white";
  }
  loadHistoryData();
}

function loadHistoryData() {
  fetch(`/api/history?node_id=${selectedNode}&range=${historyRange}`)
    .then(res => res.json())
    .then(data => {
      const readings = data.readings || [];
      const labels = readings.map(r => r.timestamp ? r.timestamp.split(' ')[1] || r.timestamp : '');
      
      charts.tilt.data.labels = labels;
      charts.tilt.data.datasets[0].data = readings.map(r => r.tilt);
      charts.tilt.update();

      charts.vibration.data.labels = labels;
      charts.vibration.data.datasets[0].data = readings.map(r => r.vibration);
      charts.vibration.update();

      charts.temperature.data.labels = labels;
      charts.temperature.data.datasets[0].data = readings.map(r => r.temperature);
      charts.temperature.update();

      charts.humidity.data.labels = labels;
      charts.humidity.data.datasets[0].data = readings.map(r => r.humidity);
      charts.humidity.update();
    })
    .catch(err => console.error("Error loading chart history:", err));
}

function appendDataToCharts(r, ml) {
  const timeLabel = new Date().toLocaleTimeString();

  // Helper to append and keep max 25 points
  const pushPoint = (chart, label, val) => {
    chart.data.labels.push(label);
    chart.data.datasets[0].data.push(val);
    if (chart.data.labels.length > 25) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }
    chart.update('none');
  };

  pushPoint(charts.tilt, timeLabel, r.tilt);
  pushPoint(charts.vibration, timeLabel, r.vibration);
  pushPoint(charts.temperature, timeLabel, r.temperature);
  pushPoint(charts.humidity, timeLabel, r.humidity);
}

function loadRiskHistory() {
  fetch('/api/risk-history?limit=30')
    .then(res => res.json())
    .then(data => {
      const hist = data.history || [];
      const labels = hist.map(h => h.timestamp ? h.timestamp.split(' ')[1] || h.timestamp : '');
      const scores = hist.map(h => h.risk_level === 'HIGH' ? 3 : h.risk_level === 'MEDIUM' ? 2 : 1);

      charts.riskHistory.data.labels = labels;
      charts.riskHistory.data.datasets[0].data = scores;
      charts.riskHistory.update();
    });
}

function fetchLatestNodeData(nodeId) {
  fetch(`/api/latest?node_id=${nodeId}`)
    .then(res => res.json())
    .then(data => {
      if (data.reading) {
        updateDashboardCards(data.reading, {
          risk: data.reading.risk_level,
          confidence_pct: data.reading.confidence
        });
      }
    });
}

// Test Payload Submission
function submitTestPayload(e) {
  e.preventDefault();
  const payload = {
    node_id: document.getElementById('test-node-id').value,
    tilt: parseFloat(document.getElementById('test-tilt').value),
    vibration: parseFloat(document.getElementById('test-vibration').value),
    temperature: parseFloat(document.getElementById('test-temp').value),
    humidity: parseFloat(document.getElementById('test-humidity').value)
  };

  const out = document.getElementById('test-response-output');
  out.classList.remove('hidden');
  out.innerText = "Sending HTTP POST request...";

  fetch('/api/sensor-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    out.innerText = "Response:\n" + JSON.stringify(data, null, 2);
  })
  .catch(err => {
    out.innerText = "Error: " + err.message;
  });
}

// Contact Form Submission
function submitContactForm(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('contact-name').value,
    email: document.getElementById('contact-email').value,
    message: document.getElementById('contact-message').value
  };

  const resp = document.getElementById('contact-response');

  fetch('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    resp.classList.remove('hidden');
    if (data.success) {
      resp.className = "p-4 rounded-xl text-sm border bg-emerald-950/60 border-emerald-500/40 text-emerald-300";
      resp.innerText = data.info || "Message sent successfully and stored in database!";
      document.getElementById('contact-form').reset();
    } else {
      resp.className = "p-4 rounded-xl text-sm border bg-rose-950/60 border-rose-500/40 text-rose-300";
      resp.innerText = data.error || "Failed to send message.";
    }
  })
  .catch(err => {
    resp.classList.remove('hidden');
    resp.className = "p-4 rounded-xl text-sm border bg-rose-950/60 border-rose-500/40 text-rose-300";
    resp.innerText = "Network error: " + err.message;
  });
}
