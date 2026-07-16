const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE_URL = 'http://localhost';
let authToken = null;

const login = () => {
  try {
    const result = execSync(`node -e "
      fetch('${BASE_URL}/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'zeechen', password: '123456' })
      })
      .then(r => r.json())
      .then(d => console.log(JSON.stringify(d)));
    "`).toString().trim();
    const data = JSON.parse(result);
    if (data.success) {
      authToken = data.token;
      console.log('登录成功');
    }
    return data;
  } catch (e) {
    console.error('登录失败:', e.message);
    return null;
  }
};

const request = (url, options = {}) => {
  const headers = {
    'Authorization': `Bearer ${authToken}`,
    ...options.headers
  };
  const body = options.body ? `JSON.stringify(${JSON.stringify(options.body)})` : 'null';
  try {
    const result = execSync(`node -e "
      fetch('${BASE_URL}${url}', {
        method: '${options.method || 'GET'}',
        headers: ${JSON.stringify(headers)},
        body: ${body}
      })
      .then(r => r.json())
      .then(d => console.log(JSON.stringify(d)));
    "`).toString().trim();
    return JSON.parse(result);
  } catch (e) {
    return { success: false, error: e.message };
  }
};

describe('交易心得模块测试', function() {
  this.timeout(10000);
  
  before(() => {
    const loginResult = login();
    if (!loginResult || !loginResult.success) {
      throw new Error('登录失败，无法进行测试');
    }
  });

  describe('API测试', () => {
    let createdNoteId = null;

    it('POST /api/notes - 创建心得（正常）', () => {
      const result = request('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: '测试心得标题',
          content: '这是测试内容',
          category: '心得',
          tags: '测试,自动化'
        }
      });
      assert.strictEqual(result.success, true);
      assert.ok(result.data);
      assert.ok(result.data.id);
      assert.strictEqual(result.data.title, '测试心得标题');
      assert.strictEqual(result.data.content, '这是测试内容');
      assert.strictEqual(result.data.category, '心得');
      assert.strictEqual(result.data.tags, '测试,自动化');
      assert.strictEqual(result.data.is_favorite, 0);
      createdNoteId = result.data.id;
    });

    it('POST /api/notes - 创建心得（标题为空）', () => {
      const result = request('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: '',
          content: '内容不为空'
        }
      });
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, '标题不能为空');
    });

    it('POST /api/notes - 创建心得（仅标题）', () => {
      const result = request('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: '仅标题测试'
        }
      });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.title, '仅标题测试');
      assert.strictEqual(result.data.category, '心得');
    });

    it('GET /api/notes - 获取心得列表（空搜索）', () => {
      const result = request('/api/notes');
      assert.strictEqual(result.success, true);
      assert.ok(Array.isArray(result.data));
      assert.ok(result.data.length >= 1);
    });

    it('GET /api/notes - 获取心得列表（带搜索条件）', () => {
      const result = request('/api/notes?search=测试');
      assert.strictEqual(result.success, true);
      assert.ok(Array.isArray(result.data));
      assert.ok(result.data.length >= 1);
      const found = result.data.some(note => note.title.includes('测试') || note.content.includes('测试'));
      assert.strictEqual(found, true);
    });

    it('GET /api/notes - 获取心得列表（带分类筛选）', () => {
      const result = request('/api/notes?category=心得');
      assert.strictEqual(result.success, true);
      assert.ok(Array.isArray(result.data));
      const allMatch = result.data.every(note => note.category === '心得');
      assert.strictEqual(allMatch, true);
    });

    it('GET /api/notes/:id - 获取单个心得', () => {
      const result = request(`/api/notes/${createdNoteId}`);
      assert.strictEqual(result.success, true);
      assert.ok(result.data);
      assert.strictEqual(result.data.id, createdNoteId);
      assert.strictEqual(result.data.title, '测试心得标题');
    });

    it('GET /api/notes/:id - 获取不存在的心得', () => {
      const result = request('/api/notes/999999');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, '心得不存在');
    });

    it('PUT /api/notes/:id - 更新心得', () => {
      const result = request(`/api/notes/${createdNoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: '更新后的标题',
          content: '更新后的内容',
          category: '名句',
          tags: '更新,测试'
        }
      });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.title, '更新后的标题');
      assert.strictEqual(result.data.content, '更新后的内容');
      assert.strictEqual(result.data.category, '名句');
      assert.strictEqual(result.data.tags, '更新,测试');
    });

    it('PUT /api/notes/:id - 更新心得（标题为空）', () => {
      const result = request(`/api/notes/${createdNoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: '',
          content: '内容'
        }
      });
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, '标题不能为空');
    });

    it('PUT /api/notes/:id - 更新不存在的心得', () => {
      const result = request('/api/notes/999999', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: {
          title: '测试',
          content: '内容'
        }
      });
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, '心得不存在');
    });

    it('POST /api/notes/:id/favorite - 收藏心得', () => {
      const result = request(`/api/notes/${createdNoteId}/favorite`, {
        method: 'POST'
      });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.is_favorite, 1);
    });

    it('POST /api/notes/:id/favorite - 取消收藏心得', () => {
      const result = request(`/api/notes/${createdNoteId}/favorite`, {
        method: 'POST'
      });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.is_favorite, 0);
    });

    it('POST /api/notes/:id/favorite - 收藏不存在的心得', () => {
      const result = request('/api/notes/999999/favorite', {
        method: 'POST'
      });
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, '心得不存在');
    });

    it('DELETE /api/notes/:id - 删除心得', () => {
      const result = request(`/api/notes/${createdNoteId}`, {
        method: 'DELETE'
      });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.id, createdNoteId);
    });

    it('DELETE /api/notes/:id - 删除不存在的心得', () => {
      const result = request('/api/notes/999999', {
        method: 'DELETE'
      });
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, '心得不存在');
    });

    it('GET /api/notes/:id - 获取已删除的心得', () => {
      const result = request(`/api/notes/${createdNoteId}`);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, '心得不存在');
    });
  });

  describe('前端测试', () => {
    it('notes.html文件存在', () => {
      const filePath = path.join(__dirname, '../public/notes.html');
      assert.strictEqual(fs.existsSync(filePath), true);
    });

    it('notes.js文件存在', () => {
      const filePath = path.join(__dirname, '../public/notes.js');
      assert.strictEqual(fs.existsSync(filePath), true);
    });

    it('notes.html包含必要元素', () => {
      const content = fs.readFileSync(path.join(__dirname, '../public/notes.html'), 'utf8');
      assert.ok(content.includes('<div id="notesGrid">'), '缺少notesGrid元素');
      assert.ok(content.includes('<div id="noteModal">'), '缺少noteModal元素');
      assert.ok(content.includes('<input id="searchInput">'), '缺少searchInput元素');
      assert.ok(content.includes('<input id="noteTitle">'), '缺少noteTitle元素');
      assert.ok(content.includes('<textarea id="noteContent">'), '缺少noteContent元素');
      assert.ok(content.includes('<select id="noteCategory">'), '缺少noteCategory元素');
      assert.ok(content.includes('<input id="noteTags">'), '缺少noteTags元素');
      assert.ok(content.includes('<div id="toast">'), '缺少toast元素');
    });

    it('notes.js包含必要函数', () => {
      const content = fs.readFileSync(path.join(__dirname, '../public/notes.js'), 'utf8');
      assert.ok(content.includes('function loadNotes'), '缺少loadNotes函数');
      assert.ok(content.includes('function renderNotes'), '缺少renderNotes函数');
      assert.ok(content.includes('function saveNote'), '缺少saveNote函数');
      assert.ok(content.includes('function deleteNote'), '缺少deleteNote函数');
      assert.ok(content.includes('function toggleFavorite'), '缺少toggleFavorite函数');
      assert.ok(content.includes('function filterByCategory'), '缺少filterByCategory函数');
      assert.ok(content.includes('function handleSearch'), '缺少handleSearch函数');
      assert.ok(content.includes('function openDetail'), '缺少openDetail函数');
    });
  });
});