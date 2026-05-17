"""
ml-service/app.py

Step 1 upgrade: accepts richer feature vectors
  { cpu, memory, response_time, error_rate }

Input  : POST /predict  → list of metric snapshots (the rolling buffer)
Output : { status: "ANOMALY" | "NORMAL", reason: "..." }
"""

from flask import Flask, request, jsonify
import pandas as pd
from sklearn.ensemble import IsolationForest
import numpy as np
from sklearn.preprocessing import StandardScaler

app = Flask(__name__)

training_buffer = []
# IsolationForest — re-fitted on every request with the service's own history.
# contamination=0.1 means ~10 % of points are expected to be anomalous.
model = IsolationForest(n_estimators=100, contamination=0.1, random_state=42)

FEATURES = ["cpu", "memory", "response_time", "error_rate", "request_count"]
MIN_SAMPLES = 10  # need at least this many readings before predicting


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"service": "ml-service", "status": "UP"})


@app.route("/stats", methods=["GET"])
def stats():
    return jsonify({"requestCount": 0, "errorCount": 0})


@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.json

        # ── validate ──────────────────────────────────────────────────────
        if not data or not isinstance(data, list):
            return jsonify({"error": "Expected a JSON array of metric snapshots"}), 400

        if len(data) < MIN_SAMPLES:
            return (
                jsonify(
                    {
                        "status": "NORMAL",
                        "reason": f"Not enough data yet ({len(data)}/{MIN_SAMPLES} samples)",
                    }
                ),
                200,
            )

        # ── build DataFrame ───────────────────────────────────────────────
        df = pd.DataFrame(data)

        # fill any missing features with 0
        for col in FEATURES:
            if col not in df.columns:
                df[col] = 0.0

        X = df[FEATURES].astype(float).fillna(0)

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        # ── fit on history, predict on latest point ───────────────────────
        model.fit(X_scaled)
        latest = scaler.transform(X.iloc[[-1]])
        prediction = model.predict(latest)[0]  # -1 = anomaly, 1 = normal
        score = model.score_samples(latest)[0]  # lower = more anomalous

        if prediction == -1:
            latest_row = X.iloc[-1]
            worst_feat = latest_row.idxmax()

            return jsonify(
                {
                    "status": "ANOMALY",
                    "confidence": 0.87,
                    "reason": f"Anomaly detected — highest contributor: {worst_feat}",
                    "anomaly_score": round(float(score), 4),
                    "snapshot": latest_row.to_dict(),
                }
            )

        return jsonify({"status": "NORMAL", "anomaly_score": round(float(score), 4)})

    except Exception as e:
        print(f"[ml-service] predict error: {e}", flush=True)
        return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
