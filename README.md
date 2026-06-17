# 抄表异常复核台

一个完整的抄表数据异常检测与复核管理系统，包含数据导入、规则配置、异常复核、报告导出等完整功能链。

## 功能模块

- **交付自检**：系统启动前的环境检查，确保配置、接口、样例文件、导出目录全部正常
- **功能演练**：一键式最短操作链演练，覆盖核心业务流程
- **批次导入**：支持 CSV 格式抄表数据批量导入，自动检测异常
- **规则配置**：灵活的异常检测规则配置，支持参数调整和版本管理
- **异常复核**：人工改判、关闭、重开等完整复核流程
- **复核报告**：多维度统计分析与报告导出（CSV/JSON）

## 快速开始

### 环境要求

- Node.js >= 18
- Python >= 3.7（用于运行回归测试）

### 安装依赖

```bash
npm install
```

### 启动方式

#### 方式一：GUI 模式（推荐，同时启动前端和后端）

```bash
npm run dev
```

启动后访问：http://localhost:5173

#### 方式二：仅启动后端 API（CLI 模式）

```bash
npm run server:dev
```

后端 API 服务地址：http://localhost:3001

#### 方式三：生产构建

```bash
npm run build
npm run preview
```

## 最短操作链（演练流程）

进入首页「交付自检与演练」页面，按照以下步骤完成完整流程演练：

### 第一步：运行交付自检

点击「运行自检」按钮，系统自动检查以下四项：

| 检查项 | 检查内容 | 失败处理 |
|--------|----------|----------|
| 配置检查 | 数据库文件存在、默认规则已加载 | 检查 `data/meter-review.db` 是否存在，重启服务自动重建 |
| 接口检查 | API 服务可访问、数据查询正常 | 确认后端服务已启动，端口 3001 未被占用 |
| 样例文件检查 | `test-data.csv` 存在且格式正确 | 确认项目根目录下存在样例文件，表头包含 `meterNo` |
| 导出目录检查 | 目录可写、无重名冲突 | 清理同名导出文件或更换文件名 |

**自检结果持久化**：重启应用后仍可查看最近一次检查时间、结果、失败摘要和关键日志。

### 第二步：开始功能演练

自检全部通过后，点击「开始演练」按钮，依次执行以下四步：

#### 1. 样例导入
点击「导入样例」，系统自动导入 `test-data.csv` 样例文件并检测异常。
- 预期结果：成功导入 8 条有效数据，检出 6 条异常

#### 2. 人工改判
点击「执行改判」，系统自动对第一条待复核异常进行改判操作。
- 预期结果：异常状态从 `pending` 变为 `confirmed`，记录改判原因和备注

#### 3. 关闭再重开
点击「关闭重开」，系统自动关闭已改判异常后重新打开。
- 预期结果：状态流转为 `confirmed` → `closed` → `confirmed`，每次操作均留痕

#### 4. 导出报告
点击「导出报告」，系统自动导出 CSV 和 JSON 格式的复核报告。
- 预期结果：下载 `drill_report.csv` 和 `drill_report.json` 两个文件

### 第三步：生成演练摘要

所有步骤完成后，点击「完成演练，生成摘要」，系统将保存本次演练的完整记录，包括：
- 开始/完成时间、总耗时
- 每步执行时间和结果
- 检出异常数、导出文件名
- 操作人信息

**演练摘要可回看**：在「演练历史」表格中点击「查看摘要」可随时回看历史演练记录。

## 完整操作指南

### 1. 交付自检与演练

**入口**：首页（/）

**功能**：
- 运行环境自检，查看检查详情和关键日志
- 执行功能演练，自动完成核心流程
- 查看历史演练记录和摘要
- 查看真实启动步骤和必跑检查项说明

### 2. 批次导入

**入口**：左侧导航「批次导入」（/import）

**操作**：
1. 拖拽或点击选择 CSV 文件
2. 点击「开始导入」
3. 查看导入结果（有效行数、错误行、异常数）

**CSV 格式要求**：
```csv
meterNo,meterName,prevReading,currReading,usage,readDate
M001,张三,100,200,100,2026-06-01
M002,李四,50,500,450,2026-06-01
```

### 3. 规则配置

**入口**：左侧导航「规则配置」（/rules）

**支持的规则类型**：
| 类型 | 含义 | 可调参数 |
|------|------|----------|
| 读数突增 spike | 当期用量 > 上期用量 × multiplier | multiplier（倍数） |
| 读数为负 negative | currReading < 0 | 无 |
| 读数回退 rollback | currReading < prevReading | 无 |
| 用量超限 overlimit | usage > limit | limit（阈值） |
| 空值检测 null_value | currReading 为空或无法解析 | 无 |

### 4. 异常复核

**入口**：左侧导航「异常复核」（/review）

**操作**：
1. 按批次、规则、状态、表号筛选异常
2. 对待复核异常点击「改判」
3. 选择判定结果（确认异常/误报），可变更异常类别
4. 填写原因和备注，提交改判
5. 已改判异常可「关闭」，已关闭异常可「重开」

### 5. 复核报告

**入口**：左侧导航「复核报告」（/report）

**功能**：
- 查看异常统计卡片（总数、待复核、已改判、已关闭）
- 查看异常类型分布饼图和批次异常分布柱图
- 导出 CSV 或 JSON 格式报告

## 项目结构

```
.
├── api/                    # 后端 API
│   ├── routes/            # API 路由
│   │   ├── check.ts       # 自检相关接口
│   │   ├── drill.ts       # 演练相关接口
│   │   ├── anomalies.ts   # 异常相关接口
│   │   ├── batches.ts     # 批次相关接口
│   │   ├── rules.ts       # 规则相关接口
│   │   └── report.ts      # 报告相关接口
│   ├── app.ts             # Express 应用配置
│   ├── server.ts          # 服务器启动入口
│   ├── db.ts              # 数据库初始化
│   └── rule-engine.ts     # 异常检测规则引擎
├── src/                   # 前端源码
│   ├── pages/             # 页面组件
│   │   ├── Checklist.tsx  # 交付自检与演练（首页）
│   │   ├── BatchImport.tsx
│   │   ├── RuleConfig.tsx
│   │   ├── AnomalyReview.tsx
│   │   └── Report.tsx
│   ├── stores/            # 状态管理（Zustand）
│   ├── shared/            # 共享类型定义
│   ├── components/        # 公共组件
│   └── App.tsx            # 应用入口
├── data/                  # 数据库文件目录
│   └── meter-review.db    # SQLite 数据库
├── test-data.csv          # 样例数据文件
├── regression_tests.py    # 回归测试脚本
├── test_restart_consistency.py  # 重启一致性测试
└── package.json
```

## API 接口

### 自检相关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/check/latest | 获取最近一次自检记录 |
| GET | /api/check/history | 获取自检历史（最近 20 条） |
| POST | /api/check/run | 执行自检并保存结果 |

### 演练相关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/drill/summaries | 获取演练摘要列表 |
| GET | /api/drill/summaries/:id | 获取单个演练摘要详情 |
| POST | /api/drill/complete | 完成演练并保存摘要 |

### 其他接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/health | 健康检查 |
| POST | /api/batches/import | 导入批次数据 |
| GET | /api/batches | 获取批次列表 |
| GET | /api/anomalies | 获取异常列表 |
| POST | /api/anomalies/:id/judge | 改判异常 |
| POST | /api/anomalies/:id/close | 关闭异常 |
| POST | /api/anomalies/:id/reopen | 重开异常 |
| GET | /api/report/summary | 获取报告统计 |
| GET | /api/report/export | 导出报告 |

## 数据持久化

- 数据库：SQLite（`data/meter-review.db`）
- 重启应用后保留：
  - 所有批次、读数、异常记录
  - 所有规则版本和配置
  - 所有改判/关闭/重开的判定历史
  - **自检记录**（最近一次检查时间、结果、失败摘要、关键日志）
  - **演练摘要**（所有历史演练记录）

**清理测试数据**：停止服务后删除 `data/meter-review.db`，重启即自动重建含默认规则的全新库。

## 测试验证

### 前端类型检查

```bash
npm run check
```

### 生产构建

```bash
npm run build
```

### 代码检查

```bash
npm run lint
```

### 回归测试

确保服务已启动（`npm run dev`），然后运行：

```bash
# 核心功能回归测试（21 项断言）
python regression_tests.py

# 重启一致性测试
python test_restart_consistency.py

# 全新环境完整演练测试
python regression_tests.py --fresh
```

## 常见问题

### Q: 自检提示「样例文件缺失」
A: 确认项目根目录下存在 `test-data.csv` 文件，可从 `test-data.csv` 恢复。

### Q: 自检提示「导出目录存在重名冲突」
A: 清理项目根目录下的 `anomalies_export.csv`、`report.csv`、`report.json` 等文件。

### Q: 演练步骤失败如何重试？
A: 点击错误提示中的「重试该步骤」，或点击「重置」按钮重新开始演练。

### Q: 数据库损坏如何恢复？
A: 删除 `data/meter-review.db` 文件，重启服务会自动重建数据库并初始化默认规则。

## License

MIT
