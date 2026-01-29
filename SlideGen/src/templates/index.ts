export interface BuiltInTemplate {
  id: string
  name: string
  type: 'html' | 'pic' | 'pptx'
  path: string
}

// 动态获取 HTML 模板列表
export async function getHtmlTemplates(): Promise<BuiltInTemplate[]> {
  const templates: BuiltInTemplate[] = []

  try {
    // 使用 Vite 的 import.meta.glob 获取所有 html 文件
    const htmlFiles = import.meta.glob('/public/template/html/*.html', { as: 'url', eager: true })

    for (const [path, url] of Object.entries(htmlFiles)) {
      const filename = path.split('/').pop()?.replace('.html', '') || ''
      templates.push({
        id: `html-${filename}`,
        name: `html - ${filename}`,
        type: 'html',
        path: url as string
      })
    }
  } catch (error) {
    console.warn('Failed to load HTML templates:', error)
  }

  return templates
}

// 动态获取图片模板列表
export async function getPicTemplates(): Promise<BuiltInTemplate[]> {
  const templates: BuiltInTemplate[] = []

  try {
    // 使用 Vite 的 import.meta.glob 获取所有图片文件
    const picFiles = import.meta.glob('/public/template/pic/*.{png,jpg,jpeg,webp,gif}', { as: 'url', eager: true })

    for (const [path, url] of Object.entries(picFiles)) {
      const filename = path.split('/').pop()?.replace(/\.(png|jpg|jpeg|webp|gif)$/i, '') || ''
      templates.push({
        id: `pic-${filename}`,
        name: `pic - ${filename}`,
        type: 'pic',
        path: url as string
      })
    }
  } catch (error) {
    console.warn('Failed to load pic templates:', error)
  }

  return templates
}

// 动态获取 PPTX 模板列表
export async function getPptxTemplates(): Promise<BuiltInTemplate[]> {
  const templates: BuiltInTemplate[] = []

  try {
    // 使用 Vite 的 import.meta.glob 获取所有 pptx 文件
    const pptxFiles = import.meta.glob('/public/template/pptx/*.{pptx,ppt}', { as: 'url', eager: true })

    for (const [path, url] of Object.entries(pptxFiles)) {
      const filename = path.split('/').pop()?.replace(/\.(pptx|ppt)$/i, '') || ''
      templates.push({
        id: `pptx-${filename}`,
        name: `pptx - ${filename}`,
        type: 'pptx',
        path: url as string
      })
    }
  } catch (error) {
    console.warn('Failed to load PPTX templates:', error)
  }

  return templates
}

// 获取所有模板
export async function getAllTemplates(): Promise<BuiltInTemplate[]> {
  const [htmlTemplates, picTemplates, pptxTemplates] = await Promise.all([
    getHtmlTemplates(),
    getPicTemplates(),
    getPptxTemplates()
  ])
  return [...htmlTemplates, ...picTemplates, ...pptxTemplates]
}

// 根据 ID 获取模板
export async function getTemplateById(id: string): Promise<BuiltInTemplate | undefined> {
  const templates = await getAllTemplates()
  return templates.find(t => t.id === id)
}

// 加载 HTML 模板内容
export async function loadHtmlTemplateContent(template: BuiltInTemplate): Promise<string> {
  if (template.type !== 'html') {
    throw new Error('Not an HTML template')
  }

  const response = await fetch(template.path)
  if (!response.ok) {
    throw new Error(`Failed to load template: ${response.status}`)
  }
  return await response.text()
}

// 加载图片模板为 base64
export async function loadPicTemplateBase64(template: BuiltInTemplate): Promise<string> {
  if (template.type !== 'pic') {
    throw new Error('Not a pic template')
  }

  const response = await fetch(template.path)
  if (!response.ok) {
    throw new Error(`Failed to load template: ${response.status}`)
  }
  const blob = await response.blob()

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// 加载 PPTX 模板并转换为 HTML
export async function loadPptxTemplateAsHtml(template: BuiltInTemplate): Promise<string> {
  if (template.type !== 'pptx') {
    throw new Error('Not a PPTX template')
  }

  const response = await fetch(template.path)
  if (!response.ok) {
    throw new Error(`Failed to load template: ${response.status}`)
  }
  const blob = await response.blob()

  // 将 pptx 转换为 HTML
  return await convertPptxToHtml(blob)
}

/**
 * 将 PPTX 文件转换为 HTML
 * TODO: 实现核心转换逻辑
 * @param pptxBlob PPTX 文件的 Blob 对象
 * @returns 转换后的 HTML 字符串
 */
async function convertPptxToHtml(_pptxBlob: Blob): Promise<string> {
  // TODO: 实现 PPTX 到 HTML 的转换
  // 可以使用 pptxgenjs、officegen 或其他库
  // 或者调用后端服务进行转换

  throw new Error('PPTX to HTML conversion not implemented yet')
}
