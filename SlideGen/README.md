# HTML PPT Generator

基于 AI 大模型的 HTML 演示文稿生成器。输入文字描述，自动生成精美的单页 HTML PPT。

![Vue](https://img.shields.io/badge/Vue-3.4-4FC08D?logo=vue.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite)

## ✨ 功能特性

- 🤖 **AI 智能生成** - 输入 Prompt 自动生成 HTML 格式的 PPT
- 🎨 **参考模板** - 支持选择内置模板或上传参考图/HTML 作为设计参考
- 🔍 **排版检测** - 自动检测容器溢出、视口越界、元素重叠等排版问题
- 🔧 **自动修复** - 检测到爆版问题后，可自动调用 AI 进行修复
- 🔄 **批量生成** - 支持设置循环次数，批量生成多个结果
- 📊 **实时预览** - 流式输出，边生成边预览
- 📤 **一键导出** - 导出完整的 HTML 文件

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- pnpm（推荐）或 npm

### 安装依赖

```bash
pnpm install
```

### 配置 API

在项目根目录创建 `.env.local` 文件：

```env
# API 地址（兼容 OpenAI 格式的接口）
VITE_API_BASE_URL=https://your-api-endpoint/v1

# API Key
VITE_API_KEY=your-api-key

# 默认模型（可选）
VITE_MODEL_NAME=gpt-4o
```

### 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:5173 开始使用。

### 构建生产版本

```bash
pnpm build
```

构建产物在 `dist/` 目录。

## 📁 项目结构

```
src/
├── App.vue                    # 主应用组件
├── main.ts                    # 入口文件
├── style.css                  # 全局样式
├── components/
│   ├── InputPanel.vue         # 左侧输入面板（Prompt、模型选择、参数配置）
│   └── ResultPanel.vue        # 右侧结果面板（预览、表格、全屏查看）
├── services/
│   └── llmService.ts          # LLM API 调用服务
├── utils/
│   ├── layout-checker.ts      # 排版检测工具
│   └── local-storages.ts      # 本地存储工具
├── templates/
│   └── index.ts               # 内置模板配置
public/
└── template/                  # 模板资源文件
    ├── html/                  # HTML 模板
    ├── pic/                   # 图片资源
    └── pptx/                  # PPTX 模板
```

## 🎯 核心模块说明

### InputPanel.vue - 输入面板

- **Prompt 输入**: 支持多行文本描述
- **模型选择**: 自动获取可用模型列表，支持多模态模型筛选
- **Max Tokens**: 根据模型自动设置（glm-4.6: 15000, gemini-3-pro: 65535）
- **参考文件**: 支持拖拽/粘贴上传图片、HTML 文件
- **循环次数**: 批量生成设置
- **自动修复**: 勾选后自动检测并修复爆版问题

### ResultPanel.vue - 结果面板

- **表格视图**: 显示所有生成结果（原始/修复、爆版状态、耗时）
- **预览模式**: iframe 实时渲染 HTML
- **代码模式**: 查看生成的 HTML 源码
- **全屏查看**: 点击缩略图进入全屏模式
- **排版检测**: 可视化显示检测到的问题
- **一键导出**: 下载 HTML 文件

### llmService.ts - LLM 服务

- **generateSinglePageHtmlPpt()**: 生成 HTML PPT
- **fixLayoutIssues()**: 修复排版问题
- **fetchModels()**: 获取可用模型列表
- 支持流式输出、多模态输入（图片参考）

### layout-checker.ts - 排版检测

检测三类问题：
1. **容器溢出**: `scrollHeight > clientHeight`
2. **视口越界**: 元素超出 1280×720 边界
3. **元素重叠**: 图片与文字等关键元素的非预期重叠

## 🛠️ 开发调试

### 调试技巧

1. **查看 API 请求**: 打开浏览器开发者工具 → Network 面板
2. **查看生成日志**: 右侧面板底部的日志区域
3. **调试排版检测**: 点击检测结果项会在预览中高亮对应元素

### 添加新模板

1. 将 HTML 文件放入 `public/template/html/`
2. 在 `src/templates/index.ts` 中注册模板信息
3. 模板会自动出现在选择列表中

### 自定义模型预设

修改 `InputPanel.vue` 中的 `modelMaxTokensPreset` 对象：

```typescript
const modelMaxTokensPreset: Record<string, number> = {
  "glm-4.6": 15000,
  "gemini-3-pro-preview": 65535,
  // 添加更多模型...
};
```

## 📝 API 兼容性

本项目使用 OpenAI 兼容格式的 API，支持以下服务：

- OpenAI API
- Azure OpenAI
- 智谱 AI (GLM)
- Google Gemini（通过兼容层）
- 其他兼容 OpenAI 格式的服务

## 📄 License

MIT

