import urllib.request
import json
import subprocess
import sys
import time

BASE = "http://127.0.0.1:3001/api"

def req(method, path, body=None):
    h = {"Content-Type": "application/json"}
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    r = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    with urllib.request.urlopen(r) as resp:
        return json.loads(resp.read().decode("utf-8"))

def snapshot():
    anomalies = req("GET", "/anomalies")["data"]
    summary = req("GET", "/report/summary")["data"]
    with urllib.request.urlopen(BASE + "/report/export?format=json") as r:
        export = json.loads(r.read().decode("utf-8"))["data"]
    return anomalies, summary, export

print("Before restart snapshot...")
a1, s1, e1 = snapshot()
changed_ids = set()
for a in a1:
    if a.get("latestReason") and "REGTEST" in a["latestReason"]:
        changed_ids.add(a["id"])

print(f"Changed anomaly IDs: {[x[:8] for x in changed_ids]}")
before = {aid: next((x for x in a1 if x["id"] == aid), None) for aid in changed_ids}
before_export = {aid: next((x for x in e1 if x["id"] == aid), None) for aid in changed_ids}

# 触发 nodemon 重启（touch a backend file）
print("Touching api/server.ts to trigger restart...")
with open("api/server.ts", "a", encoding="utf-8") as f:
    pass
f.close()

# 等待服务器重启，最多 30s
print("Waiting for server to restart...")
start = time.time()
while time.time() - start < 30:
    try:
        req("GET", "/rules")
        print("Server is back up.")
        break
    except Exception as ex:
        print(f"  not ready yet: {ex.__class__.__name__}")
        time.sleep(2)
else:
    print("ERROR: server did not come back")
    sys.exit(1)

print("After restart snapshot...")
a2, s2, e2 = snapshot()

mismatches = []
if s1 != s2:
    mismatches.append(f"Summary mismatch: before={s1} after={s2}")

for aid in changed_ids:
    b = before[aid]
    a = next((x for x in a2 if x["id"] == aid), None)
    if a is None:
        mismatches.append(f"Anomaly {aid[:8]} disappeared after restart")
        continue
    for k in ["ruleId", "anomalyType", "status", "latestReason", "latestNote", "latestNewRuleId"]:
        if b.get(k) != a.get(k):
            mismatches.append(f"Anomaly {aid[:8]} field {k} changed: {b.get(k)} -> {a.get(k)}")

    be = before_export[aid]
    ae = next((x for x in e2 if x["id"] == aid), None)
    if ae is None:
        mismatches.append(f"Export row {aid[:8]} disappeared after restart")
        continue
    if be.get("judgments") != ae.get("judgments"):
        mismatches.append(f"Export judgments {aid[:8]} changed after restart")

if mismatches:
    print("\nFAILED MISMATCHES:")
    for m in mismatches:
        print(" ", m)
    sys.exit(1)
else:
    print(f"\nAll {len(changed_ids)} modified anomalies match before/after restart.")
    print(f"  ruleId / anomalyType / status / latestReason / latestNote / judgments 全部一致。")
    print("Summary statistics also identical.")
