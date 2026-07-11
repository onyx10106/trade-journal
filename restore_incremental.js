const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const BACKUP_PATH = 'D:\\Mywork\\code\\trading-journal-pro\\backups\\backup_2026-07-10T23-35-43-777Z';
const DB_PATH = path.join(__dirname, 'trading.db');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

const log = (msg, type = 'info') => {
  const prefix = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : '🔹';
  console.log(`${prefix} ${msg}`);
};

const copyFile = (src, dest) => {
  if (!fs.existsSync(path.dirname(dest))) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
  }
  fs.copyFileSync(src, dest);
};

const restoreIncremental = () => {
  log('='.repeat(60));
  log('增量恢复工具 - 仅恢复不存在的数据');
  log('='.repeat(60));
  console.log();

  const backupDataPath = path.join(BACKUP_PATH, 'data.json');
  if (!fs.existsSync(backupDataPath)) {
    log(`备份文件不存在: ${backupDataPath}`, 'error');
    process.exit(1);
  }

  let backupData;
  try {
    backupData = JSON.parse(fs.readFileSync(backupDataPath, 'utf8'));
  } catch (err) {
    log(`读取备份文件失败: ${err.message}`, 'error');
    process.exit(1);
  }

  const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      log(`打开数据库失败: ${err.message}`, 'error');
      process.exit(1);
    }

    const tables = Object.keys(backupData.tables);
    let completed = 0;
    let totalInserted = 0;

    const finish = () => {
      db.close();
      console.log();
      log('='.repeat(60));
      log(`增量恢复完成! 共插入 ${totalInserted} 条新记录`, 'success');
      log('='.repeat(60));
    };

    tables.forEach(tableName => {
      const tableData = backupData.tables[tableName];
      const rows = tableData.data || [];
      let inserted = 0;

      log(`处理表: ${tableName} (备份中 ${rows.length} 条记录)`);

      if (rows.length === 0) {
        completed++;
        if (completed >= tables.length) finish();
        return;
      }

      let processed = 0;

      rows.forEach(row => {
        const id = row.id;

        db.get(`SELECT COUNT(*) as count FROM ${tableName} WHERE id = ?`, [id], (err, result) => {
          if (err) {
            log(`查询 ${tableName} id=${id} 失败: ${err.message}`, 'warning');
            processed++;
            if (processed >= rows.length) {
              log(`表 ${tableName}: 新增 ${inserted} 条记录`);
              totalInserted += inserted;
              completed++;
              if (completed >= tables.length) finish();
            }
            return;
          }

          if (result && result.count > 0) {
            processed++;
            if (processed >= rows.length) {
              log(`表 ${tableName}: 新增 ${inserted} 条记录`);
              totalInserted += inserted;
              completed++;
              if (completed >= tables.length) finish();
            }
            return;
          }

          const columns = Object.keys(row);
          const placeholders = columns.map(() => '?').join(',');
          const insertSql = `INSERT INTO ${tableName} (${columns.join(',')}) VALUES (${placeholders})`;

          db.run(insertSql, Object.values(row), (err) => {
            if (err) {
              log(`插入 ${tableName} id=${id} 失败: ${err.message}`, 'warning');
            } else {
              inserted++;
            }
            processed++;
            if (processed >= rows.length) {
              log(`表 ${tableName}: 新增 ${inserted} 条记录`);
              totalInserted += inserted;
              completed++;
              if (completed >= tables.length) finish();
            }
          });
        });
      });
    });
  });
};

const restoreUploads = () => {
  const backupUploads = path.join(BACKUP_PATH, 'uploads');
  if (!fs.existsSync(backupUploads)) {
    log('备份中没有上传文件目录', 'warning');
    return;
  }

  log('开始恢复上传文件...');

  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const entries = fs.readdirSync(backupUploads, { withFileTypes: true });
    let copied = 0;

    for (const entry of entries) {
      if (entry.isDirectory()) continue;

      const srcPath = path.join(backupUploads, entry.name);
      const destPath = path.join(UPLOADS_DIR, entry.name);

      if (!fs.existsSync(destPath)) {
        copyFile(srcPath, destPath);
        copied++;
      }
    }

    log(`上传文件恢复完成: 新增 ${copied} 个文件`, 'success');
  } catch (err) {
    log(`恢复上传文件失败: ${err.message}`, 'error');
  }
};

restoreIncremental();
restoreUploads();
