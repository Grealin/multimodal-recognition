#!/usr/bin/env node

/**
 * recognize.js — 多模态识别脚本
 *
 * 调用 Qwen3.5-Omni-Plus 全模态大模型，将图片/音频/视频转换为文字描述。
 *
 * 用法:
 *   node recognize.js <input1> [input2...] [--prompt "..."] [--model "..."] [--max-tokens N] [--timeout MS] [--clipboard]
 *
 * 输入支持四种格式:
 *   1. 本地绝对路径:     C:\path\to\photo.png
 *   2. 网络 URL:         https://example.com/image.jpg
 *   3. Data URI（剪贴板）: data:image/png;base64,iVBORw0KGgo...
 *   4. --clipboard:       从 Windows 剪贴板读取图片（仅支持单张）
 *
 * 依赖: npm install --prefix 本脚本所在目录
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const childProcess = require('child_process');

// ============================================================
// 1. 配置加载
// ============================================================

/**
 * 手动解析 .env 格式文件，返回键值对对象。
 * 支持 # 注释行、空行、引号包裹的值。
 * @param {string} filePath - .env 文件路径
 * @returns {Record<string, string>}
 */
function parseEnvFile(filePath) {
  /** @type {Record<string, string>} */
  const result = {};
  if (!fs.existsSync(filePath)) return result;

  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();

    // 去除首尾引号
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key) result[key] = value;
  }
  return result;
}

/**
 * 按优先级加载配置：scripts/.env > ~/.claude/.env > process.env
 * @param {string} skillScriptDir - 脚本所在目录（__dirname）
 * @returns {{ baseURL: string, mode: string, apiKey: string }} — mode 即模型名称
 */
function loadEnv(skillScriptDir) {
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';

  // 优先级 3: 系统环境变量（兜底）
  let baseURL = process.env.BASE_URL || process.env.baseURL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  // mode 字段指定模型名称（非输出模式）
  let mode = process.env.MODE || process.env.mode || 'qwen3.5-omni-plus';
  let apiKey = process.env.API_KEY || process.env.apiKey || process.env.DASHSCOPE_API_KEY || '';

  // 优先级 2: 用户全局 ~/.claude/.env
  const globalEnvPath = path.join(homeDir, '.claude', '.env');
  const globalEnv = parseEnvFile(globalEnvPath);
  if (globalEnv.baseURL) baseURL = globalEnv.baseURL;
  if (globalEnv.mode) mode = globalEnv.mode;
  if (globalEnv.apiKey) apiKey = globalEnv.apiKey;

  // 优先级 1: 脚本同级 .env（最高优先级）
  const localEnvPath = path.join(skillScriptDir, '.env');
  const localEnv = parseEnvFile(localEnvPath);
  if (localEnv.baseURL) baseURL = localEnv.baseURL;
  if (localEnv.mode) mode = localEnv.mode;
  if (localEnv.apiKey) apiKey = localEnv.apiKey;

  return { baseURL, mode, apiKey };
}

// ============================================================
// 2. Windows 剪贴板图片读取
// ============================================================

/**
 * 从 Windows 剪贴板读取图片，保存到临时文件，返回 data: URI 字符串。
 *
 * 工作原理：
 *   1. 生成 PowerShell 脚本写入 scripts/temp/ 目录
 *   2. 调用 .NET System.Windows.Forms.Clipboard::GetImage() 读取剪贴板
 *   3. 保存为 PNG 到指定路径
 *   4. Node.js 读取 PNG 文件并编码为 Base64 Data URI
 *
 * 限制：
 *   - 仅支持 Windows 平台
 *   - Windows 剪贴板同时只保留一张图片（最近一次复制的）
 *   - 如需对照 [Unsupported Image] 提示，请逐张重新复制到剪贴板后调用
 *
 * @returns {string | null} 成功返回临时 PNG 文件路径，失败返回 null
 */
function readClipboardImage() {
  if (process.platform !== 'win32') {
    console.error('[error] --clipboard 仅支持 Windows 平台');
    return null;
  }

  // 临时目录：脚本所在目录下的 temp 子目录
  const tmpDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  const outPath = path.join(tmpDir, `clipboard_${Date.now()}.png`);
  const ps1Path = path.join(tmpDir, `_reader.ps1`);

  // PowerShell 脚本：读取 System.Windows.Forms.Clipboard 中的图片
  const psScript = [
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    '$img = [System.Windows.Forms.Clipboard]::GetImage()',
    'if ($img -ne $null) {',
    `    $img.Save('${outPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)`,
    '    Write-Host "OK"',
    '} else {',
    '    Write-Host "EMPTY"',
    '}',
  ].join('\n');

  try {
    fs.writeFileSync(ps1Path, psScript, 'utf-8');

    const result = childProcess.execFileSync('powershell', [
      '-ExecutionPolicy', 'Bypass',
      '-File', ps1Path,
    ], { encoding: 'utf-8', timeout: 15000 }).trim();

    // 清理临时脚本
    try { fs.unlinkSync(ps1Path); } catch { /* 文件可能已被删除，忽略 */ }

    if (result === 'EMPTY' || !fs.existsSync(outPath)) {
      console.error('[error] 剪贴板中没有图片数据。请先截图或复制一张图片到剪贴板，然后重试。');
      return null;
    }

    // 返回临时文件路径，由 processInput() 走本地文件分支处理
    // 避免 Data URI 过大导致 API 413 Request body size exceeds maximum allowed size
    return outPath;
  } catch (err) {
    console.error(`[error] 读取剪贴板失败: ${err.message}`);
    try { fs.unlinkSync(ps1Path); } catch { /* 清理失败，忽略 */ }
    return null;
  }
}

// ============================================================
// 2.5. 临时文件清理
// ============================================================

/**
 * 清理 scripts/temp 目录中的临时文件：
 *   - 删除所有非剪贴板自动生成的文件（如 _reader.ps1 等）
 *   - 仅保留最近 10 次剪贴板图片（clipboard_*.png），删除更旧的
 *
 * 在每次识别结果输出后调用，避免临时文件累积。
 * 失败时仅记录错误，不中断主流程。
 */
function cleanTempDir() {
  const tmpDir = path.join(__dirname, 'temp');
  try {
    if (!fs.existsSync(tmpDir)) return;
    const entries = fs.readdirSync(tmpDir);

    const clipboardFiles = [];
    const otherFiles = [];

    for (const entry of entries) {
      const fullPath = path.join(tmpDir, entry);
      if (entry.startsWith('clipboard_') && entry.endsWith('.png')) {
        clipboardFiles.push(fullPath);
      } else {
        otherFiles.push(fullPath);
      }
    }

    // 1) 删除所有非剪贴板图片的临时文件
    for (const f of otherFiles) {
      try { fs.unlinkSync(f); } catch { /* 文件可能已被删除，忽略 */ }
    }

    // 2) 剪贴板图片按时间戳升序排列（旧→新），仅保留最近 10 个
    if (clipboardFiles.length > 10) {
      clipboardFiles.sort((a, b) => {
        const ta = parseInt(path.basename(a).replace('clipboard_', '').replace('.png', ''), 10);
        const tb = parseInt(path.basename(b).replace('clipboard_', '').replace('.png', ''), 10);
        return ta - tb;
      });
      // slice(0, -10) 取出最旧的文件，将其删除
      for (const f of clipboardFiles.slice(0, -10)) {
        try { fs.unlinkSync(f); } catch { /* 文件可能已被删除，忽略 */ }
      }
    }
  } catch (err) {
    console.error(`[warn] 清理 temp 目录失败: ${err.message}`);
  }
}

// ============================================================
// 3. 输入类型检测
// ============================================================

/**
 * 判断字符串是否为 data: URI 格式
 * @param {string} str
 * @returns {boolean}
 */
function isDataURI(str) {
  return /^data:[^;]+;base64,/i.test(str);
}

/**
 * 解析 data: URI，提取 MIME 类型、格式、模态类别和 Base64 数据
 * 格式: data:<mime>;base64,<data>
 * @param {string} dataUri
 * @returns {{ mimeType: string, format: string, category: string, base64Data: string }}
 */
function parseDataURI(dataUri) {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) {
    throw new Error('无效的 Data URI 格式，期望格式: data:<mime>;base64,<data>');
  }

  const mimeType = match[1].toLowerCase();
  const base64Data = match[2];

  // 从 MIME 类型推导格式和模态类别
  const mimeMap = {
    'image/jpeg':    { format: 'jpeg',    category: 'image' },
    'image/jpg':     { format: 'jpeg',    category: 'image' },
    'image/png':     { format: 'png',     category: 'image' },
    'image/webp':    { format: 'webp',    category: 'image' },
    'image/gif':     { format: 'gif',     category: 'image' },
    'image/bmp':     { format: 'bmp',     category: 'image' },
    'image/tiff':    { format: 'tiff',    category: 'image' },
    'image/heic':    { format: 'heic',    category: 'image' },
    'audio/wav':     { format: 'wav',     category: 'audio' },
    'audio/wave':    { format: 'wav',     category: 'audio' },
    'audio/mpeg':    { format: 'mp3',     category: 'audio' },
    'audio/mp3':     { format: 'mp3',     category: 'audio' },
    'audio/aac':     { format: 'aac',     category: 'audio' },
    'audio/ogg':     { format: 'ogg',     category: 'audio' },
    'audio/flac':    { format: 'flac',    category: 'audio' },
    'audio/mp4':     { format: 'm4a',     category: 'audio' },
    'audio/x-m4a':   { format: 'm4a',     category: 'audio' },
    'audio/amr':     { format: 'amr',     category: 'audio' },
    'video/mp4':     { format: 'mp4',     category: 'video' },
    'video/x-msvideo': { format: 'avi',   category: 'video' },
    'video/avi':     { format: 'avi',     category: 'video' },
    'video/x-matroska': { format: 'mkv',  category: 'video' },
    'video/quicktime': { format: 'mov',   category: 'video' },
    'video/x-flv':   { format: 'flv',     category: 'video' },
    'video/x-ms-wmv': { format: 'wmv',    category: 'video' },
  };

  const info = mimeMap[mimeType];
  if (!info) {
    // 如果 MIME 未在映射表中，尝试从 MIME 类型推断类别
    const category = mimeType.split('/')[0]; // image / audio / video
    const format = mimeType.split('/')[1] || 'bin';
    if (['image', 'audio', 'video'].includes(category)) {
      return { mimeType, format, category, base64Data };
    }
    throw new Error(`不支持的 MIME 类型: ${mimeType}，支持的类别: image/audio/video`);
  }

  return { mimeType, format: info.format, category: info.category, base64Data };
}

/**
 * 判断字符串是否为 http/https URL
 * @param {string} str
 * @returns {boolean}
 */
function isURL(str) {
  return /^https?:\/\//i.test(str);
}

/**
 * 根据文件扩展名映射模态类型
 * @param {string} filePath
 * @returns {{ category: string, mimeType: string, format: string }}
 */
function detectFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  if (!ext) {
    throw new Error('无法从文件路径中检测到扩展名，请确保文件路径包含有效扩展名');
  }

  const extMap = {
    // 图片
    'jpg':  { mimeType: 'image/jpeg',    category: 'image', format: 'jpeg' },
    'jpeg': { mimeType: 'image/jpeg',    category: 'image', format: 'jpeg' },
    'jpe':  { mimeType: 'image/jpeg',    category: 'image', format: 'jpeg' },
    'png':  { mimeType: 'image/png',     category: 'image', format: 'png' },
    'webp': { mimeType: 'image/webp',    category: 'image', format: 'webp' },
    'gif':  { mimeType: 'image/gif',     category: 'image', format: 'gif' },
    'bmp':  { mimeType: 'image/bmp',     category: 'image', format: 'bmp' },
    'tif':  { mimeType: 'image/tiff',    category: 'image', format: 'tiff' },
    'tiff': { mimeType: 'image/tiff',    category: 'image', format: 'tiff' },
    'heic': { mimeType: 'image/heic',    category: 'image', format: 'heic' },
    // 音频
    'wav':  { mimeType: 'audio/wav',     category: 'audio', format: 'wav' },
    'mp3':  { mimeType: 'audio/mpeg',    category: 'audio', format: 'mp3' },
    'aac':  { mimeType: 'audio/aac',     category: 'audio', format: 'aac' },
    'ogg':  { mimeType: 'audio/ogg',     category: 'audio', format: 'ogg' },
    'flac': { mimeType: 'audio/flac',    category: 'audio', format: 'flac' },
    'm4a':  { mimeType: 'audio/mp4',     category: 'audio', format: 'm4a' },
    'amr':  { mimeType: 'audio/amr',     category: 'audio', format: 'amr' },
    '3gp':  { mimeType: 'audio/3gpp',    category: 'audio', format: '3gp' },
    '3gpp': { mimeType: 'audio/3gpp',    category: 'audio', format: '3gpp' },
    // 视频
    'mp4':  { mimeType: 'video/mp4',     category: 'video', format: 'mp4' },
    'avi':  { mimeType: 'video/x-msvideo', category: 'video', format: 'avi' },
    'mkv':  { mimeType: 'video/x-matroska', category: 'video', format: 'mkv' },
    'mov':  { mimeType: 'video/quicktime', category: 'video', format: 'mov' },
    'flv':  { mimeType: 'video/x-flv',   category: 'video', format: 'flv' },
    'wmv':  { mimeType: 'video/x-ms-wmv', category: 'video', format: 'wmv' },
  };

  const info = extMap[ext];
  if (!info) {
    const supported = Object.keys(extMap).join(', ');
    throw new Error(`不支持的文件格式 ".${ext}"。支持的格式: ${supported}`);
  }

  return info;
}

/**
 * 生成简短的输入显示名称
 * - Data URI: 截断 base64 内容，保留 MIME 前缀和后 20 个字符
 * - 本地文件: 只显示文件名
 * - URL/其他: 保持原样
 * @param {string} input
 * @returns {string}
 */
function shortDisplayName(input) {
  if (!input) return 'input';

  if (isDataURI(input)) {
    const commaIdx = input.indexOf(',');
    if (commaIdx !== -1) {
      const header = input.slice(0, commaIdx + 1);
      const b64 = input.slice(commaIdx + 1);
      if (b64.length <= 40) return input;
      const suffix = b64.slice(-20);
      return `${header}...${suffix}`;
    }
  }

  if (isURL(input)) return input;
  if (input.includes('/') || input.includes('\\')) return path.basename(input);
  return input;
}

// ============================================================
// 3. 内容构建
// ============================================================

/**
 * 将本地文件读取并编码为 Base64
 * @param {string} filePath
 * @returns {{ data: string, mimeType: string }}
 */
function fileToBase64(filePath) {
  const MAX_SIZE = 100 * 1024 * 1024; // 100MB
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_SIZE) {
    throw new Error(`文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)，超过 100MB 限制。请先压缩文件。`);
  }
  if (stat.size === 0) {
    throw new Error('文件大小为 0，无法处理空文件');
  }

  const buffer = fs.readFileSync(filePath);
  const mimeType = detectFileType(filePath).mimeType;
  return { data: buffer.toString('base64'), mimeType };
}

/**
 * 根据模态类别和负载数据构建 API content part 对象
 * @param {string} category - image | audio | video
 * @param {{ data: string, mimeType: string, format: string, url?: string }} payload
 * @returns {object}
 */
function buildContentPart(category, payload) {
  switch (category) {
    case 'image':
      if (payload.url) {
        // 网络 URL：将图片 URL 包装在 image_url 中
        return {
          type: 'image_url',
          image_url: { url: payload.url },
        };
      }
      // Base64 图片：带 data: URI 前缀
      return {
        type: 'image_url',
        image_url: { url: `data:${payload.mimeType};base64,${payload.data}` },
      };

    case 'audio':
      // 音频：data 字段需带 data: URI 前缀（此端点要求）
      return {
        type: 'input_audio',
        input_audio: {
          data: `data:${payload.mimeType};base64,${payload.data}`,
          format: payload.format,
        },
      };

    case 'video':
      if (payload.url) {
        // 网络 URL：将视频 URL 包装在 video_url 中
        return {
          type: 'video_url',
          video_url: { url: payload.url },
        };
      }
      // Base64 视频：带 data: URI 前缀
      return {
        type: 'video_url',
        video_url: { url: `data:${payload.mimeType};base64,${payload.data}` },
      };

    default:
      throw new Error(`未知的模态类别: ${category}`);
  }
}

// ============================================================
// 4. API 调用
// ============================================================

/**
 * 调用 Qwen3.5-Omni-Plus API 进行流式对话
 * @param {object} contentPart - 单个 content part 对象
 * @param {object} options - { apiKey, baseURL, model, prompt, maxTokens, timeout }
 * @returns {Promise<string>} - 累积的完整文本描述
 */
async function callAPI(contentPart, options) {
  const { default: OpenAI } = await import('openai');

  const client = new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    timeout: options.timeout || 120000,
  });

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: options.prompt },
        contentPart,
      ],
    },
  ];

  /** @type {import('openai').ChatCompletionCreateParams} */
  const params = {
    model: options.model || 'qwen3.5-omni-plus',
    messages: messages,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: options.maxTokens || 4096,
  };

  let fullText = '';
  let retries = 0;
  const maxRetries = 1;

  while (true) {
    try {
      const stream = await client.chat.completions.create(params);

      for await (const chunk of stream) {
        if (Array.isArray(chunk.choices) && chunk.choices.length > 0) {
          const delta = chunk.choices[0].delta;
          if (delta && delta.content) {
            fullText += delta.content;
          }
        }
        // 最后一个 chunk 包含 usage 信息，忽略
      }

      return fullText.trim();

    } catch (err) {
      const status = err.status || err.code || 0;

      // 401/403: 认证/权限错误，不重试
      if (status === 401 || status === 403) {
        throw new Error(
          `API 认证失败 (HTTP ${status})。请检查 scripts/.env 中的 apiKey 是否正确。\n` +
          `获取 API Key: https://www.alibabacloud.com/help/zh/model-studio/get-api-key`
        );
      }

      // 429 (限流) 或 5xx (服务端错误): 重试一次
      if ((status === 429 || (status >= 500 && status < 600)) && retries < maxRetries) {
        retries++;
        const delay = 2000;
        console.error(`[warn] API 返回 ${status}，${delay / 1000}s 后重试 (${retries}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // 网络超时
      if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
        throw new Error(`API 请求超时 (${options.timeout || 120000}ms)。可尝试使用 --timeout 增大超时时间。`);
      }

      // 其他错误
      throw new Error(`API 调用失败: ${err.message}`);
    }
  }
}

// ============================================================
// 5. 单文件处理流水线
// ============================================================

/**
 * 处理单个输入（本地文件 / URL / Data URI）
 * @param {string} input - 输入字符串
 * @param {{ label: string, apiKey: string, baseURL: string, model: string, prompt: string, maxTokens: number, timeout: number }} options
 * @returns {Promise<{ input: string, category: string, description: string|null, error: string|null }>}
 */
async function processInput(input, options) {
  const label = options.label || input;

  try {
    let category, contentPart;

    // 情况 1: Data URI
    if (isDataURI(input)) {
      console.error(`[info] 处理 Data URI (${label})...`);
      const parsed = parseDataURI(input);
      category = parsed.category;
      contentPart = buildContentPart(category, {
        data: parsed.base64Data,
        mimeType: parsed.mimeType,
        format: parsed.format,
      });
    }
    // 情况 2: 网络 URL
    else if (isURL(input)) {
      console.error(`[info] 处理 URL (${label})...`);
      // 从 URL 路径推断类型
      const urlPath = new URL(input).pathname;
      const ext = path.extname(urlPath).toLowerCase().replace('.', '');
      let fileInfo;
      try {
        fileInfo = detectFileType(urlPath);
      } catch {
        // URL 无法从路径推断类型时，默认按图片处理
        console.error(`[warn] 无法从 URL 路径推断文件类型，默认按 image/jpeg 处理: ${input}`);
        fileInfo = { category: 'image', mimeType: 'image/jpeg', format: 'jpeg' };
      }
      category = fileInfo.category;
      contentPart = buildContentPart(category, {
        url: input,
        data: '',
        mimeType: fileInfo.mimeType,
        format: fileInfo.format,
      });
    }
    // 情况 3: 本地文件路径
    else {
      console.error(`[info] 处理本地文件 (${label})...`);
      const fileInfo = detectFileType(input);
      category = fileInfo.category;

      if (!fs.existsSync(input)) {
        throw new Error(`文件不存在: ${input}`);
      }

      const base64Result = fileToBase64(input);
      console.error(`[info] 文件大小: ${(fs.statSync(input).size / 1024).toFixed(1)}KB, 类型: ${category}/${fileInfo.format}`);

      contentPart = buildContentPart(category, {
        data: base64Result.data,
        mimeType: fileInfo.mimeType,
        format: fileInfo.format,
      });
    }

    console.error(`[info] 正在调用 Qwen3.5-Omni-Plus API...`);
    const description = await callAPI(contentPart, options);
    console.error(`[info] ${label} 处理完成`);

    return { input, category, description, error: null };

  } catch (err) {
    console.error(`[error] ${label}: ${err.message}`);
    return { input, category: null, description: null, error: err.message };
  }
}

// ============================================================
// 6. CLI 入口
// ============================================================

/**
 * 解析命令行参数
 * @param {string[]} args
 * @returns {{ inputs: string[], options: Record<string, string> }}
 */
function parseArgs(args) {
  const inputs = [];
  /** @type {Record<string, string>} */
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--prompt' && i + 1 < args.length) {
      options.prompt = args[++i];
    } else if (arg === '--model' && i + 1 < args.length) {
      options.model = args[++i];
    } else if (arg === '--max-tokens' && i + 1 < args.length) {
      options.maxTokens = args[++i];
    } else if (arg === '--timeout' && i + 1 < args.length) {
      options.timeout = args[++i];
    } else if (arg === '--file' && i + 1 < args.length) {
      // 从文件读取输入（每行一个），支持多次 --file
      if (!options.files) options.files = [];
      options.files.push(args[++i]);
    } else if (arg === '--clipboard') {
      // 从 Windows 剪贴板读取图片（仅支持单张，即当前剪贴板中的图片）
      options.clipboard = 'true';
    } else if (arg.startsWith('--')) {
      const key = arg.replace(/^--/, '');
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        options[key] = args[++i];
      } else {
        options[key] = 'true';
      }
    } else {
      inputs.push(arg);
    }
  }

  return { inputs, options };
}

/**
 * 打印使用说明
 */
function printUsage() {
  console.error('用法: node recognize.js <input1> [input2...] [选项]');
  console.error('');
  console.error('输入格式（支持混合使用）:');
  console.error('  本地绝对路径:    node recognize.js C:\\path\\to\\photo.png');
  console.error('  网络 URL:        node recognize.js https://example.com/image.jpg');
  console.error('  Data URI:        node recognize.js "data:image/png;base64,..."');
  console.error('  Windows 剪贴板:   node recognize.js --clipboard');
  console.error('');
  console.error('选项:');
  console.error('  --prompt <text>      自定义提示词（默认: 详细描述该内容）');
  console.error('  --model <name>       模型名称（默认: qwen3.5-omni-plus）');
  console.error('  --max-tokens <n>     最大输出 tokens（默认: 4096）');
  console.error('  --timeout <ms>       请求超时毫秒数（默认: 120000）');
  console.error('  --file <path>        从文件读取输入（每行一个，支持多次指定）');
  console.error('  --clipboard          从 Windows 剪贴板读取图片（单张）');
}

/**
 * 格式化输出结果
 * @param {Array<{ input: string, category: string, description: string|null, error: string|null }>} results
 * @returns {string}
 */
function formatResults(results) {
  const lines = [];
  for (const r of results) {
    lines.push(`=== FILE: ${shortDisplayName(r.input)} ===`);
    if (r.category) {
      lines.push(`TYPE: ${r.category}`);
    }
    if (r.error) {
      lines.push(`ERROR: ${r.error}`);
    } else if (r.description) {
      lines.push(r.description);
    } else {
      lines.push('(无输出)');
    }
    lines.push(`=== END: ${shortDisplayName(r.input || 'input')} ===`);
    lines.push('');
  }
  return lines.join('\n').trim();
}

async function main() {
  const { inputs, options: cliOptions } = parseArgs(process.argv.slice(2));

  // 展开 --file 选项：从文件中按行读取输入
  /** @type {string[]} */
  const fileInputs = [];
  if (cliOptions.files) {
    for (const filePath of cliOptions.files) {
      if (!fs.existsSync(filePath)) {
        console.error(`[warn] --file 指定的文件不存在，跳过: ${filePath}`);
        continue;
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '' && !l.startsWith('#'));
      console.error(`[info] 从 ${path.basename(filePath)} 读取到 ${lines.length} 个输入`);
      fileInputs.push(...lines);
    }
    delete cliOptions.files; // 避免误传
  }

  // 展开 --clipboard 选项：从 Windows 剪贴板读取图片
  /** @type {string[]} */
  const clipboardInputs = [];
  if (cliOptions.clipboard) {
    console.error('[info] 正在从 Windows 剪贴板读取图片...');
    const clipPath = readClipboardImage();
    if (clipPath) {
      clipboardInputs.push(clipPath);
      console.error('[info] 剪贴板图片读取成功');
    }
    delete cliOptions.clipboard; // 避免误传
  }

  const allInputs = [...inputs, ...fileInputs, ...clipboardInputs];

  if (allInputs.length === 0) {
    printUsage();
    process.exit(1);
  }

  // 加载配置
  const config = loadEnv(__dirname);

  if (!config.apiKey || config.apiKey === 'sk-your-real-api-key-here' || config.apiKey.startsWith('sk-your-')) {
    console.error('[error] 未配置有效的 API Key。');
    console.error('请编辑 scripts/.env 文件，将 apiKey 替换为您的真实 API Key。');
    console.error('获取 API Key: https://www.alibabacloud.com/help/zh/model-studio/get-api-key');
    process.exit(1);
  }

  const options = {
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    // 模型优先级: --model 命令行参数 > .env mode 字段 > 默认值
    model: cliOptions.model || config.mode || 'qwen3.5-omni-plus',
    prompt: cliOptions.prompt || '请详细描述该内容，包括其中可见的所有文字信息。对于图片，描述画面内容和任何可见的文本；对于音频，提供完整的转写和总结；对于视频，描述场景、对话和关键内容。请尽可能详尽准确。',
    maxTokens: parseInt(cliOptions.maxTokens, 10) || 4096,
    timeout: parseInt(cliOptions.timeout, 10) || 120000,
  };

  console.error(`[info] 模型: ${options.model}`);
  console.error(`[info] 端点: ${config.baseURL}`);
  console.error(`[info] 共 ${allInputs.length} 个输入待处理`);
  console.error('');

  // 并行处理所有输入
  const results = await Promise.allSettled(
    allInputs.map((input, idx) =>
      processInput(input, { ...options, label: `#${idx + 1}` })
    )
  );

  // 提取结果值
  const processed = results.map(r =>
    r.status === 'fulfilled' ? r.value : { input: 'unknown', category: null, description: null, error: '处理异常: ' + (r.reason?.message || '') }
  );

  // 输出结果到 stdout
  const output = formatResults(processed);
  console.log(output);

  // 清除临时文件
  cleanTempDir();

  // 统计结果
  const successCount = processed.filter(r => !r.error).length;
  const failCount = processed.filter(r => r.error).length;

  console.error('');
  console.error(`[info] 完成: ${successCount}/${processed.length} 成功` + (failCount > 0 ? `, ${failCount} 失败` : ''));

  // 退出码：全部成功=0，有失败=1
  process.exit(failCount > 0 ? 1 : 0);
}

// 仅在直接运行时执行 main
if (require.main === module) {
  main().catch(err => {
    console.error(`[fatal] ${err.message}`);
    process.exit(2);
  });
}

module.exports = {
  loadEnv,
  parseEnvFile,
  isDataURI,
  parseDataURI,
  isURL,
  detectFileType,
  fileToBase64,
  buildContentPart,
  callAPI,
  processInput,
};
