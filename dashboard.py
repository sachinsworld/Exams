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
def get_client():
    return MongoClient(mongo_uri(), serverSelectionTimeoutMS=5000)


client = get_client()
try:
    client.admin.command("ping")
except Exception as e:
    st.error(f"Cannot reach MongoDB: {e}")
    st.stop()

# ---- which database? The app always uses MONGODB_DB (default "exam_management")
def _setting(key, default):
    try:
        return st.secrets[key]
    except Exception:
        return os.getenv(key, default)


default_name = _setting("MONGODB_DB", "exam_management")   # same value the app uses
try:
    candidates = [n for n in client.list_database_names()
                  if "users" in client[n].list_collection_names()]
except Exception:                          # user lacks listDatabases permission
    candidates = []
options = candidates or [default_name]
index = options.index(default_name) if default_name in options else 0
db_name = st.sidebar.selectbox("Database", options, index=index)
db = client[db_name]
st.sidebar.caption(f"Connected to: {db_name}")
if not candidates:
    st.sidebar.warning("Could not list databases. Showing the one from MONGODB_URI.")

st.title("📊 Exam Platform Analytics")

names = ["users", "subjects", "questions", "exams", "attempts"]
for col, n in zip(st.columns(len(names)), names):
    col.metric(n.title(), db[n].count_documents({}))

if db["users"].count_documents({}) == 0:
    st.warning(f"Database '{db_name}' has no users. If your app has data, it is using a different "
               "database name or cluster: compare MONGODB_URI in the app and in this dashboard.")

attempts = pd.DataFrame(db.attempts.find(
    {"submittedAt": {"$exists": True}},
    {"exam": 1, "student": 1, "score": 1, "totalMarks": 1, "submittedAt": 1}))
if attempts.empty:
    st.info("No submitted attempts yet.")
    st.stop()

students = pd.DataFrame(db.users.find(
    {"role": "student"}, {"name": 1, "email": 1, "enrollmentNumber": 1}))   # never read passwords
exams = pd.DataFrame(db.exams.find({}, {"title": 1}))
for frame, cols in ((students, ["_id", "name", "email", "enrollmentNumber"]), (exams, ["_id", "title"])):
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
