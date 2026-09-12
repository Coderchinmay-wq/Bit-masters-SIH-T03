import os
import joblib
import pandas as pd
import numpy as np

class MLPredictor:
    def __init__(self):
        self.ml_dir = os.path.dirname(__file__)
        self.model_path = os.path.join(self.ml_dir, 'model.joblib')
        self.model_data = None
        self.model = None
        self.features = ['tilt', 'vibration', 'temperature', 'humidity']
        self.classes = ['LOW', 'MEDIUM', 'HIGH']
        self.load_model()

    def load_model(self):
        if not os.path.exists(self.model_path):
            print(f"[ML Predictor] Model file not found at {self.model_path}. Attempting to train...")
            try:
                from .train_model import train_and_save_model
                train_and_save_model()
            except Exception as e:
                print(f"[ML Predictor] Failed auto-training model: {e}")
                return False

        try:
            self.model_data = joblib.load(self.model_path)
            self.model = self.model_data['model']
            self.features = self.model_data.get('features', self.features)
            self.classes = self.model_data.get('classes', self.classes)
            print("[ML Predictor] Model loaded successfully.")
            return True
        except Exception as e:
            print(f"[ML Predictor] Error loading model: {e}")
            self.model = None
            return False

    def predict(self, tilt, vibration, temperature, humidity):
        """
        Executes prediction on real-time or simulated sensor inputs.
        """
        if self.model is None:
            # Fallback rule-based estimation if ML model fails to load
            return self._fallback_prediction(tilt, vibration, temperature, humidity)

        try:
            input_df = pd.DataFrame([{
                'tilt': float(tilt),
                'vibration': float(vibration),
                'temperature': float(temperature),
                'humidity': float(humidity)
            }])[self.features]

            # Get predicted class and class probabilities
            prediction = self.model.predict(input_df)[0]
            probabilities = self.model.predict_proba(input_df)[0]

            # Index of predicted class
            class_idx = list(self.model.classes_).index(prediction)
            confidence = float(probabilities[class_idx])

            # Get feature importances
            importances = self.model_data.get('feature_importances', {})

            return {
                'risk': str(prediction),
                'confidence': round(confidence, 4),
                'confidence_pct': round(confidence * 100, 1),
                'probabilities': {
                    cls: round(float(prob), 4)
                    for cls, prob in zip(self.model.classes_, probabilities)
                },
                'feature_importances': importances,
                'status': 'READY'
            }
        except Exception as e:
            print(f"[ML Predictor] Prediction error: {e}")
            return self._fallback_prediction(tilt, vibration, temperature, humidity)

    def _fallback_prediction(self, tilt, vibration, temperature, humidity):
        """
        Safety fallback prediction if ML model is temporarily unavailable.
        """
        tilt_v = float(tilt)
        vib_v = float(vibration)
        
        if tilt_v >= 8.0 or vib_v >= 65:
            risk = 'HIGH'
            conf = 0.80
        elif tilt_v >= 4.0 or vib_v >= 30:
            risk = 'MEDIUM'
            conf = 0.75
        else:
            risk = 'LOW'
            conf = 0.85

        return {
            'risk': risk,
            'confidence': conf,
            'confidence_pct': round(conf * 100, 1),
            'probabilities': {'LOW': 0.33, 'MEDIUM': 0.33, 'HIGH': 0.34},
            'feature_importances': {'tilt': 0.25, 'vibration': 0.25, 'temperature': 0.25, 'humidity': 0.25},
            'status': 'ML prediction unavailable (Fallback mode active)'
        }

# Singleton instance
predictor = MLPredictor()
