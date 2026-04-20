from flask import Flask, request, jsonify
import pandas as pd
from sklearn.ensemble import IsolationForest
import numpy as np

app = Flask(__name__)

# Initialize Isolation Forest
# We will fit it dynamically when data arrives
model = IsolationForest(n_estimators=100, contamination=0.1, random_state=42)

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.json
        if not data or not isinstance(data, list):
            return jsonify({"error": "Invalid input, expected list of metrics"}), 400
        
        if len(data) < 10:
            return jsonify({"status": "NORMAL", "reason": "Not enough data"}), 200

        # We assume data is sorted from oldest to newest (or we just use all of it)
        # Convert to DataFrame
        df = pd.DataFrame(data)
        
        if 'cpu' not in df.columns or 'memory' not in df.columns:
            return jsonify({"error": "Data must contain 'cpu' and 'memory'"}), 400

        # Extract features
        X = df[['cpu', 'memory']].astype(float)
        
        # Fit model on the historical data
        model.fit(X)
        
        # Predict on the most recent data point (last element in array)
        latest_point = X.iloc[[-1]]
        prediction = model.predict(latest_point)
        
        # -1 means anomaly, 1 means normal
        if prediction[0] == -1:
            return jsonify({"status": "ANOMALY"})
        else:
            return jsonify({"status": "NORMAL"})
            
    except Exception as e:
        print(f"Error predicting: {str(e)}", flush=True)
        return jsonify({"error": "Internal server error"}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
