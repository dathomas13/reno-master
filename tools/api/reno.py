#!/usr/bin/env python3
"""Schreibt über die API des Datei-Workers in die App: Kosten, Aufgaben, Tagebuch, Notizen,
Kontakte und Gespräche – und liest, sucht und wertet aus.

Gedacht für eine Claude-Sitzung, in der jemand sagt „ich habe Schrauben für 12,40 € bei
Hornbach geholt“. Felder und Regeln: worker/README.md, Abschnitt „API“.

Braucht zwei Umgebungsvariablen:
  RENO_API_URL    Adresse des Workers, wie VITE_FILES_URL
  RENO_API_TOKEN  ein Token aus der App (Einstellungen → API-Zugang)

  python3 tools/api/reno.py whoami
  python3 tools/api/reno.py catalog                              # Kategorien, Personen, Gewerke …
  python3 tools/api/reno.py add costs '{"amountGross": 12.4, "vendor": "Hornbach", "description": "Schrauben", "category": "Material allgemein"}'
  python3 tools/api/reno.py add tasks '{"title": "Fliesenkleber nachkaufen", "assignees": ["Thomas"]}'
  python3 tools/api/reno.py add diary '{"text": "Schlitze für die Leitungen gestemmt.", "present": ["Thomas", "Wolfgang"]}'
  python3 tools/api/reno.py add notes '{"text": "Estrich braucht 4 Wochen"}'
  python3 tools/api/reno.py add contactLogs '{"contact": "Müller", "text": "Kommt Donnerstag", "channel": "Anruf"}'
  python3 tools/api/reno.py update costs <id> '{"amountGross": 15}'          # eigene Einträge: alle Felder
  python3 tools/api/reno.py update tasks <id> '{"appendText": "Termin steht"}'
  python3 tools/api/reno.py summary --group-by trade [--from 2026-10-01]
  python3 tools/api/reno.py search estrich
  python3 tools/api/reno.py list costs --since 2026-10-01
  python3 tools/api/reno.py list tasks                           # offene Aufgaben
  python3 tools/api/reno.py list contacts --query elektro
  python3 tools/api/reno.py done <aufgaben-id>
  python3 tools/api/reno.py delete costs <id>                    # nur, was über die API kam
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


COLLECTIONS = ["costs", "tasks", "diary", "notes", "contacts", "contactLogs"]


def read_json(raw: str) -> dict:
    try:
        return json.loads(sys.stdin.read() if raw == "-" else raw)
    except ValueError as error:
        sys.exit(f"kein gültiges JSON: {error}")


def call(method: str, path: str, body: dict | None = None):
    base = os.environ.get("RENO_API_URL", "").rstrip("/")
    token = os.environ.get("RENO_API_TOKEN", "")
    if not base or not token:
        sys.exit("RENO_API_URL und RENO_API_TOKEN fehlen (siehe worker/README.md, „API“).")
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        f"{base}/api/v1{path}",
        data=data,
        method=method,
        # Cloudflare weist den Standard-User-Agent von urllib ab (error code 1010)
        headers={"authorization": f"Bearer {token}", "content-type": "application/json", "user-agent": "reno-api-cli/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        text = error.read().decode("utf-8", "replace")
        try:
            text = json.loads(text).get("error", text)
        except (ValueError, AttributeError):
            pass
        sys.exit(f"{error.code}: {text}")
    except urllib.error.URLError as error:
        sys.exit(f"{base} nicht erreichbar: {error.reason} (Netzwerkzugriff der Umgebung prüfen)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("whoami", help="welches Token, welche Rechte")
    sub.add_parser("catalog", help="Auswahlwerte, Gewerke, Phasen, heutiges Datum")
    add = sub.add_parser("add", help="Eintrag anlegen")
    add.add_argument("collection", choices=COLLECTIONS)
    add.add_argument("json", help="die Felder als JSON-Objekt, oder - für stdin")
    lst = sub.add_parser("list", help="letzte Einträge")
    lst.add_argument("collection", choices=COLLECTIONS)
    lst.add_argument("--query", help="nur Einträge mit diesen Wörtern")
    lst.add_argument("--contact", help="contactLogs: nur mit diesem Kontakt")
    lst.add_argument("--since", help="JJJJ-MM-TT")
    lst.add_argument("--limit", type=int)
    lst.add_argument("--all", action="store_true", help="Aufgaben: auch erledigte")
    done = sub.add_parser("done", help="Aufgabe abhaken")
    done.add_argument("id")
    delete = sub.add_parser("delete", help="über die API angelegten Eintrag löschen")
    delete.add_argument("collection", choices=COLLECTIONS)
    delete.add_argument("id")
    update = sub.add_parser("update", help="Eintrag ändern")
    update.add_argument("collection", choices=COLLECTIONS)
    update.add_argument("id")
    update.add_argument("json", help="die Änderungen als JSON-Objekt, oder - für stdin")
    summary = sub.add_parser("summary", help="Kosten summieren")
    summary.add_argument("--group-by", default="category", help="category, trade, month, paidBy, paymentStatus, room")
    for name in ("from", "to", "category", "trade", "paidBy", "paymentStatus", "room"):
        summary.add_argument(f"--{name}")
    search = sub.add_parser("search", help="in allen Einträgen suchen")
    search.add_argument("query", nargs="+")
    args = parser.parse_args()

    if args.command == "whoami":
        result = call("GET", "")
    elif args.command == "catalog":
        result = call("GET", "/catalog")
    elif args.command == "add":
        result = call("POST", f"/{args.collection}", read_json(args.json))
    elif args.command == "update":
        result = call("PATCH", f"/{args.collection}/{urllib.parse.quote(args.id)}", read_json(args.json))
    elif args.command == "summary":
        names = ("from", "to", "category", "trade", "paidBy", "paymentStatus", "room")
        query = {"groupBy": args.group_by, **{n: getattr(args, n) for n in names if getattr(args, n)}}
        result = call("GET", f"/costs/summary?{urllib.parse.urlencode(query)}")
    elif args.command == "search":
        result = call("GET", f"/search?{urllib.parse.urlencode({'q': ' '.join(args.query)})}")
    elif args.command == "list":
        query = {
            k: v
            for k, v in {"since": args.since, "limit": args.limit, "open": "false" if args.all else None, "query": args.query, "contact": args.contact}.items()
            if v
        }
        result = call("GET", f"/{args.collection}" + (f"?{urllib.parse.urlencode(query)}" if query else ""))
    elif args.command == "done":
        result = call("POST", f"/tasks/{urllib.parse.quote(args.id)}/done")
    else:
        result = call("DELETE", f"/{args.collection}/{urllib.parse.quote(args.id)}")
    print(json.dumps(result, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
