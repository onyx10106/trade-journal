const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./database');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const MAX_BACKUPS = 20;

const ensureBackupDir = () => {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
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
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }

  return count;
};

const deleteDirectory = (dirPath) => {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      deleteDirectory(fullPath);
    } else {
      fs.unlinkSync(fullPath);
    }
  }
  fs.rmdirSync(dirPath);
};

const getBackupTimestamp = (backupName) => {
  const match = backupName.match(/backup_(.+)/);
  if (match) {
    return new Date(match[1].replace(/-/g, ':'));
  }
  return new Date(0);
};

const getUploadsFingerprint = (dirPath) => {
  if (!fs.existsSync(dirPath)) return 'empty';

  const files = [];
  const walk = (currentDir, relativePath = '') => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.join(relativePath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else {
        const stats = fs.statSync(fullPath);
        files.push(`${relPath}:${stats.size}:${stats.mtimeMs}`);
      }
    }
  };
  walk(dirPath);

  files.sort();
  const hash = crypto.createHash('md5');
  hash.update(files.join('|'));
  return hash.digest('hex');
};

const getBackupListFolders = () => {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  const entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory() && e.name.startsWith('backup_'))
    .map(e => e.name)
    .sort((a, b) => getBackupTimestamp(b) - getBackupTimestamp(a));
};

const findBackupWithImages = (startFromName) => {
  const folders = getBackupListFolders();
  const startIndex = folders.findIndex(f => f === startFromName);
  for (let i = startIndex; i < folders.length; i++) {
    const uploadsPath = path.join(BACKUP_DIR, folders[i], 'uploads');
    if (fs.existsSync(uploadsPath)) {
      return folders[i];
    }
  }
  return null;
};

const createBackup = (callback) => {
  try {
    ensureBackupDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFolderName = `backup_${timestamp}`;
    const backupFolderPath = path.join(BACKUP_DIR, backupFolderName);
    const dataFilePath = path.join(backupFolderPath, 'data.json');
    const uploadsBackupPath = path.join(backupFolderPath, 'uploads');
    const imagesRefPath = path.join(backupFolderPath, 'images_ref.json');

    fs.mkdirSync(backupFolderPath, { recursive: true });

    const currentFingerprint = getUploadsFingerprint(UPLOADS_DIR);
    const backupFolders = getBackupListFolders();

    let imagesFromBackup = null;
    let needCopyImages = true;

    if (backupFolders.length > 0 && currentFingerprint !== 'empty') {
      for (const prevFolder of backupFolders) {
        const prevUploads = path.join(BACKUP_DIR, prevFolder, 'uploads');
        const prevRef = path.join(BACKUP_DIR, prevFolder, 'images_ref.json');

        if (fs.existsSync(prevUploads)) {
          const prevFingerprint = getUploadsFingerprint(prevUploads);
          if (prevFingerprint === currentFingerprint) {
            imagesFromBackup = prevFolder;
            needCopyImages = false;
            break;
          }
        } else if (fs.existsSync(prevRef)) {
          const refData = JSON.parse(fs.readFileSync(prevRef, 'utf8'));
          if (refData.fingerprint === currentFingerprint) {
            imagesFromBackup = refData.source_backup || prevFolder;
            needCopyImages = false;
            break;
          }
        }
      }
    }

    db.all("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", [], (err, tables) => {
      if (err) {
        console.error("获取表列表失败:", err.message);
        if (callback) callback(err);
        return;
      }

      let completed = 0;
      const total = tables.length;
      const backupData = {
        backup_time: new Date().toISOString(),
        table_count: total,
        tables: {}
      };

      const finishBackup = () => {
        try {
          fs.writeFileSync(dataFilePath, JSON.stringify(backupData, null, 2), 'utf8');

          let imageCount = 0;
          if (needCopyImages && currentFingerprint !== 'empty') {
            imageCount = copyDirectory(UPLOADS_DIR, uploadsBackupPath);
          } else if (!needCopyImages && imagesFromBackup) {
            fs.writeFileSync(imagesRefPath, JSON.stringify({
              fingerprint: currentFingerprint,
              source_backup: imagesFromBackup,
              note: '图片与引用备份相同，未重复存储'
            }, null, 2), 'utf8');
            const refUploads = path.join(BACKUP_DIR, imagesFromBackup, 'uploads');
            imageCount = fs.existsSync(refUploads)
              ? fs.readdirSync(refUploads).filter(f => !fs.statSync(path.join(refUploads, f)).isDirectory()).length
              : 0;
          }

          const totalSize = getDirectorySize(backupFolderPath);
          const msg = needCopyImages
            ? `✅ 备份成功: ${backupFolderName} (${total} 张表, ${imageCount} 张图片, ${(totalSize / 1024).toFixed(2)} KB)`
            : `✅ 备份成功: ${backupFolderName} (${total} 张表, ${imageCount} 张图片[引用自${imagesFromBackup}], ${(totalSize / 1024).toFixed(2)} KB)`;
          console.log(msg);
          cleanupOldBackups();
          if (callback) callback(null, backupFolderName);
        } catch (writeErr) {
          console.error("写入备份文件失败:", writeErr.message);
          if (callback) callback(writeErr);
        }
      };

      if (total === 0) {
        finishBackup();
        return;
      }

      tables.forEach(table => {
        db.all(`SELECT * FROM ${table.name}`, [], (selectErr, rows) => {
          if (selectErr) {
            console.error(`读取表 ${table.name} 数据失败:`, selectErr.message);
            backupData.tables[table.name] = { schema: table.sql, data: [] };
          } else {
            backupData.tables[table.name] = {
              schema: table.sql,
              count: rows.length,
              data: rows
            };
          }

          completed++;
          if (completed >= total) {
            finishBackup();
          }
        });
      });
    });
  } catch (err) {
    console.error("备份过程异常:", err.message);
    if (callback) callback(err);
  }
};

const getDirectorySize = (dirPath) => {
  let totalSize = 0;
  if (!fs.existsSync(dirPath)) return 0;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      totalSize += getDirectorySize(fullPath);
    } else {
      const stats = fs.statSync(fullPath);
      totalSize += stats.size;
    }
  }
  return totalSize;
};

const createBackupPromise = () => {
  return new Promise((resolve, reject) => {
    createBackup((err, folderName) => {
      if (err) reject(err);
      else resolve(folderName);
    });
  });
};

const cleanupOldBackups = () => {
  try {
    const folders = getBackupListFolders().reverse();

    while (folders.length > MAX_BACKUPS) {
      const oldFolder = folders.shift();
      const oldPath = path.join(BACKUP_DIR, oldFolder);
      try {
        deleteDirectory(oldPath);
        console.log(`🗑️ 删除旧备份: ${oldFolder}`);
      } catch (unlinkErr) {
        console.error(`删除旧备份失败 ${oldFolder}:`, unlinkErr.message);
      }
    }
  } catch (err) {
    console.error("清理旧备份异常:", err.message);
  }
};

const getBackupList = (callback) => {
  ensureBackupDir();
  try {
    const folders = getBackupListFolders();

    const backups = folders.map(folderName => {
      const folderPath = path.join(BACKUP_DIR, folderName);
      const stats = fs.statSync(folderPath);
      const size = getDirectorySize(folderPath);

      const hasUploads = fs.existsSync(path.join(folderPath, 'uploads'));
      const refPath = path.join(folderPath, 'images_ref.json');
      let imagesInfo = '';
      if (hasUploads) {
        const count = fs.readdirSync(path.join(folderPath, 'uploads')).filter(f =>
          !fs.statSync(path.join(folderPath, 'uploads', f)).isDirectory()
        ).length;
        imagesInfo = `${count}张图片`;
      } else if (fs.existsSync(refPath)) {
        imagesInfo = '图片(引用)';
      }

      return {
        name: folderName,
        size: size,
        created_at: stats.birthtime,
        has_images: hasUploads,
        images_info: imagesInfo
      };
    });

    if (callback) callback(null, backups);
  } catch (err) {
    if (callback) callback(err);
  }
};

const getEffectiveUploadsPath = (backupFolderName) => {
  const backupFolderPath = path.join(BACKUP_DIR, backupFolderName);
  const uploadsPath = path.join(backupFolderPath, 'uploads');
  const refPath = path.join(backupFolderPath, 'images_ref.json');

  if (fs.existsSync(uploadsPath)) {
    return uploadsPath;
  }

  if (fs.existsSync(refPath)) {
    try {
      const refData = JSON.parse(fs.readFileSync(refPath, 'utf8'));
      const sourceBackup = refData.source_backup;
      if (sourceBackup) {
        const sourceUploads = path.join(BACKUP_DIR, sourceBackup, 'uploads');
        if (fs.existsSync(sourceUploads)) {
          return sourceUploads;
        }
        const realSource = findBackupWithImages(sourceBackup);
        if (realSource) {
          return path.join(BACKUP_DIR, realSource, 'uploads');
        }
      }
    } catch (e) {
      console.error('解析图片引用失败:', e.message);
    }
  }

  const realSource = findBackupWithImages(backupFolderName);
  if (realSource) {
    return path.join(BACKUP_DIR, realSource, 'uploads');
  }

  return null;
};

const restoreFromBackup = (backupFolderName, callback) => {
  const backupFolderPath = path.join(BACKUP_DIR, backupFolderName);
  const dataFilePath = path.join(backupFolderPath, 'data.json');

  if (!fs.existsSync(backupFolderPath)) {
    const err = new Error('备份不存在');
    if (callback) callback(err);
    return;
  }

  try {
    const backupData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
    const tables = Object.keys(backupData.tables);

    let completed = 0;
    const total = tables.length;

    const finishRestore = () => {
      const effectiveUploads = getEffectiveUploadsPath(backupFolderName);
      if (effectiveUploads && fs.existsSync(effectiveUploads)) {
        if (!fs.existsSync(UPLOADS_DIR)) {
          fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        }
        const imageCount = copyDirectory(effectiveUploads, UPLOADS_DIR);
        console.log(`  恢复图片: ${imageCount} 张`);
      }
      console.log(`✅ 从备份恢复成功: ${backupFolderName}`);
      if (callback) callback(null);
    };

    if (total === 0) {
      finishRestore();
      return;
    }

    tables.forEach(tableName => {
      const tableData = backupData.tables[tableName];

      db.run(`DELETE FROM ${tableName}`, () => {
        const rows = tableData.data || [];

        if (rows.length === 0) {
          completed++;
          if (completed >= total) {
            finishRestore();
          }
          return;
        }

        const columns = Object.keys(rows[0]);
        const placeholders = columns.map(() => '?').join(',');
        const insertSql = `INSERT INTO ${tableName} (${columns.join(',')}) VALUES (${placeholders})`;

        let inserted = 0;
        rows.forEach(row => {
          db.run(insertSql, Object.values(row), () => {
            inserted++;
            if (inserted >= rows.length) {
              completed++;
              if (completed >= total) {
                finishRestore();
              }
            }
          });
        });
      });
    });
  } catch (err) {
    console.error("恢复失败:", err.message);
    if (callback) callback(err);
  }
};

module.exports = {
  createBackup,
  createBackupPromise,
  getBackupList,
  restoreFromBackup,
  ensureBackupDir,
  getEffectiveUploadsPath,
  BACKUP_DIR
};
