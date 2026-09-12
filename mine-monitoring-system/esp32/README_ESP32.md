# ESP32 Receiver Connection & Hardware Setup Guide

This guide explains how to connect your ESP32 hardware receiver/gateway node to the **AI-Enabled Mine Monitoring and Risk Detection System**.

---

## 1. Hardware Pinout & Wiring Diagram

### MPU6050 Accelerometer / Gyroscope (I2C)
| MPU6050 Pin | ESP32 Pin | Description |
| :--- | :--- | :--- |
| **VCC** | 3.3V / 5V | Power Supply |
| **GND** | GND | Ground |
| **SDA** | GPIO 21 | I2C Data |
| **SCL** | GPIO 22 | I2C Clock |

### Vibration Sensor (SW-420 or Piezo Sensor Module)
| Sensor Pin | ESP32 Pin | Description |
| :--- | :--- | :--- |
| **VCC** | 3.3V | Power Supply |
| **GND** | GND | Ground |
| **DO / AO** | GPIO 34 | Digital/Analog Vibration Input |

### DHT Temperature & Humidity Sensor (DHT11 or DHT22)
| Sensor Pin | ESP32 Pin | Description |
| :--- | :--- | :--- |
| **VCC** | 3.3V / 5V | Power Supply |
| **GND** | GND | Ground |
| **DATA** | GPIO 4 | OneWire Signal Pin (with 10k resistor to VCC if needed) |

---

## 2. Software Requirements (Arduino IDE)

1. Open **Arduino IDE**.
2. Go to **Tools -> Board -> ESP32 Arduino** and select **ESP32 Dev Module**.
3. Install required libraries from **Sketch -> Include Library -> Manage Libraries**:
   - `ArduinoJson` (by Benoit Blanchon)
   - `Adafruit MPU6050` (or standard `Wire.h`)
   - `DHT sensor library` (by Adafruit)

---

## 3. Web Server Address Configuration

In `mine_monitoring_receiver.ino`, update:

```cpp
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL    = "http://<YOUR_LOCAL_IP_OR_REPLIT_HOST>:5000/api/sensor-data";
```

---

## 4. Testing Without Hardware

You can also test the web API endpoint using `curl` or PowerShell:

```bash
curl -X POST http://localhost:5000/api/sensor-data ^
  -H "Content-Type: application/json" ^
  -d "{\"node_id\": \"NODE_01\", \"tilt\": 5.2, \"vibration\": 30, \"temperature\": 29.5, \"humidity\": 65}"
```

Expected Response:
```json
{
  "confidence": 0.84,
  "confidence_pct": 84.0,
  "message": "Sensor data recorded",
  "node_id": "NODE_01",
  "risk": "MEDIUM",
  "success": true,
  "timestamp": "2026-09-12 09:15:00"
}
```
