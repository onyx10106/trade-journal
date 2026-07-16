require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const supabase = require('./supabaseClient');
const db = require('./database');
const backup = require('./backup');

const app = express();

backup.ensureBackupDir();

const VALID_USER = 'zeechen';
const VALID_PASSWORD = '123456';
const TOKENS_FILE = path.join(__dirname, 'tokens.json');

const loadTokens = () => {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const data = fs.readFileSync(TOKENS_FILE, 'utf8');
      const arr = JSON.parse(data);
      return new Map(arr);
    }
  } catch (err) {
    console.error('加载tokens失败:', err.message);
  }
  return new Map();
};

const saveTokens = (tokens) => {
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify([...tokens.entries()]));
  } catch (err) {
    console.error('保存tokens失败:', err.message);
  }
};

let activeTokens = loadTokens();

const generateToken = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token || !activeTokens.has(token)) {
    return res.status(401).json({ success: false, error: '未授权，请先登录' });
  }
  next();
};

app.use(cors());
app.use(express.json());

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'), false);
    }
  }
});

app.get('/', (req, res) => {
  res.redirect('/trades');
});

app.get('/trades', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trades.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/backups', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'backups.html'));
});

app.get('/notes', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'notes.html'));
});

app.get('/add', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'add.html'));
});

app.get('/funds', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'funds.html'));
});

app.get('/watchlist', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'watchlist.html'));
});

app.get('/date', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'date.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (username === VALID_USER && password === VALID_PASSWORD) {
    const token = generateToken();
    activeTokens.set(token, { username, loginAt: Date.now() });
    saveTokens(activeTokens);
    res.json({ success: true, token, username });
  } else {
    res.status(401).json({ success: false, error: '用户名或密码错误' });
  }
});

app.post('/api/logout', authenticateToken, (req, res) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (token) {
    activeTokens.delete(token);
    saveTokens(activeTokens);
  }
  res.json({ success: true, message: '退出登录成功' });
});

app.get('/add', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'add.html'));
});

app.post('/api/trade', authenticateToken, async (req, res) => {
  const { trade_date, symbol, direction, timeframe, leverage, entry_price, exit_price, stop_loss, take_profit, position_usd, pnl, reason, review } = req.body;

  db.run(
    `INSERT INTO trades (date, symbol, direction, timeframe, leverage, entry, exit, sl, tp, position, pnl, reason, review)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [trade_date, symbol, direction, timeframe, leverage, entry_price, exit_price, stop_loss, take_profit, position_usd, pnl, reason, review],
    function(err) {
      if (err) {
        return res.json({ success: false, error: err.message });
      }
      // backup.createBackup(); // 已改为手动备份
      res.json({ success: true, data: { id: this.lastID } });
    }
  );
});

app.get('/api/trades', authenticateToken, (req, res) => {
  const { page = 1, limit = 10, symbol, direction, timeframe, startDate, endDate } = req.query;
  const offset = (page - 1) * limit;
  
  let query = `SELECT * FROM trades WHERE deleted_at IS NULL`;
  const params = [];
  
  if (symbol) {
    query += ` AND symbol LIKE ?`;
    params.push(`%${symbol}%`);
  }
  
  if (direction) {
    query += ` AND direction = ?`;
    params.push(direction);
  }
  
  if (timeframe) {
    query += ` AND timeframe = ?`;
    params.push(timeframe);
  }
  
  if (startDate) {
    query += ` AND date >= ?`;
    params.push(startDate);
  }
  
  if (endDate) {
    query += ` AND date <= ?`;
    params.push(endDate);
  }
  
  query += ` ORDER BY CASE WHEN exit IS NULL OR exit = 0 THEN 0 ELSE 1 END ASC, date DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), offset);
  
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    
    db.get(`SELECT COUNT(*) as total FROM trades WHERE deleted_at IS NULL` + 
      (symbol ? ` AND symbol LIKE '%${symbol}%'` : '') +
      (direction ? ` AND direction = '${direction}'` : '') +
      (timeframe ? ` AND timeframe = '${timeframe}'` : '') +
      (startDate ? ` AND date >= '${startDate}'` : '') +
      (endDate ? ` AND date <= '${endDate}'` : ''), [], (countErr, countRow) => {
      if (countErr) {
        return res.json({ success: false, error: countErr.message });
      }
      res.json({
        success: true,
        data: rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countRow.total || 0,
          pages: Math.ceil((countRow.total || 0) / limit)
        }
      });
    });
  });
});

app.put('/api/trade/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { trade_date, symbol, direction, timeframe, leverage, entry_price, exit_price, stop_loss, take_profit, position_usd, pnl, reason, review } = req.body;
  
  db.run(
    `UPDATE trades SET date = ?, symbol = ?, direction = ?, timeframe = ?, leverage = ?, entry = ?, exit = ?, sl = ?, tp = ?, position = ?, pnl = ?, reason = ?, review = ? WHERE id = ?`,
    [trade_date, symbol, direction, timeframe, leverage, entry_price, exit_price, stop_loss, take_profit, position_usd, pnl, reason, review, id],
    function(err) {
      if (err) {
        return res.json({ success: false, error: err.message });
      }
      // backup.createBackup(); // 已改为手动备份
      res.json({ success: true, data: { id, changes: this.changes } });
    }
  );
});

app.get('/api/trade/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.get(`SELECT * FROM trades WHERE id = ? AND deleted_at IS NULL`, [id], (err, row) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, data: row });
  });
});

app.delete('/api/trade/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run(`UPDATE trades SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`, [id], function(err) {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    // backup.createBackup(); // 已改为手动备份
    res.json({ success: true, data: { id, changes: this.changes } });
  });
});

app.post('/api/trade/:id/upload', authenticateToken, upload.array('files', 10), (req, res) => {
  const { id } = req.params;
  
  if (!req.files || req.files.length === 0) {
    return res.json({ success: false, error: '请选择要上传的图片' });
  }
  
  const attachments = req.files.map(file => ({
    trade_id: id,
    filename: file.originalname,
    filepath: file.path,
    file_url: `/uploads/${file.filename}`,
    file_type: file.mimetype,
    size: file.size
  }));
  
  const placeholders = attachments.map(() => '(?, ?, ?, ?, ?, ?)').join(',');
  const values = attachments.flatMap(a => [a.trade_id, a.filename, a.filepath, a.file_url, a.file_type, a.size]);
  
  db.run(
    `INSERT INTO trade_attachments (trade_id, filename, filepath, file_url, file_type, size) VALUES ${placeholders}`,
    values,
    function(err) {
      if (err) {
        req.files.forEach(file => fs.unlinkSync(file.path));
        return res.json({ success: false, error: err.message });
      }
      // backup.createBackup(); // 已改为手动备份
      res.json({ 
        success: true, 
        data: { 
          count: this.changes,
          attachments: attachments.map(a => ({ filename: a.filename, url: a.file_url }))
        } 
      });
    }
  );
});

app.get('/api/trade/:id/attachments', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.all(`SELECT * FROM trade_attachments WHERE trade_id = ? ORDER BY created_at DESC`, [id], (err, rows) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, data: rows });
  });
});

app.delete('/api/attachment/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.get(`SELECT * FROM trade_attachments WHERE id = ?`, [id], (err, row) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    if (!row) {
      return res.json({ success: false, error: '附件不存在' });
    }
    
    fs.unlink(row.filepath, (unlinkErr) => {
      db.run(`DELETE FROM trade_attachments WHERE id = ?`, [id], function(deleteErr) {
        if (deleteErr) {
          return res.json({ success: false, error: deleteErr.message });
        }
        // backup.createBackup(); // 已改为手动备份
        res.json({ success: true, data: { id, changes: this.changes } });
      });
    });
  });
});

app.get('/trades', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trades.html'));
});

app.get('/funds', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'funds.html'));
});

app.post('/api/fund', authenticateToken, (req, res) => {
  const { type, amount, address, reason, date } = req.body;

  db.run(
    `INSERT INTO fund_records (type, amount, address, reason, date)
     VALUES (?, ?, ?, ?, ?)`,
    [type, amount, address, reason, date],
    function(err) {
      if (err) {
        return res.json({ success: false, error: err.message });
      }
      // backup.createBackup(); // 已改为手动备份
      res.json({ success: true, data: { id: this.lastID } });
    }
  );
});

app.get('/api/funds', authenticateToken, (req, res) => {
  db.all(`SELECT * FROM fund_records WHERE deleted_at IS NULL ORDER BY date DESC`, [], (err, rows) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, data: rows });
  });
});

app.delete('/api/fund/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run(`UPDATE fund_records SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`, [id], function(err) {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    // backup.createBackup(); // 已改为手动备份
    res.json({ success: true, data: { id, changes: this.changes } });
  });
});

app.get('/api/funds/total', authenticateToken, (req, res) => {
  db.get(`
    SELECT 
      SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END) as total_deposit,
      SUM(CASE WHEN type = 'withdraw' THEN amount ELSE 0 END) as total_withdraw,
      SUM(CASE WHEN type = 'deposit' THEN amount ELSE -amount END) as balance
    FROM fund_records WHERE deleted_at IS NULL
  `, [], (err, row) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, data: row || { total_deposit: 0, total_withdraw: 0, balance: 0 } });
  });
});

app.get('/api/account-balance', authenticateToken, (req, res) => {
  db.all(`SELECT * FROM account_balance WHERE deleted_at IS NULL ORDER BY date DESC`, [], (err, rows) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, data: rows });
  });
});

app.get('/api/account-balance/total', authenticateToken, (req, res) => {
  db.get(`
    SELECT SUM(amount) as total 
    FROM account_balance WHERE deleted_at IS NULL
  `, [], (err, row) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, data: { total: (row && row.total) || 0 } });
  });
});

app.post('/api/account-balance', authenticateToken, (req, res) => {
  const { amount, reason, date } = req.body;

  db.run(
    `INSERT INTO account_balance (amount, reason, date) VALUES (?, ?, ?)`,
    [amount, reason, date],
    function(err) {
      if (err) {
        return res.json({ success: false, error: err.message });
      }
      // backup.createBackup(); // 已改为手动备份
      res.json({ success: true, data: { id: this.lastID } });
    }
  );
});

app.put('/api/account-balance/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { amount, reason, date } = req.body;

  db.run(
    `UPDATE account_balance SET amount = ?, reason = ?, date = ? WHERE id = ? AND deleted_at IS NULL`,
    [amount, reason, date, id],
    function(err) {
      if (err) {
        return res.json({ success: false, error: err.message });
      }
      // backup.createBackup(); // 已改为手动备份
      res.json({ success: true, data: { id, changes: this.changes } });
    }
  );
});

app.delete('/api/account-balance/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run(`UPDATE account_balance SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`, [id], function(err) {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    // backup.createBackup(); // 已改为手动备份
    res.json({ success: true, data: { id, changes: this.changes } });
  });
});

app.get('/watchlist', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'watchlist.html'));
});

app.get('/date', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'date.html'));
});

app.get('/api/watchlist', authenticateToken, (req, res) => {
  const { page = 1, limit = 10, stock_code } = req.query;
  const offset = (page - 1) * limit;
  
  let query = `SELECT * FROM watchlist WHERE deleted_at IS NULL`;
  const params = [];
  
  if (stock_code) {
    query += ` AND stock_code LIKE ?`;
    params.push(`%${stock_code}%`);
  }
  
  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), offset);
  
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    
    let countQuery = `SELECT COUNT(*) as total FROM watchlist WHERE deleted_at IS NULL`;
    const countParams = [];
    if (stock_code) {
      countQuery += ` AND stock_code LIKE ?`;
      countParams.push(`%${stock_code}%`);
    }
    db.get(countQuery, countParams, (countErr, countRow) => {
      if (countErr) {
        return res.json({ success: false, error: countErr.message });
      }
      res.json({
        success: true,
        data: rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countRow.total || 0,
          pages: Math.ceil((countRow.total || 0) / limit)
        }
      });
    });
  });
});

app.get('/api/watchlist/:id/logs', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.all(`SELECT * FROM watchlist_logs WHERE watchlist_id = ? ORDER BY created_at DESC`, [id], (err, rows) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    rows.forEach(row => {
      try {
        row.changes = JSON.parse(row.changes);
      } catch (e) {
        row.changes = {};
      }
    });
    res.json({ success: true, data: rows });
  });
});

app.get('/api/watchlist/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.get(`SELECT * FROM watchlist WHERE id = ? AND deleted_at IS NULL`, [id], (err, row) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, data: row });
  });
});

app.post('/api/watchlist', authenticateToken, (req, res) => {
  const { stock_code, signal, expected_gain, is_watching, remark } = req.body;

  db.run(
    `INSERT INTO watchlist (stock_code, signal, expected_gain, is_watching, remark, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [stock_code, signal, expected_gain, is_watching ? 1 : 0, remark],
    function(err) {
      if (err) {
        return res.json({ success: false, error: err.message });
      }
      const newId = this.lastID;
      const changes = JSON.stringify({
        stock_code: stock_code,
        signal: signal || null,
        expected_gain: expected_gain || null,
        is_watching: is_watching ? 1 : 0,
        remark: remark || null
      });
      db.run(`INSERT INTO watchlist_logs (watchlist_id, action, changes) VALUES (?, ?, ?)`, [newId, 'create', changes]);
      // backup.createBackup(); // 已改为手动备份
      res.json({ success: true, data: { id: newId } });
    }
  );
});

app.put('/api/watchlist/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { stock_code, signal, expected_gain, is_watching, remark } = req.body;

  db.get(`SELECT stock_code, signal, expected_gain, is_watching, remark FROM watchlist WHERE id = ? AND deleted_at IS NULL`, [id], (err, oldData) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }

    const changes = {};
    if (oldData.stock_code !== stock_code) {
      changes.stock_code = { old: oldData.stock_code, new: stock_code };
    }
    if (oldData.signal !== signal) {
      changes.signal = { old: oldData.signal || null, new: signal || null };
    }
    if (String(oldData.expected_gain) !== String(expected_gain)) {
      changes.expected_gain = { old: oldData.expected_gain || null, new: expected_gain || null };
    }
    if (oldData.is_watching !== (is_watching ? 1 : 0)) {
      changes.is_watching = { old: oldData.is_watching, new: is_watching ? 1 : 0 };
    }
    if (oldData.remark !== remark) {
      changes.remark = { old: oldData.remark || null, new: remark || null };
    }

    db.run(
      `UPDATE watchlist SET stock_code = ?, signal = ?, expected_gain = ?, is_watching = ?, remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`,
      [stock_code, signal, expected_gain, is_watching ? 1 : 0, remark, id],
      function(updateErr) {
        if (updateErr) {
          return res.json({ success: false, error: updateErr.message });
        }
        if (Object.keys(changes).length > 0) {
          db.run(`INSERT INTO watchlist_logs (watchlist_id, action, changes) VALUES (?, ?, ?)`, [id, 'update', JSON.stringify(changes)]);
        }
        // backup.createBackup(); // 已改为手动备份
        res.json({ success: true, data: { id, changes: this.changes } });
      }
    );
  });
});

app.delete('/api/watchlist/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run(`UPDATE watchlist SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`, [id], function(err) {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    // backup.createBackup(); // 已改为手动备份
    res.json({ success: true, data: { id, changes: this.changes } });
  });
});

const restoreFromBackupMiddleware = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      if (file.fieldname === 'data') {
        cb(null, path.join(__dirname));
      } else {
        cb(null, path.join(__dirname, 'public', 'uploads'));
      }
    },
    filename: function (req, file, cb) {
      if (file.fieldname === 'data') {
        cb(null, 'temp_backup_data.json');
      } else {
        cb(null, file.originalname);
      }
    }
  }),
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

app.post('/api/restore-from-backup', authenticateToken, restoreFromBackupMiddleware.fields([
  { name: 'data', maxCount: 1 },
  { name: 'files', maxCount: 100 }
]), (req, res) => {
  if (!req.files || !req.files.data || req.files.data.length === 0) {
    return res.json({ success: false, error: '未找到备份数据文件' });
  }

  const dataPath = req.files.data[0].path;
  
  let backupData;
  try {
    const rawData = fs.readFileSync(dataPath, 'utf8');
    backupData = JSON.parse(rawData);
  } catch (err) {
    try { fs.unlinkSync(dataPath); } catch (e) {}
    if (err instanceof SyntaxError) {
      return res.json({ success: false, error: '备份文件格式错误，不是有效的JSON格式' });
    }
    return res.json({ success: false, error: '读取备份文件失败: ' + err.message });
  } finally {
    try { fs.unlinkSync(dataPath); } catch (e) {}
  }

  if (!backupData || typeof backupData !== 'object') {
    return res.json({ success: false, error: '备份文件内容格式不正确' });
  }

  if (!backupData.tables || typeof backupData.tables !== 'object') {
    return res.json({ success: false, error: '备份文件缺少 tables 数据' });
  }

  const ALLOWED_TABLES = ['trades', 'fund_records', 'watchlist', 'watchlist_logs', 'account_balance', 'trade_attachments'];
  const tables = Object.keys(backupData.tables).filter(table => ALLOWED_TABLES.includes(table));
  
  if (tables.length === 0) {
    return res.json({ success: false, error: '备份文件中没有可恢复的数据表' });
  }

  let completed = 0;
  let totalInserted = 0;
  let failedTables = [];
  let restoreErrors = [];

  const finish = () => {
    const message = failedTables.length > 0 
      ? `恢复完成，共插入 ${totalInserted} 条新记录。${failedTables.length} 张表恢复失败` 
      : `增量恢复完成，共插入 ${totalInserted} 条新记录`;
    
    res.json({ 
      success: true, 
      message,
      details: {
        inserted: totalInserted,
        failedTables,
        errors: restoreErrors.slice(0, 5)
      }
    });
  };

  tables.forEach(tableName => {
    const tableData = backupData.tables[tableName];
    
    if (!tableData || typeof tableData !== 'object') {
      failedTables.push(tableName);
      restoreErrors.push(`表 ${tableName} 数据格式错误`);
      completed++;
      if (completed >= tables.length) finish();
      return;
    }

    const rows = tableData.data || [];
    let inserted = 0;
    let processed = 0;
    let tableFailed = false;

    if (rows.length === 0) {
      completed++;
      if (completed >= tables.length) finish();
      return;
    }

    rows.forEach(row => {
      if (!row || typeof row !== 'object' || row.id === undefined) {
        processed++;
        if (processed >= rows.length) {
          if (tableFailed) failedTables.push(tableName);
          totalInserted += inserted;
          completed++;
          if (completed >= tables.length) finish();
        }
        return;
      }

      const id = row.id;

      db.get(`SELECT COUNT(*) as count FROM ${tableName} WHERE id = ?`, [id], (err, result) => {
        if (err) {
          if (!tableFailed) {
            tableFailed = true;
            restoreErrors.push(`表 ${tableName} 查询失败: ${err.message}`);
          }
          processed++;
          if (processed >= rows.length) {
            if (tableFailed) failedTables.push(tableName);
            totalInserted += inserted;
            completed++;
            if (completed >= tables.length) finish();
          }
          return;
        }

        if (result && result.count > 0) {
          processed++;
          if (processed >= rows.length) {
            if (tableFailed) failedTables.push(tableName);
            totalInserted += inserted;
            completed++;
            if (completed >= tables.length) finish();
          }
          return;
        }

        const columns = Object.keys(row).filter(col => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col));
        const placeholders = columns.map(() => '?').join(',');
        const insertSql = `INSERT INTO ${tableName} (${columns.join(',')}) VALUES (${placeholders})`;
        const values = columns.map(col => row[col]);

        db.run(insertSql, values, (err) => {
          if (err) {
            if (!tableFailed) {
              tableFailed = true;
              restoreErrors.push(`表 ${tableName} 插入失败: ${err.message}`);
            }
          } else {
            inserted++;
          }
          processed++;
          if (processed >= rows.length) {
            if (tableFailed) failedTables.push(tableName);
            totalInserted += inserted;
            completed++;
            if (completed >= tables.length) finish();
          }
        });
      });
    });
  });
});

app.post('/api/backups/manual', authenticateToken, (req, res) => {
  backup.createBackup((err, folderName) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, message: '手动备份成功', data: { backupName: folderName } });
  });
});

app.get('/api/backups', authenticateToken, (req, res) => {
  backup.getBackupList((err, backups) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, data: backups });
  });
});

app.delete('/api/backups/:name', authenticateToken, (req, res) => {
  const { name } = req.params;
  const backupFolderPath = path.join(backup.BACKUP_DIR, name);
  
  if (!fs.existsSync(backupFolderPath)) {
    return res.json({ success: false, error: '备份不存在' });
  }
  
  try {
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
    
    deleteDirectory(backupFolderPath);
    res.json({ success: true, message: '备份删除成功' });
  } catch (err) {
    res.json({ success: false, error: '删除备份失败: ' + err.message });
  }
});

app.post('/api/backups/:name/restore', authenticateToken, (req, res) => {
  const { name } = req.params;
  
  const backupFolderPath = path.join(backup.BACKUP_DIR, name);
  const dataFilePath = path.join(backupFolderPath, 'data.json');
  
  if (!fs.existsSync(dataFilePath)) {
    return res.json({ success: false, error: '备份文件不存在' });
  }
  
  let backupData;
  try {
    backupData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
  } catch (err) {
    return res.json({ success: false, error: '读取备份文件失败' });
  }
  
  const tables = Object.keys(backupData.tables);
  let completed = 0;
  let totalInserted = 0;
  
  const finish = () => {
    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    const effectiveUploads = backup.getEffectiveUploadsPath(name);
    
    if (effectiveUploads && fs.existsSync(effectiveUploads)) {
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const entries = fs.readdirSync(effectiveUploads, { withFileTypes: true });
      entries.forEach(entry => {
        if (!entry.isDirectory()) {
          const src = path.join(effectiveUploads, entry.name);
          const dest = path.join(uploadsDir, entry.name);
          if (!fs.existsSync(dest)) {
            fs.copyFileSync(src, dest);
          }
        }
      });
    }
    
    res.json({ 
      success: true, 
      message: `增量恢复完成，共插入 ${totalInserted} 条新记录` 
    });
  };
  
  tables.forEach(tableName => {
    const tableData = backupData.tables[tableName];
    const rows = tableData.data || [];
    let inserted = 0;
    let processed = 0;
    
    if (rows.length === 0) {
      completed++;
      if (completed >= tables.length) finish();
      return;
    }
    
    rows.forEach(row => {
      const id = row.id;
      
      db.get(`SELECT COUNT(*) as count FROM ${tableName} WHERE id = ?`, [id], (err, result) => {
        if (err || (result && result.count > 0)) {
          processed++;
          if (processed >= rows.length) {
            totalInserted += inserted;
            completed++;
            if (completed >= tables.length) finish();
          }
          return;
        }
        
        const columns = Object.keys(row);
        const placeholders = columns.map(() => '?').join(',');
        const insertSql = `INSERT INTO ${tableName} (${columns.join(',')}) VALUES (${placeholders})`;
        
        db.run(insertSql, Object.values(row), () => {
          inserted++;
          processed++;
          if (processed >= rows.length) {
            totalInserted += inserted;
            completed++;
            if (completed >= tables.length) finish();
          }
        });
      });
    });
  });
});

app.get('/api/notes', authenticateToken, (req, res) => {
  const { search, category } = req.query;
  
  let query = `SELECT * FROM trading_notes WHERE deleted_at IS NULL`;
  const params = [];
  
  if (search) {
    query += ` AND (title LIKE ? OR content LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  
  if (category && category !== '全部') {
    query += ` AND category = ?`;
    params.push(category);
  }
  
  query += ` ORDER BY is_favorite DESC, created_at DESC`;
  
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, data: rows });
  });
});

app.get('/api/notes/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.get(`SELECT * FROM trading_notes WHERE id = ? AND deleted_at IS NULL`, [id], (err, row) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    if (!row) {
      return res.json({ success: false, error: '心得不存在' });
    }
    res.json({ success: true, data: row });
  });
});

app.post('/api/notes', authenticateToken, (req, res) => {
  const { title, content, category, tags } = req.body;
  
  if (!title) {
    return res.json({ success: false, error: '标题不能为空' });
  }
  
  db.run(
    `INSERT INTO trading_notes (title, content, category, tags, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [title, content || '', category || '心得', tags || ''],
    function(err) {
      if (err) {
        return res.json({ success: false, error: err.message });
      }
      backup.createBackup();
      db.get(`SELECT * FROM trading_notes WHERE id = ?`, [this.lastID], (getErr, row) => {
        if (getErr) {
          return res.json({ success: false, error: getErr.message });
        }
        res.json({ success: true, data: row });
      });
    }
  );
});

app.put('/api/notes/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { title, content, category, tags } = req.body;
  
  if (!title) {
    return res.json({ success: false, error: '标题不能为空' });
  }
  
  db.run(
    `UPDATE trading_notes SET title = ?, content = ?, category = ?, tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`,
    [title, content || '', category || '心得', tags || '', id],
    function(err) {
      if (err) {
        return res.json({ success: false, error: err.message });
      }
      if (this.changes === 0) {
        return res.json({ success: false, error: '心得不存在' });
      }
      backup.createBackup();
      db.get(`SELECT * FROM trading_notes WHERE id = ?`, [id], (getErr, row) => {
        if (getErr) {
          return res.json({ success: false, error: getErr.message });
        }
        res.json({ success: true, data: row });
      });
    }
  );
});

app.delete('/api/notes/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run(`UPDATE trading_notes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`, [id], function(err) {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    if (this.changes === 0) {
      return res.json({ success: false, error: '心得不存在' });
    }
    backup.createBackup();
    res.json({ success: true, data: { id, changes: this.changes } });
  });
});

app.post('/api/notes/:id/favorite', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.get(`SELECT is_favorite FROM trading_notes WHERE id = ? AND deleted_at IS NULL`, [id], (err, row) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    if (!row) {
      return res.json({ success: false, error: '心得不存在' });
    }
    
    const newFavorite = row.is_favorite === 1 ? 0 : 1;
    
    db.run(`UPDATE trading_notes SET is_favorite = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [newFavorite, id], function(updateErr) {
      if (updateErr) {
        return res.json({ success: false, error: updateErr.message });
      }
      backup.createBackup();
      res.json({ success: true, data: { id, is_favorite: newFavorite } });
    });
  });
});

const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';

app.listen(port, host, () => {
  console.log(`Server running: http://${host}:${port}`);
  console.log(`公网访问地址: http://121.43.49.195:${port}`);
});