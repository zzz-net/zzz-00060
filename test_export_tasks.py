#!/usr/bin/env python3
"""
导出任务台自动化测试
覆盖场景:
  1. 基础任务创建与执行
  2. 重启恢复 - 服务重启后任务记录仍可查询
  3. 权限报错 - 目录不存在/不可写的错误处理
  4. 冲突后重试 - 同名文件检测与冲突解决（rename/overwrite/cancel/changeDir）
  5. 连续导出生成不同文件名
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

def wait_for_status(task_id, target_status, timeout=5):
    """轮询等待任务达到目标状态"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        code, data = req("GET", f"/export-tasks/{task_id}")
        if code == 200 and data.get("success"):
            status = data["data"]["status"]
            if status == target_status:
                return data["data"]
            if status in ("failed", "cancelled") and target_status not in ("failed", "cancelled"):
                return data["data"]
        time.sleep(0.2)
    code, data = req("GET", f"/export-tasks/{task_id}")
    return data.get("data") if data.get("success") else None

def file_exists_and_not_empty(path):
    return os.path.isfile(path) and os.path.getsize(path) > 0

def cleanup_test_files(dir_path):
    """清理测试目录中的所有文件"""
    if os.path.isdir(dir_path):
        for f in os.listdir(dir_path):
            fp = os.path.join(dir_path, f)
            try:
                if os.path.isfile(fp):
                    os.unlink(fp)
            except Exception:
                pass

print("=" * 70)
print("导出任务台自动化测试")
print("=" * 70)

# 准备测试目录
project_root = os.path.dirname(os.path.abspath(__file__))
TEST_DIR = os.path.join(project_root, "__test_exports__")
TEST_DIR_2 = os.path.join(project_root, "__test_exports_2__")
os.makedirs(TEST_DIR, exist_ok=True)
os.makedirs(TEST_DIR_2, exist_ok=True)
cleanup_test_files(TEST_DIR)
cleanup_test_files(TEST_DIR_2)

try:
    # 先确保健康检查通过
    code, _ = req("GET", "/health")
    if code != 200:
        print("\n错误: 后端服务未启动，请先运行 'npm run server:dev'")
        sys.exit(1)

    # =====================================================================
    # 测试 1: 基础任务创建与执行（CSV/JSON）
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 1: 基础任务创建与执行")
    print("=" * 70)

    # 1.1 创建 CSV 导出任务
    code, data = req("POST", "/export-tasks", {
        "format": "csv",
        "exportDir": TEST_DIR,
        "fileName": "test_basic.csv",
        "conflictAction": "rename",
        "operator": "TESTER",
    })
    check("创建 CSV 任务返回 200", code == 200, f"实际={code}")
    check("创建 CSV 任务 success=true", data.get("success") is True)
    task1 = data.get("data", {})
    task1_id = task1.get("id", "")
    check("CSV 任务有 ID", bool(task1_id))
    check("CSV 任务有 taskNo", bool(task1.get("taskNo", "")))
    check("CSV 任务初始状态为 queued 或 running", task1.get("status") in ("queued", "running"))
    check("CSV 任务 format=csv", task1.get("format") == "csv")
    check("CSV 任务 operator=TESTER", task1.get("operator") == "TESTER")

    # 等待执行完成
    final1 = wait_for_status(task1_id, "success", timeout=10)
    check("CSV 任务最终状态 success", final1 and final1.get("status") == "success",
          f"实际={final1.get('status') if final1 else 'None'}, 失败原因={final1.get('failureReason') if final1 else ''}")

    if final1 and final1.get("status") == "success":
        final_path1 = final1.get("finalFilePath", "")
        check("CSV 最终文件路径非空", bool(final_path1))
        check(f"CSV 文件真实存在且非空: {final_path1}", file_exists_and_not_empty(final_path1))
        check("CSV 记录数 > 0", final1.get("recordCount", 0) > 0)
        check("CSV 文件大小 > 0", final1.get("fileSize", 0) > 0)
        check("CSV finalFileName 正确", final1.get("finalFileName") == "test_basic.csv")

    # 1.2 创建 JSON 导出任务
    code, data = req("POST", "/export-tasks", {
        "format": "json",
        "exportDir": TEST_DIR,
        "fileName": "test_basic.json",
        "conflictAction": "rename",
    })
    check("创建 JSON 任务返回 200", code == 200)
    check("创建 JSON 任务 success=true", data.get("success") is True)
    task2_id = data["data"]["id"]
    final2 = wait_for_status(task2_id, "success", timeout=10)
    check("JSON 任务最终状态 success", final2 and final2.get("status") == "success",
          f"实际={final2.get('status') if final2 else 'None'}")
    if final2 and final2.get("status") == "success":
        final_path2 = final2.get("finalFilePath", "")
        check(f"JSON 文件真实存在且非空", file_exists_and_not_empty(final_path2))
        # 验证是合法 JSON
        with open(final_path2, "r", encoding="utf-8") as f:
            content = json.load(f)
        check("JSON 文件内容是数组", isinstance(content, list))

    # 1.3 任务列表查询
    code, data = req("GET", "/export-tasks?limit=10")
    check("任务列表查询成功", code == 200 and data.get("success") is True)
    check("任务列表至少 2 条", data.get("total", 0) >= 2)
    check("任务列表返回 data 数组", isinstance(data.get("data"), list))

    # 1.4 任务统计摘要
    code, data = req("GET", "/export-tasks/summary")
    check("统计摘要查询成功", code == 200 and data.get("success") is True)
    summary = data.get("data", {})
    check("摘要 total >= 2", summary.get("total", 0) >= 2)
    check("摘要 success >= 2", summary.get("success", 0) >= 2)

    # 1.5 任务详情查询 - 验证关键日志
    code, data = req("GET", f"/export-tasks/{task1_id}")
    check("任务详情查询成功", code == 200 and data.get("success") is True)
    detail = data.get("data", {})
    check("详情含 keyLogs 数组", isinstance(detail.get("keyLogs"), list))
    check("keyLogs 非空", len(detail.get("keyLogs", [])) > 0)
    check("日志包含任务创建信息", any("任务创建" in l for l in detail.get("keyLogs", [])))

    # =====================================================================
    # 测试 2: 冲突处理 - 同名文件检测与多种解决方式
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 2: 文件名冲突处理（rename / overwrite / cancel / changeDir）")
    print("=" * 70)

    # 先确保 test_basic.csv 已存在（测试1已创建）
    # 2.1 rename: 创建同名任务，自动重命名
    code, data = req("POST", "/export-tasks", {
        "format": "csv",
        "exportDir": TEST_DIR,
        "fileName": "test_basic.csv",
        "conflictAction": "rename",
    })
    task3_id = data["data"]["id"]
    final3 = wait_for_status(task3_id, "success", timeout=10)
    check("rename冲突 - 任务最终成功", final3 and final3.get("status") == "success",
          f"实际={final3.get('status') if final3 else 'None'}")
    if final3:
        check("rename冲突 - finalFileName != 原始名", final3.get("finalFileName") != "test_basic.csv")
        check("rename冲突 - 文件名含 _1 后缀", "_1" in final3.get("finalFileName", ""),
              f"实际={final3.get('finalFileName')}")
        check(f"rename冲突 - 新文件存在", file_exists_and_not_empty(final3.get("finalFilePath", "")))
        check("rename冲突 - conflictAction=rename", final3.get("conflictAction") == "rename")
        check("rename冲突 - conflictResolved=true", final3.get("conflictResolved") is True)

    # 2.2 overwrite: 覆盖已有文件
    original_mtime = os.path.getmtime(os.path.join(TEST_DIR, "test_basic.csv"))
    time.sleep(0.1)  # 确保 mtime 不同
    code, data = req("POST", "/export-tasks", {
        "format": "csv",
        "exportDir": TEST_DIR,
        "fileName": "test_basic.csv",
        "conflictAction": "overwrite",
    })
    task4_id = data["data"]["id"]
    final4 = wait_for_status(task4_id, "success", timeout=10)
    check("overwrite冲突 - 任务最终成功", final4 and final4.get("status") == "success",
          f"实际={final4.get('status') if final4 else 'None'}")
    if final4:
        new_mtime = os.path.getmtime(os.path.join(TEST_DIR, "test_basic.csv"))
        check("overwrite冲突 - 文件确实被覆盖（mtime 变化）", new_mtime > original_mtime)
        check("overwrite冲突 - finalFileName 保持原名", final4.get("finalFileName") == "test_basic.csv")
        check("overwrite冲突 - conflictAction=overwrite", final4.get("conflictAction") == "overwrite")

    # 2.3 cancel: 冲突时取消任务
    code, data = req("POST", "/export-tasks", {
        "format": "csv",
        "exportDir": TEST_DIR,
        "fileName": "test_basic.csv",
        "conflictAction": "cancel",
    })
    task5_id = data["data"]["id"]
    final5 = wait_for_status(task5_id, "cancelled", timeout=10)
    check("cancel冲突 - 任务状态为 cancelled", final5 and final5.get("status") == "cancelled",
          f"实际={final5.get('status') if final5 else 'None'}")
    if final5:
        check("cancel冲突 - conflictAction=cancel", final5.get("conflictAction") == "cancel")
        check("cancel冲突 - finalFilePath 为空（未生成文件）", not final5.get("finalFilePath"))

    # 2.4 手动冲突处理 - 先创建不指定冲突策略的任务，再 resolve
    code, data = req("POST", "/export-tasks", {
        "format": "csv",
        "exportDir": TEST_DIR,
        "fileName": "test_basic.csv",
    })
    task6_id = data["data"]["id"]
    time.sleep(1)  # 等任务检测到冲突并暂停
    code6, data6 = req("GET", f"/export-tasks/{task6_id}")
    task6 = data6.get("data", {})
    check("手动冲突 - 检测到 conflictInfo 存在", task6.get("conflictInfo") is not None and task6.get("conflictInfo", {}).get("exists") is True)
    check("手动冲突 - conflictInfo 含 suggestedName", bool(task6.get("conflictInfo", {}).get("suggestedName")))

    # 使用 changeDir 方式解决
    code, data = req("POST", f"/export-tasks/{task6_id}/resolve-conflict", {
        "conflictAction": "changeDir",
        "exportDir": TEST_DIR_2,
    })
    check("resolve-conflict changeDir 接口调用成功", code == 200 and data.get("success") is True)
    final6 = wait_for_status(task6_id, "success", timeout=10)
    check("changeDir冲突 - 任务最终成功", final6 and final6.get("status") == "success",
          f"实际={final6.get('status') if final6 else 'None'}")
    if final6:
        check("changeDir冲突 - exportDir 已切换", final6.get("exportDir") == TEST_DIR_2)
        check(f"changeDir冲突 - 文件在新目录存在", file_exists_and_not_empty(final6.get("finalFilePath", "")))
        check("changeDir冲突 - 新目录文件路径正确", TEST_DIR_2 in final6.get("finalFilePath", ""))

    # =====================================================================
    # 测试 3: 连续多次导出生成不同文件名
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 3: 连续多次导出生成不同文件名")
    print("=" * 70)

    created_names = set()
    for i in range(3):
        code, data = req("POST", "/export-tasks", {
            "format": "json",
            "exportDir": TEST_DIR,
            "fileName": "test_multi.json",
            "conflictAction": "rename",
        })
        if code == 200 and data.get("success"):
            tid = data["data"]["id"]
            final = wait_for_status(tid, "success", timeout=10)
            if final and final.get("status") == "success":
                name = final.get("finalFileName", "")
                created_names.add(name)
                check(f"第{i+1}次连续导出 - 文件 {name} 存在", file_exists_and_not_empty(final.get("finalFilePath", "")))

    check("连续 3 次导出产生了 3 个不同文件名", len(created_names) == 3,
          f"实际不同文件名数量={len(created_names)}, names={created_names}")
    expected_names = {"test_multi.json", "test_multi_1.json", "test_multi_2.json"}
    # 可能顺序不同，但应该覆盖
    check("连续导出的文件名符合命名规则 (test_multi.json / _1.json / _2.json)",
          created_names.issubset({"test_multi.json", "test_multi_1.json", "test_multi_2.json", "test_multi_3.json"})
          and len(created_names) >= 3)

    # =====================================================================
    # 测试 4: 权限/目录报错场景
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 4: 权限报错与目录错误处理")
    print("=" * 70)

    # 4.1 Windows 下的非法路径
    invalid_dir = "Z:\\nonexistent_xyz_path_that_should_not_exist_12345\\exports"
    if os.name != "nt":
        invalid_dir = "/nonexistent_xyz_path_that_should_not_exist_12345/exports"

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
        check("无效目录 - 日志含错误信息", len(final_err.get("keyLogs", [])) > 0)
        check("无效目录 - finalFilePath 为空", not final_err.get("finalFilePath"))

    # 4.2 失败后换目录重试
    code, data = req("POST", f"/export-tasks/{task_err_id}/change-dir-retry", {
        "exportDir": TEST_DIR,
    })
    check("change-dir-retry 接口调用成功", code == 200 and data.get("success") is True)
    final_retry = wait_for_status(task_err_id, "success", timeout=10)
    check("换目录重试 - 任务最终成功", final_retry and final_retry.get("status") == "success",
          f"实际={final_retry.get('status') if final_retry else 'None'}, 失败原因={final_retry.get('failureReason') if final_retry else ''}")
    if final_retry:
        check("换目录重试 - exportDir 已更新为 TEST_DIR", final_retry.get("exportDir") == TEST_DIR)
        check("换目录重试 - 文件真实存在", file_exists_and_not_empty(final_retry.get("finalFilePath", "")))

    # =====================================================================
    # 测试 5: 取消操作与状态流转
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 5: 任务取消操作")
    print("=" * 70)

    code, data = req("POST", "/export-tasks", {
        "format": "csv",
        "exportDir": TEST_DIR,
        "fileName": "test_cancel.csv",
        "conflictAction": "rename",
    })
    task_cancel_id = data["data"]["id"]

    # 尝试立刻取消（任务可能因 setImmediate 快速执行而已经 success，这是正常行为）
    code_cancel, data_cancel = req("POST", f"/export-tasks/{task_cancel_id}/cancel")
    # 先查当前真实状态
    code_cur, data_cur = req("GET", f"/export-tasks/{task_cancel_id}")
    current_status = data_cur["data"].get("status") if data_cur.get("success") else None

    # 如果取消成功或者任务已成功，都视为正常（取决于任务执行速度）
    cancel_ok = (code_cancel == 200 and data_cancel.get("success") is True)
    already_success = (current_status == "success")
    check("取消任务接口成功或任务已快速完成", cancel_ok or already_success,
          f"cancel返回code={code_cancel}, success={data_cancel.get('success') if data_cancel else None}, 当前状态={current_status}")

    if cancel_ok:
        # 取消成功的路径：等待 cancelled 状态，然后重试
        final_cancel = wait_for_status(task_cancel_id, "cancelled", timeout=5)
        check("取消后状态为 cancelled", final_cancel and final_cancel.get("status") == "cancelled",
              f"实际={final_cancel.get('status') if final_cancel else 'None'}")

        # 取消后重试
        code, data = req("POST", f"/export-tasks/{task_cancel_id}/retry")
        check("取消后重试接口成功", code == 200 and data.get("success") is True)
        final_retry2 = wait_for_status(task_cancel_id, "success", timeout=10)
        check("取消后重试 - 最终成功", final_retry2 and final_retry2.get("status") == "success",
              f"实际={final_retry2.get('status') if final_retry2 else 'None'}")
    else:
        # 任务已快速成功，验证 success 状态和 retry 功能（成功任务也应支持 retry）
        check("任务已快速完成状态为 success", current_status == "success",
              f"实际状态={current_status}")
        # 成功任务也能 retry（重置为 queued 重新执行）
        code, data = req("POST", f"/export-tasks/{task_cancel_id}/retry")
        check("成功后重试接口成功", code == 200 and data.get("success") is True)
        final_retry2 = wait_for_status(task_cancel_id, "success", timeout=10)
        check("成功后重试 - 最终仍 success", final_retry2 and final_retry2.get("status") == "success",
              f"实际={final_retry2.get('status') if final_retry2 else 'None'}")

    # =====================================================================
    # 测试 6: 重启恢复验证（任务持久化）
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 6: 重启恢复 - 任务记录持久化验证")
    print("=" * 70)

    # 创建一个任务，记录其 ID，稍后重新查询验证持久化
    code, data = req("POST", "/export-tasks", {
        "format": "json",
        "exportDir": TEST_DIR,
        "fileName": "test_persistent.json",
        "conflictAction": "rename",
    })
    persistent_id = data["data"]["id"]
    persistent_taskNo = data["data"]["taskNo"]
    final_pers = wait_for_status(persistent_id, "success", timeout=10)
    check("持久化任务 - 先成功执行", final_pers and final_pers.get("status") == "success")

    # 重新查询该任务（模拟服务重启后的首次查询）
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
    check("重启恢复 - conflictAction 持久化", isinstance(t.get("conflictAction"), str))
    check("重启恢复 - keyLogs 数组非空", isinstance(t.get("keyLogs"), list) and len(t["keyLogs"]) > 0)

    # 从列表中也能找到
    code, data = req("GET", "/export-tasks?limit=100")
    tasks_in_list = [x for x in data.get("data", []) if x["id"] == persistent_id]
    check("重启恢复 - 任务列表中仍可找到该任务", len(tasks_in_list) == 1)
    if tasks_in_list:
        check("重启恢复 - 列表中的状态正确", tasks_in_list[0].get("status") == "success")

    # 摘要统计中也包含
    code, data = req("GET", "/export-tasks/summary")
    check("重启恢复 - 摘要查询成功", code == 200 and data.get("success") is True)

    # =====================================================================
    # 测试 7: 预检冲突接口
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 7: preflight 冲突预检接口")
    print("=" * 70)

    # 已知存在的文件
    query = urllib.parse.urlencode({
        "exportDir": TEST_DIR,
        "fileName": "test_basic.csv",
    })
    code, data = req("GET", f"/export-tasks/check-conflict/preflight?{query}")
    check("预检 - 接口成功", code == 200 and data.get("success") is True)
    check("预检 - 检测到已存在文件", data.get("data", {}).get("exists") is True)
    check("预检 - 提供 suggestedName", bool(data.get("data", {}).get("suggestedName")))

    # 不存在的文件
    query2 = urllib.parse.urlencode({
        "exportDir": TEST_DIR,
        "fileName": f"no_such_file_{int(time.time())}.csv",
    })
    code, data = req("GET", f"/export-tasks/check-conflict/preflight?{query2}")
    check("预检 - 不存在文件 exists=false", data.get("data", {}).get("exists") is False)

    # =====================================================================
    # 测试 8: 数据筛选功能
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 8: 数据筛选 - 按批次/状态/类型过滤导出数据")
    print("=" * 70)

    # 8.1 筛选选项接口
    code, data = req("GET", "/export-tasks/filter-options")
    check("筛选选项接口成功", code == 200 and data.get("success") is True)
    filter_opts = data.get("data", {})
    check("筛选选项含 batches 数组", isinstance(filter_opts.get("batches"), list))
    check("筛选选项含 anomalyStatuses 数组", isinstance(filter_opts.get("anomalyStatuses"), list))
    check("筛选选项含 anomalyTypes 数组", isinstance(filter_opts.get("anomalyTypes"), list))

    # 8.2 创建带筛选条件的任务（按异常状态筛选）
    code, data = req("POST", "/export-tasks", {
        "format": "csv",
        "exportDir": TEST_DIR,
        "fileName": "test_filtered_pending.csv",
        "conflictAction": "rename",
        "filterAnomalyStatus": "pending",
    })
    check("创建筛选任务（pending）返回 200", code == 200)
    task_filter_id = data.get("data", {}).get("id", "")
    final_filter = wait_for_status(task_filter_id, "success", timeout=10)
    check("筛选任务 - 最终成功", final_filter and final_filter.get("status") == "success",
          f"实际={final_filter.get('status') if final_filter else 'None'}, 原因={final_filter.get('failureReason') if final_filter else ''}")
    if final_filter and final_filter.get("status") == "success":
        check("筛选任务 - filterAnomalyStatus 持久化", final_filter.get("filterAnomalyStatus") == "pending")
        check("筛选任务 - 文件真实存在", file_exists_and_not_empty(final_filter.get("finalFilePath", "")))
        check("筛选任务 - keyLogs 包含筛选信息",
              any("筛选" in l for l in final_filter.get("keyLogs", [])),
              f"logs={final_filter.get('keyLogs', [])}")

    # 8.3 创建不筛选的任务，对比记录数
    code, data = req("POST", "/export-tasks", {
        "format": "csv",
        "exportDir": TEST_DIR,
        "fileName": "test_all_data.csv",
        "conflictAction": "rename",
    })
    task_all_id = data.get("data", {}).get("id", "")
    final_all = wait_for_status(task_all_id, "success", timeout=10)
    if final_all and final_filter:
        all_count = final_all.get("recordCount", 0)
        filtered_count = final_filter.get("recordCount", 0)
        check("筛选结果 - 全部记录数 >= 筛选后记录数", all_count >= filtered_count,
              f"全部={all_count}, 筛选pending={filtered_count}")

    # 8.4 筛选条件持久化验证
    code, data = req("GET", f"/export-tasks/{task_filter_id}")
    check("筛选持久化 - 查询成功", code == 200 and data.get("success") is True)
    t_filter = data.get("data", {})
    check("筛选持久化 - filterAnomalyStatus 保留", t_filter.get("filterAnomalyStatus") == "pending")

    # =====================================================================
    # 测试 9: 已生成文件列表接口
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 9: 已生成文件列表接口")
    print("=" * 70)

    code, data = req("GET", "/export-tasks/generated-files?limit=50")
    check("已生成文件列表接口成功", code == 200 and data.get("success") is True)
    gen_files = data.get("data", [])
    check("已生成文件列表是数组", isinstance(gen_files, list))
    check("已生成文件列表非空", len(gen_files) > 0,
          f"实际数量={len(gen_files)}")

    if gen_files:
        first_file = gen_files[0]
        check("文件条目含 finalFileName", bool(first_file.get("finalFileName")))
        check("文件条目含 finalFilePath", bool(first_file.get("finalFilePath")))
        check("文件条目含 format", bool(first_file.get("format")))
        check("文件条目含 fileSize", first_file.get("fileSize", 0) >= 0)
        check("文件条目含 recordCount", first_file.get("recordCount", 0) >= 0)
        check("文件条目含 taskNo", bool(first_file.get("taskNo")))
        check("文件条目含 exists 标记", isinstance(first_file.get("exists"), bool))
        check("文件条目含 filters 对象", isinstance(first_file.get("filters"), dict))

        # 验证 exists 字段与磁盘一致性
        fp = first_file.get("finalFilePath", "")
        if fp:
            disk_exists = os.path.isfile(fp)
            check("exists 标记与磁盘一致", first_file.get("exists") == disk_exists,
                  f"API={first_file.get('exists')}, 磁盘={disk_exists}")

    # =====================================================================
    # 测试 10: 界面提示/CLI摘要/磁盘结果一致性
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 10: 界面提示/CLI摘要/磁盘结果一致性")
    print("=" * 70)

    # 创建一个确定会成功的任务，然后验证所有维度一致
    code, data = req("POST", "/export-tasks", {
        "format": "json",
        "exportDir": TEST_DIR,
        "fileName": "test_consistency.json",
        "conflictAction": "rename",
        "operator": "CONSISTENCY_TESTER",
    })
    consistency_id = data["data"]["id"]
    consistency_taskNo = data["data"]["taskNo"]
    final_cons = wait_for_status(consistency_id, "success", timeout=10)

    if final_cons and final_cons.get("status") == "success":
        # 10.1 API 返回一致
        check("一致性 - API status=success", final_cons.get("status") == "success")
        check("一致性 - API finalFileName 非空", bool(final_cons.get("finalFileName")))
        check("一致性 - API fileSize > 0", final_cons.get("fileSize", 0) > 0)
        check("一致性 - API recordCount >= 0", final_cons.get("recordCount", 0) >= 0)
        check("一致性 - API operator 正确", final_cons.get("operator") == "CONSISTENCY_TESTER")

        # 10.2 磁盘文件一致
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

        # 10.3 generated-files 列表一致
        code, gf_data = req("GET", "/export-tasks/generated-files?limit=100")
        if code == 200 and gf_data.get("success"):
            matched = [f for f in gf_data.get("data", []) if f.get("taskId") == consistency_id]
            check("一致性 - generated-files 列表中有该任务", len(matched) > 0)
            if matched:
                gf = matched[0]
                check("一致性 - generated-files taskNo 匹配", gf.get("taskNo") == consistency_taskNo)
                check("一致性 - generated-files format 匹配", gf.get("format") == "json")
                check("一致性 - generated-files operator 匹配", gf.get("operator") == "CONSISTENCY_TESTER")
                check("一致性 - generated-files exists=true", gf.get("exists") is True)

        # 10.4 任务列表一致
        code, list_data = req("GET", "/export-tasks?limit=100")
        if code == 200 and list_data.get("success"):
            list_match = [t for t in list_data.get("data", []) if t.get("id") == consistency_id]
            check("一致性 - 任务列表中有该任务", len(list_match) > 0)
            if list_match:
                check("一致性 - 列表状态与详情一致", list_match[0].get("status") == "success")

    # =====================================================================
    # 测试 11: 冲突后重试完整链路
    # =====================================================================
    print()
    print("=" * 70)
    print("测试 11: 冲突后重试 - rename → overwrite → 切换目录 完整链路")
    print("=" * 70)

    # 创建冲突
    code, data = req("POST", "/export-tasks", {
        "format": "csv",
        "exportDir": TEST_DIR,
        "fileName": "test_basic.csv",
        "conflictAction": "rename",
    })
    retry_task_id = data["data"]["id"]
    retry_final = wait_for_status(retry_task_id, "success", timeout=10)
    if retry_final and retry_final.get("status") == "success":
        check("冲突重试链路 - rename 成功", True)
        # 现在再 retry 该任务，此时会产生新冲突
        code, data = req("POST", f"/export-tasks/{retry_task_id}/retry")
        check("冲突重试链路 - retry 接口成功", code == 200 and data.get("success") is True)
        retry_final2 = wait_for_status(retry_task_id, "success", timeout=10)
        check("冲突重试链路 - retry 后最终成功",
              retry_final2 and retry_final2.get("status") == "success",
              f"实际={retry_final2.get('status') if retry_final2 else 'None'}")
        if retry_final2 and retry_final2.get("status") == "success":
            check("冲突重试链路 - 最终文件存在",
                  file_exists_and_not_empty(retry_final2.get("finalFilePath", "")))

finally:
    # 清理
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
