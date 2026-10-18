"""Streamlit analytics dashboard for the Exam Management System (read-only).
Run:  streamlit run dashboard.py
"""
import os

import pandas as pd
import streamlit as st
from pymongo import MongoClient

st.set_page_config(page_title="EMS Analytics", layout="wide")


def mongo_uri() -> str:
    try:                                   # Streamlit Cloud: Settings -> Secrets
        return st.secrets["MONGODB_URI"]
    except Exception:                      # local: environment variable or default
        return os.getenv("MONGODB_URI", "mongodb://localhost:27017/exam_management")


@st.cache_resource
def get_db():
    client = MongoClient(mongo_uri(), serverSelectionTimeoutMS=5000)
    return client.get_default_database(default="exam_management")


db = get_db()
try:
    db.command("ping")
except Exception as e:
    st.error(f"Cannot reach MongoDB: {e}")
    st.stop()

st.title("📊 Exam Platform Analytics")

names = ["users", "subjects", "questions", "exams", "attempts"]
for col, n in zip(st.columns(len(names)), names):
    col.metric(n.title(), db[n].count_documents({}))

attempts = pd.DataFrame(db.attempts.find(
    {"submittedAt": {"$exists": True}},
    {"exam": 1, "student": 1, "score": 1, "totalMarks": 1, "submittedAt": 1}))
if attempts.empty:
    st.info("No submitted attempts yet.")
    st.stop()

students = pd.DataFrame(db.users.find(
    {"role": "student"}, {"name": 1, "email": 1, "enrollmentNumber": 1}))   # never read passwords
exams = pd.DataFrame(db.exams.find({}, {"title": 1}))
for frame, cols in ((students, ["name", "email", "enrollmentNumber"]), (exams, ["title"])):
    for c in cols:
        if c not in frame.columns:
            frame[c] = None

df = (attempts
      .merge(students.rename(columns={"_id": "student"}), on="student", how="left")
      .merge(exams.rename(columns={"_id": "exam", "title": "exam_title"}), on="exam", how="left"))
df["percentage"] = (df["score"] / df["totalMarks"].where(df["totalMarks"] > 0) * 100).round(1)

choice = st.selectbox("Exam", ["All"] + sorted(df["exam_title"].dropna().unique()))
view = df if choice == "All" else df[df["exam_title"] == choice]

a, b, c = st.columns(3)
a.metric("Attempts", len(view))
b.metric("Average %", f"{view['percentage'].mean():.1f}")
c.metric("Highest %", f"{view['percentage'].max():.1f}")

st.subheader("Score distribution")
st.bar_chart(view["percentage"].round(-1).value_counts().sort_index())

st.subheader("Results")
st.dataframe(
    view[["exam_title", "name", "email", "enrollmentNumber", "score", "totalMarks", "percentage", "submittedAt"]]
    .sort_values("percentage", ascending=False),
    use_container_width=True)
