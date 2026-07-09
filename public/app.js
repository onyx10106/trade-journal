document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("tradeForm");

  if (!form) {
    console.error("form not found");
    return;
  }

  const datetimeInput = document.getElementById("datetimeInput");
  const leverageInput = document.getElementById("leverage");

  const setDefaultDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    datetimeInput.value = now.toISOString().slice(0, 16);
  };

  setDefaultDateTime();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const d = Object.fromEntries(new FormData(form));

    const payload = {
      trade_date: d.date,
      symbol: d.symbol,
      direction: d.direction,
      timeframe: d.timeframe,
      leverage: d.leverage !== undefined && d.leverage !== '' ? Number(d.leverage) : 10,
      entry_price: d.entry !== undefined && d.entry !== '' ? Number(d.entry) : null,
      exit_price: d.exit !== undefined && d.exit !== '' ? Number(d.exit) : null,
      stop_loss: null,
      take_profit: null,
      position_usd: d.position !== undefined && d.position !== '' ? Number(d.position) : null,
      pnl: d.pnl !== undefined && d.pnl !== '' ? Number(d.pnl) : null,
      reason: d.reason,
      review: d.review
    };

    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (result.success) {
        alert("交易记录保存成功！");
        form.reset();
        setDefaultDateTime();
        leverageInput.value = 10;
      } else {
        alert("保存失败: " + result.error);
      }

    } catch (err) {
      alert("请求失败: " + err.message);
    }
  });

});
