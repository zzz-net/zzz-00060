import urllib.request
import urllib.parse
import json
import sys
import time
import subprocess

BASE = "http://127.0.0.1:3001/api"

def req(method, path, body=None, headers=None):
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    r = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    with urllib.request.urlopen(r) as resp:
        return json.loads(resp.read().decode("utf-8"))

passed = 0
failed = 0

def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  PASS: {name}")
    else:
        failed += 1
        print(f"  FAIL: {name} {detail}")

def snapshot_db():
    resp = req("GET", "/anomalies")
    all_a = {a["id"]: a for a in resp["data"]}
    return all_a

print("=" * 60)
print("回归测试 1：改判类别变更 + 原因 + 备注保存")
print("=" * 60)

# 找一个 pending 的异常
resp = req("GET", "/anomalies?status=pending")
pending = [a for a in resp["data"] if a["anomalyType"] != "negative"]
if not pending:
    pending = resp["data"]
assert pending, "没有 pending 异常可以测试"

target = pending[0]
print(f"选中异常 id={target['id'][:8]} 原类别={target['anomalyType']} 原规则={target['ruleId']}")

# 选一个不同的规则来改判
all_rules = req("GET", "/rules")["data"]
new_rule = next(r for r in all_rules if r["id"] != target["ruleId"])
print(f"目标规则 id={new_rule['id']} name={new_rule['name']} type={new_rule['type']}")

# 提交改判
judge_body = {
    "result": "confirm",
    "reason": f"REGTEST:经核实应归类为{new_rule['name']}",
    "note": "REGTEST:现场二次抄表核实",
    "newRuleId": new_rule["id"],
}
resp2 = req("POST", f"/anomalies/{target['id']}/judge", judge_body)
updated = resp2["data"]

check("status 更新为 confirmed", updated["status"] == "confirmed")
check("ruleId 变更", updated["ruleId"] == new_rule["id"], f"期望={new_rule['id']} 实际={updated['ruleId']}")
check("anomalyType 变更", updated["anomalyType"] == new_rule["type"], f"期望={new_rule['type']} 实际={updated['anomalyType']}")
check("ruleName 更新", updated.get("ruleName") == new_rule["name"])

# 重新拉 anomalies 列表，检查最新 judgment 带出的 reason/note
resp3 = req("GET", "/anomalies")
refetched = next(a for a in resp3["data"] if a["id"] == target["id"])
check("列表查询带出 latestReason=改判原因", "REGTEST" in (refetched.get("latestReason") or ""))
check("列表查询带出 latestNote=改判备注", "REGTEST" in (refetched.get("latestNote") or ""))
check("列表查询带出 latestNewRuleId=目标规则", refetched.get("latestNewRuleId") == new_rule["id"])

print()
print("=" * 60)
print("回归测试 2：导出报告 JSON 和 CSV 都包含改判原因/备注/类别变更")
print("=" * 60)

# JSON 导出
with urllib.request.urlopen(BASE + "/report/export?format=json") as r:
    json_export = json.loads(r.read().decode("utf-8"))["data"]
row = next(x for x in json_export if x["id"] == target["id"])
latest = row["judgments"][-1] if row["judgments"] else None
check("JSON 导出 judgments 存在", latest is not None)
check("JSON 导出 reason 正确", "REGTEST" in (latest.get("reason") if latest else ""))
check("JSON 导出 note 正确", "REGTEST" in (latest.get("note") if latest else ""))
check("JSON 导出 prevRuleId 正确", latest.get("prevRuleId") == target["ruleId"])
check("JSON 导出 newRuleId 正确", latest.get("newRuleId") == new_rule["id"])

# CSV 导出
with urllib.request.urlopen(BASE + "/report/export?format=csv") as r:
    csv_text = r.read().decode("utf-8-sig")

check("CSV 包含改判原因列", "改判原因" in csv_text)
check("CSV 包含改判备注列", "改判备注" in csv_text)
check("CSV 包含判定历史列", "判定历史" in csv_text)
check("CSV 该行包含 REGTEST 原因", "REGTEST:经核实应归类为" in csv_text)
check("CSV 该行包含 REGTEST 备注", "REGTEST:现场二次抄表核实" in csv_text)
check("CSV 判定历史包含类别变更", f"类别变更" in csv_text or new_rule["id"] in csv_text)

print()
print("=" * 60)
print("回归测试 3：只改状态不改类别时 anomalies.ruleId 保持不变")
print("=" * 60)

resp4 = req("GET", "/anomalies?status=pending")
pending2 = resp4["data"]
if pending2:
    t2 = pending2[0]
    orig_rule = t2["ruleId"]
    orig_type = t2["anomalyType"]
    print(f"选中异常 id={t2['id'][:8]} 原类别={orig_type}")
    resp5 = req("POST", f"/anomalies/{t2['id']}/judge", {
        "result": "false_positive",
        "reason": "REGTEST:经核实为误报",
        "note": "REGTEST:误报记录",
    })
    u2 = resp5["data"]
    check("状态变为 false_positive", u2["status"] == "false_positive")
    check("ruleId 未变", u2["ruleId"] == orig_rule)
    check("anomalyType 未变", u2["anomalyType"] == orig_type)
else:
    print("  SKIP: 没有 pending 异常")
    passed += 3

print()
print("=" * 60)
print(f"结果：{passed} 个通过，{failed} 个失败")
print("=" * 60)

if failed:
    sys.exit(1)
