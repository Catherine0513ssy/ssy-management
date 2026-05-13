const { callAI } = require('./ocr-ai');
const { getSetting } = require('./db');
const fs = require('fs');
const path = require('path');

const DEFAULT_RUBRIC = {
  dimensions: [
    { key: 'content', label: '内容切题', weight: 30, description: '是否围绕题目，要点是否完整' },
    { key: 'grammar', label: '语法准确', weight: 30, description: '时态、主谓一致、句式结构' },
    { key: 'vocabulary', label: '词汇运用', weight: 15, description: '词汇丰富度、用词准确性' },
    { key: 'structure', label: '篇章结构', weight: 15, description: '段落逻辑、连接词使用' },
    { key: 'mechanics', label: '书写规范', weight: 10, description: '拼写、标点、大小写' },
  ],
  maxScore: 15,
};

const OCR_PROMPT = `请识别这张手写英语作文图片中的文字内容。

要求：
1. 尽可能准确还原手写内容，包括拼写错误也要如实还原（不要自动纠正）
2. 保留原始段落结构，段落之间必须用换行符 \\n 分隔，不要合并成一段
3. 如果有涂改，以最终版本为准
4. 如果能看到姓名或学号，请提取
5. 返回严格 JSON 格式：{"text": "作文全文内容", "student_info": "姓名或学号（如果有）"}
6. 如果图片无法识别或不是英语作文，返回：{"text": "", "student_info": "", "error": "无法识别"}
7. 仅返回 JSON，不要附加任何解释文字`;

const GRADE_PROMPT = `你是一位经验丰富的初中英语教师，请对以下学生英语作文进行详细评分和批改。

## 作文信息
- 题目：{title}
- 要求：{requirements}
- 满分：{maxScore} 分

## 评分维度及分值
{dimensions}

## 学生作文
{essayText}

## 输出要求
请返回严格 JSON 格式（仅返回 JSON，不要附加解释）：
{
  "scores": {
    "content": {"score": 数字, "max": 数字, "comment": "一句话评语"},
    "grammar": {"score": 数字, "max": 数字, "comment": "一句话评语"},
    "vocabulary": {"score": 数字, "max": 数字, "comment": "一句话评语"},
    "structure": {"score": 数字, "max": 数字, "comment": "一句话评语"},
    "mechanics": {"score": 数字, "max": 数字, "comment": "一句话评语"}
  },
  "total": 总分数字,
  "annotations": [
    {
      "type": "grammar 或 spelling 或 vocabulary 或 structure",
      "original": "原文中的错误片段（必须是原文中存在的文字）",
      "corrected": "修改后的正确版本",
      "reason": "中文解释错误原因",
      "severity": "major 或 minor 或 suggestion"
    }
  ],
  "comment": "总体评语（中文，2-3句话，指出主要优缺点）",
  "highlights": ["值得肯定的亮点1", "亮点2"]
}

注意：
- annotations 中的 original 必须是学生作文中实际存在的文字片段
- severity: major=严重错误必须修改, minor=小错误, suggestion=建议改进
- 每个维度的 score 必须是 0.5 的倍数（如 7.0, 7.5, 8.0），不能出现其他小数
- 每个维度的 score 不能超过对应的 max
- total 应等于所有维度 score 之和`;

/**
 * Get rubric configuration with fallback chain:
 * 1. Task-level rubric_config (JSON string)
 * 2. Global setting 'essay_rubric'
 * 3. DEFAULT_RUBRIC
 */
function getRubric(taskRubricJson) {
  if (taskRubricJson) {
    try {
      const parsed = typeof taskRubricJson === 'string'
        ? JSON.parse(taskRubricJson)
        : taskRubricJson;
      if (parsed.dimensions && parsed.maxScore) return parsed;
    } catch (_) { /* fall through */ }
  }

  const globalSetting = getSetting('essay_rubric');
  if (globalSetting) {
    try {
      const parsed = JSON.parse(globalSetting);
      if (parsed.dimensions && parsed.maxScore) return parsed;
    } catch (_) { /* fall through */ }
  }

  return DEFAULT_RUBRIC;
}

/**
 * OCR a handwritten essay image and return { text, studentInfo }.
 * @param {string} absoluteImagePath - Absolute path to the image file
 */
async function ocrEssay(absoluteImagePath) {
  const imageBuffer = fs.readFileSync(absoluteImagePath);
  const base64Image = imageBuffer.toString('base64');

  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: OCR_PROMPT },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + base64Image } },
    ],
  }];

  const text = await callAI(messages, { timeout: 90000 });

  // Try to parse JSON response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return { text: parsed.text || text, studentInfo: parsed.student_info || '' };
    } catch (_) { /* fall through */ }
  }
  return { text: text.trim(), studentInfo: '' };
}

/**
 * Grade an essay using AI.
 * @param {string} essayText - The OCR'd essay text
 * @param {Object} taskInfo - { title, requirements }
 * @param {string|Object} rubricConfig - Optional rubric override (JSON string or object)
 * @returns {Object} Grading result with scores, annotations, comment, highlights
 */
async function gradeEssay(essayText, taskInfo, rubricConfig) {
  const rubric = getRubric(rubricConfig);
  const totalWeight = rubric.dimensions.reduce((s, d) => s + d.weight, 0);

  // Build dimension description for prompt
  const dimDesc = rubric.dimensions.map(d => {
    const maxPts = ((d.weight / totalWeight) * rubric.maxScore).toFixed(1);
    return `- ${d.label}（${d.key}）：满分 ${maxPts} 分 — ${d.description}`;
  }).join('\n');

  const prompt = GRADE_PROMPT
    .replace('{title}', taskInfo.title || '无题目')
    .replace('{requirements}', taskInfo.requirements || '无特殊要求')
    .replace('{maxScore}', String(rubric.maxScore))
    .replace('{dimensions}', dimDesc)
    .replace('{essayText}', essayText);

  const messages = [{ role: 'user', content: prompt }];
  const responseText = await callAI(messages, { timeout: 60000 });

  // Parse JSON - strip markdown code blocks first
  const cleanText = responseText.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
  const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 返回格式无法解析');

  const result = JSON.parse(jsonMatch[0]);

  // Normalize annotations format (AI may return different field names)
  if (result.annotations && Array.isArray(result.annotations)) {
    result.annotations = result.annotations.map(a => ({
      type: a.type || 'grammar',
      original: a.original || a.word || a.phrase || '',
      corrected: a.corrected || a.suggestion || '',
      reason: a.reason || a.message || '',
      severity: a.severity || 'minor',
    }));
  }

  // Normalize highlights format (AI may return objects instead of strings)
  if (result.highlights && Array.isArray(result.highlights)) {
    result.highlights = result.highlights.map(h => {
      if (typeof h === 'string') return h;
      if (h.phrase) return h.phrase;
      if (h.text) return h.text;
      return JSON.stringify(h);
    });
  }

  // Validate, round to nearest 0.5, and cap scores
  let total = 0;
  for (const dim of rubric.dimensions) {
    const maxPts = (dim.weight / totalWeight) * rubric.maxScore;
    if (result.scores && result.scores[dim.key]) {
      const s = result.scores[dim.key];
      s.max = Math.round(maxPts * 2) / 2;
      // Round AI score to nearest 0.5
      const rawScore = parseFloat(s.score) || 0;
      s.score = Math.min(Math.round(rawScore * 2) / 2, s.max);
      total += s.score;
    }
  }
  result.total = Math.round(total * 2) / 2;

  return result;
}

// ---------------------------------------------------------------------------
// Chat with AI about an essay
// ---------------------------------------------------------------------------
async function chatWithAI(essayText, taskInfo, scoreDetail, aiComment, annotations, chatHistory, userMessage) {
  const historyText = (chatHistory || []).map(h => `${h.role === 'user' ? '学生' : 'AI'}：${h.content}`).join('\n');
  const scoreText = scoreDetail ? JSON.stringify(scoreDetail, null, 2) : '暂无评分';
  const annoText = annotations && annotations.length ? annotations.map(a => `- [${a.type}] "${a.original}" → "${a.corrected}"：${a.reason}`).join('\n') : '暂无错误标注';

  const prompt = `你是一位经验丰富的初中英语教师。以下是一篇学生英语作文及其AI批改结果。学生正在向你提问，请基于作文和批改结果友好、专业地回答问题。

## 作文信息
- 题目：${taskInfo.title || '无题目'}
- 要求：${taskInfo.requirements || '无特殊要求'}

## 学生作文
${essayText}

## 评分结果
${scoreText}

## 错误标注
${annoText}

## AI总评
${aiComment || '暂无'}

## 对话历史
${historyText || '（无）'}

## 学生问题
${userMessage}

## 回答要求
- 用中文回答，语气亲切、耐心，像老师指导学生
- **回答必须简洁**，控制在200字以内，不要啰嗦
- **必须分段**，每段讲一个要点，段与段之间用空行分隔
- **禁止输出任何 Markdown 格式标记**（不要用 **加粗 **、- 列表、## 标题等符号），只用纯文字回答
- 先直接回答核心问题，再简要解释原因，最后给出一个具体改进建议
- 如果不确定，坦诚说明
- 仅回答与英语学习相关的问题`;

  const messages = [{ role: 'user', content: prompt }];
  return await callAI(messages, { timeout: 60000 });
}

// ---------------------------------------------------------------------------
// AI rewrite essay
// ---------------------------------------------------------------------------
async function rewriteEssay(essayText, taskInfo, scoreDetail, annotations, aiComment) {
  const annoText = annotations && annotations.length ? annotations.map(a => `- [${a.type}] "${a.original}" → "${a.corrected}"：${a.reason}`).join('\n') : '暂无错误标注';

  const prompt = `你是一位经验丰富的初中英语教师。请基于以下学生作文及其批改结果，生成一篇改进版作文范文。

## 作文信息
- 题目：${taskInfo.title || '无题目'}
- 要求：${taskInfo.requirements || '无特殊要求'}

## 学生原作文
${essayText}

## 批改结果
${aiComment || '暂无'}

## 主要错误
${annoText}

## 输出要求
请返回严格 JSON 格式，仅返回 JSON，不要附加解释：
{
  "rewrite": "改进后的完整作文（保持原意，修正所有错误，提升词汇和句式）",
  "changes": [
    {"original": "原句", "rewritten": "改后句", "reason": "改动原因"}
  ]
}`;

  const messages = [{ role: 'user', content: prompt }];
  const responseText = await callAI(messages, { timeout: 60000 });

  // Parse JSON
  const cleanText = responseText.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
  const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { rewrite: responseText.trim(), changes: [] };

  try {
    const result = JSON.parse(jsonMatch[0]);
    return {
      rewrite: result.rewrite || responseText.trim(),
      changes: Array.isArray(result.changes) ? result.changes : [],
    };
  } catch (_) {
    return { rewrite: responseText.trim(), changes: [] };
  }
}

module.exports = { ocrEssay, gradeEssay, getRubric, DEFAULT_RUBRIC, chatWithAI, rewriteEssay };
