require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const supabase = require('./supabaseClient');
const db = require('./database');

const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trades.html'));
});

app.get('/add', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'add.html'));
});

app.post('/api/trade', async (req, res) => {
  const { trade_date, symbol, direction, timeframe, leverage, entry_price, exit_price, stop_loss, take_profit, position_usd, pnl, reason, review } = req.body;

  db.run(
    `INSERT INTO trades (date, symbol, direction, timeframe, leverage, entry, exit, sl, tp, position, pnl, reason, review)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [trade_date, symbol, direction, timeframe, leverage, entry_price, exit_price, stop_loss, take_profit, position_usd, pnl, reason, review],
    function(err) {
      if (err) {
        return res.json({ success: false, error: err.message });
      }
      res.json({ success: true, data: { id: this.lastID } });
    }
  );
});

app.get('/api/trades', (req, res) => {
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

app.put('/api/trade/:id', (req, res) => {
  const { id } = req.params;
  const { trade_date, symbol, direction, timeframe, leverage, entry_price, exit_price, stop_loss, take_profit, position_usd, pnl, reason, review } = req.body;
  
  db.run(
    `UPDATE trades SET date = ?, symbol = ?, direction = ?, timeframe = ?, leverage = ?, entry = ?, exit = ?, sl = ?, tp = ?, position = ?, pnl = ?, reason = ?, review = ? WHERE id = ?`,
    [trade_date, symbol, direction, timeframe, leverage, entry_price, exit_price, stop_loss, take_profit, position_usd, pnl, reason, review, id],
    function(err) {
      if (err) {
        return res.json({ success: false, error: err.message });
      }
      res.json({ success: true, data: { id, changes: this.changes } });
    }
  );
});

app.get('/api/trade/:id', (req, res) => {
  const { id } = req.params;
  
  db.get(`SELECT * FROM trades WHERE id = ? AND deleted_at IS NULL`, [id], (err, row) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, data: row });
  });
});

app.delete('/api/trade/:id', (req, res) => {
  const { id } = req.params;
  
  db.run(`UPDATE trades SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`, [id], function(err) {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, data: { id, changes: this.changes } });
  });
});

app.get('/trades', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trades.html'));
});

app.get('/funds', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'funds.html'));
});

app.post('/api/fund', (req, res) => {
  const { type, amount, address, reason, date } = req.body;

  db.run(
    `INSERT INTO fund_records (type, amount, address, reason, date)
     VALUES (?, ?, ?, ?, ?)`,
    [type, amount, address, reason, date],
    function(err) {
      if (err) {
        return res.json({ success: false, error: err.message });
      }
      res.json({ success: true, data: { id: this.lastID } });
    }
  );
});

app.get('/api/funds', (req, res) => {
  db.all(`SELECT * FROM fund_records WHERE deleted_at IS NULL ORDER BY date DESC`, [], (err, rows) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, data: rows });
  });
});

app.delete('/api/fund/:id', (req, res) => {
  const { id } = req.params;
  
  db.run(`UPDATE fund_records SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`, [id], function(err) {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, data: { id, changes: this.changes } });
  });
});

app.get('/api/funds/total', (req, res) => {
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

app.get('/api/account-balance', (req, res) => {
  db.all(`SELECT * FROM account_balance WHERE deleted_at IS NULL ORDER BY date DESC`, [], (err, rows) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, data: rows });
  });
});

app.get('/api/account-balance/total', (req, res) => {
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

app.post('/api/account-balance', (req, res) => {
  const { amount, reason, date } = req.body;

  db.run(
    `INSERT INTO account_balance (amount, reason, date) VALUES (?, ?, ?)`,
    [amount, reason, date],
    function(err) {
      if (err) {
        return res.json({ success: false, error: err.message });
      }
      res.json({ success: true, data: { id: this.lastID } });
    }
  );
});

app.put('/api/account-balance/:id', (req, res) => {
  const { id } = req.params;
  const { amount, reason, date } = req.body;

  db.run(
    `UPDATE account_balance SET amount = ?, reason = ?, date = ? WHERE id = ? AND deleted_at IS NULL`,
    [amount, reason, date, id],
    function(err) {
      if (err) {
        return res.json({ success: false, error: err.message });
      }
      res.json({ success: true, data: { id, changes: this.changes } });
    }
  );
});

app.delete('/api/account-balance/:id', (req, res) => {
  const { id } = req.params;
  
  db.run(`UPDATE account_balance SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`, [id], function(err) {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, data: { id, changes: this.changes } });
  });
});

app.get('/watchlist', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'watchlist.html'));
});

app.get('/date', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'date.html'));
});

app.get('/api/watchlist', (req, res) => {
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

app.get('/api/watchlist/:id/logs', (req, res) => {
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

app.get('/api/watchlist/:id', (req, res) => {
  const { id } = req.params;
  
  db.get(`SELECT * FROM watchlist WHERE id = ? AND deleted_at IS NULL`, [id], (err, row) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, data: row });
  });
});

app.post('/api/watchlist', (req, res) => {
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
      res.json({ success: true, data: { id: newId } });
    }
  );
});

app.put('/api/watchlist/:id', (req, res) => {
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
        res.json({ success: true, data: { id, changes: this.changes } });
      }
    );
  });
});

app.delete('/api/watchlist/:id', (req, res) => {
  const { id } = req.params;
  
  db.run(`UPDATE watchlist SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`, [id], function(err) {
    if (err) {
      return res.json({ success: false, error: err.message });
    }
    res.json({ success: true, data: { id, changes: this.changes } });
  });
});

const port = 3000;
app.listen(port, () => {
  console.log(`Server running: http://localhost:${port}`);
});