const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const SOURCE_DIR = path.join(__dirname);
const TEST_ENV_DIR = path.join(__dirname, 'test-env');
const SYNC_PACKAGE_DIR = path.join(__dirname, 'sync_package');

const SOURCE_DB = path.join(SOURCE_DIR, 'trading.db');
const TEST_ENV_DB = path.join(TEST_ENV_DIR, 'trading.db');
const SOURCE_UPLOADS = path.join(SOURCE_DIR, 'public', 'uploads');
const TEST_ENV_UPLOADS = path.join(TEST_ENV_DIR, 'public', 'uploads');

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

const copyDirectory = (src, dest) => {
  if (!fs.existsSync(src)) return 0;
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  let count = 0;
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      count += copyDirectory(srcPath, destPath);
    } else {
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath);
        count++;
      }
    }
  }

  return count;
};

const syncDatabase = (callback) => {
  log('开始同步数据库...');

  const sourceDb = new sqlite3.Database(SOURCE_DB, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
      log(`打开源数据库失败: ${err.message}`, 'error');
      callback(err);
      return;
    }

    const testEnvDb = new sqlite3.Database(TEST_ENV_DB, (err) => {
      if (err) {
        log(`打开测试环境数据库失败: ${err.message}`, 'error');
        sourceDb.close();
        callback(err);
        return;
      }

      sourceDb.all("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", [], (err, tables) => {
        if (err) {
          log(`获取表列表失败: ${err.message}`, 'error');
          sourceDb.close();
          testEnvDb.close();
          callback(err);
          return;
        }

        let completed = 0;
        const total = tables.length;

        const finish = () => {
          sourceDb.close();
          testEnvDb.close();
          log(`数据库同步完成 (${total} 张表)`, 'success');
          callback(null);
        };

        if (total === 0) {
          finish();
          return;
        }

        tables.forEach(table => {
          sourceDb.all(`SELECT * FROM ${table.name}`, [], (selectErr, rows) => {
            if (selectErr) {
              log(`读取表 ${table.name} 失败: ${selectErr.message}`, 'warning');
              rows = [];
            }

            testEnvDb.run(`DELETE FROM ${table.name}`, (delErr) => {
              if (delErr) {
                log(`清空表 ${table.name} 失败: ${delErr.message}`, 'warning');
                completed++;
                if (completed >= total) finish();
                return;
              }

              if (rows.length === 0) {
                log(`表 ${table.name}: 0 条记录`);
                completed++;
                if (completed >= total) finish();
                return;
              }

              const columns = Object.keys(rows[0]);
              const placeholders = columns.map(() => '?').join(',');
              const insertSql = `INSERT INTO ${table.name} (${columns.join(',')}) VALUES (${placeholders})`;

              let inserted = 0;
              rows.forEach(row => {
                testEnvDb.run(insertSql, Object.values(row), () => {
                  inserted++;
                  if (inserted >= rows.length) {
                    log(`表 ${table.name}: ${rows.length} 条记录`);
                    completed++;
                    if (completed >= total) finish();
                  }
                });
              });
            });
          });
        });
      });
    });
  });
};

const syncUploads = (callback) => {
  log('开始同步上传文件...');

  try {
    const newCount = copyDirectory(SOURCE_UPLOADS, TEST_ENV_UPLOADS);
    const sourceFiles = fs.readdirSync(SOURCE_UPLOADS).filter(f => !fs.statSync(path.join(SOURCE_UPLOADS, f)).isDirectory());
    const destFiles = fs.readdirSync(TEST_ENV_UPLOADS).filter(f => !fs.statSync(path.join(TEST_ENV_UPLOADS, f)).isDirectory());

    log(`上传文件同步完成: ${sourceFiles.length} 个文件, 新增 ${newCount} 个`, 'success');
    callback(null, sourceFiles.length);
  } catch (err) {
    log(`同步上传文件失败: ${err.message}`, 'error');
    callback(err);
  }
};

const createSyncPackage = (callback) => {
  log('创建远程同步包...');

  try {
    if (fs.existsSync(SYNC_PACKAGE_DIR)) {
      fs.rmSync(SYNC_PACKAGE_DIR, { recursive: true });
    }
    fs.mkdirSync(SYNC_PACKAGE_DIR, { recursive: true });

    const packageDb = path.join(SYNC_PACKAGE_DIR, 'trading.db');
    const packageUploads = path.join(SYNC_PACKAGE_DIR, 'uploads');

    copyFile(SOURCE_DB, packageDb);
    copyDirectory(SOURCE_UPLOADS, packageUploads);

    const dbSize = fs.statSync(packageDb).size;
    const uploadFiles = fs.readdirSync(packageUploads).filter(f => !fs.statSync(path.join(packageUploads, f)).isDirectory());
    const uploadsSize = uploadFiles.reduce((sum, f) => sum + fs.statSync(path.join(packageUploads, f)).size, 0);

    const readmeContent = `# 数据同步包说明

生成时间: ${new Date().toISOString()}

## 包含内容

- trading.db - 数据库文件 (${(dbSize / 1024).toFixed(2)} KB)
- uploads/ - 上传图片目录 (${uploadFiles.length} 个文件, ${(uploadsSize / 1024).toFixed(2)} KB)

## 部署步骤

1. 停止远程服务器
2. 替换服务器上的 trading.db 文件
3. 替换服务器上的 public/uploads 目录
4. 重启服务器

## 注意事项

- 同步包以本地环境(127.0.0.1)为准
- 请确保服务器上没有未备份的新增数据
- 替换前建议先备份服务器现有数据
`;

    fs.writeFileSync(path.join(SYNC_PACKAGE_DIR, 'README.txt'), readmeContent, 'utf8');

    log(`同步包创建完成: ${SYNC_PACKAGE_DIR}`, 'success');
    callback(null);
  } catch (err) {
    log(`创建同步包失败: ${err.message}`, 'error');
    callback(err);
  }
};

const run = async () => {
  log('='.repeat(60));
  log('数据同步工具 - 以本地环境(127.0.0.1)为准');
  log('='.repeat(60));

  console.log();
  log('1️⃣ 同步到测试环境');

  await new Promise((resolve) => {
    syncDatabase((err) => {
      if (err) {
        log('数据库同步失败', 'error');
        resolve();
        return;
      }
      syncUploads((err, count) => {
        if (err) {
          log('上传文件同步失败', 'error');
        }
        resolve();
      });
    });
  });

  console.log();
  log('2️⃣ 创建远程同步包');

  await new Promise((resolve) => {
    createSyncPackage((err) => {
      if (err) {
        log('创建同步包失败', 'error');
      }
      resolve();
    });
  });

  console.log();
  log('='.repeat(60));
  log('同步完成!', 'success');
  log('='.repeat(60));
  console.log();
  log('测试环境已同步完成');
  log('远程同步包已生成: sync_package/');
};

run();
