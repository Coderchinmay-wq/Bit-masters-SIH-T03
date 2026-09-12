import os
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix
import joblib

def train_and_save_model():
    ml_dir = os.path.dirname(__file__)
    dataset_path = os.path.join(ml_dir, 'synthetic_mine_data.csv')
    model_path = os.path.join(ml_dir, 'model.joblib')

    # Ensure dataset exists
    if not os.path.exists(dataset_path):
        from generate_dataset import generate_synthetic_dataset
        generate_synthetic_dataset(dataset_path)

    print(f"[ML Trainer] Loading dataset from {dataset_path}...")
    df = pd.read_csv(dataset_path)

    features = ['tilt', 'vibration', 'temperature', 'humidity']
    target = 'risk'

    X = df[features]
    y = df[target]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )

    print("[ML Trainer] Training RandomForestClassifier model...")
    clf = RandomForestClassifier(
        n_estimators=120,
        max_depth=12,
        min_samples_split=4,
        random_state=42
    )
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    print(f"[ML Trainer] Model Accuracy: {accuracy * 100:.2f}%")
    print("\nClassification Report:\n", classification_report(y_test, y_pred))

    # Package model payload with feature metadata
    payload = {
        'model': clf,
        'features': features,
        'classes': clf.classes_.tolist(),
        'accuracy': float(accuracy),
        'feature_importances': dict(zip(features, clf.feature_importances_.tolist()))
    }

    joblib.dump(payload, model_path)
    print(f"[ML Trainer] Model successfully trained & saved to {model_path}")
    return payload

if __name__ == '__main__':
    train_and_save_model()
