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
  maxScore: 10,
};

const OCR_PROMPT = `请识别这张手写英语作文图片中的文字内容。

要求：
1. 尽可能准确还原手写内容，包括拼写错误也要如实还原（不要自动纠正）
2. 保留原始段落结构和换行
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

  // Parse JSON
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 返回格式无法解析');

  const result = JSON.parse(jsonMatch[0]);

  // Validate and cap scores
  let total = 0;
  for (const dim of rubric.dimensions) {
    const maxPts = (dim.weight / totalWeight) * rubric.maxScore;
    if (result.scores && result.scores[dim.key]) {
      const s = result.scores[dim.key];
      s.max = parseFloat(maxPts.toFixed(1));
      s.score = Math.min(parseFloat(s.score) || 0, s.max);
      total += s.score;
    }
  }
  result.total = parseFloat(total.toFixed(1));

  return result;
}

module.exports = { ocrEssay, gradeEssay, getRubric, DEFAULT_RUBRIC };
