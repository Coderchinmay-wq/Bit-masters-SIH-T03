// Demo Simulator Background Generator
// Replicates demo_simulator.py to provide live telemetry simulation and SSE broadcasts

import { db } from './database.js';
import { predictor } from './ml_predictor.js';

export class DemoSimulator {
  constructor(sseBroadcastFunc) {
    this.sseBroadcast = sseBroadcastFunc || (() => {});
    this.intervalId = null;
    this.step = 0;
    this.nodes = ['NODE_01', 'NODE_02', 'NODE_03'];
    this.nodeIndex = 0;

    this.nodeOffsets = {
      NODE_01: { tilt: 0.0, vib: 0, temp: 0.0, hum: 0.0 },
      NODE_02: { tilt: 0.5, vib: 4, temp: 0.8, hum: 2.0 },
      NODE_03: { tilt: 1.2, vib: 8, temp: 1.5, hum: 4.0 }
    };
  }

  start(intervalMs = 3000) {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.tick();
    }, intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  tick() {
    const demoMode = db.getSystemSetting('demo_mode', '0');
    if (demoMode !== '1') {
      return;
    }

    const scenario = db.getSystemSetting('demo_scenario', 'NORMAL');
    const nodeId = this.nodes[this.nodeIndex % this.nodes.length];
    this.nodeIndex++;
    this.step++;

    const offset = this.nodeOffsets[nodeId] || { tilt: 0, vib: 0, temp: 0, hum: 0 };
    const jitter = (Math.random() - 0.5) * 0.4;

    let baseTilt = 1.8;
    let baseVib = 10;
    let baseTemp = 26.5;
    let baseHum = 52.0;

    if (scenario === 'WARNING') {
      baseTilt = 5.8;
      baseVib = 38;
      baseTemp = 32.5;
      baseHum = 68.0;
    } else if (scenario === 'DANGER') {
      baseTilt = 9.8;
      baseVib = 72;
      baseTemp = 38.5;
      baseHum = 82.0;
    }

    const tilt = Math.max(0.1, +(baseTilt + offset.tilt + jitter).toFixed(1));
    const vibration = Math.max(1, Math.round(baseVib + offset.vib + (Math.random() - 0.5) * 6));
    const temperature = Math.max(15, +(baseTemp + offset.temp + jitter * 0.5).toFixed(1));
    const humidity = Math.max(20, Math.min(99, Math.round(baseHum + offset.hum + (Math.random() - 0.5) * 4)));

    // Derive 3-axis accelerometer and gyro values
    const tiltRad = (tilt * Math.PI) / 180.0;
    const accelX = +(Math.sin(tiltRad) * 9.8 + (Math.random() - 0.5) * 0.08).toFixed(2);
    const accelY = +((Math.random() - 0.5) * 0.12).toFixed(2);
    const accelZ = +(Math.cos(tiltRad) * 9.8 + (Math.random() - 0.5) * 0.08).toFixed(2);
    const gyroX = +((Math.random() - 0.5) * 0.25).toFixed(2);
    const gyroY = +((Math.random() - 0.5) * 0.25).toFixed(2);
    const gyroZ = +((Math.random() - 0.5) * 0.10).toFixed(2);

    const ml = predictor.predict(tilt, vibration, temperature, humidity);

    const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const readingData = {
      timestamp: nowIso,
      node_id: nodeId,
      tilt,
      accel_x: accelX,
      accel_y: accelY,
      accel_z: accelZ,
      gyro_x: gyroX,
      gyro_y: gyroY,
      gyro_z: gyroZ,
      vibration,
      vibration_events: vibration > 60 ? 32 : vibration > 25 ? 12 : 3,
      temperature,
      humidity,
      risk_level: ml.risk,
      confidence: ml.confidence_pct,
      is_demo: 1
    };

    const readingId = db.insertSensorReading(readingData);
    readingData.id = readingId;

    const nowSeconds = String(Date.now() / 1000);
    db.setSystemSetting('last_esp32_contact', nowSeconds);
    db.setSystemSetting(`last_node_contact_${nodeId}`, nowSeconds);

    this.sseBroadcast({
      reading: readingData,
      ml,
      timestamp: nowIso
    });
  }
}
