# GamiList

A self-hosted game tracking app. Search for games, track your play status, rate them, add custom cover art, and mark favourites — all stored in your own PostgreSQL database.

```
Browser → kubectl port-forward (localhost:8080)
            → ingress-nginx
                ├── /api  → Flask backend (port 5001) → PostgreSQL
                └── /     → React frontend (nginx, port 80)
```

## Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | React (Vite), single-file SPA     |
| Backend   | Python / Flask REST API           |
| Database  | PostgreSQL 16                     |
| Game data | [RAWG Video Games Database API](https://rawg.io/apidocs) |
| Container | Docker (multi-stage builds)       |
| Cluster   | Minikube (Docker driver) on macOS |
| Deploy    | Helm 4                            |
| Ingress   | ingress-nginx                     |

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Minikube](https://minikube.sigs.k8s.io/docs/start/) with the ingress addon enabled
- [Helm](https://helm.sh/docs/intro/install/) v4+
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- A free [RAWG API key](https://rawg.io/apidocs)

### 1. Start Minikube

```bash
minikube start -p jojo-homelab --driver=docker
minikube addons enable ingress -p jojo-homelab
```

### 2. Configure secrets

```bash
cp backend/.env.example backend/.env
# Edit backend/.env and fill in your RAWG_API_KEY
```

Then create the Kubernetes secret that the backend pod reads:

```bash
kubectl create namespace gamilist
kubectl create secret generic gamilist-secrets \
  --from-literal=RAWG_API_KEY=<your_key> \
  -n gamilist
```

> See [`helm/gamilist/README.md`](helm/gamilist/README.md) for wiring the secret into the Helm chart.

### 3. Build and load images

```bash
# Backend
docker build -t gamilist-backend:latest ./backend/

# Frontend — API URL must include the port-forward port
docker build \
  --build-arg VITE_API_URL=http://gamilist.local:8080 \
  -t gamilist-frontend:latest ./frontend/

# Load both into Minikube (required for multi-node; docker-env only works on single-node)
minikube -p jojo-homelab image load gamilist-backend:latest
minikube -p jojo-homelab image load gamilist-frontend:latest
```

### 4. Deploy with Helm

```bash
helm upgrade --install gamilist ./helm/gamilist \
  --kube-context jojo-homelab \
  --namespace gamilist \
  --create-namespace \
  --wait --timeout 3m
```

### 5. Access the app

Add `gamilist.local` to your `/etc/hosts`:

```bash
sudo sed -i '' '/gamilist.local/d' /etc/hosts
echo "127.0.0.1  gamilist.local" | sudo tee -a /etc/hosts
```

Start the port-forward (or load the launchd service — see [Networking](#networking)):

```bash
kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 8080:80
```

Open **http://gamilist.local:8080**

## Networking

Minikube with the Docker driver on macOS runs cluster nodes inside Docker containers.
The cluster network (`192.168.49.x`) is a Docker-internal bridge — it is **not** reachable from the macOS host.
All access must go through `kubectl port-forward`, and `/etc/hosts` must always point to `127.0.0.1`.

### Auto port-forward on login (launchd)

A launchd service is included to start the port-forward automatically at login
and restart it if it dies. See [`helm/gamilist/README.md`](helm/gamilist/README.md) for setup instructions.

## Project Structure

```
gamilist/
├── backend/            # Flask REST API
│   ├── backend.py      # All routes and DB logic
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example    # Environment variable template
├── frontend/           # React SPA
│   ├── src/
│   │   ├── App.jsx     # Entire frontend (single-file)
│   │   └── ...
│   ├── Dockerfile      # Multi-stage: Vite build → nginx:alpine
│   └── nginx.conf      # SPA fallback routing
└── helm/
    └── gamilist/       # Helm chart
        ├── Chart.yaml
        ├── values.yaml
        └── templates/
```

## Useful Commands

```bash
# Check pod status
kubectl get pods -n gamilist

# Stream backend logs
kubectl logs -n gamilist -l app=backend -f

# Redeploy backend after a code change
docker build -t gamilist-backend:latest ./backend/
minikube -p jojo-homelab image load gamilist-backend:latest
kubectl rollout restart deployment/backend -n gamilist

# Uninstall everything
helm uninstall gamilist --namespace gamilist
```

## Sub-READMEs

- [`backend/README.md`](backend/README.md) — API routes, local dev, DB schema
- [`frontend/README.md`](frontend/README.md) — component structure, local dev
- [`helm/gamilist/README.md`](helm/gamilist/README.md) — Helm chart, secrets, launchd
