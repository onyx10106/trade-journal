const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./trading.db", (err) => {
    if (err) {
        console.error("数据库连接失败：", err.message);
        process.exit(1);
    }
    console.log("✅ SQLite连接成功");
});

db.run(`INSERT INTO trades (date, symbol, direction, timeframe, leverage, entry, exit, sl, tp, position, reason, review, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
        '2026-07-06',
        'BTC',
        'long',
        '1H',
        10,
        63115,
        62900,
        62926,
        65000,
        400,
        '猫哥1小时策略看多，k线跌破了20均线，马上跌到60均线，感觉性价比很高（赔率很高）',
        '结果：跌破止损价格，被平仓；\n感悟：交易不可赌，严格按趋势来，回踩 20均线不破才开仓\n感悟2：市场上的钱挣不完，但是你的钱真是可以亏完。',
        '2026-07-06 07:27:43'
    ],
    function(err) {
        if (err) {
            console.error("插入失败:", err.message);
        } else {
            console.log("✅ 插入成功，ID:", this.lastID);
        }
        db.close();
    }
);