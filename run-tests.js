const assert = require('assert');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost';
let authToken = null;

const login = async () => {
  try {
    const res = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'zeechen', password: '123456' })
    });
    const data = await res.json();
    if (data.success) {
      authToken = data.token;
      console.log('✓ 登录成功');
    }
    return data;
  } catch (e) {
    console.error('✗ 登录失败:', e.message);
    return null;
  }
};

const request = async (url, options = {}) => {
  const headers = {
    'Authorization': `Bearer ${authToken}`,
    ...options.headers
  };
  try {
    const res = await fetch(`${BASE_URL}${url}`, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : null
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: e.message };
  }
};

let passed = 0;
let failed = 0;
const bugs = [];

const test = async (name, fn) => {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${err.message}`);
    bugs.push({ test: name, error: err.message });
    failed++;
  }
};

const main = async () => {
  console.log('\n========== 交易心得模块测试 ==========\n');

  console.log('登录测试...');
  const loginResult = await login();
  if (!loginResult || !loginResult.success) {
    console.error('登录失败，无法进行测试');
    process.exit(1);
  }

  console.log('\n--- API测试 ---\n');

  let createdNoteId = null;

  await test('POST /api/notes - 创建心得（正常）', async () => {
    const result = await request('/api/notes', {
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

  await test('POST /api/notes - 创建心得（标题为空）', async () => {
    const result = await request('/api/notes', {
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

  await test('POST /api/notes - 创建心得（仅标题）', async () => {
    const result = await request('/api/notes', {
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

  await test('GET /api/notes - 获取心得列表（空搜索）', async () => {
    const result = await request('/api/notes');
    assert.strictEqual(result.success, true);
    assert.ok(Array.isArray(result.data));
    assert.ok(result.data.length >= 1);
  });

  await test('GET /api/notes - 获取心得列表（带搜索条件）', async () => {
    const result = await request('/api/notes?search=测试');
    assert.strictEqual(result.success, true);
    assert.ok(Array.isArray(result.data));
    assert.ok(result.data.length >= 1);
    const found = result.data.some(note => note.title.includes('测试') || note.content.includes('测试'));
    assert.strictEqual(found, true);
  });

  await test('GET /api/notes - 获取心得列表（带分类筛选）', async () => {
    const result = await request('/api/notes?category=心得');
    assert.strictEqual(result.success, true);
    assert.ok(Array.isArray(result.data));
    const allMatch = result.data.every(note => note.category === '心得');
    assert.strictEqual(allMatch, true);
  });

  await test('GET /api/notes/:id - 获取单个心得', async () => {
    const result = await request(`/api/notes/${createdNoteId}`);
    assert.strictEqual(result.success, true);
    assert.ok(result.data);
    assert.strictEqual(String(result.data.id), String(createdNoteId));
    assert.strictEqual(result.data.title, '测试心得标题');
  });

  await test('GET /api/notes/:id - 获取不存在的心得', async () => {
    const result = await request('/api/notes/999999');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, '心得不存在');
  });

  await test('PUT /api/notes/:id - 更新心得', async () => {
    const result = await request(`/api/notes/${createdNoteId}`, {
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

  await test('PUT /api/notes/:id - 更新心得（标题为空）', async () => {
    const result = await request(`/api/notes/${createdNoteId}`, {
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

  await test('PUT /api/notes/:id - 更新不存在的心得', async () => {
    const result = await request('/api/notes/999999', {
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

  await test('POST /api/notes/:id/favorite - 收藏心得', async () => {
    const result = await request(`/api/notes/${createdNoteId}/favorite`, {
      method: 'POST'
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.is_favorite, 1);
  });

  await test('POST /api/notes/:id/favorite - 取消收藏心得', async () => {
    const result = await request(`/api/notes/${createdNoteId}/favorite`, {
      method: 'POST'
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.is_favorite, 0);
  });

  await test('POST /api/notes/:id/favorite - 收藏不存在的心得', async () => {
    const result = await request('/api/notes/999999/favorite', {
      method: 'POST'
    });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, '心得不存在');
  });

  await test('DELETE /api/notes/:id - 删除心得', async () => {
    const result = await request(`/api/notes/${createdNoteId}`, {
      method: 'DELETE'
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(String(result.data.id), String(createdNoteId));
  });

  await test('DELETE /api/notes/:id - 删除不存在的心得', async () => {
    const result = await request('/api/notes/999999', {
      method: 'DELETE'
    });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, '心得不存在');
  });

  await test('GET /api/notes/:id - 获取已删除的心得', async () => {
    const result = await request(`/api/notes/${createdNoteId}`);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, '心得不存在');
  });

  console.log('\n--- 前端测试 ---\n');

  await test('notes.html文件存在', () => {
    const filePath = path.join(__dirname, 'public/notes.html');
    assert.strictEqual(fs.existsSync(filePath), true);
  });

  await test('notes.js文件存在', () => {
    const filePath = path.join(__dirname, 'public/notes.js');
    assert.strictEqual(fs.existsSync(filePath), true);
  });

  await test('notes.html包含必要元素', () => {
    const content = fs.readFileSync(path.join(__dirname, 'public/notes.html'), 'utf8');
    assert.ok(content.includes('id="notesGrid"'), '缺少notesGrid元素');
    assert.ok(content.includes('id="noteModal"'), '缺少noteModal元素');
    assert.ok(content.includes('id="searchInput"'), '缺少searchInput元素');
    assert.ok(content.includes('id="noteTitle"'), '缺少noteTitle元素');
    assert.ok(content.includes('id="noteContent"'), '缺少noteContent元素');
    assert.ok(content.includes('id="noteCategory"'), '缺少noteCategory元素');
    assert.ok(content.includes('id="noteTags"'), '缺少noteTags元素');
    assert.ok(content.includes('id="toast"'), '缺少toast元素');
  });

  await test('notes.js包含必要函数', () => {
    const content = fs.readFileSync(path.join(__dirname, 'public/notes.js'), 'utf8');
    assert.ok(content.includes('loadNotes'), '缺少loadNotes函数');
    assert.ok(content.includes('renderNotes'), '缺少renderNotes函数');
    assert.ok(content.includes('saveNote'), '缺少saveNote函数');
    assert.ok(content.includes('deleteNote'), '缺少deleteNote函数');
    assert.ok(content.includes('toggleFavorite'), '缺少toggleFavorite函数');
    assert.ok(content.includes('filterByCategory'), '缺少filterByCategory函数');
    assert.ok(content.includes('handleSearch'), '缺少handleSearch函数');
    assert.ok(content.includes('openDetail'), '缺少openDetail函数');
  });

  console.log('\n--- 代码静态分析 ---\n');

  const notesJsContent = fs.readFileSync(path.join(__dirname, 'public/notes.js'), 'utf8');

  if (!notesJsContent.includes('res.ok')) {
    bugs.push({ test: '前端缺少响应状态检查', error: 'loadNotes等函数没有检查res.ok，直接调用res.json()可能导致非2xx响应解析失败' });
    console.log('⚠ 前端缺少响应状态检查 - loadNotes等函数没有检查res.ok');
  } else {
    console.log('✓ 前端包含响应状态检查');
  }

  if (!notesJsContent.includes('debounce') && notesJsContent.includes('oninput="handleSearch()"')) {
    bugs.push({ test: '搜索事件触发过于频繁', error: '搜索框使用oninput事件，每次输入都会触发请求，建议添加debounce防抖' });
    console.log('⚠ 搜索事件触发过于频繁 - 使用oninput会导致每次输入都发起请求');
  }

  if (!notesJsContent.includes('sanitize') && !notesJsContent.includes('textContent')) {
    bugs.push({ test: 'XSS安全风险', error: 'note-content使用innerHTML渲染，可能存在XSS攻击风险，建议使用textContent或进行HTML转义' });
    console.log('⚠ XSS安全风险 - note-content使用innerHTML渲染，可能存在XSS攻击风险');
  }

  const notesHtmlContent = fs.readFileSync(path.join(__dirname, 'public/notes.html'), 'utf8');
  if (!notesHtmlContent.includes('nav-btn')) {
    bugs.push({ test: '导航按钮缺少active状态', error: '导航栏中"交易心得"按钮缺少active类样式' });
  }

  console.log('\n========== 测试结果 ==========\n');
  console.log(`通过: ${passed} 个`);
  console.log(`失败: ${failed} 个`);

  if (bugs.length > 0) {
    console.log('\n--- 发现的问题/Bug列表 ---\n');
    bugs.forEach((bug, index) => {
      console.log(`${index + 1}. [${bug.test}]`);
      console.log(`   ${bug.error}`);
    });
  }

  console.log('\n测试完成！');
  process.exit(failed > 0 ? 1 : 0);
};

main().catch(e => {
  console.error('测试运行出错:', e.message);
  process.exit(1);
});