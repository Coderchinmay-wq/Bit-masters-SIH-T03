import time
import random
import threading
from database import insert_sensor_reading, get_system_setting
from ml.predictor import predictor

class DemoSimulator(threading.Thread):
    def __init__(self, sse_broadcast_func=None):
        super().__init__()
        self.daemon = True
        self.sse_broadcast = sse_broadcast_func
        self.running = True
        self.interval = 3.0 # seconds between readings
        self.nodes = ['NODE_01', 'NODE_02', 'NODE_03']
        # Node specific variance offsets
        self.node_offsets = {
            'NODE_01': {'tilt': 0.0, 'vib': 0, 'temp': 0.0, 'hum': 0.0},
            'NODE_02': {'tilt': 0.5, 'vib': 4, 'temp': 0.8, 'hum': 2.0},
            'NODE_03': {'tilt': 1.2, 'vib': 8, 'temp': 1.5, 'hum': 4.0}
        }
        self.vibration_events = {'NODE_01': 12, 'NODE_02': 28, 'NODE_03': 45}

    def run(self):
        print("[Demo Simulator] Background simulator started.")
        while self.running:
            try:
                demo_mode = get_system_setting('demo_mode', '0')
                if demo_mode == '1':
                    scenario = get_system_setting('demo_scenario', 'NORMAL')
                    
                    # Pick a node sequentially
                    for node_id in self.nodes:
                        offset = self.node_offsets[node_id]
                        reading = self.generate_reading(node_id, scenario, offset)
                        
                        # Run through ML Predictor pipeline
                        ml_res = predictor.predict(
                            tilt=reading['tilt'],
                            vibration=reading['vibration'],
                            temperature=reading['temperature'],
                            humidity=reading['humidity']
                        )

                        reading['risk_level'] = ml_res['risk']
                        reading['confidence'] = ml_res['confidence_pct']
                        reading['is_demo'] = 1

                        # Save to Database
                        reading_id = insert_sensor_reading(reading)
                        reading['id'] = reading_id
                        reading['timestamp'] = time.strftime('%Y-%m-%d %H:%M:%S')

                        # Broadcast real-time SSE update if handler connected
                        if self.sse_broadcast:
                            self.sse_broadcast(reading, ml_res)

                        time.sleep(1.0) # stagger node updates
                        
                time.sleep(self.interval)
            except Exception as e:
                print(f"[Demo Simulator] Error in loop: {e}")
                time.sleep(5.0)

    def generate_reading(self, node_id, scenario, offset):
        if scenario == 'NORMAL':
            tilt = round(random.uniform(1.1, 3.2) + offset['tilt'], 2)
            vib = max(0, int(random.uniform(4, 18) + offset['vib']))
            temp = round(random.uniform(24.5, 29.5) + offset['temp'], 1)
            hum = round(random.uniform(45.0, 58.0) + offset['hum'], 1)
        elif scenario == 'WARNING':
            tilt = round(random.uniform(4.5, 7.8) + offset['tilt'], 2)
            vib = max(0, int(random.uniform(32, 58) + offset['vib']))
            temp = round(random.uniform(30.0, 34.5) + offset['temp'], 1)
            hum = round(random.uniform(62.0, 76.0) + offset['hum'], 1)
        else: # DANGER
            tilt = round(random.uniform(8.8, 17.5) + offset['tilt'], 2)
            vib = max(0, int(random.uniform(72, 135) + offset['vib']))
            temp = round(random.uniform(35.0, 42.5) + offset['temp'], 1)
            hum = round(random.uniform(78.0, 92.0) + offset['hum'], 1)

        self.vibration_events[node_id] += (1 if vib > 25 else 0)

        # MPU6050 Accelerometer & Gyroscope calculations derived from tilt angle
        tilt_rad = tilt * 3.14159 / 180.0
        accel_x = round(9.81 * round(random.uniform(0.01, 0.15), 2), 2)
        accel_y = round(9.81 * round(random.uniform(0.01, 0.20), 2), 2)
        accel_z = round(9.81 * round(0.95 + random.uniform(-0.05, 0.05), 2), 2)
        
        gyro_x = round(random.uniform(-1.5, 1.5), 2)
        gyro_y = round(random.uniform(-1.5, 1.5), 2)
        gyro_z = round(random.uniform(-0.8, 0.8), 2)

        return {
            'node_id': node_id,
            'tilt': tilt,
            'accel_x': accel_x,
            'accel_y': accel_y,
            'accel_z': accel_z,
            'gyro_x': gyro_x,
            'gyro_y': gyro_y,
            'gyro_z': gyro_z,
            'vibration': vib,
            'vibration_events': self.vibration_events[node_id],
            'temperature': temp,
            'humidity': hum
        }

    def stop(self):
        self.running = False
