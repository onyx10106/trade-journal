let currentPage = 1;
let currentFilters = {};
let paginationData = { total: 0, pages: 0 };

document.addEventListener("DOMContentLoaded", () => {
  loadTrades();
});

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

const loadTrades = async () => {
  const params = new URLSearchParams({
    page: currentPage,
    limit: 10,
    ...currentFilters
  });

  try {
    const res = await fetch(`/api/trades?${params.toString()}`);
    const result = await res.json();

    if (result.success) {
      renderTable(result.data);
      updatePagination(result.pagination);
    }
  } catch (err) {
    console.error("加载交易记录失败:", err);
  }
};

const renderTable = (trades) => {
  const tbody = document.getElementById("tradeTableBody");

  if (!trades || trades.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="empty-state">
          <p>暂无记录</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = trades.map(trade => {
    const pnl = trade.pnl;
    const pnlDisplay = pnl !== null && pnl !== undefined ? `$${parseFloat(pnl).toFixed(2)}` : '';
    const pnlClass = pnl !== null && pnl !== undefined ? (pnl >= 0 ? 'profit' : 'loss') : '';
    const rowClass = pnl !== null && pnl !== undefined ? (pnl > 0 ? 'row-profit' : pnl < 0 ? 'row-loss' : '') : '';
    
    return `
    <tr class="${rowClass}">
      <td>${formatDate(trade.date)}</td>
      <td>${trade.symbol}</td>
      <td>
        <span class="type-badge ${trade.direction}">
          ${trade.direction === 'long' ? '多头' : '空头'}
        </span>
      </td>
      <td>${trade.timeframe}</td>
      <td>${trade.leverage || 10}x</td>
      <td>$${(trade.entry || 0).toFixed(4)}</td>
      <td>$${(trade.exit || 0).toFixed(4)}</td>
      <td>$${(trade.position || 0).toFixed(2)}</td>
      <td class="${pnlClass}">${pnlDisplay}</td>
      <td>
        <div class="action-buttons">
          <button class="btn-edit" onclick="editTrade(${trade.id})">编辑</button>
          <button class="btn-delete" onclick="deleteTrade(${trade.id})">删除</button>
        </div>
      </td>
    </tr>
  `}).join('');
};

const updatePagination = (pagination) => {
  paginationData = pagination;
  currentPage = pagination.page;

  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const info = document.getElementById("paginationInfo");

  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= pagination.pages;

  const start = (currentPage - 1) * pagination.limit + 1;
  const end = Math.min(currentPage * pagination.limit, pagination.total);
  info.textContent = `显示 ${start}-${end} 条，共 ${pagination.total} 条`;
};

const goToPage = (page) => {
  if (page < 1 || page > paginationData.pages) return;
  currentPage = page;
  loadTrades();
};

const applyFilters = () => {
  currentFilters = {
    symbol: document.getElementById("filterSymbol").value,
    direction: document.getElementById("filterDirection").value,
    timeframe: document.getElementById("filterTimeframe").value,
    startDate: document.getElementById("filterStartDate").value,
    endDate: document.getElementById("filterEndDate").value
  };

  currentPage = 1;
  loadTrades();
};

const clearFilters = () => {
  document.getElementById("filterSymbol").value = "";
  document.getElementById("filterDirection").value = "";
  document.getElementById("filterTimeframe").value = "";
  document.getElementById("filterStartDate").value = "";
  document.getElementById("filterEndDate").value = "";
  
  currentFilters = {};
  currentPage = 1;
  loadTrades();
};

const editTrade = async (id) => {
  try {
    const res = await fetch(`/api/trade/${id}`);
    const result = await res.json();

    if (result.success && result.data) {
      populateEditForm(result.data);
      document.getElementById("editModal").classList.add("active");
    } else {
      alert("未找到交易记录");
    }
  } catch (err) {
    console.error("获取交易记录失败:", err);
    alert("获取交易记录失败");
  }
};

const populateEditForm = (trade) => {
  document.getElementById("editId").value = trade.id;
  
  const date = new Date(trade.date);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  document.getElementById("editDate").value = date.toISOString().slice(0, 16);
  
  document.getElementById("editSymbol").value = trade.symbol;
  document.getElementById("editDirection").value = trade.direction;
  document.getElementById("editTimeframe").value = trade.timeframe;
  document.getElementById("editLeverage").value = trade.leverage || 10;
  document.getElementById("editPosition").value = trade.position || "";
  document.getElementById("editEntry").value = trade.entry || "";
  document.getElementById("editExit").value = trade.exit || "";
  document.getElementById("editPnl").value = trade.pnl || "";
  document.getElementById("editReason").value = trade.reason || "";
  document.getElementById("editReview").value = trade.review || "";
};

const closeModal = () => {
  document.getElementById("editModal").classList.remove("active");
  document.getElementById("editForm").reset();
};

let deleteTradeId = null;

const deleteTrade = (id) => {
  deleteTradeId = id;
  document.getElementById("confirmModal").classList.add("active");
};

const closeConfirmModal = () => {
  document.getElementById("confirmModal").classList.remove("active");
  deleteTradeId = null;
};

const confirmDelete = async () => {
  if (!deleteTradeId) return;

  try {
    const res = await fetch(`/api/trade/${deleteTradeId}`, {
      method: "DELETE"
    });

    const result = await res.json();

    if (result.success) {
      showToast("删除成功！", "success");
      loadTrades();
    } else {
      showToast("删除失败: " + result.error, "error");
    }
  } catch (err) {
    showToast("请求失败: " + err.message, "error");
  } finally {
    closeConfirmModal();
  }
};

const showToast = (message, type = "success") => {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.style.display = "block";
  
  setTimeout(() => {
    toast.style.display = "none";
  }, 3000);
};

document.getElementById("editForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData);

  const payload = {
    trade_date: data.date,
    symbol: data.symbol,
    direction: data.direction,
    timeframe: data.timeframe,
    leverage: data.leverage !== undefined && data.leverage !== '' ? parseInt(data.leverage) : 10,
    entry_price: data.entry !== undefined && data.entry !== '' ? parseFloat(data.entry) : null,
    exit_price: data.exit !== undefined && data.exit !== '' ? parseFloat(data.exit) : null,
    stop_loss: null,
    take_profit: null,
    position_usd: data.position !== undefined && data.position !== '' ? parseFloat(data.position) : null,
    pnl: data.pnl !== undefined && data.pnl !== '' ? parseFloat(data.pnl) : null,
    reason: data.reason,
    review: data.review
  };

  try {
    const res = await fetch(`/api/trade/${data.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await res.json();

    if (result.success) {
      showToast("修改成功！", "success");
      closeModal();
      loadTrades();
    } else {
      showToast("修改失败: " + result.error, "error");
    }
  } catch (err) {
    showToast("请求失败: " + err.message, "error");
  }
});
