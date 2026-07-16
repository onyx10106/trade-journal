let currentPage = 1;
let currentSearch = '';
let totalPages = 1;
const token = localStorage.getItem('token');

if (!token) {
  window.location.href = '/login';
}

const fetchWithAuth = async (url, options = {}) => {
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`
  };
  const fullUrl = url.startsWith('http') ? url : apiUrl(url);
  const res = await fetch(fullUrl, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/login';
    throw new Error('登录已过期');
  }
  return res;
};

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.style.display = 'block';
  
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
  document.getElementById('watchlistForm').reset();
  document.getElementById('watchlistId').value = '';
  document.getElementById('modalTitle').textContent = '新增关注';
}

function closeLogsModal() {
  document.getElementById('logsModal').style.display = 'none';
}

function openModal(id = null) {
  document.getElementById('watchlistForm').reset();
  document.getElementById('watchlistId').value = '';
  
  if (id) {
    document.getElementById('modalTitle').textContent = '编辑关注';
    fetchWithAuth(`/api/watchlist/${id}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          document.getElementById('watchlistId').value = data.data.id;
          document.getElementById('stockCode').value = data.data.stock_code || '';
          document.getElementById('signal').value = data.data.signal || '';
          document.getElementById('expectedGain').value = data.data.expected_gain || '';
          document.getElementById('isWatching').checked = data.data.is_watching == 1;
          document.getElementById('remark').value = data.data.remark || '';
        }
      })
      .catch(error => {
        showToast('加载数据失败: ' + error.message, 'error');
      });
  } else {
    document.getElementById('modalTitle').textContent = '新增关注';
    document.getElementById('isWatching').checked = true;
  }
  
  document.getElementById('modal').style.display = 'flex';
}

document.getElementById('watchlistForm').addEventListener('submit', (e) => {
  e.preventDefault();
  
  const id = document.getElementById('watchlistId').value;
  const data = {
    stock_code: document.getElementById('stockCode').value,
    signal: document.getElementById('signal').value,
    expected_gain: parseFloat(document.getElementById('expectedGain').value) || null,
    is_watching: document.getElementById('isWatching').checked,
    remark: document.getElementById('remark').value
  };
  
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/watchlist/${id}` : '/api/watchlist';
  
  fetchWithAuth(url, {
    method: method,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      showToast(id ? '修改成功' : '添加成功');
      closeModal();
      loadWatchlist();
    } else {
      showToast('保存失败: ' + data.error, 'error');
    }
  })
  .catch(error => {
    showToast('保存失败: ' + error.message, 'error');
  });
});

function deleteWatchlist(id) {
  if (!confirm('确定要删除这条关注记录吗？')) return;
  
  fetchWithAuth(`/api/watchlist/${id}`, {
    method: 'DELETE'
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      showToast('删除成功');
      loadWatchlist();
    } else {
      showToast('删除失败: ' + data.error, 'error');
    }
  })
  .catch(error => {
    showToast('删除失败: ' + error.message, 'error');
  });
}

function openLogsModal(id) {
  document.getElementById('logsModal').style.display = 'flex';
  document.getElementById('logsContent').innerHTML = '<p style="color:#94a3b8; text-align:center; padding:20px;">加载中...</p>';
  
  fetchWithAuth(`/api/watchlist/${id}/logs`)
    .then(res => res.json())
    .then(data => {
      if (data.success && data.data && data.data.length > 0) {
        const logsHtml = data.data.map(log => {
          const time = new Date(log.created_at).toLocaleString('zh-CN');
          const actionText = log.action === 'create' ? '创建' : '修改';
          let changesHtml = '';
          
          if (log.action === 'create') {
            const fields = log.changes;
            changesHtml = '<ul style="margin:0; padding-left:20px;">';
            if (fields.stock_code) changesHtml += `<li><strong>股票代码</strong>: ${fields.stock_code}</li>`;
            if (fields.signal) changesHtml += `<li><strong>猫哥8H信号</strong>: ${fields.signal}</li>`;
            if (fields.expected_gain !== null && fields.expected_gain !== undefined) changesHtml += `<li><strong>预计涨幅</strong>: ${fields.expected_gain}%</li>`;
            if (fields.is_watching !== null && fields.is_watching !== undefined) changesHtml += `<li><strong>是否持续关注</strong>: ${fields.is_watching == 1 ? '是' : '否'}</li>`;
            if (fields.remark) changesHtml += `<li><strong>备注</strong>: ${fields.remark}</li>`;
            changesHtml += '</ul>';
          } else {
            const changes = log.changes;
            changesHtml = '<ul style="margin:0; padding-left:20px;">';
            const fieldNames = {
              stock_code: '股票代码',
              signal: '猫哥8H信号',
              expected_gain: '预计涨幅',
              is_watching: '是否持续关注',
              remark: '备注'
            };
            Object.keys(changes).forEach(key => {
              const change = changes[key];
              let oldVal = change.old;
              let newVal = change.new;
              if (key === 'is_watching') {
                oldVal = oldVal == 1 ? '是' : '否';
                newVal = newVal == 1 ? '是' : '否';
              }
              if (key === 'expected_gain') {
                if (oldVal !== null && oldVal !== undefined) oldVal += '%';
                if (newVal !== null && newVal !== undefined) newVal += '%';
              }
              changesHtml += `<li><strong>${fieldNames[key] || key}</strong>: ${oldVal || '-'}`;
              changesHtml += ` → ${newVal || '-'}</li>`;
            });
            changesHtml += '</ul>';
          }
          
          return `
            <div style="border-bottom:1px solid #e2e8f0; padding:16px 0; last-child{border-bottom:none;}">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="font-weight:600; color:#3b82f6;">${actionText}操作</span>
                <span style="font-size:12px; color:#94a3b8;">${time}</span>
              </div>
              ${changesHtml}
            </div>
          `;
        }).join('');
        
        document.getElementById('logsContent').innerHTML = logsHtml;
      } else {
        document.getElementById('logsContent').innerHTML = '<p style="color:#94a3b8; text-align:center; padding:20px;">暂无操作记录</p>';
      }
    })
    .catch(error => {
      document.getElementById('logsContent').innerHTML = '<p style="color:#ef4444; text-align:center; padding:20px;">加载失败</p>';
    });
}

function renderPagination() {
  const pagination = document.getElementById('pagination');
  pagination.innerHTML = '';
  
  const prevBtn = document.createElement('button');
  prevBtn.textContent = '上一页';
  prevBtn.disabled = currentPage <= 1;
  prevBtn.onclick = () => {
    if (currentPage > 1) {
      currentPage--;
      loadWatchlist();
    }
  };
  pagination.appendChild(prevBtn);
  
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    if (i === currentPage) {
      btn.className = 'active';
    }
    btn.onclick = () => {
      currentPage = i;
      loadWatchlist();
    };
    pagination.appendChild(btn);
  }
  
  const nextBtn = document.createElement('button');
  nextBtn.textContent = '下一页';
  nextBtn.disabled = currentPage >= totalPages;
  nextBtn.onclick = () => {
    if (currentPage < totalPages) {
      currentPage++;
      loadWatchlist();
    }
  };
  pagination.appendChild(nextBtn);
}

function renderTable(data) {
  const tbody = document.getElementById('watchlistTableBody');
  
  if (!data || data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          <p>暂无记录</p>
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = data.map(item => {
    const updatedAt = item.updated_at ? new Date(item.updated_at).toLocaleString('zh-CN') : '-';
    return `
    <tr>
      <td>${item.stock_code || '-'}</td>
      <td>${item.signal || '-'}</td>
      <td>${item.expected_gain !== null ? item.expected_gain + '%' : '-'}</td>
      <td>
        <span class="watching-badge ${item.is_watching == 1 ? 'yes' : 'no'}">
          ${item.is_watching == 1 ? '持续关注' : '已取消'}
        </span>
      </td>
      <td>${item.remark || '-'}</td>
      <td>${updatedAt}</td>
      <td>
        <button class="btn-edit" onclick="openModal(${item.id})">编辑</button>
        <button class="btn-delete" onclick="deleteWatchlist(${item.id})">删除</button>
        <button class="btn-edit" onclick="openLogsModal(${item.id})" style="background:rgba(139,92,246,0.1); color:#8b5cf6;">记录</button>
      </td>
    </tr>
  `;
  }).join('');
}

function loadWatchlist(page = 1) {
  currentPage = page;
  currentSearch = document.getElementById('searchInput').value;
  
  const params = new URLSearchParams();
  params.set('page', currentPage);
  params.set('limit', 10);
  
  if (currentSearch) {
    params.set('stock_code', currentSearch);
  }
  
  fetchWithAuth(`/api/watchlist?${params}`)
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        renderTable(data.data);
        totalPages = data.pagination.pages || 1;
        renderPagination();
      } else {
        showToast('加载失败: ' + data.error, 'error');
      }
    })
    .catch(error => {
      showToast('加载失败: ' + error.message, 'error');
    });
}

document.getElementById('searchInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    currentPage = 1;
    loadWatchlist();
  }
});

document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') {
    closeModal();
  }
});

document.getElementById('logsModal').addEventListener('click', (e) => {
  if (e.target.id === 'logsModal') {
    closeLogsModal();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  loadWatchlist();

  const backupInput = document.getElementById('backupFolderInput');
  if (!backupInput) return;

  backupInput.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      showToast('请选择备份文件夹', 'error');
      return;
    }

    const token = localStorage.getItem('token');

    let dataFile = null;
    let uploadFiles = [];

    for (const file of files) {
      if (file.name === 'data.json') {
        dataFile = file;
      } else {
        uploadFiles.push(file);
      }
    }

    if (!dataFile) {
      showToast('未找到备份文件 data.json', 'error');
      e.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('data', dataFile);
    uploadFiles.forEach(file => {
      formData.append('files', file);
    });

    try {
      const res = await fetch(apiUrl(`/api/restore-from-backup`), {
      method: 'POST',
      body: formData,
      headers: { 'Authorization': `Bearer ${token}` }
    });

      const result = await res.json();
      if (result.success) {
        showToast(result.message, 'success');
        loadWatchlist();
      } else {
        showToast('恢复失败: ' + result.error, 'error');
      }
    } catch (err) {
      showToast('恢复失败: ' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  });
});

const createManualBackup = async () => {
  const btn = document.querySelector('.nav-btn[onclick="createManualBackup()"]');
  const originalText = btn.textContent;
  btn.textContent = '备份中...';
  btn.disabled = true;

  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/backups/manual', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const result = await res.json();
    
    if (result.success) {
      showToast(result.message, 'success');
    } else {
      showToast('备份失败: ' + result.error, 'error');
    }
  } catch (err) {
    showToast('备份失败: ' + err.message, 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
};