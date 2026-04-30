# test_ingest.py
import urllib.request, json

token_req = urllib.request.Request(
    "http://localhost:8001/core/auth/login",
    data=json.dumps({"email":"huszar.viktor.85@gmail.com","password":"admin123"}).encode(),
    headers={"Content-Type":"application/json"}
)
token = json.loads(urllib.request.urlopen(token_req).read())["access_token"]

ingest_req = urllib.request.Request(
    "http://localhost:8001/email/ingest",
    data=json.dumps({
        "message_id": "test-001",
        "subject": "Kerdesem van a szamlazassal kapcsolatban",
        "sender": "teszt.ugyfel@example.com",
        "body": "Tisztelt Ugyfelszolgalat! Szeretnek erdeklodni a szamlam allapotarol."
    }).encode(),
    headers={"Content-Type":"application/json", "Authorization":f"Bearer {token}"}
)
print(json.loads(urllib.request.urlopen(ingest_req).read()))