# 📦 Installation

This guide helps you install and run Web Audit on Windows/macOS/Linux.

## ✅ Requirements

| Requirement | Notes |
|------------|------|
| Python | 3.10+ recommended |
| Pip | Comes with Python |
| Playwright browsers | Installed via `playwright install` |

## 1) (Recommended) Create a Virtual Environment

### Windows (PowerShell)

```powershell
python -m venv venv
venv\Scripts\Activate.ps1
```

### macOS/Linux

```bash
python -m venv venv
source venv/bin/activate
```

## 2) Install Python Dependencies

```bash
pip install -r requirements.txt
```

## 3) Install Playwright Browsers

```bash
playwright install chromium
```

## 4) Run the Web UI (Flask)

```bash
python app.py
```

Open:

- `http://localhost:5000` (Web UI)
- `http://localhost:5000/api` (API info)

## 5) Run the CLI

```bash
python cli.py
```

Or direct commands:

```bash
python cli.py visit https://example.com
python cli.py start
python cli.py check-robots https://example.com
```

## Troubleshooting

### Playwright is installed but browser is missing

Run:

```bash
playwright install chromium
```

### Permission / Policy issue on PowerShell

If activation is blocked:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
