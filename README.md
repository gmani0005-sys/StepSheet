# StepSheet 📊

> **No-Code Data Workbench for Analysts:** Build Excel-style formulas and transformations entirely through guided UI steps. 100% Open Source (MIT), self-hostable, with no proprietary lock-in.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python: 3.11+](https://img.shields.io/badge/Python-3.11%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-green.svg)](https://fastapi.tiangolo.com/)
[![DuckDB](https://img.shields.io/badge/Engine-DuckDB-yellow.svg)](https://duckdb.org/)
[![React 18](https://img.shields.io/badge/Frontend-React%2018%20%2B%20TypeScript-blue.svg)](https://react.dev/)

---

## 🎯 What is StepSheet?
Data analysts upload Excel (`.xlsx`), CSV, and Parquet files and apply transformations, lookups, and formulas through **guided visual steps**—without needing to memorize complex Excel formula syntax (`XLOOKUP`, `INDEX-MATCH`, `SUMIFS`, nested `IF`) or Power Query M.

Every transformation is recorded as a typed, re-runnable **Step** (like Power Query "Applied Steps"). When done, you can export the output and logic to:
- **Real Excel spreadsheets with live formulas** (e.g. `XLOOKUP`, `SUMIFS`, `IF`)
- **Power Query M scripts**
- **DuckDB / ANSI SQL queries**
- **Python (Polars) code**
- **JSON Pipeline files** for re-running on new files

---

## 🏗 Architecture
- **Frontend (`/apps/web`)**: React 18, TypeScript, Vite, Tailwind CSS, TanStack Table + TanStack Virtual (smooth 60fps windowing over 1M+ rows), Zustand.
- **Backend (`/apps/api`)**: Python 3.11+, FastAPI, Pydantic v2, DuckDB (in-process analytical SQL engine), Polars (high-performance dataframe ops).
- **Storage & Database**: PostgreSQL + Alembic (SQLite dev fallback), local filesystem abstraction + MinIO/S3 adapter.
- **Shared Schemas (`/packages/step-spec`)**: JSON Schema specifications for every step type.

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- Python 3.11+
- Node.js 18+ (Node 20+ recommended)

### 2. Backend Setup
```bash
# In repo root:
python -m venv .venv
# Activate:
# Windows: .\.venv\Scripts\Activate.ps1
# Mac/Linux: source .venv/bin/activate

pip install -r apps/api/requirements.txt
cd apps/api
uvicorn app.main:app --reload --port 8000
```
API Documentation will be live at `http://localhost:8000/docs`.

### 3. Frontend Setup
```bash
cd apps/web
npm install
npm run dev
```
Open `http://localhost:5173` to use StepSheet!

### 4. Docker Deployment
```bash
docker compose -f docker/docker-compose.yml up --build
```
Web app will be available at `http://localhost:3000`.

---

## 🧪 Testing
```bash
# Backend tests
pytest apps/api/tests -v

# Frontend tests
cd apps/web && npm test
```

---

## 📄 License
MIT License. StepSheet is completely open source and free for commercial and personal use.
