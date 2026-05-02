# Deploy to Kubernetes + GitHub

Deploy the current changes to the jojo-homelab Kubernetes cluster and push to GitHub.

## Cluster facts (never re-discover these)

- **Minikube profile:** `jojo-homelab` (3-node cluster, `--kube-context jojo-homelab`)
- **Driver:** Docker — multi-node, so `minikube docker-env` does NOT work
- **Image loading:** Build locally with `docker build`, then `minikube image load` into the cluster
- **Image pull policy:** `Never` (images must be present on nodes before helm upgrade)
- **Helm chart:** `./helm/gamilist` — namespace `gamilist`
- **Images:** `gamilist-backend:latest`, `gamilist-frontend:latest`
- **Git remote:** `github.com:jojo-homelab/gamilist.git`, branch `main`

## Steps (always in this order)

```bash
# 1. Build both images from project root
docker build -t gamilist-backend:latest ./backend
docker build -t gamilist-frontend:latest ./frontend

# 2. Load images into every cluster node
minikube image load gamilist-backend:latest -p jojo-homelab
minikube image load gamilist-frontend:latest -p jojo-homelab

# 3. Deploy via Helm
helm upgrade --install gamilist ./helm/gamilist \
  --kube-context jojo-homelab \
  --namespace gamilist \
  --create-namespace \
  --wait --timeout 3m

# 4. Force rollout restart (required — imagePullPolicy:Never + :latest tag means
#    Kubernetes won't restart pods automatically when a new image is loaded)
kubectl rollout restart deployment/frontend deployment/backend -n gamilist --context jojo-homelab
kubectl rollout status deployment/frontend deployment/backend -n gamilist --context jojo-homelab --timeout=90s

# 5. Commit changed files (stage specific files, not -A)
git add <changed files>
git commit -m "..."

# 5. Push
git push
```

## Common pitfalls

- Do NOT use `minikube docker-env` — fails on multi-node clusters
- Always load images into minikube BEFORE running helm upgrade, otherwise pods get ImagePullBackOff
- `imagePullPolicy: Never` + `:latest` tag means Kubernetes never detects a new image — `helm upgrade` succeeds but pods keep running the old code. Always `kubectl rollout restart` after loading
- Helm chart lives at `./helm/gamilist` (not `helm/gamilist/gamilist`)

## If only backend changed

Skip the frontend build + load steps. Same applies in reverse.

## Verify deploy

```bash
kubectl get pods -n gamilist --context jojo-homelab
```

All pods should be `Running` with fresh `AGE` timestamps after the upgrade.
