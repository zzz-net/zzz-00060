import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dataDir = path.resolve(__dirname, '..', 'data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const dbPath = path.join(dataDir, 'meter-review.db')
const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  batchNo TEXT UNIQUE NOT NULL,
  fileName TEXT NOT NULL,
  contentHash TEXT DEFAULT '',
  totalRows INTEGER NOT NULL DEFAULT 0,
  validRows INTEGER NOT NULL DEFAULT 0,
  errorRows INTEGER NOT NULL DEFAULT 0,
  errorDetail TEXT DEFAULT '[]',
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS readings (
  id TEXT PRIMARY KEY,
  batchId TEXT NOT NULL REFERENCES batches(id),
  lineNo INTEGER NOT NULL,
  meterNo TEXT NOT NULL,
  meterName TEXT DEFAULT '',
  prevReading REAL,
  currReading REAL,
  usage REAL,
  readDate TEXT,
  UNIQUE(batchId, lineNo)
);

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('spike','negative','rollback','overlimit','null_value')),
  description TEXT DEFAULT '',
  params TEXT DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rule_versions (
  id TEXT PRIMARY KEY,
  ruleId TEXT NOT NULL REFERENCES rules(id),
  version INTEGER NOT NULL,
  params TEXT DEFAULT '{}',
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ruleId, version)
);

CREATE TABLE IF NOT EXISTS anomalies (
  id TEXT PRIMARY KEY,
  readingId TEXT NOT NULL REFERENCES readings(id),
  batchId TEXT NOT NULL REFERENCES batches(id),
  ruleId TEXT NOT NULL REFERENCES rules(id),
  ruleVersion INTEGER NOT NULL,
  anomalyType TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','false_positive','closed')),
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS judgments (
  id TEXT PRIMARY KEY,
  anomalyId TEXT NOT NULL REFERENCES anomalies(id),
  prevStatus TEXT NOT NULL,
  newStatus TEXT NOT NULL,
  result TEXT NOT NULL CHECK(result IN ('confirm','false_positive','reopen','close')),
  reason TEXT DEFAULT '',
  note TEXT DEFAULT '',
  operator TEXT DEFAULT '复核员',
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_readings_batch ON readings(batchId);
CREATE INDEX IF NOT EXISTS idx_anomalies_batch ON anomalies(batchId);
CREATE INDEX IF NOT EXISTS idx_anomalies_status ON anomalies(status);
CREATE INDEX IF NOT EXISTS idx_anomalies_rule ON anomalies(ruleId);
CREATE INDEX IF NOT EXISTS idx_judgments_anomaly ON judgments(anomalyId);
CREATE INDEX IF NOT EXISTS idx_rule_versions_rule ON rule_versions(ruleId);
`)

db.exec(`
INSERT OR IGNORE INTO rules (id, name, type, description, params, version, enabled) VALUES
  ('r1', '读数突增', 'spike', '当期用量超过上期用量的指定倍数', '{"multiplier": 3}', 1, 1),
  ('r2', '读数为负', 'negative', '当前读数为负数', '{}', 1, 1),
  ('r3', '读数回退', 'rollback', '当前读数小于上期读数', '{}', 1, 1),
  ('r4', '用量超限', 'overlimit', '当期用量超过指定阈值', '{"limit": 9999}', 1, 1),
  ('r5', '空值检测', 'null_value', '当前读数为空或无法解析', '{}', 1, 1);

INSERT OR IGNORE INTO rule_versions (id, ruleId, version, params) VALUES
  ('rv1', 'r1', 1, '{"multiplier": 3}'),
  ('rv2', 'r2', 1, '{}'),
  ('rv3', 'r3', 1, '{}'),
  ('rv4', 'r4', 1, '{"limit": 9999}'),
  ('rv5', 'r5', 1, '{}');
`)

const cols = db.prepare("PRAGMA table_info(batches)").all() as any[]
if (!cols.find(c => c.name === 'contentHash')) {
  db.exec("ALTER TABLE batches ADD COLUMN contentHash TEXT DEFAULT ''")
}

const jcols = db.prepare("PRAGMA table_info(judgments)").all() as any[]
if (!jcols.find(c => c.name === 'prevRuleId')) {
  db.exec("ALTER TABLE judgments ADD COLUMN prevRuleId TEXT DEFAULT ''")
}
if (!jcols.find(c => c.name === 'newRuleId')) {
  db.exec("ALTER TABLE judgments ADD COLUMN newRuleId TEXT DEFAULT ''")
}

const jtable = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'judgments'").get() as any
if (jtable && !jtable.sql.includes("'close'")) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    CREATE TABLE judgments_new (
      id TEXT PRIMARY KEY,
      anomalyId TEXT NOT NULL REFERENCES anomalies(id),
      prevStatus TEXT NOT NULL,
      newStatus TEXT NOT NULL,
      result TEXT NOT NULL CHECK(result IN ('confirm','false_positive','reopen','close')),
      reason TEXT DEFAULT '',
      note TEXT DEFAULT '',
      operator TEXT DEFAULT '复核员',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      prevRuleId TEXT DEFAULT '',
      newRuleId TEXT DEFAULT ''
    );
    INSERT INTO judgments_new SELECT * FROM judgments;
    DROP TABLE judgments;
    ALTER TABLE judgments_new RENAME TO judgments;
    CREATE INDEX IF NOT EXISTS idx_judgments_anomaly ON judgments(anomalyId);
    PRAGMA foreign_keys = ON;
  `)
}

export default db
