import { getHtmlTemplates, loadHtmlTemplateContent } from '../templates'

export interface TemplateInfo {
  id: string
  name: string
  label: string // 模板标签（如：数据图表、时间线、商务报告等）
  content: string
  features: {
    backgroundColor?: string
    fontFamily?: string
    colorScheme?: string // 配色方案描述
    layoutType?: string // 布局类型：单栏、双栏、网格等
    hasChart?: boolean // 是否包含图表
    hasTimeline?: boolean // 是否包含时间线
    hasIcon?: boolean // 是否使用图标
    mainElements?: string[] // 主要元素列表
  }
}

/**
 * 分析HTML模板的特征
 */
function analyzeTemplate(html: string, name: string): TemplateInfo['features'] {
  const features: TemplateInfo['features'] = {
    mainElements: []
  }

  // 提取背景色
  const bgMatch = html.match(/background(?:-color)?\s*:\s*([^;]+)/i)
  if (bgMatch) {
    features.backgroundColor = bgMatch[1].trim()
  }

  // 提取字体
  const fontMatch = html.match(/font-family\s*:\s*([^;]+)/i)
  if (fontMatch) {
    features.fontFamily = fontMatch[1].trim()
  }

  // 检测配色方案（通过颜色值判断）
  const colorMatches = html.match(/#[0-9a-fA-F]{3,6}/g)
  if (colorMatches) {
    const colors = [...new Set(colorMatches)]
    if (colors.some(c => ['#1a202c', '#2d3748', '#1e293b'].includes(c.toLowerCase()))) {
      features.colorScheme = '深色系'
    } else if (colors.some(c => ['#f0f2f5', '#ffffff', '#f8f9fa'].includes(c.toLowerCase()))) {
      features.colorScheme = '浅色系'
    } else {
      features.colorScheme = '彩色系'
    }
  }

  // 检测布局类型
  if (html.includes('display: flex') || html.includes('display:grid')) {
    if (html.includes('flex-direction: column')) {
      features.layoutType = '垂直布局'
    } else if (html.includes('flex-direction: row')) {
      features.layoutType = '水平布局'
    } else if (html.includes('grid-template-columns')) {
      features.layoutType = '网格布局'
    }
  }

  // 检测是否包含图表
  features.hasChart = html.includes('echarts') || html.includes('chart') || html.includes('ECharts')

  // 检测是否包含时间线
  features.hasTimeline = html.includes('timeline') || html.includes('时间线') || name.toLowerCase().includes('timeline')

  // 检测是否使用图标
  features.hasIcon = html.includes('font-awesome') || html.includes('fa-') || html.includes('icon')

  // 提取主要元素
  if (html.includes('<h1') || html.includes('<h2')) features.mainElements!.push('标题')
  if (html.includes('<p') || html.includes('<span')) features.mainElements!.push('文本')
  if (html.includes('<img')) features.mainElements!.push('图片')
  if (html.includes('<div') && html.includes('chart')) features.mainElements!.push('图表')
  if (html.includes('table')) features.mainElements!.push('表格')
  if (html.includes('list') || html.includes('<ul') || html.includes('<ol')) features.mainElements!.push('列表')

  return features
}

/**
 * 根据模板内容和特征生成标签
 */
function generateLabel(name: string, features: TemplateInfo['features']): string {
  const nameLower = name.toLowerCase()
  
  // 基于文件名
  if (nameLower.includes('timeline')) return '时间线'
  if (nameLower.includes('chart') || nameLower.includes('graph')) return '数据图表'
  if (nameLower.includes('complex')) return '复杂布局'
  if (nameLower.includes('report')) return '报告'
  if (nameLower.includes('presentation')) return '演示文稿'
  
  // 基于特征
  if (features.hasTimeline) return '时间线'
  if (features.hasChart) return '数据图表'
  if (features.layoutType === '网格布局') return '网格布局'
  if (features.colorScheme === '深色系') return '深色主题'
  
  return '通用模板'
}

/**
 * 加载并分析所有HTML模板
 */
export async function loadAndAnalyzeTemplates(): Promise<TemplateInfo[]> {
  const templates = await getHtmlTemplates()
  const templateInfos: TemplateInfo[] = []

  for (const template of templates) {
    try {
      const content = await loadHtmlTemplateContent(template)
      const features = analyzeTemplate(content, template.name)
      const label = generateLabel(template.name, features)

      templateInfos.push({
        id: template.id,
        name: template.name,
        label,
        content,
        features
      })
    } catch (error) {
      console.warn(`Failed to load template ${template.id}:`, error)
    }
  }

  return templateInfos
}

/**
 * 生成模板索引文档（用于发送给模型）
 */
export function generateTemplateIndex(templates: TemplateInfo[]): string {
  let indexDoc = `# HTML模板索引

以下是所有可用的HTML模板及其特征信息。请根据用户输入的主题，选择最匹配的模板。

## 模板列表

`

  templates.forEach((template, idx) => {
    const { id, name, label, features } = template
    indexDoc += `### 模板 ${idx + 1}: ${name} (ID: ${id})

**标签**: ${label}

**特征**:
- 配色方案: ${features.colorScheme || '未指定'}
- 布局类型: ${features.layoutType || '未指定'}
- 背景色: ${features.backgroundColor || '未指定'}
- 字体: ${features.fontFamily || '未指定'}
- 包含图表: ${features.hasChart ? '是' : '否'}
- 包含时间线: ${features.hasTimeline ? '是' : '否'}
- 使用图标: ${features.hasIcon ? '是' : '否'}
- 主要元素: ${features.mainElements?.join('、') || '未指定'}

**完整HTML内容**:
\`\`\`html
${template.content}
\`\`\`

---

`
  })

  indexDoc += `
## 选择指南

请根据以下优先级选择模板：

1. **标签匹配**（权重最高）：优先选择标签与用户主题最相关的模板
2. **内容匹配**：仔细查看模板的完整HTML内容，分析其内容主题、文字类型、信息结构，选择与用户主题最接近的模板
3. **风格匹配**：根据配色方案、视觉风格、整体氛围等特征选择
4. **功能匹配**：如果用户需要图表，选择包含图表的模板；如果需要时间线，选择包含时间线的模板；如果需要特定功能，选择具备该功能的模板
5. **结构样式次要**：若模板之间仅仅是HTML结构或CSS样式不同，但风格、内容和功能匹配，优先选择风格、内容和功能匹配的模板。结构可以调整，样式可以修改，但风格、内容和功能的匹配更重要。

**重要提示**：
- 每个模板都提供了完整的HTML代码，请仔细分析HTML结构、CSS样式、JavaScript逻辑等
- 优先考虑风格、内容和功能的匹配，结构或样式的差异可以通过调整来解决
- 如果无法确定，请选择最通用的模板

## 输出格式

请只输出匹配的模板ID，格式如下：
\`\`\`
TEMPLATE_ID: {模板ID} 例如： ${templates[0]?.id}
\`\`\`
`

  return indexDoc
}

