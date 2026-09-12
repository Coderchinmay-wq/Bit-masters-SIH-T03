import sqlite3
import os
import json
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), 'mine_monitoring.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Sensor readings table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sensor_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            node_id TEXT NOT NULL,
            tilt REAL,
            accel_x REAL DEFAULT 0.0,
            accel_y REAL DEFAULT 0.0,
            accel_z REAL DEFAULT 0.0,
            gyro_x REAL DEFAULT 0.0,
            gyro_y REAL DEFAULT 0.0,
            gyro_z REAL DEFAULT 0.0,
            vibration REAL,
            temperature REAL,
            humidity REAL,
            risk_level TEXT,
            confidence REAL,
            is_demo INTEGER DEFAULT 0
        )
    ''')

    # Contact form messages table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contact_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            message TEXT NOT NULL
        )
    ''')

    # System key-value state table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS system_state (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ''')

    # Initialize default state keys if missing
    cursor.execute('INSERT OR IGNORE INTO system_state (key, value) VALUES (?, ?)', ('demo_mode', '0'))
    cursor.execute('INSERT OR IGNORE INTO system_state (key, value) VALUES (?, ?)', ('demo_scenario', 'NORMAL'))

    conn.commit()
    conn.close()
    print("[Database] SQLite database initialized at", DB_PATH)

def insert_sensor_reading(data):
    """
    Inserts a new sensor reading into SQLite DB.
    """
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO sensor_readings (
            node_id, tilt, accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z,
            vibration, temperature, humidity, risk_level, confidence, is_demo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data.get('node_id', 'NODE_01'),
        float(data.get('tilt', 0.0)),
        float(data.get('accel_x', 0.0)),
        float(data.get('accel_y', 0.0)),
        float(data.get('accel_z', 0.0)),
        float(data.get('gyro_x', 0.0)),
        float(data.get('gyro_y', 0.0)),
        float(data.get('gyro_z', 0.0)),
        float(data.get('vibration', 0.0)),
        float(data.get('temperature', 0.0)),
        float(data.get('humidity', 0.0)),
        data.get('risk_level', 'LOW'),
        float(data.get('confidence', 0.0)),
        1 if data.get('is_demo') else 0
    ))

    inserted_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return inserted_id

def get_latest_readings_all_nodes():
    """
    Fetches the latest reading for each active node.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT r.* FROM sensor_readings r
        INNER JOIN (
            SELECT node_id, MAX(id) as max_id
            FROM sensor_readings
            GROUP BY node_id
        ) latest ON r.id = latest.max_id
        ORDER BY r.node_id ASC
    ''')
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_node_latest_reading(node_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT * FROM sensor_readings
        WHERE node_id = ?
        ORDER BY id DESC LIMIT 1
    ''', (node_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_sensor_history(node_id='NODE_01', time_range='1h'):
    """
    Fetches historical readings for a specific node filtered by time window.
    time_range: '1h', '6h', '24h', or 'all'
    """
    conn = get_db()
    cursor = conn.cursor()

    time_filters = {
        '1h': "-1 hours",
        '6h': "-6 hours",
        '24h': "-24 hours"
    }

    if time_range in time_filters:
        query = '''
            SELECT * FROM sensor_readings
            WHERE node_id = ? AND timestamp >= datetime('now', ?)
            ORDER BY timestamp ASC
        '''
        cursor.execute(query, (node_id, time_filters[time_range]))
    else:
        query = '''
            SELECT * FROM sensor_readings
            WHERE node_id = ?
            ORDER BY timestamp DESC LIMIT 100
        '''
        cursor.execute(query, (node_id,))
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in reversed(rows)]

    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_risk_history(limit=50):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, timestamp, node_id, risk_level, confidence, tilt, vibration, temperature, humidity, is_demo
        FROM sensor_readings
        ORDER BY id DESC LIMIT ?
    ''', (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in reversed(rows)]

def save_contact_message(name, email, message):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO contact_messages (name, email, message)
        VALUES (?, ?, ?)
    ''', (name, email, message))
    msg_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return msg_id

def set_system_setting(key, value):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO system_state (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value
    ''', (key, str(value)))
    conn.commit()
    conn.close()

def get_system_setting(key, default=None):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT value FROM system_state WHERE key = ?', (key,))
    row = cursor.fetchone()
    conn.close()
    return row['value'] if row else default
