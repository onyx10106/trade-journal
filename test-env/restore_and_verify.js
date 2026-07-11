/**
 * 全新环境恢复测试脚本
 * 从最新备份恢复数据库和图片到当前空环境
 */
const backup = require('./backup');
const db = require('./database');
const fs = require('fs');
const path = require('path');

const TARGET_DB = path.join(__dirname, 'trading.db');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const getDirSize = (dirPath) => {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirSize(fullPath);
    } else {
      total += fs.statSync(fullPath).size;
    }
  }
  return total;
};

const getDirFileCount = (dirPath) => {
  if (!fs.existsSync(dirPath)) return 0;
  let count = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      count += getDirFileCount(fullPath);
    } else {
      count++;
    }
  }
  return count;
};

console.log('═══════════════════════════════════════════');
console.log('  全新环境备份恢复测试');
console.log('═══════════════════════════════════════════\n');

// 1. 检查全新环境状态
console.log('【步骤1】检查全新环境状态');
console.log(`  数据库文件: ${fs.existsSync(TARGET_DB) ? '存在' : '不存在 ✓（全新环境）'}`);
console.log(`  数据库大小: ${fs.existsSync(TARGET_DB) ? formatSize(fs.statSync(TARGET_DB).size) : '0 B'}`);
console.log(`  uploads目录: ${fs.existsSync(UPLOADS_DIR) ? getDirFileCount(UPLOADS_DIR) + ' 个文件' : '不存在 ✓（全新环境）'}`);
console.log('');

// 2. 列出可用备份
console.log('【步骤2】可用备份列表');
backup.getBackupList((listErr, backups) => {
  if (listErr || !backups || backups.length === 0) {
    console.error('  ❌ 没有可用备份');
    process.exit(1);
  }

  backups.forEach((b, i) => {
    console.log(`  ${i + 1}. ${b.name}`);
    console.log(`     大小: ${formatSize(b.size)} | 图片: ${b.images_info} | 时间: ${new Date(b.created_at).toLocaleString('zh-CN')}`);
  });

  // 3. 选择最新备份恢复
  const latestBackup = backups[0];
  console.log(`\n【步骤3】从最新备份恢复: ${latestBackup.name}`);

  // 等待数据库表创建完成
  setTimeout(() => {
    backup.restoreFromBackup(latestBackup.name, (restoreErr) => {
      if (restoreErr) {
        console.error('  ❌ 恢复失败:', restoreErr.message);
        process.exit(1);
      }

      console.log('');
      console.log('【步骤4】恢复后环境状态');
      console.log(`  数据库文件: ${fs.existsSync(TARGET_DB) ? '存在 ✓' : '不存在 ✗'}`);
      console.log(`  数据库大小: ${fs.existsSync(TARGET_DB) ? formatSize(fs.statSync(TARGET_DB).size) : '0 B'}`);
      console.log(`  uploads目录: ${fs.existsSync(UPLOADS_DIR) ? getDirFileCount(UPLOADS_DIR) + ' 个文件' : '不存在'}`);
      console.log(`  uploads大小: ${fs.existsSync(UPLOADS_DIR) ? formatSize(getDirSize(UPLOADS_DIR)) : '0 B'}`);

      // 4. 查询数据库数据
      console.log('');
      console.log('【步骤5】数据库数据验证');

      const tables = ['trades', 'fund_records', 'account_balance', 'watchlist', 'watchlist_logs', 'trade_attachments'];
      let completed = 0;

      tables.forEach(tableName => {
        db.all(`SELECT COUNT(*) as cnt FROM ${tableName}`, [], (err, rows) => {
          if (err) {
            console.log(`  ${tableName}: 查询失败 - ${err.message}`);
          } else {
            const count = rows[0].cnt;
            const mark = count > 0 ? '✓' : '-';
            console.log(`  ${mark} ${tableName}: ${count} 条记录`);
          }

          completed++;
          if (completed >= tables.length) {
            // 5. 查看几张交易记录的详情
            console.log('');
            console.log('【步骤6】交易记录样本（前3条）');
            db.all('SELECT id, date, symbol, direction, entry, exit, pnl FROM trades WHERE deleted_at IS NULL LIMIT 3', [], (err3, sampleTrades) => {
              if (err3) {
                console.log('  查询失败:', err3.message);
              } else if (sampleTrades.length === 0) {
                console.log('  无交易记录');
              } else {
                sampleTrades.forEach(t => {
                  console.log(`  #${t.id} | ${t.date} | ${t.symbol} | ${t.direction} | 入场:${t.entry} | 出场:${t.exit} | 盈亏:${t.pnl}`);
                });
              }

              // 6. 查看附件记录
              console.log('');
              console.log('【步骤7】附件记录样本（前5条）');
              db.all('SELECT id, trade_id, filename, file_url, file_type, size FROM trade_attachments LIMIT 5', [], (err4, attachments) => {
                if (err4) {
                  console.log('  查询失败:', err4.message);
                } else if (attachments.length === 0) {
                  console.log('  无附件记录');
                } else {
                  attachments.forEach(a => {
                    const fileExists = fs.existsSync(path.join(__dirname, 'public', a.file_url));
                    console.log(`  #${a.id} | trade_id:${a.trade_id} | ${a.filename} | ${a.file_url} | ${formatSize(a.size || 0)} | 文件存在: ${fileExists ? '✓' : '✗'}`);
                  });
                }

                console.log('');
                console.log('═══════════════════════════════════════════');
                console.log('  ✅ 恢复测试完成！可以启动服务器验证');
                console.log(`  访问地址: http://localhost:8080`);
                console.log(`  登录账号: zeechen / 123456`);
                console.log('═══════════════════════════════════════════');
                process.exit(0);
              });
            });
          }
        });
      });
    });
  }, 1000);
});
