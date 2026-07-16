const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./trading.db", (err) => {
    if (err) {
        console.error("数据库连接失败：", err.message);
    } else {
        console.log("✅ SQLite连接成功");
    }
});

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            symbol TEXT,
            direction TEXT,
            timeframe TEXT,
            leverage INTEGER DEFAULT 10,
            entry REAL,
            exit REAL,
            sl REAL,
            tp REAL,
            position REAL,
            reason TEXT,
            review TEXT,
            deleted_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`ALTER TABLE trades ADD COLUMN leverage INTEGER DEFAULT 10`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error("添加leverage字段失败:", err.message);
        }
    });

    db.run(`ALTER TABLE trades ADD COLUMN deleted_at DATETIME`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error("添加deleted_at字段失败:", err.message);
        }
    });

    db.run(`ALTER TABLE trades ADD COLUMN pnl REAL`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error("添加pnl字段失败:", err.message);
        }
    });
});

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS fund_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            address TEXT,
            reason TEXT,
            date TEXT NOT NULL,
            deleted_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`ALTER TABLE fund_records ADD COLUMN deleted_at DATETIME`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error("添加deleted_at字段失败:", err.message);
        }
    });
});

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS account_balance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            amount REAL NOT NULL,
            reason TEXT,
            date TEXT NOT NULL,
            deleted_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS watchlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            stock_code TEXT NOT NULL,
            signal TEXT,
            expected_gain REAL,
            is_watching INTEGER DEFAULT 1,
            remark TEXT,
            deleted_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

db.get(`SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='watchlist'`, [], (err, row) => {
    if (err || !row || row.cnt === 0) return;
    db.all(`PRAGMA table_info(watchlist)`, [], (infoErr, columns) => {
        if (infoErr) return;
        const colNames = columns.map(c => c.name);
        if (!colNames.includes('remark')) {
            db.run(`ALTER TABLE watchlist ADD COLUMN remark TEXT`);
        }
        if (!colNames.includes('updated_at')) {
            db.run(`ALTER TABLE watchlist ADD COLUMN updated_at DATETIME`);
        }
    });
});

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS watchlist_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            watchlist_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            changes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (watchlist_id) REFERENCES watchlist(id)
        )
    `);
});

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS trade_attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            filepath TEXT NOT NULL,
            file_url TEXT NOT NULL,
            file_type TEXT,
            size INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (trade_id) REFERENCES trades(id)
        )
    `);
});

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS trading_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT,
            category TEXT DEFAULT '心得',
            tags TEXT,
            is_favorite INTEGER DEFAULT 0,
            deleted_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

module.exports = db;