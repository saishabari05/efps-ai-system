# ml/train_model.py
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
import joblib

data = {
    "attendance":[90,85,70,65,60,55,80,75],
    "internal_avg":[18,16,12,10,9,8,15,14],
    "assignment":[9,8,7,6,5,4,8,7],
    "risk":[0,0,1,1,2,2,0,1]
}

df = pd.DataFrame(data)

X = df[["attendance","internal_avg","assignment"]]
y = df["risk"]

# Scale numeric features before logistic regression to improve optimizer convergence.
model = make_pipeline(
    StandardScaler(),
    LogisticRegression(max_iter=100, solver="lbfgs")
)
model.fit(X,y)

joblib.dump(model,"risk_model.pkl")