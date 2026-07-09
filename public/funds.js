document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("fundForm");
  const datetimeInput = document.getElementById("datetimeInput");
  const fundType = document.getElementById("fundType");
  const depositBtn = document.getElementById("depositBtn");
  const withdrawBtn = document.getElementById("withdrawBtn");
  const balanceAmount = document.getElementById("balanceAmount");
  const totalDeposit = document.getElementById("totalDeposit");
  const totalWithdraw = document.getElementById("totalWithdraw");
  const fundTableBody = document.getElementById("fundTableBody");
  const actualBalanceAmount = document.getElementById("actualBalanceAmount");
  const balanceTableBody = document.getElementById("balanceTableBody");

  const setDefaultDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  };

  datetimeInput.value = setDefaultDateTime();

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

  const showToast = (message, type = "success") => {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.style.display = "block";
    
    setTimeout(() => {
      toast.style.display = "none";
    }, 3000);
  };

  const loadFundTotal = async () => {
    try {
      const res = await fetch("/api/funds/total");
      const result = await res.json();
      if (result.success) {
        const { total_deposit, total_withdraw, balance } = result.data;
        balanceAmount.textContent = `$${(balance || 0).toFixed(2)}`;
        totalDeposit.textContent = `+$${(total_deposit || 0).toFixed(2)}`;
        totalWithdraw.textContent = `-$${(total_withdraw || 0).toFixed(2)}`;
      }
    } catch (err) {
      console.error("加载余额失败:", err);
    }
  };

  const loadFundRecords = async () => {
    try {
      const res = await fetch("/api/funds");
      const result = await res.json();
      if (result.success) {
        const records = result.data;
        renderFundTable(records);
      }
    } catch (err) {
      console.error("加载记录失败:", err);
    }
  };

  const renderFundTable = (records) => {
    if (!records || records.length === 0) {
      fundTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">
            <p>暂无记录</p>
          </td>
        </tr>
      `;
      return;
    }

    fundTableBody.innerHTML = records.map(record => `
      <tr>
        <td>${formatDate(record.date)}</td>
        <td>
          <span class="type-badge ${record.type}">
            ${record.type === 'deposit' ? '入金' : '出金'}
          </span>
        </td>
        <td class="${record.type === 'deposit' ? 'amount-positive' : 'amount-negative'}">
          ${record.type === 'deposit' ? '+' : '-'}$${record.amount.toFixed(2)}
        </td>
        <td>${record.address || '-'}</td>
        <td>${record.reason || '-'}</td>
        <td>
          <button class="btn-delete" onclick="deleteFundRecord(${record.id})">删除</button>
        </td>
      </tr>
    `).join('');
  };

  const loadActualBalance = async () => {
    try {
      const res = await fetch("/api/account-balance/total");
      const result = await res.json();
      if (result.success) {
        actualBalanceAmount.textContent = `$${(result.data.total || 0).toFixed(2)}`;
      }
    } catch (err) {
      console.error("加载实际余额失败:", err);
    }
  };

  const loadBalanceRecords = async () => {
    try {
      const res = await fetch("/api/account-balance");
      const result = await res.json();
      if (result.success) {
        const records = result.data;
        renderBalanceTable(records);
      }
    } catch (err) {
      console.error("加载余额记录失败:", err);
    }
  };

  const renderBalanceTable = (records) => {
    if (!records || records.length === 0) {
      balanceTableBody.innerHTML = `
        <tr>
          <td colspan="4" class="empty-state">
            <p>暂无记录</p>
          </td>
        </tr>
      `;
      return;
    }

    balanceTableBody.innerHTML = records.map(record => `
      <tr>
        <td>${formatDate(record.date)}</td>
        <td class="amount-positive">$${record.amount.toFixed(2)}</td>
        <td>${record.reason || '-'}</td>
        <td>
          <button class="btn-edit" onclick="editBalanceRecord(${record.id})">编辑</button>
          <button class="btn-delete" onclick="deleteBalanceRecord(${record.id})">删除</button>
        </td>
      </tr>
    `).join('');
  };

  window.deleteFundRecord = async (id) => {
    if (!confirm("确定要删除这条出入金记录吗？")) return;

    try {
      const res = await fetch(`/api/fund/${id}`, {
        method: "DELETE"
      });

      const result = await res.json();

      if (result.success) {
        showToast("删除成功！", "success");
        loadFundTotal();
        loadFundRecords();
      } else {
        showToast("删除失败: " + result.error, "error");
      }

    } catch (err) {
      showToast("请求失败: " + err.message, "error");
    }
  };

  window.deleteBalanceRecord = async (id) => {
    if (!confirm("确定要删除这条余额调整记录吗？")) return;

    try {
      const res = await fetch(`/api/account-balance/${id}`, {
        method: "DELETE"
      });

      const result = await res.json();

      if (result.success) {
        showToast("删除成功！", "success");
        loadActualBalance();
        loadBalanceRecords();
      } else {
        showToast("删除失败: " + result.error, "error");
      }

    } catch (err) {
      showToast("请求失败: " + err.message, "error");
    }
  };

  window.openBalanceModal = () => {
    document.getElementById("balanceModal").style.display = "flex";
    document.getElementById("balanceForm").reset();
    document.getElementById("balanceId").value = "";
    document.getElementById("balanceDate").value = setDefaultDateTime();
  };

  window.closeBalanceModal = () => {
    document.getElementById("balanceModal").style.display = "none";
  };

  window.editBalanceRecord = async (id) => {
    try {
      const res = await fetch(`/api/account-balance`);
      const result = await res.json();
      if (result.success) {
        const record = result.data.find(r => r.id === id);
        if (record) {
          document.getElementById("balanceModal").style.display = "flex";
          document.getElementById("balanceId").value = record.id;
          document.getElementById("balanceDate").value = record.date ? new Date(record.date).toISOString().slice(0, 16) : setDefaultDateTime();
          document.getElementById("balanceAmountInput").value = record.amount;
          document.getElementById("balanceReason").value = record.reason || '';
        }
      }
    } catch (err) {
      showToast("加载数据失败: " + err.message, "error");
    }
  };

  document.getElementById("balanceForm").addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const d = Object.fromEntries(new FormData(e.target));
    const payload = {
      amount: Number(d.amount),
      reason: d.reason,
      date: d.date
    };

    if (!payload.amount || payload.amount < 0) {
      showToast("请输入有效的余额", "error");
      return;
    }

    try {
      const id = document.getElementById("balanceId").value;
      const url = id ? `/api/account-balance/${id}` : "/api/account-balance";
      const method = id ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (result.success) {
        showToast(id ? "修改成功！" : "添加成功！", "success");
        closeBalanceModal();
        loadActualBalance();
        loadBalanceRecords();
      } else {
        showToast("保存失败: " + result.error, "error");
      }

    } catch (err) {
      showToast("请求失败: " + err.message, "error");
    }
  });

  depositBtn.addEventListener('click', (e) => {
    e.preventDefault();
    fundType.value = 'deposit';
    submitForm();
  });

  withdrawBtn.addEventListener('click', (e) => {
    e.preventDefault();
    fundType.value = 'withdraw';
    submitForm();
  });

  const submitForm = async () => {
    const d = Object.fromEntries(new FormData(form));

    const payload = {
      type: d.type,
      amount: Number(d.amount),
      address: d.address,
      reason: d.reason,
      date: d.date
    };

    if (!payload.amount || payload.amount <= 0) {
      showToast("请输入有效的金额", "error");
      return;
    }

    try {
      const res = await fetch("/api/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (result.success) {
        showToast(`${payload.type === 'deposit' ? '入金' : '出金'}记录保存成功！`, "success");
        form.reset();
        datetimeInput.value = setDefaultDateTime();
        loadFundTotal();
        loadFundRecords();
      } else {
        showToast("保存失败: " + result.error, "error");
      }

    } catch (err) {
      showToast("请求失败: " + err.message, "error");
    }
  };

  loadFundTotal();
  loadFundRecords();
  loadActualBalance();
  loadBalanceRecords();

});