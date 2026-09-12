import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './src/database.js';
import { predictor } from './src/ml_predictor.js';
import { DemoSimulator } from './src/demo_simulator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets
app.use('/static', express.static(path.join(__dirname, 'static')));

// Active SSE client connections
const sseClients = new Set();

function broadcastSSE(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(data);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Start background demo simulator
const simulator = new DemoSimulator(broadcastSSE);
simulator.start(3000);

// Keep-alive heartbeat for SSE connections
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(': keepalive\n\n');
    } catch {
      sseClients.delete(client);
    }
  }
}, 15000);

// ==========================================
// 1. PAGE ROUTE
// ==========================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

// ==========================================
// 2. REAL-TIME SERVER-SENT EVENTS (SSE)
// ==========================================
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send initial connection packet
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// ==========================================
// 3. TELEMETRY INGESTION ENDPOINT (ESP32)
// ==========================================
app.post('/api/sensor-data', (req, res) => {
  const data = req.body || {};
  const nodeId = String(data.node_id || 'NODE_01').toUpperCase().trim();

  const tilt = parseFloat(data.tilt) || 0.0;
  const vibration = parseFloat(data.vibration) || 0.0;
  const temperature = parseFloat(data.temperature) || 0.0;
  const humidity = parseFloat(data.humidity) || 0.0;

  // Evaluate ML hazard prediction
  const ml = predictor.predict(tilt, vibration, temperature, humidity);

  const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19);

  const readingData = {
    timestamp: nowIso,
    node_id: nodeId,
    tilt,
    accel_x: parseFloat(data.accel_x) || 0.0,
    accel_y: parseFloat(data.accel_y) || 0.0,
    accel_z: parseFloat(data.accel_z) || 9.8,
    gyro_x: parseFloat(data.gyro_x) || 0.0,
    gyro_y: parseFloat(data.gyro_y) || 0.0,
    gyro_z: parseFloat(data.gyro_z) || 0.0,
    vibration,
    vibration_events: parseInt(data.vibration_events) || (vibration > 60 ? 32 : vibration > 25 ? 12 : 3),
    temperature,
    humidity,
    risk_level: ml.risk,
    confidence: ml.confidence_pct,
    is_demo: data.is_demo ? 1 : 0
  };

  const readingId = db.insertSensorReading(readingData);
  readingData.id = readingId;

  // Mark hardware contact timestamp
  const nowSeconds = String(Date.now() / 1000);
  db.setSystemSetting('last_esp32_contact', nowSeconds);
  db.setSystemSetting(`last_node_contact_${nodeId}`, nowSeconds);

  // Broadcast to all connected SSE clients
  broadcastSSE({
    reading: readingData,
    ml,
    timestamp: nowIso
  });

  return res.json({
    success: true,
    message: 'Telemetry received and evaluated',
    node_id: nodeId,
    risk: ml.risk,
    confidence: ml.confidence,
    confidence_pct: ml.confidence_pct,
    probabilities: ml.probabilities,
    timestamp: nowIso
  });
});

// ==========================================
// 4. SYSTEM STATUS
// ==========================================
app.get('/api/status', (req, res) => {
  const lastContactStr = db.getSystemSetting('last_esp32_contact');
  const nowSeconds = Date.now() / 1000;
  let secondsAgo = null;

  if (lastContactStr) {
    secondsAgo = Math.max(0, nowSeconds - parseFloat(lastContactStr));
  }

  const isOnline = secondsAgo !== null && secondsAgo <= 15.0;
  const demoMode = db.getSystemSetting('demo_mode', '0') === '1';
  const demoScenario = db.getSystemSetting('demo_scenario', 'NORMAL');

  const esp32Status = (isOnline || demoMode) ? 'ONLINE' : 'OFFLINE';

  return res.json({
    esp32_status: esp32Status,
    last_contact_seconds_ago: secondsAgo !== null ? +secondsAgo.toFixed(1) : null,
    is_online: isOnline,
    is_live_hardware: isOnline && !demoMode,
    database_status: 'CONNECTED',
    ml_status: predictor.status,
    demo_mode: demoMode,
    demo_scenario: demoScenario,
    nodes: db.getLatestReadingsAllNodes()
  });
});

// ==========================================
// 5. TELEMETRY HISTORY
// ==========================================
app.get('/api/history', (req, res) => {
  const nodeId = String(req.query.node_id || 'NODE_01');
  const range = String(req.query.range || '1h');

  const readings = db.getSensorHistory(nodeId, range);
  return res.json({
    node_id: nodeId,
    range,
    readings
  });
});

// ==========================================
// 6. LATEST TELEMETRY
// ==========================================
app.get('/api/latest', (req, res) => {
  const nodeId = req.query.node_id;
  if (nodeId) {
    const reading = db.getNodeLatestReading(String(nodeId));
    return res.json({ node_id: nodeId, reading });
  }

  const nodes = db.getLatestReadingsAllNodes();
  return res.json({ nodes });
});

// ==========================================
// 7. ML RISK HISTORY TIMELINE
// ==========================================
app.get('/api/risk-history', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const history = db.getRiskHistory(limit);
  return res.json({ history });
});

// ==========================================
// 8. DEMO MODE TOGGLE
// ==========================================
app.post('/api/demo/mode', (req, res) => {
  const { enabled, scenario } = req.body || {};

  db.setSystemSetting('demo_mode', enabled ? '1' : '0');
  if (scenario) {
    db.setSystemSetting('demo_scenario', String(scenario).toUpperCase());
  }

  return res.json({
    success: true,
    demo_mode: !!enabled,
    scenario: db.getSystemSetting('demo_scenario', 'NORMAL'),
    message: `Demo mode is now ${enabled ? 'ENABLED' : 'DISABLED'}`
  });
});

// ==========================================
// 9. CONTACT FORM
// ==========================================
app.post('/api/contact', (req, res) => {
  const { name, email, message } = req.body || {};

  if (!name || !email || !message) {
    return res.status(400).json({ success: false, error: 'Name, email, and message are required.' });
  }

  const messageId = db.saveContactMessage(String(name).trim(), String(email).trim(), String(message).trim());

  return res.json({
    success: true,
    message_id: messageId,
    info: 'Message sent successfully and recorded in project database!'
  });
});

// Start listening
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Mine Monitoring System server listening on http://0.0.0.0:${PORT}`);
});
