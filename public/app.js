document.addEventListener("DOMContentLoaded", () => {

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
        <img src="${e.target.result}" alt="${file.name}">
        <button class="remove-btn" onclick="removeFile('${file.name}', this)">&times;</button>
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
      const res = await fetch(`/api/trade/${tradeId}/upload`, {
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
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (result.success) {
        await uploadFiles(result.data.id);
        alert("交易记录保存成功！");
        form.reset();
        setDefaultDateTime();
        leverageInput.value = 10;
        filesToUpload.length = 0;
        uploadedFiles.innerHTML = '';
      } else {
        alert("保存失败: " + result.error);
      }

    } catch (err) {
      alert("请求失败: " + err.message);
    }
  });

});
