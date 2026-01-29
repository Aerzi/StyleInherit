export interface LLMConfig {
    apiKey?: string
    apiUrl?: string
    model?: string
    stream?: boolean
}

export interface ModelInfo {
    id: string
    object: string
    created?: number
    owned_by?: string
}

export interface GenerateRequest {
    prompt: string
    slideCount?: number
    model?: string
    maxTokens?: number
    referenceType?: 'none' | 'template' | 'custom'
    templateId?: string
    customReference?: {
        type: 'html' | 'pptx' | 'image' | 'url'
        content: string // base64 或 URL
        filename?: string
    }
    // 场景2：同时支持图片和HTML模板
    imageReference?: {
        content: string // base64 图片
        filename?: string
    }
    htmlTemplate?: {
        content: string // HTML模板内容
        filename?: string
    }
    // 上下文内容（从txt/docx/pptx文件解析）
    contextContent?: string
}

export interface SlideResult {
    index: number
    html: string
    title?: string
}

export interface GenerateResult {
    slides: SlideResult[]
    totalCount: number
}

export interface GenerateCallbacks {
    onSlideGenerated?: (slide: SlideResult) => void
    onStreamContent?: (content: string) => void
    onError?: (error: string) => void
    onComplete?: () => void
}

// 从环境变量或默认值获取配置
function getConfig(): LLMConfig {
    return {
        apiUrl: (import.meta as any).env?.VITE_API_BASE_URL || 'https://api.openai.com/v1',
        apiKey: (import.meta as any).env?.VITE_API_KEY || '',
        model: (import.meta as any).env?.VITE_MODEL_NAME || 'gpt-4o',
        stream: true
    }
}

/**
 * 获取模型列表（OpenAI 标准格式）
 */
export async function fetchModels(): Promise<ModelInfo[]> {
    const config = getConfig()

    if (!config.apiKey) {
        console.warn('未配置 API Key，无法获取模型列表')
        return []
    }

    try {
        const response = await fetch(`${config.apiUrl}/models`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${config.apiKey}`
            }
        })

        if (!response.ok) {
            console.error('获取模型列表失败:', response.status)
            return []
        }

        const data = await response.json()
        return data.data || []
    } catch (error) {
        console.error('获取模型列表出错:', error)
        return []
    }
}

type MessageContent = string | Array<{
    type: 'text' | 'image_url'
    text?: string
    image_url?: { url: string }
}>

interface ChatMessage {
    role: 'user' | 'assistant' | 'system'
    content: MessageContent
}

/**
 * 构建消息数组（支持多模态图片）
 */
function buildMessages(prompt: string, request: GenerateRequest): ChatMessage[] {
    const { referenceType, customReference } = request

    // 如果有图片参考，使用多模态格式
    if (referenceType === 'custom' && customReference?.type === 'image' && customReference.content) {
        const imageUrl = customReference.content.startsWith('data:')
            ? customReference.content
            : `data:image/png;base64,${customReference.content}`

        return [{
            role: 'user',
            content: [
                {
                    type: 'image_url',
                    image_url: { url: imageUrl }
                },
                {
                    type: 'text',
                    text: prompt
                }
            ]
        }]
    }

    // 普通文本消息
    return [{ role: 'user', content: prompt }]
}

function buildPrompt(request: GenerateRequest): string {
    const { prompt, referenceType, customReference, contextContent } = request

    let referenceInfo = ''
    let contextInfo = ''

    // 如果有上下文内容，添加到提示词中
    if (contextContent && contextContent.trim()) {
        contextInfo = `
## 参考资料（请基于以下内容生成PPT）
${contextContent}
`
    }

    if (referenceType === 'custom' && customReference) {
        if (customReference.type === 'html') {
            referenceInfo = `
## 参考模板（必须严格遵循）
\`\`\`html
${customReference.content}
\`\`\`

### 模板使用要求
1. **保持完全相同的 HTML 结构**：不要增删任何 DOM 节点，保持标签层级和嵌套关系
2. **保持完全相同的 CSS 样式**：复用模板的所有样式定义（颜色、字体、间距、布局等）
3. **只替换文字内容**：将模板中的示例文字替换为与用户主题相关的内容
4. **保持图标类型**：如果模板使用了 Font Awesome 图标，保持相同位置使用图标，可更换为更贴合主题的图标
5. **保持数据结构**：如果模板包含图表/数据，保持相同的数据展示方式，只更换具体数值和标签
6. **填充所有占位内容**：确保模板中每一个文字区域都根据主题填入有意义的内容`
        } else if (customReference.type === 'url') {
            referenceInfo = `
## 参考网址
${customReference.content}
请参考该网页的整体视觉风格、配色方案和布局结构来设计。`
        } else if (customReference.type === 'image') {
            referenceInfo = `
你是一个专业的全栈前端开发者，擅长从 UI 截图或设计图精确复刻成现代、干净、可响应的 HTML 和 CSS 代码。

任务：基于上传的图片，生成一个像素级接近的单文件 HTML（包含内联 CSS 或 Tailwind CDN），完美复刻布局、颜色、字体、间距、阴影和所有视觉元素。

步骤：
1. 先详细分析图片：描述整体布局（grid/flex）、主要组件（header、cards、buttons 等）、颜色方案（用 hex 值）、typography、spacing 和任何微交互提示。
2. 然后生成代码：使用 HTML5 + Tailwind CSS（通过 CDN），确保响应式（mobile-first），代码干净、可读、无多余元素。
3. 只输出完整的 HTML 代码（从 <html> 开始），用\`\`\`html 包裹，便于复制。
4. 如果图片有文本，确保精确复制；如果有图标，用合适 emoji 或描述替代。

严格要求：
- 100% 基于图片，不要添加或省略任何可见元素。
- 优先使用 Tailwind 类实现样式。
- 确保在桌面和手机上看起来一致。
- 输出前验证代码有效性。

现在开始分析并生成代码。`
        } else if (customReference.type === 'pptx') {
            referenceInfo = `
## 参考文件
用户上传了PPTX文件（${customReference.filename}），请：
1. 复刻其布局结构和设计风格
2. 保持相同的配色方案
3. 根据用户主题替换所有文字内容`
        }
    }

    return `${referenceInfo}
${contextInfo}
请为以下主题创建一张高质量的 HTML 幻灯片页面。

## 主题
${prompt}


## 设计要求
1. 尺寸固定为 1280px × 720px
2. 现代、专业的设计风格，配色和谐
3. 文字清晰可读，排版美观
4. 可使用渐变、阴影、圆角等现代设计元素
5. 避免蓝紫渐变色和发光效果

## 可用资源（推荐使用）
1. **Font Awesome 6** - 用于图标
   \`<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">\`
   使用示例：\`<i class="fa-solid fa-chart-line"></i>\`

2. **ECharts 5** - 用于数据可视化图表（如果内容涉及数据展示）
   \`<script src="https://cdnjs.cloudflare.com/ajax/libs/echarts/5.4.3/echarts.min.js"></script>\`
   图表必须在页面加载时立即渲染，不依赖用户交互
   **必须关闭动画**：配置中设置 \`animation: false\`

3. **Google Fonts** - 用于优质字体
   \`<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">\`

## 严格禁止
- 禁止任何 CSS 动画（animation、transition、@keyframes）
- 禁止任何 hover、focus、active 等伪类效果
- 禁止滚动条（必须 overflow: hidden）
- 禁止任何需要用户交互才能显示的内容
- 禁止图表动画（ECharts 必须设置 animation: false）
- 这是静态 PPT，所有内容必须在页面加载后立即可见

## 输出格式
输出完整的 HTML 文档，以 ===SLIDE_START=== 开始，===SLIDE_END=== 结束：

===SLIDE_START===
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1280, height=720">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 1280px; height: 720px; overflow: hidden; font-family: 'Noto Sans SC', sans-serif; }
    /* 你的样式 */
  </style>
</head>
<body>
  <!-- 你的内容 -->
  <!-- 如需 ECharts，在此添加 script 标签并立即初始化图表 -->
</body>
</html>
===SLIDE_END===

请直接输出 HTML 代码，不要添加任何解释。`
}

export async function generateSinglePageHtmlPpt(
    request: GenerateRequest,
    callbacks?: GenerateCallbacks
): Promise<GenerateResult> {
    const config = getConfig()

    // 如果没有API Key，直接报错
    if (!config.apiKey) {
        const error = '未配置 API Key，请在环境变量中设置 VITE_API_KEY'
        callbacks?.onError?.(error)
        throw new Error(error)
    }

    const prompt = buildPrompt(request)

    // 构建消息内容（支持多模态）
    const messages = buildMessages(prompt, request)

    let response: Response
    try {
        response = await fetch(`${config.apiUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                model: request.model || config.model,
                messages,
                temperature: 0.2,
                max_tokens: request.maxTokens || 16000,
                stream: config.stream
            })
        })
    } catch (error) {
        // 网络错误详细提示
        let msg = '网络请求失败'
        if (error instanceof Error) {
            msg = `网络错误: ${error.message}`
        }
        else {
            msg = '[修复] 网络请求失败'
        }
        callbacks?.onError?.(msg)
        throw new Error(msg)
    }

    try {
        if (!response.ok) {
            const errorText = await response.text()
            let errorDetail = errorText
            try {
                const errorJson = JSON.parse(errorText)
                errorDetail = errorJson.error?.message || errorJson.message || errorText
            } catch { }
            const msg = `API 错误 (${response.status}): ${errorDetail}`
            callbacks?.onError?.(msg)
            throw new Error(msg)
        }

        if (config.stream) {
            return await handleStreamResponse(response, callbacks)
        } else {
            return await handleNormalResponse(response, callbacks)
        }
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('API 错误')) {
            throw error
        }
        const msg = error instanceof Error ? error.message : '未知错误'
        callbacks?.onError?.(msg)
        throw error
    }
}

async function handleStreamResponse(
    response: Response,
    callbacks?: GenerateCallbacks
): Promise<GenerateResult> {
    const reader = response.body?.getReader()
    if (!reader) throw new Error('无法读取响应流')

    const decoder = new TextDecoder()
    let fullContent = ''
    let reasoningContent = ''
    let buffer = ''
    let isCollectingThinking = false
    let isFirstChunk = true
    const slides: SlideResult[] = []

    // 超时控制：10分钟 = 600000毫秒
    const TIMEOUT_MS = 600000
    const startTime = Date.now()

    try {
        while (true) {
            // 检查超时
            const elapsed = Date.now() - startTime
            if (elapsed >= TIMEOUT_MS) {
                throw new Error(`生成超时（已等待 ${Math.round(elapsed / 1000)}s，超时时间：10分钟）`)
            }

            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6)
                    if (data === '[DONE]') continue

                    try {
                        const parsed = JSON.parse(data)
                        // 检查是否有错误
                        if (parsed.error) {
                            const errorMsg = parsed.error.message || JSON.stringify(parsed.error)
                            throw new Error(`流式响应错误: ${errorMsg}`)
                        }
                        const delta = parsed.choices?.[0]?.delta?.content || ''
                        const reasoning = parsed.choices?.[0]?.delta?.reasoning_content || ''

                        // 处理推理内容（reasoning_content）
                        if (reasoning) {
                            reasoningContent += reasoning
                            // 回调推理内容（带前缀标识）
                            callbacks?.onStreamContent?.(`[思考中...]\n${reasoningContent}`)
                        }
                        // 处理 <think> 标签包裹的推理内容
                        else if (isFirstChunk && delta === '<think>') {
                            isCollectingThinking = true
                            isFirstChunk = false
                            continue
                        } else if (isCollectingThinking && delta === '</think>') {
                            isCollectingThinking = false
                            continue
                        } else if (isCollectingThinking) {
                            reasoningContent += delta
                            callbacks?.onStreamContent?.(`[思考中...]\n${reasoningContent}`)
                        }
                        // 处理正常内容
                        else if (delta) {
                            fullContent += delta

                            // 实时回调流式内容（如果有推理内容，也显示）
                            const displayContent = reasoningContent
                                ? `[思考完成]\n${reasoningContent}\n\n[生成中...]\n${fullContent}`
                                : fullContent
                            callbacks?.onStreamContent?.(displayContent)

                            // 尝试解析已完成的幻灯片
                            const newSlides = parseSlides(fullContent, slides.length)
                            for (const slide of newSlides) {
                                if (!slides.find(s => s.index === slide.index)) {
                                    slides.push(slide)
                                    callbacks?.onSlideGenerated?.(slide)
                                }
                            }
                        }

                        if (isFirstChunk) {
                            isFirstChunk = false
                        }
                    } catch {
                        // 忽略解析错误
                    }
                }
            }
        }

        // 最终解析
        const finalSlides = parseSlides(fullContent, 0)
        callbacks?.onComplete?.()

        return {
            slides: finalSlides.length > 0 ? finalSlides : slides,
            totalCount: finalSlides.length || slides.length
        }
    } finally {
        reader.releaseLock()
    }
}

async function handleNormalResponse(
    response: Response,
    callbacks?: GenerateCallbacks
): Promise<GenerateResult> {
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    const slides = parseSlides(content, 0)
    slides.forEach(slide => callbacks?.onSlideGenerated?.(slide))
    callbacks?.onComplete?.()

    return { slides, totalCount: slides.length }
}

function parseSlides(content: string, startIndex: number): SlideResult[] {
    const slides: SlideResult[] = []
    const regex = /===SLIDE_START===([\s\S]*?)===SLIDE_END===/g
    let match
    let index = startIndex

    while ((match = regex.exec(content)) !== null) {
        const html = match[1].trim()
        if (html) {
            slides.push({
                index: index++,
                html,
                title: extractTitle(html)
            })
        }
    }

    return slides
}

function extractTitle(html: string): string | undefined {
    const match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
    return match?.[1]?.trim()
}

/**
 * 意图识别：根据用户输入匹配最合适的模板
 */
export interface IntentRecognitionRequest {
    userPrompt: string
    templateIndex: string // 模板索引文档
    model?: string
}

export interface IntentRecognitionCallbacks {
    onStreamContent?: (content: string) => void
    onError?: (error: string) => void
    onComplete?: () => void
}

function buildIntentRecognitionPrompt(request: IntentRecognitionRequest): string {
    return `你是一个专业的模板选择助手。请根据用户输入的主题，从以下模板列表中选择最匹配的HTML模板。

${request.templateIndex}

## 用户输入的主题
${request.userPrompt}

## 任务要求
1. 仔细分析用户主题的内容、风格、功能需求
2. 查看每个模板的完整HTML代码，理解其内容主题、视觉风格、功能特点
3. 严格按照上述"选择指南"中的优先级进行匹配
4. 优先考虑风格、内容和功能的匹配，结构或样式的差异可以忽略
5. 请尽最大可能从中选出一个最合适的模板ID

请根据选择指南输出最匹配的模板ID。`
}

export async function recognizeTemplateIntent(
    request: IntentRecognitionRequest,
    callbacks?: IntentRecognitionCallbacks
): Promise<string | null> {
    const config = getConfig()

    if (!config.apiKey) {
        callbacks?.onError?.('未配置 API Key')
        return null
    }

    const prompt = buildIntentRecognitionPrompt(request)

    let response: Response
    try {
        response = await fetch(`${config.apiUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                model: request.model || config.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 2000,
                stream: true
            })
        })
    } catch (error) {
        let msg: string
        if (error instanceof Error) {
            msg = `网络错误: ${error.message}`
        } else {
            msg = '意图识别请求失败'
        }
        callbacks?.onError?.(msg)
        return null
    }

    if (!response.ok) {
        const errorText = await response.text()
        let errorDetail = errorText
        try {
            const errorJson = JSON.parse(errorText)
            errorDetail = errorJson.error?.message || errorJson.message || errorText
        } catch { }
        const errorMsg = `意图识别 API 错误 (${response.status}): ${errorDetail}`
        callbacks?.onError?.(errorMsg)
        return null
    }

    // 流式处理
    const reader = response.body?.getReader()
    if (!reader) {
        callbacks?.onError?.('无法读取响应流')
        return null
    }

    const decoder = new TextDecoder()
    let fullContent = ''
    let buffer = ''

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6)
                    if (data === '[DONE]') continue

                    try {
                        const parsed = JSON.parse(data)
                        if (parsed.error) {
                            const errorMsg = parsed.error.message || JSON.stringify(parsed.error)
                            callbacks?.onError?.(`意图识别流式响应错误: ${errorMsg}`)
                            return null
                        }
                        const delta = parsed.choices?.[0]?.delta?.content || ''
                        if (delta) {
                            fullContent += delta
                            callbacks?.onStreamContent?.(fullContent)
                        }
                    } catch { }
                }
            }
        }

        callbacks?.onComplete?.()

        // 从响应中提取模板ID
        // 尝试多种格式匹配
        const idPatterns = [
            /TEMPLATE_ID:\s*([^\s`]+)/i,
            /模板ID[：:]\s*([^\s`]+)/i,
            /id[：:]\s*([^\s`]+)/i,
            /(html-[^\s`]+)/i,
            /模板\s*\d+[：:]\s*([^\s`]+)/i
        ]

        for (const pattern of idPatterns) {
            const match = fullContent.match(pattern)
            if (match && match[1]) {
                return match[1].trim()
            }
        }

        // 如果无法提取，尝试查找所有模板ID格式
        const allIds = fullContent.match(/html-[a-zA-Z0-9_-]+/g)
        if (allIds && allIds.length > 0) {
            return allIds[0]
        }

        callbacks?.onError?.('无法从响应中提取模板ID')
        return null
    } catch (error) {
        const msg = error instanceof Error ? error.message : '流式读取失败'
        callbacks?.onError?.(`意图识别读取响应流时出错: ${msg}`)
        return null
    } finally {
        reader.releaseLock()
    }
}

/**
 * 修复 HTML 排版问题
 */
export interface FixLayoutRequest {
    html: string
    issues: Array<{
        type: string
        severity: string
        element: string
        message: string
        details?: string
    }>
    model?: string
}

export interface FixLayoutCallbacks {
    onStreamContent?: (content: string) => void
    onError?: (error: string) => void
    onComplete?: () => void
}

function buildFixPrompt(request: FixLayoutRequest): string {
    const issuesList = request.issues.map((issue, idx) =>
        `${idx + 1}. [${issue.severity.toUpperCase()}] ${issue.message}\n   元素: ${issue.element}${issue.details ? `\n   详情: ${issue.details}` : ''}`
    ).join('\n')

    return `请修复以下 HTML 页面的排版问题。

## 检测到的问题
${issuesList}

## 原始 HTML
\`\`\`html
${request.html}
\`\`\`

## 修复要求
1. 保持原有的设计风格、配色、字体不变
2. 只修改导致排版问题的部分
3. 确保修复后的页面尺寸严格为 1280px × 720px，无滚动条
4. 如果内容过多导致溢出，可以：
   - 适当减小字体大小
   - 减少间距
   - 精简文字内容
   - 调整布局结构
5. 确保所有内容都在可视区域内

## 输出格式
输出修复后的完整 HTML 文档，以 ===SLIDE_START=== 开始，===SLIDE_END=== 结束。
不要添加任何解释，直接输出修复后的 HTML。`
}

export async function fixLayoutIssues(
    request: FixLayoutRequest,
    callbacks?: FixLayoutCallbacks
): Promise<SlideResult | null> {
    const config = getConfig()

    if (!config.apiKey) {
        callbacks?.onError?.('未配置 API Key')
        return null
    }

    const prompt = buildFixPrompt(request)

    let response: Response
    try {
        response = await fetch(`${config.apiUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                model: request.model || config.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 16000,
                stream: true
            })
        })
    } catch (error) {
        let msg: string
        if (error instanceof Error) {
            msg = `网络错误: ${error.message}`
        } else {
            msg = '[修复] 网络请求失败'
        }
        callbacks?.onError?.(msg)
        // 抛出错误，让调用者处理重试
        throw new Error(msg)
    }

    if (!response.ok) {
        const errorText = await response.text()
        let errorDetail = errorText
        try {
            const errorJson = JSON.parse(errorText)
            errorDetail = errorJson.error?.message || errorJson.message || errorText
        } catch { }
        const errorMsg = `[修复] API 错误 (${response.status}): ${errorDetail}`
        callbacks?.onError?.(errorMsg)
        // 如果是网络相关错误（5xx服务器错误），抛出以便重试
        if (response.status >= 500) {
            throw new Error(errorMsg)
        }
        return null
    }

    // 流式处理
    const reader = response.body?.getReader()
    if (!reader) {
        callbacks?.onError?.('无法读取响应流')
        return null
    }

    const decoder = new TextDecoder()
    let fullContent = ''
    let buffer = ''

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6)
                    if (data === '[DONE]') continue

                    try {
                        const parsed = JSON.parse(data)
                        // 检查是否有错误
                        if (parsed.error) {
                            const errorMsg = parsed.error.message || JSON.stringify(parsed.error)
                            callbacks?.onError?.(`[修复] 流式响应错误: ${errorMsg}`)
                            return null
                        }
                        const delta = parsed.choices?.[0]?.delta?.content || ''
                        if (delta) {
                            fullContent += delta
                            callbacks?.onStreamContent?.(fullContent)
                        }
                    } catch { }
                }
            }
        }

        callbacks?.onComplete?.()

        // 解析修复后的 HTML
        const slides = parseSlides(fullContent, 0)
        return slides[0] || null
    } catch (error) {
        const msg = error instanceof Error ? error.message : '流式读取失败'
        callbacks?.onError?.(`[修复] 读取响应流时出错: ${msg}`)
        // 如果是网络相关错误，抛出以便重试
        if (error instanceof Error && (
            msg.includes('网络') ||
            msg.includes('network') ||
            msg.includes('fetch') ||
            msg.includes('timeout') ||
            msg.includes('超时')
        )) {
            throw error
        }
        return null
    } finally {
        reader.releaseLock()
    }
}
