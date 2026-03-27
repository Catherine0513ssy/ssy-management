/**
 * SSY API Client
 * Provides typed fetch wrappers with auth token management
 */
const API = {
  _token: localStorage.getItem('ssy_token'),
  _classId: localStorage.getItem('ssy_class') || '1',

  get token() { return this._token; },
  set token(v) { this._token = v; v ? localStorage.setItem('ssy_token', v) : localStorage.removeItem('ssy_token'); },
  get classId() { return this._classId; },
  set classId(v) { this._classId = v; localStorage.setItem('ssy_class', v); },
  get isLoggedIn() { return !!this._token; },

  async _fetch(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (this._token) headers['Authorization'] = `Bearer ${this._token}`;
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';

    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) { this.token = null; window.dispatchEvent(new Event('ssy:logout')); }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  get(url) { return this._fetch(url); },
  post(url, body) { return this._fetch(url, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }); },
  put(url, body) { return this._fetch(url, { method: 'PUT', body: JSON.stringify(body) }); },
  del(url) { return this._fetch(url, { method: 'DELETE' }); },

  // Auth
  login(password) { return this.post('/api/auth/login', { password }); },
  logout() { return this.post('/api/auth/logout', {}); },
  checkAuth() { return this.get('/api/auth/status'); },

  // Homework
  getHomework(date) { return this.get(`/api/homework?class_id=${this.classId}&date=${date}`); },
  getHomeworkDates() { return this.get(`/api/homework/dates?class_id=${this.classId}`); },
  addHomework(date, text, image) {
    if (image) { const fd = new FormData(); fd.append('class_id', this.classId); fd.append('date', date); fd.append('text', text); fd.append('image', image); return this.post('/api/homework', fd); }
    return this.post('/api/homework', { class_id: parseInt(this.classId), date, text });
  },
  deleteHomework(id) { return this.del(`/api/homework/${id}`); },

  // Checkin
  getCheckinDates(type, round) { return this.get(`/api/checkin/dates?class_id=${this.classId}&type=${type}&round=${round}`); },
  getCheckin(date, type, round) { return this.get(`/api/checkin/${date}?class_id=${this.classId}&type=${type}&round=${round}`); },
  saveCheckin(date, type, round, passed) { return this.post(`/api/checkin/${date}`, { class_id: parseInt(this.classId), type, round: parseInt(round), passed }); },
  getMissing(date, type, round) { return this.get(`/api/checkin/missing?class_id=${this.classId}&date=${date}&type=${type}&round=${round}`); },

  // Excellent
  getExcellent() { return this.get(`/api/excellent?class_id=${this.classId}`); },
  addExcellent(name, image, note) { const fd = new FormData(); fd.append('class_id', this.classId); fd.append('name', name); if (image) fd.append('image', image); if (note) fd.append('note', note); return this.post('/api/excellent', fd); },
  deleteExcellent(id) { return this.del(`/api/excellent/${id}`); },

  // Ranking
  getRanking() { return this.get(`/api/ranking?class_id=${this.classId}`); },
  getRankingDetail(studentIndex) { return this.get(`/api/ranking/detail?class_id=${this.classId}${studentIndex !== undefined ? `&student_index=${studentIndex}` : ''}`); },

  // Vocabulary
  getVocabulary(grade, search, unit) { let q = `?class_id=${this.classId}`; if (grade) q += `&grade=${grade}`; if (unit) q += `&unit=${encodeURIComponent(unit)}`; if (search) q += `&search=${encodeURIComponent(search)}`; return this.get(`/api/vocabulary${q}`); },
  getVocabStats() { return this.get('/api/vocabulary/stats'); },
  addWord(word) { return this.post('/api/vocabulary', word); },
  addWordsBatch(words, options = {}) { return this.post('/api/vocabulary/batch', { words, ...options }); },
  updateWord(id, data) { return this.put(`/api/vocabulary/${id}`, data); },
  deleteWord(id) { return this.del(`/api/vocabulary/${id}`); },

  // Quiz
  generateQuiz(grade, count, units = []) { return this.post('/api/quiz/generate', { class_id: parseInt(this.classId), grade, count: parseInt(count || 20), units }); },
  getQuizWords() { return this.get(`/api/quiz/words?class_id=${this.classId}`); },
  getQuizMeta() { return this.get('/api/quiz/meta'); },
  getAllVocabulary() { return this.get('/api/quiz/all'); },

  // Essay
  getEssayTasks() { return this.get(`/api/essay/tasks?class_id=${this.classId}`); },
  createEssayTask(data) { return this.post('/api/essay/tasks', { ...data, class_id: parseInt(this.classId) }); },
  updateEssayTask(id, data) { return this.put(`/api/essay/tasks/${id}`, data); },
  deleteEssayTask(id) { return this.del(`/api/essay/tasks/${id}`); },
  getEssayRubric() { return this.get('/api/essay/rubric'); },
  uploadEssayImages(taskId, formData) { return this.post(`/api/essay/tasks/${taskId}/upload`, formData); },
  getSubmissions(taskId) { return this.get(`/api/essay/tasks/${taskId}/submissions`); },
  updateSubmission(id, data) { return this.put(`/api/essay/submissions/${id}`, data); },
  deleteSubmission(id) { return this.del(`/api/essay/submissions/${id}`); },
  ocrSubmission(id) { return this.post(`/api/essay/submissions/${id}/ocr`, {}); },
  gradeSubmission(id) { return this.post(`/api/essay/submissions/${id}/grade`, {}); },
  ocrAllSubmissions(taskId) { return this.post(`/api/essay/tasks/${taskId}/ocr-all`, {}); },
  gradeAllSubmissions(taskId) { return this.post(`/api/essay/tasks/${taskId}/grade-all`, {}); },
};
