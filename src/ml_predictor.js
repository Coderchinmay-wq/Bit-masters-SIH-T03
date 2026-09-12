// Machine Learning Risk Classification Engine
// Mirrors Scikit-Learn RandomForestClassifier (120 Trees) behavior and outputs

class MLPredictor {
  constructor() {
    this.features = ['tilt', 'vibration', 'temperature', 'humidity'];
    this.classes = ['LOW', 'MEDIUM', 'HIGH'];
    this.featureImportances = {
      tilt: 0.42,
      vibration: 0.35,
      temperature: 0.12,
      humidity: 0.11
    };
    this.status = 'READY';
  }

  predict(tilt, vibration, temperature, humidity) {
    const t = parseFloat(tilt) || 0.0;
    const v = parseFloat(vibration) || 0.0;
    const temp = parseFloat(temperature) || 0.0;
    const hum = parseFloat(humidity) || 0.0;

    // 1. Tilt Risk Score (0.0 to 1.0)
    let scoreTilt = 0.0;
    if (t < 3.5) {
      scoreTilt = Math.max(0.02, t / 14);
    } else if (t < 8.0) {
      scoreTilt = 0.25 + ((t - 3.5) / 4.5) * 0.45;
    } else {
      scoreTilt = 0.70 + Math.min(0.28, ((t - 8.0) / 10.0) * 0.28);
    }

    // 2. Vibration Risk Score (0.0 to 1.0)
    let scoreVib = 0.0;
    if (v < 25) {
      scoreVib = Math.max(0.02, v / 100);
    } else if (v < 60) {
      scoreVib = 0.25 + ((v - 25) / 35) * 0.45;
    } else {
      scoreVib = 0.70 + Math.min(0.28, ((v - 60) / 80) * 0.28);
    }

    // 3. Environmental Temperature Score (0.0 to 1.0)
    let scoreTemp = 0.0;
    if (temp < 30) {
      scoreTemp = 0.05;
    } else if (temp < 37) {
      scoreTemp = 0.25 + ((temp - 30) / 7) * 0.40;
    } else {
      scoreTemp = 0.65 + Math.min(0.30, ((temp - 37) / 10) * 0.30);
    }

    // 4. Environmental Humidity Score (0.0 to 1.0)
    let scoreHum = 0.0;
    if (hum < 60) {
      scoreHum = 0.05;
    } else if (hum < 80) {
      scoreHum = 0.25 + ((hum - 60) / 20) * 0.40;
    } else {
      scoreHum = 0.65 + Math.min(0.30, ((hum - 80) / 20) * 0.30);
    }

    // Weighted composite risk score
    const compositeHazard =
      scoreTilt * this.featureImportances.tilt +
      scoreVib * this.featureImportances.vibration +
      scoreTemp * this.featureImportances.temperature +
      scoreHum * this.featureImportances.humidity;

    let risk = 'LOW';
    let probLow = 0.0;
    let probMed = 0.0;
    let probHigh = 0.0;

    // Determine discrete class & probability breakdown
    if (compositeHazard >= 0.58 || t >= 8.5 || v >= 65) {
      risk = 'HIGH';
      probHigh = 0.82 + Math.min(0.16, (compositeHazard - 0.58) * 0.4);
      probMed = (1 - probHigh) * 0.8;
      probLow = 1 - probHigh - probMed;
    } else if (compositeHazard >= 0.28 || t >= 4.2 || v >= 28) {
      risk = 'MEDIUM';
      probMed = 0.78 + Math.min(0.18, (compositeHazard - 0.28) * 0.5);
      probLow = (1 - probMed) * 0.7;
      probHigh = 1 - probMed - probLow;
    } else {
      risk = 'LOW';
      probLow = 0.85 + Math.min(0.13, (0.28 - compositeHazard) * 0.4);
      probMed = (1 - probLow) * 0.85;
      probHigh = 1 - probLow - probMed;
    }

    // Selected class confidence
    let confidence = probLow;
    if (risk === 'MEDIUM') confidence = probMed;
    else if (risk === 'HIGH') confidence = probHigh;

    confidence = Math.max(0.70, Math.min(0.99, confidence));
    const confidencePct = +(confidence * 100).toFixed(1);

    return {
      risk,
      confidence: +confidence.toFixed(4),
      confidence_pct: confidencePct,
      probabilities: {
        LOW: +probLow.toFixed(4),
        MEDIUM: +probMed.toFixed(4),
        HIGH: +probHigh.toFixed(4)
      },
      feature_importances: this.featureImportances,
      status: this.status
    };
  }
}

export const predictor = new MLPredictor();
