# GamiList — Helm Chart

Deploys the full GamiList stack (frontend, backend, PostgreSQL) to the `gamilist` Kubernetes namespace.

## Chart Contents

| Template               | Resources                                                   |
|------------------------|-------------------------------------------------------------|
| `namespace.yaml`       | Namespace `gamilist`                                        |
| `postgres.yaml`        | PVC + Deployment + Service                                  |
| `backend.yaml`         | Deployment + Service                                        |
| `frontend.yaml`        | Deployment + Service                                        |
| `ingress.yaml`         | nginx Ingress routing `/api` → backend, `/` → frontend      |
| `networkpolicy.yaml`   | Least-privilege ingress/egress rules per pod                |
| `pre-upgrade-hook.yaml`| Pre-install/pre-upgrade Job that deletes the stale nginx admission webhook |

## Deploy

```bash
helm upgrade --install gamilist ./helm/gamilist \
  --kube-context jojo-homelab \
  --namespace gamilist \
  --create-namespace \
  --wait --timeout 3m
```

## Secrets

The RAWG API key must be provided as a Kubernetes secret **before** deploying.
The chart references it by name — it is never stored in `values.yaml` or committed to git.

```bash
kubectl create secret generic gamilist-secrets \
  --from-literal=RAWG_API_KEY=your_key_here \
  -n gamilist
```

Then wire it into `templates/backend.yaml` under the container's `env`:

```yaml
- name: RAWG_API_KEY
  valueFrom:
    secretKeyRef:
      name: gamilist-secrets
      key: RAWG_API_KEY
```

## Key values (`values.yaml`)

```yaml
namespace: gamilist

frontend:
  image: gamilist-frontend
  tag: latest
  replicas: 1
  port: 80

backend:
  image: gamilist-backend
  tag: latest
  replicas: 1
  port: 5001

postgres:
  image: postgres
  tag: "16-alpine"
  port: 5432
  database: gamilist
  user: gamilist
  password: gamilist   # change for production
  storageSize: 1Gi

ingress:
  host: gamilist.local
```

## Pre-upgrade Hook

`pre-upgrade-hook.yaml` runs a Job before every `helm upgrade` that deletes the
`ingress-nginx-admission` ValidatingWebhookConfiguration. After a cluster reboot,
the webhook's TLS certificate becomes stale, which causes the upgrade to fail with:

```
x509: certificate signed by unknown authority
```

The hook automatically resolves this on every deploy without manual intervention.

## Networking (macOS + Minikube Docker driver)

The cluster IP (`192.168.49.x`) is inside Docker's bridge network and **not reachable** from macOS.
Access requires `kubectl port-forward`:

```bash
kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 8080:80
```

### Auto port-forward with launchd

To start the port-forward automatically at login, create a launchd service:

**`~/Library/LaunchAgents/local.gamilist.portforward.plist`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>local.gamilist.portforward</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/kubectl</string>
        <string>port-forward</string>
        <string>-n</string>
        <string>ingress-nginx</string>
        <string>svc/ingress-nginx-controller</string>
        <string>8080:80</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/gamilist-portforward.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/gamilist-portforward.err</string>
</dict>
</plist>
```

```bash
# Load once — persists across reboots
launchctl load ~/Library/LaunchAgents/local.gamilist.portforward.plist

# Start manually if already loaded
launchctl start local.gamilist.portforward

# View logs
cat /tmp/gamilist-portforward.log
```

## Network Policies

| Pod       | Ingress from                     | Egress to                          |
|-----------|----------------------------------|------------------------------------|
| frontend  | ingress-nginx namespace only     | backend pod only                   |
| backend   | ingress-nginx + frontend pod     | postgres pod + internet + DNS      |
| postgres  | backend pod only                 | none                               |
