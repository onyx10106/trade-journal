const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./database");

const app = express();
const PORT = 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 提供 public 目录中的静态页面
app.use(express.static(path.join(__dirname, "public")));

// 首页
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 新增交易
app.post("/api/trade", (req, res) => {

    const {
        date,
        symbol,
        direction,
        timeframe,
        entry,
        exit,
        sl,
        tp,
        position,
        reason,
        review
    } = req.body;

    const sql = `
        INSERT INTO trades
        (
            date,
            symbol,
            direction,
            timeframe,
            entry,
            exit,
            sl,
            tp,
            position,
            reason,
            review
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `;

    db.run(
        sql,
        [
            date,
            symbol,
            direction,
            timeframe,
            entry,
            exit,
            sl,
            tp,
            position,
            reason,
            review
        ],
        function (err) {

            if (err) {

                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: err.message
                });

            }

            res.json({
                success: true,
                message: "保存成功",
                id: this.lastID
            });

        }
    );

});

// 查询所有交易
app.get("/api/trades", (req, res) => {

    db.all(
        "SELECT * FROM trades ORDER BY id DESC",
        [],
        (err, rows) => {

            if (err) {

                return res.status(500).json({
                    success: false,
                    message: err.message
                });

            }

            res.json(rows);

        }
    );

});

// 删除交易
app.delete("/api/trades/:id", (req, res) => {

    db.run(
        "DELETE FROM trades WHERE id = ?",
        [req.params.id],
        function (err) {

            if (err) {

                return res.status(500).json({
                    success: false,
                    message: err.message
                });

            }

            res.json({
                success: true,
                message: "删除成功"
            });

        }
    );

});

app.listen(PORT, () => {

    console.log("====================================");
    console.log("🚀 Trading Journal Server 已启动");
    console.log(`📍 http://localhost:${PORT}`);
    console.log("====================================");

});