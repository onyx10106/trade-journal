document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login';
    return;
  }

  const form = document.getElementById("tradeForm");

  if (!form) {
    console.error("form not found");
    return;
  }

  const datetimeInput = document.getElementById("datetimeInput");
  const leverageInput = document.getElementById("leverage");
  const fileInput = document.getElementById("fileInput");
  const uploadedFiles = document.getElementById("uploadedFiles");
  const filesToUpload = [];

  const fetchWithAuth = async (url, options = {}) => {
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

  const setDefaultDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    datetimeInput.value = now.toISOString().slice(0, 16);
  };

  setDefaultDateTime();

  fileInput.addEventListener("change", (e) => {
    Array.from(e.target.files).forEach(file => {
      filesToUpload.push(file);
      showUploadedFile(file);
    });
    fileInput.value = '';
  });

  const showUploadedFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const div = document.createElement("div");
      div.className = "uploaded-file";
      div.innerHTML = `
        <img src="${e.target.result}" alt="${file.name}" onclick="showPreviewImage('${e.target.result}')" style="cursor:pointer">
        <button class="remove-btn" onclick="removeFile('${file.name}', this); event.stopPropagation();">&times;</button>
      `;
      uploadedFiles.appendChild(div);
    };
    reader.readAsDataURL(file);
  };

  window.removeFile = (fileName, btn) => {
    const index = filesToUpload.findIndex(f => f.name === fileName);
    if (index > -1) {
      filesToUpload.splice(index, 1);
    }
    btn.parentElement.remove();
  };

  const uploadFiles = async (tradeId) => {
    if (filesToUpload.length === 0) return;

    const formData = new FormData();
    filesToUpload.forEach(file => {
      formData.append("files", file);
    });

    try {
      const res = await fetchWithAuth(`/api/trade/${tradeId}/upload`, {
        method: "POST",
        body: formData
      });

      const result = await res.json();
      if (!result.success) {
        alert("附件上传失败: " + result.error);
      }
    } catch (err) {
      alert("附件上传请求失败: " + err.message);
    }
  };

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
      const res = await fetchWithAuth("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (result.success) {
        await uploadFiles(result.data.id);
        alert("交易记录保存成功！");
        window.location.href = '/trades';
      } else {
        alert("保存失败: " + result.error);
      }

    } catch (err) {
      alert("请求失败: " + err.message);
    }
  });

});

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) {
    const toastEl = document.createElement('div');
    toastEl.id = 'toast';
    toastEl.className = `toast ${type}`;
    toastEl.textContent = message;
    toastEl.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);padding:12px 24px;border-radius:8px;color:white;font-size:14px;z-index:9999;opacity:0;transition:opacity 0.3s;';
    document.body.appendChild(toastEl);
    setTimeout(() => toastEl.style.opacity = '1', 10);
    setTimeout(() => toastEl.style.opacity = '0', 3000);
    return;
  }
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
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
    const res = await fetch(apiUrl('/api/backups/manual'), {
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
