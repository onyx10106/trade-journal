const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./trading.db", (err) => {
    if (err) {
        console.error("数据库连接失败：", err.message);
        process.exit(1);
    }
    console.log("✅ SQLite连接成功");
});

const records = [
    {
        date: '',
        symbol: '1',
        direction: 'long',
        timeframe: '15m',
        leverage: 10,
        entry: 1,
        exit: 1,
        sl: 0,
        tp: null,
        position: null,
        reason: '1',
        review: '1',
        created_at: '2026-07-06 04:53:18'
    },
    {
        date: '2026-07-06',
        symbol: 'BTC',
        direction: 'long',
        timeframe: '1H',
        leverage: 10,
        entry: 63115,
        exit: 62900,
        sl: 62926,
        tp: 65000,
        position: 400,
        reason: '猫哥1小时策略看多，k线跌破了20均线，马上跌到60均线，感觉性价比很高（赔率很高）',
        review: '结果：跌破止损价格，被平仓；\n感悟：交易不可赌，严格按趋势来，回踩 20均线不破才开仓\n感悟2：市场上的钱挣不完，但是你的钱真是可以亏完。',
        created_at: '2026-07-06 07:27:43'
    }
];

let inserted = 0;
records.forEach((record, index) => {
    db.run(`INSERT INTO trades (date, symbol, direction, timeframe, leverage, entry, exit, sl, tp, position, reason, review, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            record.date,
            record.symbol,
            record.direction,
            record.timeframe,
            record.leverage,
            record.entry,
            record.exit,
            record.sl,
            record.tp,
            record.position,
            record.reason,
            record.review,
            record.created_at
        ],
        function(err) {
            if (err) {
                console.error(`第${index+1}条记录插入失败:`, err.message);
            } else {
                console.log(`✅ 第${index+1}条记录插入成功，ID:`, this.lastID);
                inserted++;
            }
            
            if (index === records.length - 1) {
                console.log(`\n共成功插入 ${inserted}/${records.length} 条记录`);
                db.close();
            }
        }
    );
});