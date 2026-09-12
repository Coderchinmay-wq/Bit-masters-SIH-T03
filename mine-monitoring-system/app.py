import time
import json
import queue
from datetime import datetime, timezone
from flask import Flask, render_template, request, jsonify, Response, stream_with_context

from database import (
    init_db, insert_sensor_reading, get_latest_readings_all_nodes,
    get_node_latest_reading, get_sensor_history, get_risk_history,
    save_contact_message, set_system_setting, get_system_setting
)
from ml.predictor import predictor
from demo_simulator import DemoSimulator

app = Flask(__name__)

# Queue for real-time Server-Sent Events (SSE)
sse_queues = []

def broadcast_sse(reading, ml_result):
    payload = {
        'reading': reading,
        'ml': ml_result,
        'timestamp': datetime.now().isoformat()
    }
    data_str = f"data: {json.dumps(payload)}\n\n"
    
    # Send to active clients
    dead_queues = []
    for q in sse_queues:
        try:
            q.put_nowait(data_str)
        except Exception:
            dead_queues.append(q)
            
    for q in dead_queues:
        if q in sse_queues:
            sse_queues.remove(q)

# Initialize background demo simulator
demo_thread = DemoSimulator(sse_broadcast_func=broadcast_sse)
demo_thread.start()

@app.route('/')
def index():
    return render_template('index.html')

# ==========================================
# 1. ESP32 SENSOR DATA INGESTION API
# ==========================================
@app.route('/api/sensor-data', methods=['POST'])
def receive_sensor_data():
    """
    HTTP POST API for ESP32 receiver node telemetry.
    Expected JSON:
    {
      "node_id": "NODE_01",
      "tilt": 7.4,
      "accel_x": 0.12, "accel_y": 0.45, "accel_z": 9.72,
      "gyro_x": 1.2, "gyro_y": 0.8, "gyro_z": 0.4,
      "vibration": 42,
      "temperature": 29.5,
      "humidity": 64
    }
    """
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({'success': False, 'error': 'Invalid or missing JSON payload'}), 400

        node_id = str(data.get('node_id', 'NODE_01')).strip().upper()
        tilt = float(data.get('tilt', 0.0))
        vibration = float(data.get('vibration', 0.0))
        temperature = float(data.get('temperature', 0.0))
        humidity = float(data.get('humidity', 0.0))

        # Optional MPU6050 values
        accel_x = float(data.get('accel_x', 0.0))
        accel_y = float(data.get('accel_y', 0.0))
        accel_z = float(data.get('accel_z', 0.0))
        gyro_x = float(data.get('gyro_x', 0.0))
        gyro_y = float(data.get('gyro_y', 0.0))
        gyro_z = float(data.get('gyro_z', 0.0))

        # Execute ML Risk Prediction
        ml_res = predictor.predict(
            tilt=tilt,
            vibration=vibration,
            temperature=temperature,
            humidity=humidity
        )

        reading_payload = {
            'node_id': node_id,
            'tilt': tilt,
            'accel_x': accel_x,
            'accel_y': accel_y,
            'accel_z': accel_z,
            'gyro_x': gyro_x,
            'gyro_y': gyro_y,
            'gyro_z': gyro_z,
            'vibration': vibration,
            'temperature': temperature,
            'humidity': humidity,
            'risk_level': ml_res['risk'],
            'confidence': ml_res['confidence_pct'],
            'is_demo': 0
        }

        # Store reading in database
        reading_id = insert_sensor_reading(reading_payload)
        reading_payload['id'] = reading_id
        reading_payload['timestamp'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        # Record last live ESP32 contact timestamp
        set_system_setting('last_esp32_contact', str(time.time()))
        set_system_setting(f'last_node_contact_{node_id}', str(time.time()))

        # Broadcast update to web frontend dashboards via SSE
        broadcast_sse(reading_payload, ml_res)

        return jsonify({
            'success': True,
            'message': 'Sensor data recorded',
            'node_id': node_id,
            'risk': ml_res['risk'],
            'confidence': ml_res['confidence'],
            'confidence_pct': ml_res['confidence_pct'],
            'timestamp': reading_payload['timestamp']
        }), 200

    except ValueError as ve:
        return jsonify({'success': False, 'error': f'Invalid data format: {str(ve)}'}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': f'Server error processing reading: {str(e)}'}), 500

# ==========================================
# 2. SYSTEM STATUS & HEARTBEAT API
# ==========================================
@app.route('/api/status', methods=['GET'])
def get_system_status():
    """
    Returns actual live system health, connection states, and node summaries.
    """
    demo_mode = get_system_setting('demo_mode', '0') == '1'
    demo_scenario = get_system_setting('demo_scenario', 'NORMAL')
    last_contact_str = get_system_setting('last_esp32_contact', None)

    is_online = False
    last_contact_seconds_ago = None

    if last_contact_str:
        try:
            elapsed = time.time() - float(last_contact_str)
            last_contact_seconds_ago = round(elapsed, 1)
            # ESP32 considered online if data received within 15 seconds
            if elapsed <= 15.0:
                is_online = True
        except Exception:
            pass

    # Fetch latest node readings
    latest_nodes = get_latest_readings_all_nodes()

    # Determine system status
    status_data = {
        'esp32_status': 'ONLINE' if (is_online or demo_mode) else 'OFFLINE',
        'is_live_hardware': is_online and not demo_mode,
        'last_contact_seconds_ago': last_contact_seconds_ago,
        'database_status': 'CONNECTED',
        'ml_status': predictor.model_data.get('status', 'READY') if predictor.model else 'ML prediction unavailable',
        'demo_mode': demo_mode,
        'demo_scenario': demo_scenario,
        'nodes': latest_nodes
    }
    return jsonify(status_data)

# ==========================================
# 3. SENSOR & RISK HISTORY APIS
# ==========================================
@app.route('/api/history', methods=['GET'])
def get_history():
    node_id = request.args.get('node_id', 'NODE_01').upper()
    time_range = request.args.get('range', '1h')
    readings = get_sensor_history(node_id, time_range)
    return jsonify({'node_id': node_id, 'range': time_range, 'readings': readings})

@app.route('/api/latest', methods=['GET'])
def get_latest():
    node_id = request.args.get('node_id', None)
    if node_id:
        reading = get_node_latest_reading(node_id.upper())
        return jsonify({'node_id': node_id, 'reading': reading})
    else:
        readings = get_latest_readings_all_nodes()
        return jsonify({'nodes': readings})

@app.route('/api/risk-history', methods=['GET'])
def get_risk_hist():
    limit = int(request.args.get('limit', 50))
    history = get_risk_history(limit)
    return jsonify({'history': history})

# ==========================================
# 4. DEMO MODE TOGGLE API
# ==========================================
@app.route('/api/demo/mode', methods=['POST'])
def toggle_demo_mode():
    data = request.get_json(force=True, silent=True) or {}
    enabled = '1' if data.get('enabled', True) else '0'
    scenario = data.get('scenario', 'NORMAL').upper()
    
    if scenario not in ['NORMAL', 'WARNING', 'DANGER']:
        scenario = 'NORMAL'

    set_system_setting('demo_mode', enabled)
    set_system_setting('demo_scenario', scenario)

    return jsonify({
        'success': True,
        'demo_mode': enabled == '1',
        'scenario': scenario,
        'message': f"Demo mode set to {'ENABLED (' + scenario + ')' if enabled == '1' else 'DISABLED (LIVE MODE)'}"
    })

# ==========================================
# 5. CONTACT FORM API
# ==========================================
@app.route('/api/contact', methods=['POST'])
def handle_contact():
    data = request.get_json(force=True, silent=True) or {}
    name = str(data.get('name', '')).strip()
    email = str(data.get('email', '')).strip()
    message = str(data.get('message', '')).strip()

    if not name or not email or not message:
        return jsonify({'success': False, 'error': 'Name, email, and message are required.'}), 400

    msg_id = save_contact_message(name, email, message)
    return jsonify({
        'success': True,
        'message_id': msg_id,
        'info': 'Thank you! Your message has been saved to the database.'
    })

# ==========================================
# 6. REAL-TIME SERVER-SENT EVENTS (SSE)
# ==========================================
@app.route('/api/stream')
def sse_stream():
    def event_stream():
        q = queue.Queue()
        sse_queues.append(q)
        try:
            # Send initial ping event
            yield "data: {\"type\": \"connected\"}\n\n"
            while True:
                data = q.get()
                yield data
        except GeneratorExit:
            if q in sse_queues:
                sse_queues.remove(q)

    return Response(stream_with_context(event_stream()), mimetype='text/event-stream')

if __name__ == '__main__':
    init_db()
    # Pre-train/load ML model
    predictor.load_model()
    print("\n" + "="*60)
    print(" AI-ENABLED MINE MONITORING & RISK DETECTION SYSTEM RUNNING")
    print(" Local Dashboard URL: http://127.0.0.1:5000")
    print(" ESP32 Ingestion API: http://127.0.0.1:5000/api/sensor-data")
    print("="*60 + "\n")
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)
