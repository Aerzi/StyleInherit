/**
 * 上下文文件解析服务
 * 支持 txt、docx、pptx 文件，表格转换为 markdown 格式
 */
import JSZip from 'jszip'

export interface ParsedContext {
    content: string
    filename: string
    type: 'txt' | 'docx' | 'pptx'
}

// pptx 单页内容
export interface PptxSlide {
    pageNum: number
    content: string
}

/**
 * 解析上下文文件
 */
export async function parseContextFile(file: File): Promise<ParsedContext> {
    const ext = file.name.split('.').pop()?.toLowerCase()

    switch (ext) {
        case 'txt':
            return parseTxtFile(file)
        case 'docx':
            return parseDocxFile(file)
        case 'pptx':
        case 'ppt':
            return parsePptxFile(file)
        default:
            throw new Error(`不支持的文件类型: ${ext}`)
    }
}

/**
 * 解析 pptx 文件，返回每页的内容数组（用于页面选择）
 */
export async function parsePptxSlides(file: File): Promise<PptxSlide[]> {
    const zip = new JSZip()
    const zipContent = await zip.loadAsync(file)

    const slides: PptxSlide[] = []

    // 获取所有幻灯片文件
    const slideFiles = Object.keys(zipContent.files)
        .filter(name => name.match(/ppt\/slides\/slide\d+\.xml$/))
        .sort((a, b) => {
            const numA = parseInt(a.match(/slide(\d+)\.xml$/)?.[1] || '0')
            const numB = parseInt(b.match(/slide(\d+)\.xml$/)?.[1] || '0')
            return numA - numB
        })

    for (const slidePath of slideFiles) {
        const slideXml = await zipContent.file(slidePath)?.async('string')
        if (slideXml) {
            const pageNum = parseInt(slidePath.match(/slide(\d+)\.xml$/)?.[1] || '0')
            const content = parsePptxSlideXml(slideXml)
            slides.push({ pageNum, content: content.trim() })
        }
    }

    return slides
}

/**
 * 解析 txt 文件
 */
async function parseTxtFile(file: File): Promise<ParsedContext> {
    const buffer = await file.arrayBuffer()
    const content = decodeTextWithEncoding(new Uint8Array(buffer))
    return {
        content,
        filename: file.name,
        type: 'txt'
    }
}

/**
 * 自动检测编码并解码文本
 */
function decodeTextWithEncoding(bytes: Uint8Array): string {
    // 1. 检查BOM（Byte Order Mark）
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        // UTF-8 BOM
        return new TextDecoder('utf-8').decode(bytes.slice(3))
    }
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
        // UTF-16 LE BOM
        return new TextDecoder('utf-16le').decode(bytes.slice(2))
    }
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
        // UTF-16 BE BOM
        return new TextDecoder('utf-16be').decode(bytes.slice(2))
    }

    // 2. 尝试UTF-8解码
    try {
        const utf8Text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        // 检查是否包含大量乱码特征（替换字符）
        if (!utf8Text.includes('\uFFFD')) {
            return utf8Text
        }
    } catch {
        // UTF-8解码失败，尝试其他编码
    }

    // 3. 尝试GBK编码（常见中文编码）
    try {
        return new TextDecoder('gbk').decode(bytes)
    } catch {
        // GBK不支持，回退到UTF-8
    }

    // 4. 最后回退到UTF-8（允许替换字符）
    return new TextDecoder('utf-8').decode(bytes)
}

/**
 * 解析 docx 文件
 * docx 本质上是一个 ZIP 包，包含 XML 文件
 */
async function parseDocxFile(file: File): Promise<ParsedContext> {
    const zip = new JSZip()
    const zipContent = await zip.loadAsync(file)

    // 读取主文档内容
    const documentXml = await zipContent.file('word/document.xml')?.async('string')
    if (!documentXml) {
        throw new Error('无法读取 docx 文件内容')
    }

    // 解析 XML 提取文本和表格
    const content = parseDocxXml(documentXml)

    return {
        content,
        filename: file.name,
        type: 'docx'
    }
}

/**
 * 解析 pptx 文件
 */
async function parsePptxFile(file: File): Promise<ParsedContext> {
    const zip = new JSZip()
    const zipContent = await zip.loadAsync(file)

    const contents: string[] = []

    // 获取所有幻灯片文件
    const slideFiles = Object.keys(zipContent.files)
        .filter(name => name.match(/ppt\/slides\/slide\d+\.xml$/))
        .sort((a, b) => {
            const numA = parseInt(a.match(/slide(\d+)\.xml$/)?.[1] || '0')
            const numB = parseInt(b.match(/slide(\d+)\.xml$/)?.[1] || '0')
            return numA - numB
        })

    for (const slidePath of slideFiles) {
        const slideXml = await zipContent.file(slidePath)?.async('string')
        if (slideXml) {
            const slideNum = slidePath.match(/slide(\d+)\.xml$/)?.[1] || '?'
            const slideContent = parsePptxSlideXml(slideXml)
            if (slideContent.trim()) {
                contents.push(`## 第 ${slideNum} 页\n${slideContent}`)
            }
        }
    }

    return {
        content: contents.join('\n\n'),
        filename: file.name,
        type: 'pptx'
    }
}

/**
 * 解析 docx XML 内容
 */
function parseDocxXml(xml: string): string {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'text/xml')

    const result: string[] = []
    const body = doc.getElementsByTagName('w:body')[0]
    if (!body) return ''

    // 遍历所有子元素
    for (const child of Array.from(body.children)) {
        if (child.tagName === 'w:p') {
            // 段落
            const text = extractTextFromParagraph(child)
            if (text.trim()) {
                result.push(text)
            }
        } else if (child.tagName === 'w:tbl') {
            // 表格 - 转换为 markdown
            const table = parseDocxTable(child)
            if (table) {
                result.push(table)
            }
        }
    }

    return result.join('\n\n')
}

/**
 * 从段落元素提取文本
 */
function extractTextFromParagraph(paragraph: Element): string {
    const texts: string[] = []
    const runs = paragraph.getElementsByTagName('w:r')

    for (const run of Array.from(runs)) {
        const textNodes = run.getElementsByTagName('w:t')
        for (const textNode of Array.from(textNodes)) {
            texts.push(textNode.textContent || '')
        }
    }

    return texts.join('')
}

/**
 * 解析 docx 表格并转换为 markdown
 */
function parseDocxTable(tableElement: Element): string {
    const rows: string[][] = []
    const tableRows = tableElement.getElementsByTagName('w:tr')

    for (const tr of Array.from(tableRows)) {
        const cells: string[] = []
        const tableCells = tr.getElementsByTagName('w:tc')

        for (const tc of Array.from(tableCells)) {
            const paragraphs = tc.getElementsByTagName('w:p')
            const cellTexts: string[] = []

            for (const p of Array.from(paragraphs)) {
                const text = extractTextFromParagraph(p)
                if (text.trim()) {
                    cellTexts.push(text.trim())
                }
            }

            cells.push(cellTexts.join(' '))
        }

        if (cells.length > 0) {
            rows.push(cells)
        }
    }

    return convertToMarkdownTable(rows)
}

/**
 * 检查元素是否在表格内
 */
function isInsideTable(element: Element): boolean {
    let parent = element.parentElement
    while (parent) {
        if (parent.tagName === 'a:tbl') {
            return true
        }
        parent = parent.parentElement
    }
    return false
}

/**
 * 解析 pptx 幻灯片 XML
 */
function parsePptxSlideXml(xml: string): string {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'text/xml')

    const result: string[] = []

    // 提取所有文本内容（排除表格内的文本）
    const textElements = doc.getElementsByTagName('a:t')
    for (const textEl of Array.from(textElements)) {
        // 跳过表格内的文本，表格会单独处理为markdown格式
        if (isInsideTable(textEl)) {
            continue
        }
        const text = textEl.textContent?.trim()
        if (text) {
            result.push(text)
        }
    }

    // 查找表格，转换为markdown格式
    const tables = doc.getElementsByTagName('a:tbl')
    for (const table of Array.from(tables)) {
        const mdTable = parsePptxTable(table)
        if (mdTable) {
            result.push(mdTable)
        }
    }

    return result.join('\n')
}

/**
 * 解析 pptx 表格并转换为 markdown
 */
function parsePptxTable(tableElement: Element): string {
    const rows: string[][] = []
    const tableRows = tableElement.getElementsByTagName('a:tr')

    for (const tr of Array.from(tableRows)) {
        const cells: string[] = []
        const tableCells = tr.getElementsByTagName('a:tc')

        for (const tc of Array.from(tableCells)) {
            const textElements = tc.getElementsByTagName('a:t')
            const cellTexts: string[] = []

            for (const t of Array.from(textElements)) {
                const text = t.textContent?.trim()
                if (text) {
                    cellTexts.push(text)
                }
            }

            cells.push(cellTexts.join(' '))
        }

        if (cells.length > 0) {
            rows.push(cells)
        }
    }

    return convertToMarkdownTable(rows)
}

/**
 * 将二维数组转换为 markdown 表格
 */
function convertToMarkdownTable(rows: string[][]): string {
    if (rows.length === 0) return ''

    // 确定最大列数
    const maxCols = Math.max(...rows.map(r => r.length))

    // 标准化每行的列数
    const normalizedRows = rows.map(row => {
        const normalized = [...row]
        while (normalized.length < maxCols) {
            normalized.push('')
        }
        return normalized
    })

    // 生成表头
    const header = normalizedRows[0]
    const headerRow = '| ' + header.map(cell => cell || ' ').join(' | ') + ' |'

    // 生成分隔行
    const separatorRow = '| ' + header.map(() => '---').join(' | ') + ' |'

    // 生成数据行
    const dataRows = normalizedRows.slice(1).map(row => {
        return '| ' + row.map(cell => cell || ' ').join(' | ') + ' |'
    })

    return [headerRow, separatorRow, ...dataRows].join('\n')
}

