let currentPage = 1;
let currentFilters = {};
let paginationData = { total: 0, pages: 0 };
let tradesWithAttachments = [];

const getToken = () => localStorage.getItem('token');

const fetchWithAuth = async (url, options = {}) => {
  const token = getToken();
  if (!token) {
    window.location.href = '/login';
    throw new Error('未登录');
  }
  
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`
  };
  
  const res = await fetch(url, { ...options, headers });
  
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/login';
    throw new Error('登录已过期');
  }
  
  return res;
};

document.addEventListener("DOMContentLoaded", () => {
  if (!getToken()) {
    window.location.href = '/login';
    return;
  }
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
    const res = await fetchWithAuth(`/api/trades?${params.toString()}`);
    const result = await res.json();

    if (result.success) {
      tradesWithAttachments = result.data;
      await loadAttachmentsForTrades(tradesWithAttachments);
      renderTable(tradesWithAttachments);
      updatePagination(result.pagination);
    }
  } catch (err) {
    console.error("加载交易记录失败:", err);
  }
};

const loadAttachmentsForTrades = async (trades) => {
  for (const trade of trades) {
    try {
      const res = await fetchWithAuth(`/api/trade/${trade.id}/attachments`);
      const result = await res.json();
      trade.attachments = result.success ? result.data : [];
    } catch (err) {
      trade.attachments = [];
    }
  }
};

const renderTable = (trades) => {
  const tbody = document.getElementById("tradeTableBody");

  if (!trades || trades.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="empty-state">
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
    
    const attachments = trade.attachments || [];
    const attachmentsHtml = attachments.length > 0 ? `
      <div class="attachments-preview">
        ${attachments.slice(0, 3).map((att, i) => `
          <img src="${att.file_url}" class="attachment-thumb" onclick="showImage('${att.file_url}')" title="${att.filename}">
        `).join('')}
        ${attachments.length > 3 ? `<span class="more-count">+${attachments.length - 3}</span>` : ''}
      </div>
    ` : '';
    
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
      <td>${attachmentsHtml}</td>
      <td>
        <div class="action-buttons">
          <button class="btn-edit" onclick="editTrade(${trade.id})">编辑</button>
          <button class="btn-delete" onclick="deleteTrade(${trade.id})">删除</button>
        </div>
      </td>
    </tr>
  `}).join('');
};

const showImage = (url) => {
  const modal = document.getElementById("imageModal");
  const img = document.getElementById("previewImage");
  img.src = url;
  modal.classList.add("active");
};

const closeImageModal = () => {
  const modal = document.getElementById("imageModal");
  modal.classList.remove("active");
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

let editFilesToUpload = [];

const editTrade = async (id) => {
  try {
    const [tradeRes, attachmentsRes] = await Promise.all([
      fetchWithAuth(`/api/trade/${id}`),
      fetchWithAuth(`/api/trade/${id}/attachments`)
    ]);

    const tradeResult = await tradeRes.json();
    const attachmentsResult = await attachmentsRes.json();

    if (tradeResult.success && tradeResult.data) {
      populateEditForm(tradeResult.data);
      editFilesToUpload = [];
      const editUploadedFiles = document.getElementById("editUploadedFiles");
      editUploadedFiles.innerHTML = '';
      
      const existingAttachments = attachmentsResult.success ? attachmentsResult.data : [];
      existingAttachments.forEach(att => {
        const div = document.createElement("div");
        div.className = "uploaded-file";
        div.innerHTML = `
          <img src="${att.file_url}" alt="${att.filename}" onclick="showImage('${att.file_url}')" style="cursor:pointer">
          <button class="remove-btn" onclick="removeEditAttachment(${att.id}, this); event.stopPropagation();">&times;</button>
        `;
        editUploadedFiles.appendChild(div);
      });
      
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
  editFilesToUpload = [];
  document.getElementById("editUploadedFiles").innerHTML = '';
};

const removeEditAttachment = async (attachmentId, btn) => {
  if (!confirm("确定要删除这个附件吗？")) return;
  
  try {
    const res = await fetchWithAuth(`/api/attachment/${attachmentId}`, {
      method: "DELETE"
    });
    const result = await res.json();
    
    if (result.success) {
      btn.parentElement.remove();
      showToast("附件删除成功！", "success");
    } else {
      showToast("删除失败: " + result.error, "error");
    }
  } catch (err) {
    showToast("请求失败: " + err.message, "error");
  }
};

document.getElementById("editFileInput").addEventListener("change", (e) => {
  const editUploadedFiles = document.getElementById("editUploadedFiles");
  Array.from(e.target.files).forEach(file => {
    editFilesToUpload.push(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const div = document.createElement("div");
      div.className = "uploaded-file";
      div.innerHTML = `
        <img src="${ev.target.result}" alt="${file.name}" onclick="showImage('${ev.target.result}')" style="cursor:pointer">
        <button class="remove-btn" onclick="removeEditFile('${file.name}', this); event.stopPropagation();">&times;</button>
      `;
      editUploadedFiles.appendChild(div);
    };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
});

const removeEditFile = (fileName, btn) => {
  const index = editFilesToUpload.findIndex(f => f.name === fileName);
  if (index > -1) {
    editFilesToUpload.splice(index, 1);
  }
  btn.parentElement.remove();
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
    const res = await fetchWithAuth(`/api/trade/${deleteTradeId}`, {
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
    const res = await fetchWithAuth(`/api/trade/${data.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await res.json();

    if (result.success) {
      if (editFilesToUpload.length > 0) {
        const uploadFormData = new FormData();
        editFilesToUpload.forEach(file => {
          uploadFormData.append("files", file);
        });
        const uploadRes = await fetchWithAuth(`/api/trade/${data.id}/upload`, {
          method: "POST",
          body: uploadFormData
        });
        const uploadResult = await uploadRes.json();
        if (!uploadResult.success) {
          showToast("附件上传失败: " + uploadResult.error, "error");
        }
      }
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

const logout = async () => {
  try {
    await fetchWithAuth('/api/logout', { method: 'POST' });
  } catch (err) {
    console.log('Logout error:', err);
  }
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  window.location.href = '/login';
};

document.getElementById('backupFolderInput').addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files || files.length === 0) {
    showToast('请选择备份文件夹', 'error');
    return;
  }

  const backupBtn = document.querySelector('.btn-backups');
  if (backupBtn.disabled) {
    showToast('正在处理中，请稍候', 'error');
    return;
  }

  const originalText = backupBtn.textContent;
  backupBtn.textContent = '恢复中...';
  backupBtn.disabled = true;

  let dataFile = null;
  let uploadFiles = [];

  try {
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) {
        showToast(`文件 ${file.name} 超过大小限制(50MB)`, 'error');
        throw new Error(`文件过大: ${file.name}`);
      }

      if (file.name === 'data.json') {
        dataFile = file;
      } else {
        const ext = file.name.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
          uploadFiles.push(file);
        }
      }
    }

    if (!dataFile) {
      showToast('未找到备份文件 data.json，请选择正确的备份文件夹', 'error');
      throw new Error('缺少 data.json');
    }

    if (!dataFile.name.endsWith('.json')) {
      showToast('data.json 文件格式不正确', 'error');
      throw new Error('data.json 格式错误');
    }

    const formData = new FormData();
    formData.append('data', dataFile);
    uploadFiles.forEach(file => {
      formData.append('files', file);
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const res = await fetchWithAuth('/api/restore-from-backup', {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP错误: ${res.status}`);
    }

    const result = await res.json();

    if (result.success) {
      showToast(result.message, 'success');
      loadTrades();
    } else {
      showToast('恢复失败: ' + result.error, 'error');
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      showToast('请求超时，请重试', 'error');
    } else if (err.name === 'TypeError') {
      showToast('网络连接失败，请检查网络', 'error');
    } else {
      showToast('恢复失败: ' + err.message, 'error');
    }
    console.error('恢复备份错误:', err);
  } finally {
    backupBtn.textContent = originalText;
    backupBtn.disabled = false;
    e.target.value = '';
  }
});

const createManualBackup = async () => {
  const btn = document.querySelector('.btn-backup-create');
  const originalText = btn.textContent;
  btn.textContent = '备份中...';
  btn.disabled = true;

  try {
    const res = await fetchWithAuth('/api/backups/manual', {
      method: 'POST'
    });
    const result = await res.json();
    
    if (result.success) {
      showToast(result.message, 'success');
    } else {
      showToast('备份失败: ' + result.error, 'error');
    }
  } catch (err) {
    showToast('备份失败: ' + err.message, 'error');
    console.error('创建备份错误:', err);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
};
