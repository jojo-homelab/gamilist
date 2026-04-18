# Contributing to GamiList

Thanks for your interest in contributing!

## Getting Started

1. Fork the repository and clone your fork
2. Follow the setup steps in [`README.md`](README.md) to get the app running locally
3. Create a branch for your change: `git checkout -b feat/your-feature`

## What to Work On

Check the [issues](https://github.com/jojo-homelab/gamilist/issues) for open bugs or feature requests.
Feel free to open a new issue before starting work on something significant so we can discuss the approach.

## Making Changes

- **Backend** — changes to `backend/backend.py` should keep all routes under `/api` and not break the existing response shapes the frontend depends on
- **Frontend** — the UI lives entirely in `src/App.jsx`; keep components in the same file unless the addition is substantial enough to warrant splitting
- **Helm chart** — test your changes with `helm upgrade --install` against a local Minikube cluster before submitting
- **Secrets** — never commit API keys or passwords; use environment variables and document them in `.env.example`

## Submitting a Pull Request

1. Make sure the app still runs end-to-end after your change
2. Update the relevant `README.md` if you added or changed behaviour
3. Open a pull request with a clear description of what changed and why

## Code Style

- Python: follow [PEP 8](https://peps.python.org/pep-0008/); no external formatter is enforced
- JavaScript: the project uses the ESLint config included with the Vite template
- YAML (Helm): 2-space indentation, consistent with the existing templates

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
