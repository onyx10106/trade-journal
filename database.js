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
            entry REAL,
            exit REAL,
            sl REAL,
            tp REAL,
            position REAL,
            reason TEXT,
            review TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

module.exports = db;