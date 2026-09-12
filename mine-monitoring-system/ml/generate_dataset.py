import os
import csv
import random

def generate_synthetic_dataset(output_path, num_samples=2000):
    """
    Generates a synthetic mine monitoring dataset containing sensor readings:
    - tilt (°): angle from MPU6050
    - vibration: vibration sensor event intensity/count
    - temperature (°C): ambient temperature from DHT sensor
    - humidity (%): ambient relative humidity from DHT sensor
    - risk: LOW, MEDIUM, HIGH (target risk level)

    NOTE: This is synthetic data created for demonstration and educational testing
    of the AI-Enabled Mine Monitoring System.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    fieldnames = ['tilt', 'vibration', 'temperature', 'humidity', 'risk']
    rows = []
    
    # 1. Generate LOW RISK samples (~45%)
    low_count = int(num_samples * 0.45)
    for _ in range(low_count):
        tilt = round(max(0.1, random.uniform(0.5, 4.0) + random.gauss(0, 0.3)), 2)
        vibration = max(0, int(random.uniform(2, 22) + random.gauss(0, 3)))
        temp = round(random.uniform(20.0, 31.5) + random.gauss(0, 1.0), 1)
        humidity = round(random.uniform(35.0, 62.0) + random.gauss(0, 2.0), 1)
        rows.append({
            'tilt': tilt,
            'vibration': vibration,
            'temperature': temp,
            'humidity': humidity,
            'risk': 'LOW'
        })

    # 2. Generate MEDIUM RISK samples (~35%)
    med_count = int(num_samples * 0.35)
    for _ in range(med_count):
        pattern = random.choice(['tilt_warn', 'vib_warn', 'env_warn', 'mixed_warn'])
        if pattern == 'tilt_warn':
            tilt = round(random.uniform(4.3, 8.5) + random.gauss(0, 0.4), 2)
            vibration = max(0, int(random.uniform(15, 45) + random.gauss(0, 5)))
            temp = round(random.uniform(25.0, 34.0), 1)
            humidity = round(random.uniform(50.0, 75.0), 1)
        elif pattern == 'vib_warn':
            tilt = round(random.uniform(2.0, 6.0), 2)
            vibration = max(0, int(random.uniform(35, 65) + random.gauss(0, 5)))
            temp = round(random.uniform(24.0, 33.0), 1)
            humidity = round(random.uniform(45.0, 70.0), 1)
        elif pattern == 'env_warn':
            tilt = round(random.uniform(3.0, 6.5), 2)
            vibration = max(0, int(random.uniform(20, 45)))
            temp = round(random.uniform(32.0, 39.0), 1)
            humidity = round(random.uniform(70.0, 85.0), 1)
        else:
            tilt = round(random.uniform(4.5, 7.5), 2)
            vibration = max(0, int(random.uniform(30, 55)))
            temp = round(random.uniform(29.0, 36.0), 1)
            humidity = round(random.uniform(62.0, 78.0), 1)
            
        rows.append({
            'tilt': tilt,
            'vibration': vibration,
            'temperature': temp,
            'humidity': humidity,
            'risk': 'MEDIUM'
        })

    # 3. Generate HIGH RISK samples (~20%)
    high_count = num_samples - low_count - med_count
    for _ in range(high_count):
        pattern = random.choice(['structural_danger', 'seismic_danger', 'extreme_danger'])
        if pattern == 'structural_danger':
            tilt = round(random.uniform(8.5, 22.0) + random.gauss(0, 0.8), 2)
            vibration = max(0, int(random.uniform(50, 110)))
            temp = round(random.uniform(30.0, 42.0), 1)
            humidity = round(random.uniform(65.0, 92.0), 1)
        elif pattern == 'seismic_danger':
            tilt = round(random.uniform(6.0, 16.0), 2)
            vibration = max(0, int(random.uniform(70, 140) + random.gauss(0, 10)))
            temp = round(random.uniform(28.0, 40.0), 1)
            humidity = round(random.uniform(60.0, 90.0), 1)
        else:
            tilt = round(random.uniform(10.0, 25.0), 2)
            vibration = max(0, int(random.uniform(80, 150)))
            temp = round(random.uniform(35.0, 45.0), 1)
            humidity = round(random.uniform(75.0, 95.0), 1)

        rows.append({
            'tilt': tilt,
            'vibration': vibration,
            'temperature': temp,
            'humidity': humidity,
            'risk': 'HIGH'
        })

    # Shuffle dataset
    random.shuffle(rows)

    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"[Dataset Generator] Successfully generated {len(rows)} clean samples at {output_path}")

if __name__ == '__main__':
    dataset_file = os.path.join(os.path.dirname(__file__), 'synthetic_mine_data.csv')
    generate_synthetic_dataset(dataset_file, 2000)
