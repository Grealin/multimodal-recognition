---
name: multimodal-recognition
description: 当用户需要图片识别、剪切板识别、剪贴板图片，或描述/提取图片、音频、视频中的文字信息时使用此 Skill。触发条件包括：用户提到 "图片识别"、"剪切板识别"、"剪贴板图片"、"识别图片"、"描述这张图片"、"图片里有什么"、"识别这个截图"、"识别这张图"、"提取图中的文字"、"剪贴板里有什么"、"转写这段音频"、"这个视频讲了什么"、"分析这张图表"、"听听这个录音说了什么"、"看看这个视频" 等，或直接提供了 .jpg / .jpeg / .png / .webp / .gif / .bmp / .tif / .heic / .wav / .mp3 / .aac / .ogg / .flac / .m4a / .mp4 / .avi / .mkv / .mov 等媒体文件路径，或提供了图片/音频/视频的网络 URL，或提供了 data:image/...;base64,... 格式的剪贴板内容。不要对普通文本文件读取或文档处理使用此 Skill（应使用 pdf/docx/xlsx 等对应 Skill）。
---

# 多模态识别 (Multimodal Recognition)

## 概述

此 Skill 通过调用 Qwen3.5-Omni-Plus 全模态大模型 API，将图片、音频、视频转换为详细的文字描述。它使不支持多模态输入的大模型能够间接"看到"和"听到"媒体内容。

**核心能力：** 将视觉和听觉内容转换为结构化文字描述，包含画面中的文本（OCR）、音频中的语音转写、视频中的场景和对话分析。

## 脚本位置

本 Skill 的识别脚本位于 `scripts/recognize.js`。调用时需使用该文件的绝对路径。

**动态获取脚本路径：**

由于不同用户的 Skill 安装目录不同，请通过以下方式确定实际路径，**禁止使用硬编码的用户名**：

| 操作系统 | 脚本路径 |
|----------|----------|
| Windows | `%USERPROFILE%\.claude\skills\multimodal-recognition\scripts\recognize.js` |
| Linux / macOS | `$HOME/.claude/skills/multimodal-recognition/scripts/recognize.js` |

在命令行中，可通过以下方式在运行时展开：

```bash
# Windows (PowerShell)
node "$env:USERPROFILE\.claude\skills\multimodal-recognition\scripts\recognize.js" <输入>

# Windows (CMD)
node "%USERPROFILE%\.claude\skills\multimodal-recognition\scripts\recognize.js" <输入>

# Linux / macOS
node "$HOME/.claude/skills/multimodal-recognition/scripts/recognize.js" <输入>
```

下文所有示例使用 `<SKILL_SCRIPTS>/recognize.js` 表示脚本路径，请自行替换为上述对应操作系统的实际路径。

## 何时使用

当用户提出以下类型的请求时使用此 Skill：

- "图片识别" / "识别图片" / "识别这张图" — 通用的图片识别请求
- "剪切板识别" / "剪贴板图片" / "剪贴板里有什么" — 从剪贴板读取并识别图片
- "描述这张图片" / "图片里有什么内容？"
- "识别这个截图里的文字" / "提取图中的文本"
- "转写这段录音" / "这个音频说了什么？"
- "这个视频讲了什么？" / "总结一下视频内容"
- "分析这张图表/照片"
- 提供了以 `.jpg`、`.png`、`.webp`、`.gif`、`.wav`、`.mp3`、`.mp4` 等结尾的文件路径
- 提供了指向图片、音频、视频的网络 URL
- 提供了 `data:image/png;base64,...` 格式的剪贴板内容

**不要使用的情况：**
- 用户需要文档处理（应使用 pdf、docx、xlsx、pptx 等 Skill）
- 用户需要编辑或转换媒体文件
- 用户提出的问题可以在不分析媒体内容的情况下回答

## 使用方式

### 基本调用模式

```bash
node <SKILL_SCRIPTS>/recognize.js <输入1> [输入2...] [选项]
```

### 单文件处理

```bash
node <SKILL_SCRIPTS>/recognize.js "C:\path\to\chart.png"
```

### 多文件并行处理

```bash
node <SKILL_SCRIPTS>/recognize.js "photo.jpg" "recording.mp3" "demo.mp4"
```

所有文件并行处理，互不阻塞。

### URL 输入

```bash
node <SKILL_SCRIPTS>/recognize.js "https://example.com/image.png"
```

URL 由 Qwen API 服务端直接拉取，无需本地下载。

### Data URI 输入（手动粘贴 Base64）

```bash
node <SKILL_SCRIPTS>/recognize.js "data:image/png;base64,iVBORw0KGgo..."
```

脚本自动解析 MIME 类型并使用 Base64 数据构建 API 请求。

### Windows 剪贴板输入（--clipboard）

```bash
node <SKILL_SCRIPTS>/recognize.js --clipboard
```

直接从 Windows 剪贴板读取当前复制的图片，自动编码为 Data URI 后识别。

**限制：仅支持单张图片。** Windows 剪贴板同时只保留最近一次复制的图片。如果聊天中出现了多个 `[Unsupported Image]` 提示，需要逐个重新复制图片到剪贴板，然后每次执行 `--clipboard`。

**典型使用场景（`[Unsupported Image]` 处理流程）：**

1. 用户在聊天中粘贴了一张图片，模型看到 `[Unsupported Image]` 提示
2. 用户重新复制（Ctrl+C）那张图片到剪贴板
3. 调用 `node <SKILL_SCRIPTS>/recognize.js --clipboard` 即可获取图片的文字描述

```bash
# 完整示例：识别剪贴板中的图片
node <SKILL_SCRIPTS>/recognize.js --clipboard --prompt "请详细描述这张图片的内容"
```

### 从文件批量读取输入（--file）

```bash
node <SKILL_SCRIPTS>/recognize.js --file "urls.txt" --file "data_uris.txt"
```

从文本文件按行读取输入（每行一个 URL 或 Data URI），支持多次 `--file` 指定多个文件。适用于超长 Data URI 超出命令行参数限制的场景。

### 自定义提示词

```bash
node <SKILL_SCRIPTS>/recognize.js "screenshot.png" --prompt "只提取截图中的代码块内容"
```

如果未提供自定义提示词，默认使用：
> "请详细描述该内容，包括其中可见的所有文字信息。对于图片，描述画面内容和任何可见的文本；对于音频，提供完整的转写和总结；对于视频，描述场景、对话和关键内容。请尽可能详尽准确。"

### 选项

| 选项 | 说明 |
|------|------|
| `--prompt "<text>"` | 自定义分析提示词 |
| `--model <name>` | 覆盖模型名称（默认从 `.env` 的 `mode` 读取，兜底: `qwen3.5-omni-plus`） |
| `--max-tokens <n>` | 最大输出 tokens（默认: 4096） |
| `--timeout <ms>` | 请求超时毫秒数（默认: 120000，即 2 分钟） |
| `--clipboard` | 从 Windows 剪贴板读取图片（仅当前单张） |
| `--file <path>` | 从文本文件读取输入（每行一个，支持多次指定） |

## 配置

脚本从 `.env` 文件读取 API 凭据，按以下优先级加载：

1. `scripts/.env` — 脚本同级目录（最高优先级）
2. `~/.claude/.env` — 用户全局配置
3. 系统环境变量 — `BASE_URL` / `MODE`(模型名称) / `API_KEY`

### 首次配置

1. 将 `scripts/.env.template` 复制为 `scripts/.env`
2. 编辑 `scripts/.env`，将 `apiKey` 替换为您的真实 API Key
3. 如需使用其他端点，修改 `baseURL`

API Key 获取地址：https://www.alibabacloud.com/help/zh/model-studio/get-api-key

### 配置文件格式

```ini
# Multimodal Recognition Skill - 配置
# baseURL - API 端点地址
#   阿里云百炼官方端点: https://dashscope.aliyuncs.com/compatible-mode/v1
# mode - 指定模型名称，默认为 qwen3.5-omni-plus
# apiKey - 阿里云百炼 API Key

baseURL=https://dashscope.aliyuncs.com/compatible-mode/v1
mode=qwen3.5-omni-plus
apiKey=sk-your-api-key-here
```

## 输入格式支持

| 输入类型 | 格式示例 | 处理方式 |
|----------|----------|----------|
| 本地绝对路径 | `C:\path\to\photo.png` | 读取文件 -> Base64 编码 -> 构建 content part |
| 网络 URL | `https://example.com/image.jpg` | 直接传入 API（服务端拉取） |
| Data URI | `data:image/png;base64,...` | 解析 MIME -> 提取 Base64 -> 构建 content part |
| 剪贴板 (`--clipboard`) | PowerShell 读取剪贴板 | .NET Clipboard API -> 保存 PNG -> 编码 Data URI |
| 文件输入 (`--file`) | `urls.txt`（每行一个输入） | 逐行读取 -> 按 URL/DataURI 规则处理 |

## 支持的文件格式

- **图片：** JPG, JPEG, JPE, PNG, WebP, GIF, BMP, TIF, TIFF, HEIC
- **音频：** WAV, MP3, AAC, OGG, FLAC, M4A, AMR, 3GP, 3GPP
- **视频：** MP4, AVI, MKV, MOV, FLV, WMV

最大单文件大小：100MB

## 输出格式

每个文件的结果以以下格式输出到 stdout：

```
=== FILE: <输入路径> ===
TYPE: <image|audio|video>
<详细的文字描述>

=== END: <文件名> ===

```

多文件处理时，每个结果块之间以空行分隔。

- stdout：识别结果文本
- stderr：进度和错误信息
- 退出码：0 = 全部成功，1 = 部分失败

每次识别完成后，脚本会自动清除 `scripts/temp/` 目录中的临时文件，避免磁盘空间累积。

## 错误处理

脚本对以下情况进行优雅处理：

- **缺少 API Key：** 输出配置指引，提示用户编辑 `.env`
- **文件不存在：** 跳过该文件，继续处理其他文件
- **不支持的文件格式：** 跳过并列出支持的格式
- **API 认证错误 (401/403)：** 提示检查 API Key
- **API 限流 (429)：** 自动重试一次
- **网络超时：** 报告超时时间，建议使用 `--timeout` 增大超时

## 依赖安装

首次使用前需安装 npm 依赖：

```bash
# Windows (PowerShell)
npm install --prefix "$env:USERPROFILE\.claude\skills\multimodal-recognition\scripts"

# Windows (CMD)
npm install --prefix "%USERPROFILE%\.claude\skills\multimodal-recognition\scripts"

# Linux / macOS
npm install --prefix "$HOME/.claude/skills/multimodal-recognition/scripts"
```

依赖仅包含 `openai`（OpenAI 兼容 SDK），用于调用 Qwen API 端点。

## 隐私与安全

- **`.env` 文件已被 `.gitignore` 忽略**，确保 API Key 不会被提交到版本控制系统
- **`scripts/temp/` 目录已被忽略**，运行时产生的临时文件不会进入仓库
- **`scripts/node_modules/` 目录已被忽略**，依赖由各用户自行安装
- **SKILL.md 中不包含任何硬编码的用户名或路径**，所有路径均使用环境变量引用
- 分享本 Skill 前，请确认 `scripts/.env` 中的真实 API Key 已被移除或替换为占位符

## 技术架构

```
multimodal-recognition/
├── SKILL.md                  # Skill 说明文档（本文件）
├── .gitignore                # Git 忽略规则
└── scripts/
    ├── recognize.js          # 主识别脚本（Node.js）
    ├── package.json          # npm 依赖声明
    ├── package-lock.json     # 依赖版本锁定
    ├── .env.template         # 配置模板（可安全分享）
    ├── .env                  # 实际配置（已被 gitignore，含 API Key）
    ├── node_modules/         # 依赖（已被 gitignore）
    └── temp/                 # 临时文件（已被 gitignore，脚本自动清理）
```
