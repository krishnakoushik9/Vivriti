
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier, IsolationForest
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report, roc_auc_score
import joblib
import os

# Paths
DATA_PATH = "/home/krsna/Desktop/IITH-vivriti/dataset/lending-club/accepted_2007_to_2018Q4.csv.gz"
MODEL_SAVE_PATH = "/home/krsna/Desktop/IITH-vivriti/ml-worker-python/models/rf_credit_model.pkl"
SCALER_SAVE_PATH = "/home/krsna/Desktop/IITH-vivriti/ml-worker-python/models/rf_scaler.pkl"

def train():
    print("Loading dataset...")
    # Use only necessary columns to save memory
    cols = [
        "loan_amnt", "annual_inc", "dti", "delinq_2yrs", 
        "revol_util", "int_rate", "installment", "grade", "loan_status"
    ]
    
    # Read in chunks or just read if memory allows. 375MB compressed might be ~2GB in memory.
    df = pd.read_csv(DATA_PATH, usecols=cols, compression="gzip")
    
    print(f"Dataset loaded. Initial shape: {df.shape}")
    
    # 2. Clean labels
    # Fully Paid -> 0 (Good), Charged Off -> 1 (Bad/Default)
    df = df[df["loan_status"].isin(["Fully Paid", "Charged Off"])]
    df["label"] = df["loan_status"].map({"Fully Paid": 0, "Charged Off": 1})
    
    print(f"Filtered for Paid/Charged Off. New shape: {df.shape}")
    
    # 3. Handle missing values
    df = df.dropna()
    print(f"Dropped NAs. New shape: {df.shape}")
    
    # 4. Encode Categoricals
    le = LabelEncoder()
    df["grade_encoded"] = le.fit_transform(df["grade"])
    # Save label encoder if needed, but for now we just use the numbers.
    # Grade: A=0, B=1, ... G=6
    
    # 5. Select Features
    features = [
        "loan_amnt", "annual_inc", "dti", "delinq_2yrs", 
        "revol_util", "int_rate", "installment", "grade_encoded"
    ]
    X = df[features]
    y = df["label"]
    
    # 6. Split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    print("Training RandomForest model...")
    # 7. Pipeline
    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("rf", RandomForestClassifier(
            n_estimators=100, 
            max_depth=10, 
            random_state=42, 
            n_jobs=-1,
            class_weight="balanced"
        ))
    ])
    
    pipeline.fit(X_train, y_train)
    
    # 8. Evaluate
    y_pred = pipeline.predict(X_test)
    y_prob = pipeline.predict_proba(X_test)[:, 1]
    
    auc = roc_auc_score(y_test, y_prob)
    print(f"ROC-AUC: {auc:.4f}")
    print(classification_report(y_test, y_pred))
    
    # 9. Isolation Forest for Anomaly Detection (using Fully Paid as 'normal')
    print("Training IsolationForest model...")
    iso_forest = IsolationForest(
        n_estimators=100,
        contamination=0.05,
        random_state=42
    )
    # Use same features
    X_normal = X[y == 0]
    iso_forest.fit(X_normal)
    
    ISO_MODEL_PATH = "/home/krsna/Desktop/IITH-vivriti/ml-worker-python/models/iso_forest_model.pkl"
    joblib.dump(iso_forest, ISO_MODEL_PATH)
    print(f"Isolation Forest saved to {ISO_MODEL_PATH}")
    
    # 10. Save artifacts
    os.makedirs(os.path.dirname(MODEL_SAVE_PATH), exist_ok=True)
    joblib.dump(pipeline, MODEL_SAVE_PATH)
    print(f"Model saved to {MODEL_SAVE_PATH}")
    
    # Save the feature list for reference in main.py
    with open("/home/krsna/Desktop/IITH-vivriti/ml-worker-python/models/features.txt", "w") as f:
        f.write(",".join(features))

if __name__ == "__main__":
    train()
