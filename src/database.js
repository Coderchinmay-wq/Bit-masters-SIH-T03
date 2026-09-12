// In-Memory Database for Mine Monitoring System (Replaces SQLite)

class MineDatabase {
  constructor() {
    this.sensorReadings = [];
    this.contactMessages = [];
    this.systemState = new Map();
    this.nextReadingId = 1;
    this.nextMessageId = 1;

    this.initDb();
  }

  initDb() {
    // Default system settings
    this.setSystemSetting('demo_mode', '1'); // Default to demo so live streaming works immediately in preview
    this.setSystemSetting('demo_scenario', 'NORMAL');
    this.setSystemSetting('last_esp32_contact', String(Date.now() / 1000));

    // Seed realistic initial readings for NODE_01, NODE_02, NODE_03
    const now = Date.now();
    const nodes = [
      { id: 'NODE_01', baseTilt: 1.8, baseVib: 8, baseTemp: 26.4, baseHum: 51 },
      { id: 'NODE_02', baseTilt: 2.2, baseVib: 12, baseTemp: 27.1, baseHum: 53 },
      { id: 'NODE_03', baseTilt: 2.9, baseVib: 15, baseTemp: 28.0, baseHum: 56 }
    ];

    // Seed 15 readings for each node spanning the last 15 minutes
    for (let i = 14; i >= 0; i--) {
      const timestamp = new Date(now - i * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);

      for (const node of nodes) {
        const jitter = (Math.sin(i + node.baseTilt) * 0.4);
        const tilt = +(node.baseTilt + jitter).toFixed(1);
        const vib = Math.max(2, Math.round(node.baseVib + Math.cos(i) * 3));
        const temp = +(node.baseTemp + jitter * 0.5).toFixed(1);
        const hum = Math.round(node.baseHum + jitter * 2);

        this.sensorReadings.push({
          id: this.nextReadingId++,
          timestamp,
          node_id: node.id,
          tilt,
          accel_x: +(0.05 + jitter * 0.02).toFixed(2),
          accel_y: +(0.10 + jitter * 0.02).toFixed(2),
          accel_z: +(9.80 - jitter * 0.01).toFixed(2),
          gyro_x: +(jitter * 0.1).toFixed(2),
          gyro_y: +(-jitter * 0.1).toFixed(2),
          gyro_z: 0.0,
          vibration: vib,
          vibration_events: vib > 25 ? 12 : 3,
          temperature: temp,
          humidity: hum,
          risk_level: 'LOW',
          confidence: 94.2,
          is_demo: 1
        });
      }
    }
  }

  insertSensorReading(data) {
    const readingId = this.nextReadingId++;
    const timestamp = data.timestamp || new Date().toISOString().replace('T', ' ').substring(0, 19);

    const reading = {
      id: readingId,
      timestamp,
      node_id: String(data.node_id || 'NODE_01').toUpperCase().trim(),
      tilt: Number(data.tilt) || 0.0,
      accel_x: Number(data.accel_x) || 0.0,
      accel_y: Number(data.accel_y) || 0.0,
      accel_z: Number(data.accel_z) || 9.8,
      gyro_x: Number(data.gyro_x) || 0.0,
      gyro_y: Number(data.gyro_y) || 0.0,
      gyro_z: Number(data.gyro_z) || 0.0,
      vibration: Number(data.vibration) || 0.0,
      vibration_events: Number(data.vibration_events) || 0,
      temperature: Number(data.temperature) || 0.0,
      humidity: Number(data.humidity) || 0.0,
      risk_level: data.risk_level || 'LOW',
      confidence: Number(data.confidence) || 90.0,
      is_demo: data.is_demo ? 1 : 0
    };

    this.sensorReadings.push(reading);

    // Keep history manageable (last 1000 readings)
    if (this.sensorReadings.length > 1000) {
      this.sensorReadings.shift();
    }

    return readingId;
  }

  getLatestReadingsAllNodes() {
    const latestByNode = new Map();

    for (let i = this.sensorReadings.length - 1; i >= 0; i--) {
      const r = this.sensorReadings[i];
      if (!latestByNode.has(r.node_id)) {
        latestByNode.set(r.node_id, r);
      }
    }

    return Array.from(latestByNode.values()).sort((a, b) => a.node_id.localeCompare(b.node_id));
  }

  getNodeLatestReading(nodeId) {
    const norm = String(nodeId).toUpperCase().trim();
    for (let i = this.sensorReadings.length - 1; i >= 0; i--) {
      if (this.sensorReadings[i].node_id === norm) {
        return this.sensorReadings[i];
      }
    }
    return null;
  }

  getSensorHistory(nodeId = 'NODE_01', timeRange = '1h') {
    const norm = String(nodeId).toUpperCase().trim();
    const nodeReadings = this.sensorReadings.filter(r => r.node_id === norm);

    const now = Date.now();
    let cutoff = 0;
    if (timeRange === '1h') cutoff = now - 1 * 60 * 60 * 1000;
    else if (timeRange === '6h') cutoff = now - 6 * 60 * 60 * 1000;
    else if (timeRange === '24h') cutoff = now - 24 * 60 * 60 * 1000;

    if (cutoff > 0) {
      return nodeReadings.filter(r => new Date(r.timestamp).getTime() >= cutoff);
    }

    // Default limit last 100
    return nodeReadings.slice(-100);
  }

  getRiskHistory(limit = 50) {
    const sliced = this.sensorReadings.slice(-limit);
    return sliced.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      node_id: r.node_id,
      risk_level: r.risk_level,
      confidence: r.confidence,
      tilt: r.tilt,
      vibration: r.vibration,
      temperature: r.temperature,
      humidity: r.humidity,
      is_demo: r.is_demo
    }));
  }

  saveContactMessage(name, email, message) {
    const msgId = this.nextMessageId++;
    this.contactMessages.push({
      id: msgId,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      name,
      email,
      message
    });
    return msgId;
  }

  setSystemSetting(key, value) {
    this.systemState.set(key, String(value));
  }

  getSystemSetting(key, defaultValue = null) {
    return this.systemState.has(key) ? this.systemState.get(key) : defaultValue;
  }
}

export const db = new MineDatabase();
