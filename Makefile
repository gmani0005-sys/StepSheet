.PHONY: help install test test-backend test-frontend build dev dev-backend dev-frontend docker-up docker-down

help:
	@echo "StepSheet Development Commands:"
	@echo "  make install        - Install both backend and frontend dependencies"
	@echo "  make test           - Run all backend and frontend tests"
	@echo "  make test-backend   - Run pytest suite"
	@echo "  make test-frontend  - Run vitest suite"
	@echo "  make build          - Build web frontend production bundle"
	@echo "  make dev-backend    - Run FastAPI dev server with auto-reload"
	@echo "  make dev-frontend   - Run Vite dev server"
	@echo "  make docker-up      - Start full stack in Docker Compose"
	@echo "  make docker-down    - Stop Docker Compose services"

install:
	python -m pip install -r apps/api/requirements.txt
	cd apps/web && npm install

test: test-backend test-frontend

test-backend:
	pytest apps/api/tests -v

test-frontend:
	cd apps/web && npm test

test-e2e:
	cd apps/web && npx playwright test

build:
	cd apps/web && npm run build

dev-backend:
	cd apps/api && uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd apps/web && npm run dev

docker-up:
	docker compose -f docker/docker-compose.yml up --build

docker-down:
	docker compose -f docker/docker-compose.yml down
