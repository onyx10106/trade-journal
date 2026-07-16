let notes = [];
let currentNoteId = null;
let currentSearch = '';
let currentCategory = '全部';

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
  
  if (!res.ok) {
    throw new Error(`HTTP错误: ${res.status}`);
  }
  
  return res;
};

const showToast = (message, type = 'success') => {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.style.display = 'block';
  
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
};

const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

const loadNotes = async () => {
  try {
    const params = new URLSearchParams();
    if (currentSearch) params.append('search', currentSearch);
    if (currentCategory !== '全部') params.append('category', currentCategory);
    
    const res = await fetchWithAuth(`/api/notes?${params.toString()}`);
    const result = await res.json();
    
    if (result.success) {
      notes = result.data;
      renderNotes();
    } else {
      showToast('加载失败: ' + result.error, 'error');
    }
  } catch (err) {
    showToast('加载失败: ' + err.message, 'error');
  }
};

const renderNotes = () => {
  const grid = document.getElementById('notesGrid');
  
  if (!notes || notes.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
        </svg>
        <h3>暂无心得</h3>
        <p>点击右上角按钮开始记录你的交易心得</p>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = notes.map(note => {
    const tags = note.tags ? note.tags.split(',').filter(t => t.trim()) : [];
    const date = new Date(note.created_at);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    
    return `
      <div class="note-card ${note.is_favorite ? 'favorite' : ''}" onclick="openDetail('${note.id}')">
        <div class="note-header">
          <div class="favorite-icon ${note.is_favorite ? 'active' : ''}" onclick="toggleFavorite(event, '${note.id}')">
            ${note.is_favorite ? '⭐' : '☆'}
          </div>
        </div>
        <div class="note-title">${escapeHtml(note.title)}</div>
        <span class="note-category category-${escapeHtml(note.category)}">${escapeHtml(note.category)}</span>
        <div class="note-content">${escapeHtml(note.content || '')}</div>
        ${tags.length > 0 ? `
          <div class="note-tags">
            ${tags.map(tag => `<span class="note-tag">${escapeHtml(tag.trim())}</span>`).join('')}
          </div>
        ` : ''}
        <div class="note-time">${dateStr}</div>
      </div>
    `;
  }).join('');
};

const escapeHtml = (str) => {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
};

const handleSearch = debounce(() => {
  currentSearch = document.getElementById('searchInput').value.trim();
  loadNotes();
}, 300);

const filterByCategory = (category) => {
  currentCategory = category;
  
  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.textContent === category) {
      btn.classList.add('active');
    }
  });
  
  loadNotes();
};

const openCreateModal = () => {
  currentNoteId = null;
  document.getElementById('modalTitle').textContent = '新建心得';
  document.getElementById('noteTitle').value = '';
  document.getElementById('noteCategory').value = '心得';
  document.getElementById('noteTags').value = '';
  document.getElementById('noteContent').value = '';
  document.getElementById('deleteBtn').style.display = 'none';
  document.getElementById('noteModal').classList.add('active');
};

const openDetail = async (id) => {
  try {
    const res = await fetchWithAuth(`/api/notes/${id}`);
    const result = await res.json();
    
    if (result.success) {
      const note = result.data;
      currentNoteId = note.id;
      
      document.getElementById('modalTitle').textContent = '查看心得';
      document.getElementById('noteTitle').value = note.title;
      document.getElementById('noteCategory').value = note.category;
      document.getElementById('noteTags').value = note.tags || '';
      document.getElementById('noteContent').value = note.content || '';
      document.getElementById('deleteBtn').style.display = 'inline-flex';
      document.getElementById('noteModal').classList.add('active');
    } else {
      showToast('获取失败: ' + result.error, 'error');
    }
  } catch (err) {
    showToast('获取失败: ' + err.message, 'error');
  }
};

const closeModal = () => {
  document.getElementById('noteModal').classList.remove('active');
  currentNoteId = null;
};

const saveNote = async () => {
  const title = document.getElementById('noteTitle').value.trim();
  const content = document.getElementById('noteContent').value;
  const category = document.getElementById('noteCategory').value;
  const tags = document.getElementById('noteTags').value;
  
  if (!title) {
    showToast('标题不能为空', 'error');
    return;
  }
  
  try {
    let res;
    
    if (currentNoteId) {
      res = await fetchWithAuth(`/api/notes/${currentNoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, category, tags })
      });
    } else {
      res = await fetchWithAuth('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, category, tags })
      });
    }
    
    const result = await res.json();
    
    if (result.success) {
      showToast(currentNoteId ? '修改成功' : '创建成功');
      closeModal();
      loadNotes();
    } else {
      showToast('保存失败: ' + result.error, 'error');
    }
  } catch (err) {
    showToast('保存失败: ' + err.message, 'error');
  }
};

const deleteNote = () => {
  if (!confirm('确定要删除这条心得吗？')) return;
  
  fetchWithAuth(`/api/notes/${currentNoteId}`, {
    method: 'DELETE'
  })
  .then(res => res.json())
  .then(result => {
    if (result.success) {
      showToast('删除成功');
      closeModal();
      loadNotes();
    } else {
      showToast('删除失败: ' + result.error, 'error');
    }
  })
  .catch(err => {
    showToast('删除失败: ' + err.message, 'error');
  });
};

const toggleFavorite = (event, id) => {
  event.stopPropagation();
  
  fetchWithAuth(`/api/notes/${id}/favorite`, {
    method: 'POST'
  })
  .then(res => res.json())
  .then(result => {
    if (result.success) {
      loadNotes();
    } else {
      showToast('操作失败: ' + result.error, 'error');
    }
  })
  .catch(err => {
    showToast('操作失败: ' + err.message, 'error');
  });
};

document.getElementById('noteModal').addEventListener('click', (e) => {
  if (e.target.id === 'noteModal') {
    closeModal();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  loadNotes();
});