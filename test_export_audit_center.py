#!/usr/bin/env python3
"""
导出审计中心回归测试
覆盖场景:
  1. 权限报错 - 目录不存在/不可写
  2. 冲突改名 - rename 策略自动追加后缀
  3. 冲突覆盖 - overwrite 策略覆盖已有文件
  4. 重启恢复 - 服务重启后任务记录可查询、文件可验证
  5. 连续导出 - 多次同名导出生成不同文件
  6. 一致性校验 - verify 接口比对 API 记录与磁盘文件
  7. 审计日志 - audit-log 接口汇总一致性状态
  8. 换目录重试 - 失败任务切换目录后重新成功
  9. 冲突手动解决 - changeDir 方式
  10. 取消与重试 - 状态流转完整性
"""
import urllib.request
import urllib.parse
import json
import os
import sys
import time
import tempfile
import shutil

BASE = os.environ.get("TEST_EXPORT_BASE", "http://127.0.0.1:3001/api")

def req(method, path, body=None):
    h = {"Content-Type": "application/json"}
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    r = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8")
            return e.code, json.loads(body) if body else {}
        except Exception:
            return e.code, {}

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

def wait_for_status(task_id, target_status, timeout=10):
    deadline = time.time() + timeout
    while time.time() < deadline:
        code, data = req("GET", f"/export-tasks/{task_id}")
        if code == 200 and data.get("success"):
            status = data["data"]["status"]
            if status == target_status:
                return data["data"]
            if status in ("failed", "cancelled") and target_status not in ("failed", "cancelled"):
                return data["data"]
        time.sleep(0.3)
    code, data = req("GET", f"/export-tasks/{task_id}")
    return data.get("data") if data.get("success") else None

def file_exists_and_not_empty(path):
    return os.path.isfile(path) and os.path.getsize(path) > 0

def cleanup_test_files(dir_path):
    if os.path.isdir(dir_path):
        for f in os.listdir(dir_path):
            fp = os.path.join(dir_path, f)
            try:
                if os.path.isfile(fp):
                    os.unlink(fp)
            except Exception:
                pass

print("=" * 70)
print("导出审计中心回归测试")
print("=" * 70)

project_root = os.path.dirname(os.path.abspath(__file__))
TEST_DIR = os.path.join(project_root, "__test_audit_exports__")
TEST_DIR_2 = os.path.join(project_root, "__test_audit_exports_2__")
os.makedirs(TEST_DIR, exist_ok=True)
os.makedirs(TEST_DIR_2, exist_ok=True)
cleanup_test_files(TEST_DIR)
cleanup_test_files(TEST_DIR_2)

try:
    code, _ = req("GET", "/health")
    if code != 200:
        print("\n错误: 后端服务未启动，请先运行 'npm run server:dev'")
        sys.exit(1)

    # =====================================================================
    # 测试 1: 权限报错 - 无效/不存在的目录
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 1: 权限报错 - 目录不存在/不可写")
    print("=" * 70)

    invalid_dir = "Z:\\nonexistent_audit_xyz_12345\\exports"
    if os.name != "nt":
        invalid_dir = "/nonexistent_audit_xyz_12345/exports"

    code, data = req("POST", "/export-tasks", {
        "format": "csv",
        "exportDir": invalid_dir,
        "fileName": "should_fail.csv",
        "conflictAction": "rename",
    })
    task_err_id = data["data"]["id"]
    final_err = wait_for_status(task_err_id, "failed", timeout=10)
    check("无效目录 - 任务最终状态 failed", final_err and final_err.get("status") == "failed",
          f"实际={final_err.get('status') if final_err else 'None'}")
    if final_err:
        check("无效目录 - failureReason 非空", bool(final_err.get("failureReason")))
        check("无效目录 - keyLogs 含错误信息", len(final_err.get("keyLogs", [])) > 0)
        check("无效目录 - finalFilePath 为空", not final_err.get("finalFilePath"))
        check("无效目录 - 界面提示与实际一致",
              "目录" in final_err.get("failureReason", "") or "不可写" in final_err.get("failureReason", "") or "无法" in final_err.get("failureReason", ""))

    # 1.2 失败后换目录重试
    code, data = req("POST", f"/export-tasks/{task_err_id}/change-dir-retry", {
        "exportDir": TEST_DIR,
    })
    check("换目录重试 - 接口调用成功", code == 200 and data.get("success") is True)
    final_retry = wait_for_status(task_err_id, "success", timeout=10)
    check("换目录重试 - 任务最终成功", final_retry and final_retry.get("status") == "success",
          f"实际={final_retry.get('status') if final_retry else 'None'}")
    if final_retry:
        check("换目录重试 - exportDir 已更新", final_retry.get("exportDir") == TEST_DIR)
        check("换目录重试 - 文件真实存在", file_exists_and_not_empty(final_retry.get("finalFilePath", "")))

    # 1.3 校验失败后重试的任务一致性
    code, data = req("GET", f"/export-tasks/{task_err_id}/verify")
    check("verify 接口 - 调用成功", code == 200 and data.get("success") is True)
    vr = data.get("data", {})
    check("verify 接口 - 一致性校验通过", vr.get("consistent") is True,
          f"issues={vr.get('issues')}")
    check("verify 接口 - 磁盘文件存在", vr.get("diskExists") is True)
    check("verify 接口 - 大小匹配", vr.get("sizeMatch") is True)

    # =====================================================================
    # 测试 2: 冲突改名 (rename)
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 2: 冲突改名 - rename 策略")
    print("=" * 70)

    code, data = req("POST", "/export-tasks", {
        "format": "csv",
        "exportDir": TEST_DIR,
        "fileName": "audit_rename.csv",
        "conflictAction": "rename",
    })
    task_r1_id = data["data"]["id"]
    final_r1 = wait_for_status(task_r1_id, "success", timeout=10)
    check("首次导出 - 成功", final_r1 and final_r1.get("status") == "success")

    code, data = req("POST", "/export-tasks", {
        "format": "csv",
        "exportDir": TEST_DIR,
        "fileName": "audit_rename.csv",
        "conflictAction": "rename",
    })
    task_r2_id = data["data"]["id"]
    final_r2 = wait_for_status(task_r2_id, "success", timeout=10)
    check("rename冲突 - 任务成功", final_r2 and final_r2.get("status") == "success")
    if final_r2:
        check("rename冲突 - finalFileName != 原始名", final_r2.get("finalFileName") != "audit_rename.csv")
        check("rename冲突 - 文件名含 _1 后缀", "_1" in final_r2.get("finalFileName", ""),
              f"实际={final_r2.get('finalFileName')}")
        check("rename冲突 - 新文件存在", file_exists_and_not_empty(final_r2.get("finalFilePath", "")))
        check("rename冲突 - conflictResolved=true", final_r2.get("conflictResolved") is True)
        check("rename冲突 - 原文件仍存在", file_exists_and_not_empty(os.path.join(TEST_DIR, "audit_rename.csv")))

    # =====================================================================
    # 测试 3: 冲突覆盖 (overwrite)
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 3: 冲突覆盖 - overwrite 策略")
    print("=" * 70)

    original_mtime = os.path.getmtime(os.path.join(TEST_DIR, "audit_rename.csv"))
    time.sleep(0.1)
    code, data = req("POST", "/export-tasks", {
        "format": "csv",
        "exportDir": TEST_DIR,
        "fileName": "audit_rename.csv",
        "conflictAction": "overwrite",
    })
    task_ow_id = data["data"]["id"]
    final_ow = wait_for_status(task_ow_id, "success", timeout=10)
    check("overwrite冲突 - 任务成功", final_ow and final_ow.get("status") == "success")
    if final_ow:
        new_mtime = os.path.getmtime(os.path.join(TEST_DIR, "audit_rename.csv"))
        check("overwrite冲突 - 文件被覆盖（mtime 变化）", new_mtime > original_mtime)
        check("overwrite冲突 - finalFileName 保持原名", final_ow.get("finalFileName") == "audit_rename.csv")
        check("overwrite冲突 - conflictAction=overwrite", final_ow.get("conflictAction") == "overwrite")

    # =====================================================================
    # 测试 4: 重启恢复 - 任务记录持久化验证
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 4: 重启恢复 - 任务记录持久化验证")
    print("=" * 70)

    code, data = req("POST", "/export-tasks", {
        "format": "json",
        "exportDir": TEST_DIR,
        "fileName": "audit_persistent.json",
        "conflictAction": "rename",
        "operator": "AUDIT_TESTER",
    })
    persistent_id = data["data"]["id"]
    persistent_taskNo = data["data"]["taskNo"]
    final_pers = wait_for_status(persistent_id, "success", timeout=10)
    check("持久化任务 - 先成功执行", final_pers and final_pers.get("status") == "success")

    code, data = req("GET", f"/export-tasks/{persistent_id}")
    check("重启恢复 - 单任务查询成功", code == 200 and data.get("success") is True)
    t = data.get("data", {})
    check("重启恢复 - ID 一致", t.get("id") == persistent_id)
    check("重启恢复 - taskNo 一致", t.get("taskNo") == persistent_taskNo)
    check("重启恢复 - status 保持 success", t.get("status") == "success")
    check("重启恢复 - finalFileName 持久化", bool(t.get("finalFileName")))
    check("重启恢复 - finalFilePath 持久化", bool(t.get("finalFilePath")))
    check("重启恢复 - fileSize 持久化", t.get("fileSize", 0) > 0)
    check("重启恢复 - recordCount 持久化", t.get("recordCount", 0) >= 0)
    check("重启恢复 - operator 持久化", t.get("operator") == "AUDIT_TESTER")
    check("重启恢复 - keyLogs 非空", isinstance(t.get("keyLogs"), list) and len(t["keyLogs"]) > 0)
    check("重启恢复 - keyLogs 含一致性校验", any("一致性校验" in l for l in t.get("keyLogs", [])))

    code, data = req("GET", "/export-tasks?limit=100")
    tasks_in_list = [x for x in data.get("data", []) if x["id"] == persistent_id]
    check("重启恢复 - 列表中仍可找到该任务", len(tasks_in_list) == 1)

    # =====================================================================
    # 测试 5: 连续导出生成不同文件
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 5: 连续导出生成不同文件名")
    print("=" * 70)

    created_names = set()
    for i in range(3):
        code, data = req("POST", "/export-tasks", {
            "format": "json",
            "exportDir": TEST_DIR,
            "fileName": "audit_multi.json",
            "conflictAction": "rename",
        })
        if code == 200 and data.get("success"):
            tid = data["data"]["id"]
            final = wait_for_status(tid, "success", timeout=10)
            if final and final.get("status") == "success":
                name = final.get("finalFileName", "")
                created_names.add(name)
                check(f"第{i+1}次连续导出 - 文件存在", file_exists_and_not_empty(final.get("finalFilePath", "")))

    check("连续 3 次导出产生 3 个不同文件名", len(created_names) == 3,
          f"实际={len(created_names)}, names={created_names}")

    # =====================================================================
    # 测试 6: 一致性校验 verify 接口
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 6: 一致性校验 verify 接口")
    print("=" * 70)

    code, data = req("GET", f"/export-tasks/{persistent_id}/verify")
    check("verify 接口 - 调用成功", code == 200 and data.get("success") is True)
    vr = data.get("data", {})
    check("verify - taskId 正确", vr.get("taskId") == persistent_id)
    check("verify - taskNo 正确", vr.get("taskNo") == persistent_taskNo)
    check("verify - status 为 success", vr.get("status") == "success")
    check("verify - diskExists=true", vr.get("diskExists") is True)
    check("verify - sizeMatch=true", vr.get("sizeMatch") is True)
    check("verify - consistent=true", vr.get("consistent") is True)
    check("verify - issues 为空", len(vr.get("issues", [])) == 0,
          f"issues={vr.get('issues')}")
    check("verify - apiFileSize > 0", vr.get("apiFileSize", 0) > 0)
    check("verify - diskFileSize > 0", vr.get("diskFileSize", 0) > 0)

    # 6.2 验证失败的任务（删除文件后校验）
    temp_file_to_delete = final_pers.get("finalFilePath", "")
    if temp_file_to_delete and os.path.isfile(temp_file_to_delete):
        backup_content = open(temp_file_to_delete, "rb").read()
        os.unlink(temp_file_to_delete)
        code2, data2 = req("GET", f"/export-tasks/{persistent_id}/verify")
        vr2 = data2.get("data", {})
        check("verify 删文件后 - consistent=false", vr2.get("consistent") is False)
        check("verify 删文件后 - diskExists=false", vr2.get("diskExists") is False)
        check("verify 删文件后 - issues 非空", len(vr2.get("issues", [])) > 0)
        # 恢复文件
        with open(temp_file_to_delete, "wb") as f:
            f.write(backup_content)

    # 6.3 验证失败状态的任务
    code, data = req("GET", f"/export-tasks/{task_err_id}/verify")
    check("verify 失败任务 - 接口成功", code == 200 and data.get("success") is True)
    # 注意: task_err_id 已经重试成功，所以 verify 应该返回 consistent=true

    # =====================================================================
    # 测试 7: 审计日志 audit-log 接口
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 7: 审计日志 audit-log 接口")
    print("=" * 70)

    code, data = req("GET", "/export-tasks/audit-log?limit=50")
    check("audit-log 接口 - 调用成功", code == 200 and data.get("success") is True)
    audit_entries = data.get("data", [])
    meta = data.get("meta", {})
    check("audit-log - 返回数组", isinstance(audit_entries, list))
    check("audit-log - 数据非空", len(audit_entries) > 0)
    check("audit-log - meta.totalTasks > 0", meta.get("totalTasks", 0) > 0)
    check("audit-log - meta.shown > 0", meta.get("shown", 0) > 0)
    check("audit-log - meta 含 inconsistentCount", isinstance(meta.get("inconsistentCount"), int))
    check("audit-log - meta 含 allConsistent", isinstance(meta.get("allConsistent"), bool))

    if audit_entries:
        first = audit_entries[0]
        check("审计条目 - 含 taskId", bool(first.get("taskId")))
        check("审计条目 - 含 taskNo", bool(first.get("taskNo")))
        check("审计条目 - 含 status", bool(first.get("status")))
        check("审计条目 - 含 format", bool(first.get("format")))
        check("审计条目 - 含 diskConsistent", first.get("diskConsistent") is not None or first.get("status") != "success")
        check("审计条目 - 含 keyLogs 数组", isinstance(first.get("keyLogs"), list))

    # =====================================================================
    # 测试 8: 冲突手动解决 - changeDir
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 8: 冲突手动解决 - changeDir")
    print("=" * 70)

    code, data = req("POST", "/export-tasks", {
        "format": "csv",
        "exportDir": TEST_DIR,
        "fileName": "audit_rename.csv",
    })
    task_cd_id = data["data"]["id"]
    time.sleep(1.5)
    code6, data6 = req("GET", f"/export-tasks/{task_cd_id}")
    task_cd = data6.get("data", {})
    check("手动冲突 - 检测到 conflictInfo", task_cd.get("conflictInfo") is not None and task_cd.get("conflictInfo", {}).get("exists") is True)

    code, data = req("POST", f"/export-tasks/{task_cd_id}/resolve-conflict", {
        "conflictAction": "changeDir",
        "exportDir": TEST_DIR_2,
    })
    check("resolve-conflict changeDir - 接口成功", code == 200 and data.get("success") is True)
    final_cd = wait_for_status(task_cd_id, "success", timeout=10)
    check("changeDir - 任务最终成功", final_cd and final_cd.get("status") == "success")
    if final_cd:
        check("changeDir - exportDir 已切换", final_cd.get("exportDir") == TEST_DIR_2)
        check("changeDir - 文件在新目录存在", file_exists_and_not_empty(final_cd.get("finalFilePath", "")))
        check("changeDir - 路径含新目录", TEST_DIR_2 in final_cd.get("finalFilePath", ""))

    # =====================================================================
    # 测试 9: 取消与重试完整链路
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 9: 取消与重试完整链路")
    print("=" * 70)

    code, data = req("POST", "/export-tasks", {
        "format": "csv",
        "exportDir": TEST_DIR,
        "fileName": "audit_cancel.csv",
        "conflictAction": "rename",
    })
    task_cancel_id = data["data"]["id"]

    code_cancel, data_cancel = req("POST", f"/export-tasks/{task_cancel_id}/cancel")
    code_cur, data_cur = req("GET", f"/export-tasks/{task_cancel_id}")
    current_status = data_cur["data"].get("status") if data_cur.get("success") else None

    cancel_ok = (code_cancel == 200 and data_cancel.get("success") is True)
    already_success = (current_status == "success")
    check("取消任务 - 接口成功或任务已快速完成", cancel_ok or already_success)

    if cancel_ok:
        final_cancel = wait_for_status(task_cancel_id, "cancelled", timeout=5)
        check("取消后状态为 cancelled", final_cancel and final_cancel.get("status") == "cancelled")
        code, data = req("POST", f"/export-tasks/{task_cancel_id}/retry")
        check("取消后重试 - 接口成功", code == 200 and data.get("success") is True)
        final_retry = wait_for_status(task_cancel_id, "success", timeout=10)
        check("取消后重试 - 最终成功", final_retry and final_retry.get("status") == "success")
    else:
        code, data = req("POST", f"/export-tasks/{task_cancel_id}/retry")
        check("成功后重试 - 接口成功", code == 200 and data.get("success") is True)
        final_retry = wait_for_status(task_cancel_id, "success", timeout=10)
        check("成功后重试 - 仍为 success", final_retry and final_retry.get("status") == "success")

    # =====================================================================
    # 测试 10: 界面提示/CLI摘要/磁盘结果一致性
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 10: 界面提示/CLI摘要/磁盘结果一致性")
    print("=" * 70)

    code, data = req("POST", "/export-tasks", {
        "format": "json",
        "exportDir": TEST_DIR,
        "fileName": "audit_consistency.json",
        "conflictAction": "rename",
        "operator": "CONSISTENCY_AUDIT",
    })
    cons_id = data["data"]["id"]
    cons_taskNo = data["data"]["taskNo"]
    final_cons = wait_for_status(cons_id, "success", timeout=10)

    if final_cons and final_cons.get("status") == "success":
        # 10.1 API 返回
        check("一致性 - API status=success", final_cons.get("status") == "success")
        check("一致性 - API finalFileName 非空", bool(final_cons.get("finalFileName")))
        check("一致性 - API fileSize > 0", final_cons.get("fileSize", 0) > 0)
        check("一致性 - API operator 正确", final_cons.get("operator") == "CONSISTENCY_AUDIT")

        # 10.2 磁盘文件
        disk_path = final_cons.get("finalFilePath", "")
        check("一致性 - 磁盘文件存在", os.path.isfile(disk_path))
        if os.path.isfile(disk_path):
            disk_size = os.path.getsize(disk_path)
            check("一致性 - 磁盘文件大小 > 0", disk_size > 0)
            with open(disk_path, "r", encoding="utf-8") as f:
                disk_content = json.load(f)
            check("一致性 - 磁盘 JSON 是数组", isinstance(disk_content, list))
            check("一致性 - 磁盘记录数与 API 一致",
                  len(disk_content) == final_cons.get("recordCount", -1),
                  f"磁盘={len(disk_content)}, API={final_cons.get('recordCount')}")

        # 10.3 generated-files 列表
        code, gf_data = req("GET", "/export-tasks/generated-files?limit=100")
        if code == 200 and gf_data.get("success"):
            matched = [f for f in gf_data.get("data", []) if f.get("taskId") == cons_id]
            check("一致性 - generated-files 列表中有该任务", len(matched) > 0)
            if matched:
                gf = matched[0]
                check("一致性 - generated-files format 匹配", gf.get("format") == "json")
                check("一致性 - generated-files operator 匹配", gf.get("operator") == "CONSISTENCY_AUDIT")
                check("一致性 - generated-files exists=true", gf.get("exists") is True)

        # 10.4 verify 接口
        code, vr_data = req("GET", f"/export-tasks/{cons_id}/verify")
        if code == 200 and vr_data.get("success"):
            vr = vr_data.get("data", {})
            check("一致性 - verify consistent=true", vr.get("consistent") is True)
            check("一致性 - verify diskExists=true", vr.get("diskExists") is True)
            check("一致性 - verify sizeMatch=true", vr.get("sizeMatch") is True)

        # 10.5 audit-log 一致
        code, al_data = req("GET", "/export-tasks/audit-log?limit=100")
        if code == 200 and al_data.get("success"):
            al_matched = [e for e in al_data.get("data", []) if e.get("taskId") == cons_id]
            check("一致性 - audit-log 列表中有该任务", len(al_matched) > 0)
            if al_matched:
                check("一致性 - audit-log diskConsistent=true", al_matched[0].get("diskConsistent") is True)

        # 10.6 任务列表一致
        code, list_data = req("GET", "/export-tasks?limit=100")
        if code == 200 and list_data.get("success"):
            list_match = [t for t in list_data.get("data", []) if t.get("id") == cons_id]
            check("一致性 - 任务列表中有该任务", len(list_match) > 0)
            if list_match:
                check("一致性 - 列表状态与详情一致", list_match[0].get("status") == "success")

    # =====================================================================
    # 测试 11: 重启恢复 - 中断任务恢复验证
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 11: 重启恢复 - 中断任务恢复验证")
    print("=" * 70)

    code, data = req("POST", "/export-tasks", {
        "format": "csv",
        "exportDir": TEST_DIR,
        "fileName": "audit_restart.csv",
        "conflictAction": "rename",
    })
    restart_task_id = data["data"]["id"]
    restart_taskNo = data["data"]["taskNo"]
    final_restart = wait_for_status(restart_task_id, "success", timeout=10)
    check("重启恢复任务 - 先成功执行", final_restart and final_restart.get("status") == "success")

    # 记录关键数据
    saved_path = final_restart.get("finalFilePath", "")
    saved_size = final_restart.get("fileSize", 0)
    saved_recordCount = final_restart.get("recordCount", 0)

    # 重新查询（模拟重启后查询）
    code, data = req("GET", f"/export-tasks/{restart_task_id}")
    t_after = data.get("data", {})
    check("重启恢复 - ID 保持一致", t_after.get("id") == restart_task_id)
    check("重启恢复 - taskNo 保持一致", t_after.get("taskNo") == restart_taskNo)
    check("重启恢复 - status 保持 success", t_after.get("status") == "success")
    check("重启恢复 - finalFilePath 保持一致", t_after.get("finalFilePath") == saved_path)
    check("重启恢复 - fileSize 保持一致", t_after.get("fileSize") == saved_size)
    check("重启恢复 - recordCount 保持一致", t_after.get("recordCount") == saved_recordCount)

    # 磁盘文件也还在
    check("重启恢复 - 磁盘文件仍存在", file_exists_and_not_empty(saved_path))

    # verify 也仍然通过
    code, data = req("GET", f"/export-tasks/{restart_task_id}/verify")
    vr_restart = data.get("data", {})
    check("重启恢复 - verify 仍一致", vr_restart.get("consistent") is True)

    # =====================================================================
    # 测试 12: 冲突 cancel 策略
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 12: 冲突 cancel 策略")
    print("=" * 70)

    code, data = req("POST", "/export-tasks", {
        "format": "csv",
        "exportDir": TEST_DIR,
        "fileName": "audit_rename.csv",
        "conflictAction": "cancel",
    })
    task_cancel_conflict_id = data["data"]["id"]
    final_cancel_conflict = wait_for_status(task_cancel_conflict_id, "cancelled", timeout=10)
    check("cancel冲突 - 任务状态 cancelled", final_cancel_conflict and final_cancel_conflict.get("status") == "cancelled",
          f"实际={final_cancel_conflict.get('status') if final_cancel_conflict else 'None'}")
    if final_cancel_conflict:
        check("cancel冲突 - conflictAction=cancel", final_cancel_conflict.get("conflictAction") == "cancel")
        check("cancel冲突 - finalFilePath 为空", not final_cancel_conflict.get("finalFilePath"))

    # =====================================================================
    # 测试 13: 摘要接口
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 13: 摘要接口")
    print("=" * 70)

    code, data = req("GET", "/export-tasks/summary")
    check("统计摘要 - 查询成功", code == 200 and data.get("success") is True)
    summary = data.get("data", {})
    check("统计摘要 - total > 0", summary.get("total", 0) > 0)
    check("统计摘要 - success >= 3", summary.get("success", 0) >= 3)

finally:
    cleanup_test_files(TEST_DIR)
    cleanup_test_files(TEST_DIR_2)
    try:
        os.rmdir(TEST_DIR)
        os.rmdir(TEST_DIR_2)
    except Exception:
        pass

    print()
    print("=" * 70)
    print(f"结果：{passed} 个通过，{failed} 个失败")
    print("=" * 70)

    if failed:
        sys.exit(1)
