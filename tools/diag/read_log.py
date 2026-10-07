#!/usr/bin/env python3
"""Liest die Geräteprotokolle der App über den Datei-Worker.

Die App schickt ihr Protokoll (src/platform/debugLog.ts) selbst als diag/<gerät>.json an
R2 (src/platform/diagUpload.ts). Dieses Werkzeug holt es zurück - gedacht für eine
Entwicklungssitzung, die das Telefon nicht in der Hand hat.

Braucht zwei Umgebungsvariablen (Einrichtung in worker/README.md, „Geräteprotokolle“):
  RENO_DIAG_URL    Adresse des Workers, wie VITE_FILES_URL
  RENO_DIAG_TOKEN  das Secret DIAG_TOKEN des Workers

  python3 tools/diag/read_log.py                        # Geräte, je mit den letzten Zeilen
  python3 tools/diag/read_log.py app-abc123             # ein Gerät, ganzes Protokoll
  python3 tools/diag/read_log.py app-abc123 --scope erinnerung --tail 200
  python3 tools/diag/read_log.py --all --scope erinnerung   # alle Geräte, ganze Protokolle
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def fetch(path: str):
    base = os.environ.get("RENO_DIAG_URL", "").rstrip("/")
    token = os.environ.get("RENO_DIAG_TOKEN", "")
    if not base or not token:
        sys.exit("RENO_DIAG_URL und RENO_DIAG_TOKEN fehlen (siehe worker/README.md, „Geräteprotokolle“).")
    # Cloudflare weist den Standard-User-Agent von urllib ab (error code 1010)
    request = urllib.request.Request(
        base + path, headers={"authorization": f"Bearer {token}", "user-agent": "reno-diag-reader/1.0"}
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        sys.exit(f"{error.code} von {base}{path}: {error.read().decode('utf-8', 'replace')}")
    except urllib.error.URLError as error:
        sys.exit(f"{base} nicht erreichbar: {error.reason} (Netzwerkzugriff der Umgebung prüfen)")


def show(report: dict, scope: str | None, tail: int | None) -> None:
    lines = report.get("lines", [])
    if scope:
        lines = [line for line in lines if f"[{scope}]" in line]
    if tail:
        lines = lines[-tail:]
    print(
        f"=== {report.get('device')}  v{report.get('version')} (Build {report.get('build')}, {report.get('platform')})"
        f"  {report.get('account') or 'ohne Konto'}  {report.get('timeZone')}"
    )
    print(f"    hochgeladen {report.get('uploadedAt')} ({report.get('reason')}), {len(report.get('lines', []))} Zeilen gesamt")
    for line in lines:
        print(line)
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("device", nargs="?", help="Gerätekennung, z. B. app-abc123")
    parser.add_argument("--scope", help="nur Zeilen dieses Bereichs, z. B. erinnerung")
    parser.add_argument("--tail", type=int, help="nur die letzten N Zeilen")
    parser.add_argument("--all", action="store_true", help="alle Geräte vollständig")
    parser.add_argument("--json", action="store_true", help="Rohdaten ausgeben")
    args = parser.parse_args()

    if args.device:
        report = fetch(f"/diag/{args.device}")
        print(json.dumps(report, ensure_ascii=False, indent=1)) if args.json else show(report, args.scope, args.tail)
        return

    devices = fetch("/diag").get("devices", [])
    if not devices:
        print("Noch kein Gerät hat ein Protokoll geschickt.")
        return
    for entry in sorted(devices, key=lambda item: item.get("uploaded", ""), reverse=True):
        report = fetch(f"/diag/{entry['device']}")
        show(report, args.scope, args.tail if (args.all or args.tail) else 15)


if __name__ == "__main__":
    main()
