# 图像识别 Skill

**Multimodal Recognition** 是一个面向 DeepSeek V4 Pro等纯文本大模型的 **图片识别与音视频识别工具**。它通过调用阿里云百炼 Qwen3.5-Omni-Plus 全模态 API，将图片、音频、视频转换为结构化的文字描述（含 OCR 文字提取），从而让不具备多模态能力的文本大模型也能间接"看见"图片内容、分析音频、视频中的内容。

## 解决的核心问题

DeepSeek V4 Pro 等纯文本大模型在对话中无法直接处理图片 —— 当用户在聊天中粘贴截图或照片时，模型只能看到 `[Unsupported Image]` 占位符，无法理解图片内容。本工具作为 **图片识别桥接层**，在对话中自动或手动地将图片内容转为文本描述，再交还给文本模型进行分析和回答。

### 典型使用场景

| 场景 | 说明 |
|------|------|
| **截图文字提取** | 识别代码截图、聊天记录截图、网页截图中的文本，无需手动抄写 |
| **剪贴板一键识别** | 复制任意图片到剪贴板后，一条命令即可获取图片的文字描述 |
| **图表与数据分析** | 将数据报表截图、架构图、流程图转换为文字描述，供模型分析 |
| **照片内容理解** | 让文本模型理解照片中的物体、场景、人物和文字信息 |
| **UI 界面分析** | 识别软件界面截图的布局、按钮文本、状态信息等内容 |

## 工具特点

- **专为纯文本模型设计**：DeepSeek V4 Pro 用户的图片识别利器，填补视觉能力缺口
- **剪贴板即贴即用**：一键读取 Windows 剪贴板中的图片，无需保存文件，识别流程极简
- **OCR 级文字提取**：基于 Qwen3.5-Omni-Plus 全模态模型，对中文、英文、代码等文字有高精度识别能力
- **零配置分享**：作为 Claude Code Skill，通过 SKILL.md 即可一键安装和分发，团队成员只需配置自己的 API Key

## 支持的文件格式

### 图片（主要）

JPG / JPEG / JPE / PNG / WebP / GIF / BMP / TIF / TIFF / HEIC — 共 10 种图片格式，单文件最大 100 MB

### 音频与视频（辅助）

WAV / MP3 / AAC / OGG / FLAC / M4A / AMR / 3GP / 3GPP — 音频格式；MP4 / AVI / MKV / MOV / FLV / WMV — 视频格式

## 项目结构

```
multimodal-recognition/
├── SKILL.md                      # Claude Code Skill 定义文件（安装入口）
├── README.md                     # 本文件
├── .gitignore                    # Git 忽略规则
└── scripts/
    ├── recognize.js              # 图片/剪贴板/音频/视频识别主脚本
    ├── package.json              # npm 依赖声明
    ├── package-lock.json         # 依赖版本锁定
    ├── .env.template             # API 配置模板
    ├── .env                      # 实际配置（gitignore）
    ├── node_modules/             # 依赖（gitignore）
    └── temp/                     # 临时文件（gitignore，每次运行自动清理）
```

## 快速开始

### 环境要求

- Node.js 18 或更高版本
- Windows / Linux / macOS
- [阿里云百炼 API Key](https://www.alibabacloud.com/help/zh/model-studio/get-api-key)（免费开通）

### 安装步骤

```bash
# Step 1: 安装 npm 依赖
npm install --prefix scripts

# Step 2: 配置 API Key
cp scripts/.env.template scripts/.env
# 编辑 scripts/.env，将 apiKey 设置为你的真实 KEY

# Step 3: 作为 Claude Code Skill 安装
# 将整个项目文件夹复制到 skills 目录下，Claude Code 即可自动加载该 Skill

# Windows（Git Bash）
cp -r . "$USERPROFILE/.claude/skills/multimodal-recognition"

# macOS
cp -r . "$HOME/.claude/skills/multimodal-recognition"

# Linux
cp -r . "$HOME/.claude/skills/multimodal-recognition"
```

> **例**：假设你将项目克隆到了 `~/projects/multimodal-recognition`，进入项目目录后执行上述对应系统的 `cp -r` 命令，Claude Code 会在下次对话中自动加载该 Skill.
>
> **三操作系统的 Skills 路径**：
>
> | 操作系统 | Skills 目录路径 | 示例 |
> |----------|-----------------|------|
> | Windows | `%USERPROFILE%\.claude\skills\` | `C:\Users\YourName\.claude\skills\` |
> | macOS | `~/.claude/skills/` | `/Users/YourName/.claude/skills/` |
> | Linux | `~/.claude/skills/` | `/home/YourName/.claude/skills/` |
>
> 安装完成后，在 Claude Code 对话中直接说"识别这张图片"或粘贴图片路径，Skill 即自动触发，无需手动执行命令行。

### 配置文件 `scripts/.env`

```ini
baseURL=https://dashscope.aliyuncs.com/compatible-mode/v1
mode=qwen3.5-omni-plus
apiKey=sk-your-real-api-key-here
```

配置加载优先级（高到低）：`scripts/.env` → `~/.claude/.env` → 系统环境变量

## 使用指南

### 图片识别（核心功能）

```bash
# 识别本地图片文件
node scripts/recognize.js "C:\Users\me\screenshot.png"

# 识别网络图片（API 服务端直接拉取，无需本地下载）
node scripts/recognize.js "https://example.com/chart.jpg"

# 同时识别多张图片（并行处理）
node scripts/recognize.js "photo1.jpg" "photo2.png" "diagram.webp"

# 自定义识别提示词，聚焦特定需求
node scripts/recognize.js "screenshot.png" --prompt "只提取截图中的代码块，忽略界面装饰元素"

# 从文本文件批量读取图片 URL（每行一个）
node scripts/recognize.js --file "image_urls.txt"
```

### 剪贴板图片识别

这是本工具为 DeepSeek V4 Pro 等纯文本模型优化的 **核心工作流**。当你在聊天对话中粘贴图片，模型提示 `[Unsupported Image]` 时，只需两步即可让模型"看见"：

```bash
# Step 1: 在聊天中粘贴图片后，重新复制该图片到剪贴板（Ctrl+C）
# Step 2: 执行剪贴板识别命令
node scripts/recognize.js --clipboard

# 或配合提示词精确控制识别内容
node scripts/recognize.js --clipboard --prompt "请逐行列出图片中的所有文字，保持原文格式"
```

剪贴板识别的工作原理：

1. 脚本通过 PowerShell 调用 .NET 的 `System.Windows.Forms.Clipboard` API 读取剪贴板中的图片
2. 将图片保存为临时 PNG 文件，编码为 Base64 Data URI
3. 发送至 Qwen3.5-Omni-Plus API 进行识别
4. 输出结构化的文字描述结果
5. 自动清理临时文件，不留痕迹

> **注意**：Windows 剪贴板同时只保留最近一张复制的图片。如果聊天中有多条 `[Unsupported Image]`，需要逐张重新复制到剪贴板再执行识别。

### 音频与视频识别（辅助能力）

```bash
# 语音转写与总结
node scripts/recognize.js "meeting_recording.mp3" --prompt "完整转写这段录音并总结要点"

# 视频内容分析
node scripts/recognize.js "demo_video.mp4" --prompt "描述视频中的场景变化和对话内容"

# 多媒体混合处理
node scripts/recognize.js "photo.jpg" "audio.wav" "video.mp4"
```

### 全部命令行选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--clipboard` | **从 Windows 剪贴板读取图片**（核心功能） | — |
| `--prompt "<text>"` | 自定义识别提示词 | 内置中文全量描述提示词 |
| `--model <name>` | 模型名称 | `qwen3.5-omni-plus` |
| `--max-tokens <n>` | 最大输出 tokens | `4096` |
| `--timeout <ms>` | API 请求超时（毫秒） | `120000`（2 分钟） |
| `--file <path>` | 从文本文件批量读取输入（每行一个，可多次指定） | — |

## 技术实现

### 识别流水线

```
图片输入（本地文件 / URL / 剪贴板 / Data URI）
  → 类型检测与格式校验（扩展名映射 + MIME 解析，25+ 格式）
    → 负载构建（本地文件 Base64 编码 / URL 直传 / 剪贴板 PNG 转码）
      → 构建 OpenAI 兼容 API 请求体（含 content part 和 prompt）
        → 调用 Qwen3.5-Omni-Plus 流式 API
          → 实时累积流式响应文本
            → 格式化输出到 stdout（含文件标签和模态类型）
              → 自动清理 scripts/temp/ 目录中的临时文件
```

### 技术栈

- **运行时**：Node.js (CommonJS)，零额外运行时依赖
- **API 通信**：OpenAI 兼容 SDK (`openai` npm 包)，流式调用模式
- **识别引擎**：阿里云百炼 Qwen3.5-Omni-Plus 全模态模型
- **剪贴板读取**：PowerShell + .NET `System.Windows.Forms.Clipboard` + `System.Drawing`（仅 Windows）

### 输出格式

识别结果输出到 stdout（文本模型可直接读取），stderr 用于进度和错误日志：

```
=== FILE: C:\Users\me\screenshot.png ===
TYPE: image
[详细的图片文字描述，包含 OCR 提取的所有可见文本]

=== END: screenshot.png ===
```

### 退出码与错误处理

| 退出码 | 含义 |
|--------|------|
| `0` | 全部识别成功 |
| `1` | 部分或全部识别失败（已跳过失败项，其余正常输出） |
| `2` | 脚本严重错误（如 JS 运行时异常） |

脚本对以下异常情况有完善的容错处理，不会因单个文件失败而中断整体流程：

- **未配置 API Key** → 输出配置指引，提示编辑 `.env` 文件
- **文件不存在** → 标记错误，跳过该文件继续处理
- **不支持的格式** → 标记错误，列出全部 25+ 种支持的格式
- **API 认证失败 (401/403)** → 提示检查 API Key 的有效性
- **API 限流 (429)** → 自动等待 2 秒后重试一次
- **网络超时** → 报告超时时间，建议使用 `--timeout` 增大阈值

## 与 Claude Code 的集成

本工具是一个标准的 **Claude Code Skill**，核心定义位于 [SKILL.md](SKILL.md)。安装后，Claude Code 在对话中自动响应以下触发词：

- "描述这张图片" / "图片里有什么"
- "识别剪切板图片" / "剪切板图片中有什么"
- "转写这段录音" / "这个视频讲了什么"
- 用户直接提供图片/音频/视频文件路径或网络 URL
- 用户粘贴 Base64 Data URI 格式的剪贴板内容

在 Claude Code 中安装本 Skill 后，所有多模态识别调用均为全自动的，无需手动执行命令行。

## 隐私与安全

- **API Key 保护**：`scripts/.env` 已被 `.gitignore` 排除，不会被提交到版本控制系统
- **临时文件自动清理**：`scripts/temp/` 中的临时 PNG 和 PowerShell 脚本在每次识别完成后自动删除
- **传输安全**：本地文件经 Base64 编码后通过 HTTPS 传输至阿里云百炼 API，不在本地或中间节点留存

## 常见问题

### 剪贴板识别提示"剪贴板中没有图片数据"

请确认你确实复制了一张图片到剪贴板（可以使用截图工具或右键图片 → 复制）。仅复制图片文件（文件图标）不等同于复制图片内容。建议使用截图工具（如 Win+Shift+S）截取屏幕区域后直接执行 `--clipboard`。

### 识别结果不够详细怎么办

使用 `--prompt` 参数自定义识别指令，例如：

```bash
node scripts/recognize.js --clipboard --prompt "请作为专业 OCR 工具，逐字逐句提取图片中的所有文字，包括中英文、数字和符号，保持原有排版格式。同时描述图片的整体布局和视觉信息。"
```

### API 返回超时

较大的图片或视频可能超过默认的 120 秒超时。使用 `--timeout` 增大限制：

```bash
node scripts/recognize.js "large_video.mp4" --timeout 300000
```

## 免责声明

1. **识别结果仅供参考**：本工具作为 Qwen3.5-Omni-Plus API 的调用桥接层，不保证识别结果的准确性、完整性或时效性。所有文字描述由第三方 AI 模型生成，可能存在遗漏、误识别或幻觉内容。对于依赖识别结果做出的任何决策，使用者应自行核实并承担相应风险。

2. **API 服务依赖性**：本工具依赖阿里云百炼平台提供的 Qwen3.5-Omni-Plus API。API 的可用性、响应速度、调用配额和定价策略均由阿里云决定，项目维护者不对 API 服务的稳定性或变更承担责任。

3. **费用承担**：使用本工具调用阿里云百炼 API 可能产生费用。使用者需自行了解 API 的计费规则，并承担因调用产生的全部费用。建议在正式使用前确认免费额度与计费标准。

4. **隐私与数据安全**：本地媒体文件经 Base64 编码后通过 HTTPS 传输至阿里云百炼 API 进行处理。尽管传输过程经过加密，使用者仍需自行评估上传敏感或机密内容至第三方 API 的风险。项目维护者不对数据传输过程中的安全性做出任何保证。

5. **版权与合规**：使用者应确保拥有所处理媒体内容的合法权利，或已获得权利人的明确授权。不得利用本工具识别、转写或分析侵犯他人知识产权、隐私权或其他合法权益的内容。因使用者违反法律法规或侵犯第三方权益所产生的任何纠纷或责任，均由使用者自行承担。

6. **免责范围**：在适用法律允许的最大范围内，项目维护者和贡献者不对因使用或无法使用本工具而产生的任何直接、间接、附带、特殊或后果性损害承担责任，包括但不限于数据丢失、业务中断、经济损失或第三方索赔。

## 许可

本项目基于 [MIT License](LICENSE) 开源。
