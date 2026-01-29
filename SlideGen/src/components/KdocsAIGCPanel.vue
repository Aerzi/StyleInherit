<script setup lang="ts">
import { ref, watch } from 'vue'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import html2canvas from 'html2canvas'
import {
  callKdocsAIGCFull,
} from '../services/kdocsService'
import { useStorageRef } from '../utils/local-storages'
import { checkLayoutInIframe } from '../utils/layout-checker'

// ========== 单次调用模式 ==========
const abilityId = useStorageRef('kdocs-ability-id', 'wpp_generate_ppt_language_type')
const userInput = ref('{}') // JSON 字符串输入
const isLoading = ref(false)
const result = ref('')
const error = ref('')
const resultTextareaRef = ref<HTMLTextAreaElement | null>(null)

// 调用能力
async function handleCall() {
  if (!abilityId.value.trim() || !userInput.value.trim()) {
    alert('请填写能力ID和输入内容')
    return
  }

  // 解析 JSON 对象
  let userInputObj: Record<string, any>
  try {
    userInputObj = JSON.parse(userInput.value.trim())
  } catch (e) {
    alert('输入内容必须是有效的 JSON 格式')
    return
  }

  isLoading.value = true
  error.value = ''
  result.value = ''

  try {
    const fullContent = await callKdocsAIGCFull(
      abilityId.value.trim(),
      userInputObj,
      undefined,
      {
        onStreamChunk(chunk) {
          result.value += chunk
          if (resultTextareaRef.value) {
            resultTextareaRef.value.scrollTop = resultTextareaRef.value.scrollHeight
          }
        },
        onStreamComplete(fullContent) {
          result.value = fullContent
        },
        onError(err) {
          error.value = err
        }
      }
    )
    result.value = fullContent
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    isLoading.value = false
  }
}

// 清空
function handleClear() {
  userInput.value = '{}'
  result.value = ''
  error.value = ''
}

// 复制结果
function copyResult() {
  if (result.value) {
    navigator.clipboard.writeText(result.value).then(() => {
      alert('已复制到剪贴板')
    })
  }
}

// 复制日志
function copyLogs() {
  if (logs.value.length > 0) {
    navigator.clipboard.writeText(logs.value.join('\n')).then(() => {
      alert('日志已复制到剪贴板')
    })
  }
}

// ========== 自动化测试模式 ==========
const testMode = ref<'single' | 'batch'>('single')
const excelFile = ref<File | null>(null)
const workbook = ref<XLSX.WorkBook | null>(null)
const exceljsWorkbook = ref<ExcelJS.Workbook | null>(null)
const htmlTemplateFile = ref<File | null>(null)
const htmlTemplateContent = ref('')

// 能力选择
const selectedAbility = ref<'ability1' | 'ability2' | 'ability3' | 'ability4'>('ability1')

// 能力ID映射
const abilityIdMap: Record<string, string> = {
  ability1: 'wpp_create_html_without_template_glmtest',
  ability2: 'wpp_create_html_with_template_glmtest',
  ability3: 'wpp_choose_template_by_userInput_glmtest',
  ability4: 'wpp_choose_template_by_userInput_glmtest' // 第一阶段使用能力3
}

// 监听能力选择变化，自动更新能力ID
watch(selectedAbility, (newAbility: 'ability1' | 'ability2' | 'ability3' | 'ability4') => {
  if (abilityIdMap[newAbility]) {
    abilityId.value = abilityIdMap[newAbility]
  }
})

// 模板文件夹（使用文件列表模拟）
const templateFiles = ref<Map<number, File>>(new Map()) // key: template_id, value: File

// 参数配置
const width = ref('1280')
const height = ref('720')
const htmlList = ref('[]')
const number = ref('3')

// 处理状态
const isProcessing = ref(false)
const shouldStop = ref(false)
const progress = ref({ current: 0, total: 0, currentPrompt: '' })
const logs = ref<string[]>([])
const logTextareaRef = ref<HTMLTextAreaElement | null>(null)

const MAX_RETRIES = 3
const TIMEOUT_MS = 240000 // 4分钟超时
const DELAY_BETWEEN_TESTS = 2000

// 添加日志
function addLog(message: string) {
  const timestamp = new Date().toLocaleTimeString()
  logs.value.push(`[${timestamp}] ${message}`)
  setTimeout(() => {
    if (logTextareaRef.value) {
      logTextareaRef.value.scrollTop = logTextareaRef.value.scrollHeight
    }
  }, 100)
}

// 读取Excel文件
async function handleExcelFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  excelFile.value = file
  const reader = new FileReader()

  reader.onload = async (e) => {
    const data = e.target?.result
    if (data) {
      workbook.value = XLSX.read(data, { type: 'binary' })
      const buffer = await file.arrayBuffer()
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer)
      exceljsWorkbook.value = wb
      addLog(`已加载Excel文件: ${file.name}`)
    }
  }

  reader.readAsBinaryString(file)
}

// 读取HTML模板文件
async function handleHtmlFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  htmlTemplateFile.value = file
  const text = await file.text()
  htmlTemplateContent.value = text
  addLog(`已加载HTML模板文件: ${file.name} (${text.length} 字符)`)
}

// 处理模板文件夹选择（使用webkitdirectory）
async function handleTemplateFolderSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return

  templateFiles.value.clear()
  
  // 解析文件名，提取ID
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const match = file.name.match(/^(\d+)\.html$/i)
    if (match) {
      const id = Number(match[1])
      templateFiles.value.set(id, file)
    }
  }
  
  addLog(`已加载模板文件夹，找到 ${templateFiles.value.size} 个模板文件`)
}

// 根据template_id加载模板内容
async function loadTemplateById(templateId: number): Promise<string> {
  const file = templateFiles.value.get(templateId)
  if (!file) {
    throw new Error(`未找到模板文件: ${templateId}.html`)
  }
  return await file.text()
}

// 根据选择的能力和参数，构建输入对象（使用单次调用模式的格式）
function buildBatchInput(information: string): Record<string, any> {
  if (selectedAbility.value === 'ability1') {
    // 能力1: wpp_create_html_without_template_glmtest
    return {
      information,
      width: width.value,
      height: height.value
    }
  } else if (selectedAbility.value === 'ability2') {
    // 能力2: wpp_create_html_with_template_glmtest
    return {
      information,
      htmlTemplate: htmlTemplateContent.value,
      width: width.value,
      height: height.value
    }
  } else if (selectedAbility.value === 'ability3') {
    // 能力3: wpp_choose_template_by_userInput_glmtest
    let htmlListObj: any
    try {
      htmlListObj = JSON.parse(htmlList.value)
    } catch (e) {
      throw new Error('HTML列表JSON格式错误')
    }
    return {
      information,
      htmlList: JSON.stringify(htmlListObj),
      number: number.value
    }
  } else if (selectedAbility.value === 'ability4') {
    // 能力4第一阶段：使用能力3的输入格式
    let htmlListObj: any
    try {
      htmlListObj = JSON.parse(htmlList.value)
    } catch (e) {
      throw new Error('HTML列表JSON格式错误')
    }
    return {
      information,
      htmlList: JSON.stringify(htmlListObj),
      number: '1' // 只选择一个模板
    }
  }
  return { information }
}

// 根据选择的能力，获取对应的能力ID（使用单次调用模式中的能力ID）
function getBatchAbilityId(): string {
  // 使用单次调用模式中的能力ID
  return abilityId.value.trim()
}

// 查找"输入语料"列
function findInputColumn(sheet: XLSX.WorkSheet): number | null {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
  for (let col = 0; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
    const cell = sheet[cellAddress]
    if (cell && cell.v === '输入语料') {
      return col
    }
  }
  return null
}

// 获取所有输入语料内容
function getInputPrompts(sheet: XLSX.WorkSheet, colIndex: number): string[] {
  const prompts: string[] = []
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
  
  for (let row = 1; row <= range.e.r; row++) {
    const cellAddress = XLSX.utils.encode_cell({ r: row, c: colIndex })
    const cell = sheet[cellAddress]
    if (cell && cell.v && typeof cell.v === 'string' && cell.v.trim()) {
      prompts.push(cell.v.trim())
    }
  }
  
  return prompts
}

// 带超时的Promise包装器
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ])
}

// HTML转PNG
async function htmlToPng(html: string, widthPx: number = 1280, heightPx: number = 720): Promise<string> {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = `position:absolute;left:-9999px;width:${widthPx}px;height:${heightPx}px;border:none;`
  iframe.sandbox.add('allow-same-origin', 'allow-scripts')
  document.body.appendChild(iframe)

  try {
    const doc = iframe.contentDocument
    if (!doc) throw new Error('无法创建iframe文档')

    doc.open()
    doc.write(html)
    doc.close()

    await new Promise((resolve) => setTimeout(resolve, 2000))

    const canvasPromise = html2canvas(iframe.contentDocument!.body, {
      width: widthPx,
      height: heightPx,
      scale: 1,
      useCORS: true,
      logging: false,
      timeout: 60000,
    } as any)

    const canvas = (await withTimeout(
      canvasPromise,
      TIMEOUT_MS,
      'HTML转PNG超时'
    )) as HTMLCanvasElement

    return canvas.toDataURL('image/png')
  } finally {
    document.body.removeChild(iframe)
  }
}

// 检测爆版（仅针对KPP批量测试：只检测元素超出规定大小）
async function checkLayoutErrors(html: string, widthPx: number = 1280, heightPx: number = 720): Promise<{ passed: boolean; reason: string }> {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = `position:absolute;left:-9999px;width:${widthPx}px;height:${heightPx}px;border:none;`
  iframe.sandbox.add('allow-same-origin', 'allow-scripts')
  document.body.appendChild(iframe)

  try {
    const doc = iframe.contentDocument
    if (!doc) return { passed: false, reason: '无法访问iframe内容' }
    doc.open()
    doc.write(html)
    doc.close()

    await new Promise((resolve) => setTimeout(resolve, 500))
    const checkResult = checkLayoutInIframe(iframe)
    
    // 只检测元素超出边界、页面整体尺寸超出和滚动条，忽略重叠、内容溢出等
    const relevantIssues = checkResult.issues.filter(issue => {
      // 保留：元素超出边界（hidden-content）、页面整体尺寸超出（overflow，但只针对body的）、滚动条（scrollbar）
      if (issue.type === 'hidden-content') {
        return true // 元素超出边界
      }
      if (issue.type === 'overflow' && issue.element === '<body>') {
        return true // 页面整体尺寸超出
      }
      if (issue.type === 'scrollbar' && issue.element === '<body>') {
        return true // 页面滚动条
      }
      return false // 忽略其他所有问题（重叠、内容溢出等）
    })
    
    const errorIssues = relevantIssues.filter(i => i.severity === 'error')
    let reason = '否'
    if (errorIssues.length > 0) {
      const issueTypes = new Set<string>()
      errorIssues.forEach(issue => {
        if (issue.type === 'hidden-content') {
          issueTypes.add('元素超出边界')
        } else if (issue.type === 'overflow') {
          if (issue.message.includes('高度')) {
            issueTypes.add('页面高度超出')
          } else if (issue.message.includes('宽度')) {
            issueTypes.add('页面宽度超出')
          } else {
            issueTypes.add('页面尺寸超出')
          }
        } else if (issue.type === 'scrollbar') {
          if (issue.message.includes('垂直')) {
            issueTypes.add('垂直滚动条')
          }
          if (issue.message.includes('水平')) {
            issueTypes.add('水平滚动条')
          }
        }
      })
      reason = Array.from(issueTypes).join('、') || '是'
    }
    
    // 判断是否通过：只有相关错误才算爆版
    const passed = errorIssues.length === 0
    
    return { passed, reason }
  } finally {
    document.body.removeChild(iframe)
  }
}

// 提取HTML内容（从 ===SLIDE_START=== 到 ===SLIDE_END===）
function extractHtmlFromResponse(response: string): string | null {
  const startMarker = '===SLIDE_START==='
  const endMarker = '===SLIDE_END==='
  
  const startIndex = response.indexOf(startMarker)
  const endIndex = response.indexOf(endMarker)
  
  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
    return null
  }
  
  return response.substring(startIndex + startMarker.length, endIndex).trim()
}

// 调用能力并提取HTML
// @ts-ignore - 保留以备后用
async function callAbilityAndExtractHtml(
  ability: string,
  input: Record<string, any>,
  retries: number = MAX_RETRIES
): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await withTimeout(
        callKdocsAIGCFull(ability, input, undefined, {}),
        TIMEOUT_MS,
        '调用能力超时'
      )
      
      const html = extractHtmlFromResponse(response)
      if (html) {
        return html
      }
      
      throw new Error('响应中未找到HTML内容')
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      if (i < retries - 1) {
        addLog(`调用失败 (${i + 1}/${retries})，正在重试... 错误: ${errMsg}`)
        await new Promise((resolve) => setTimeout(resolve, 2000))
      } else {
        throw new Error(`调用失败，已重试${retries}次: ${errMsg}`)
      }
    }
  }
  throw new Error('重试次数用尽')
}

// 将PNG插入Excel
async function insertPngToExcel(row: number, col: number, pngBase64: string): Promise<void> {
  if (!exceljsWorkbook.value) return

  try {
    const worksheet = exceljsWorkbook.value.worksheets[0]
    if (!worksheet) return

    const base64Data = pngBase64.replace(/^data:image\/png;base64,/, '')
    const binaryString = atob(base64Data)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    const imageId = exceljsWorkbook.value.addImage({
      buffer: bytes as any,
      extension: 'png',
    })

    worksheet.getRow(row + 1).height = 120
    worksheet.getColumn(col + 1).width = 20

    worksheet.addImage(imageId, {
      tl: { col: col, row: row },
      ext: { width: 256, height: 144 },
    })

    addLog(`图片已插入到Excel: 行${row + 1}, 列${col + 1}`)
  } catch (error) {
    addLog(`插入图片失败: ${error}`)
    if (workbook.value) {
      const sheet = workbook.value.Sheets[workbook.value.SheetNames[0]]
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
      sheet[cellAddress] = { t: 's', v: '[图片插入失败]' }
    }
  }
}

// 写入文本到Excel
function writeTextToExcel(row: number, col: number, value: string) {
  if (workbook.value) {
    const sheet = workbook.value.Sheets[workbook.value.SheetNames[0]]
    const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
    sheet[cellAddress] = { t: 's', v: value }
  }
  
  if (exceljsWorkbook.value) {
    const worksheet = exceljsWorkbook.value.worksheets[0]
    if (worksheet) {
      const cell = worksheet.getCell(row + 1, col + 1)
      cell.value = value
      if (value.length > 20) {
        worksheet.getColumn(col + 1).width = Math.min(value.length + 2, 50)
      }
    }
  }
}

// 检测JSON有效性（能力3）
function validateJsonResponse(response: string, expectedCount: number): { valid: boolean; reason: string; matchedCount: number } {
  try {
    // 尝试解析为JSON数组
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (Array.isArray(parsed) && parsed.length === expectedCount) {
        // 检查每个元素是否有 template_id
        const allValid = parsed.every((item: any) => item && typeof item.template_id !== 'undefined')
        if (allValid) {
          return { valid: true, reason: '有效', matchedCount: parsed.length }
        }
        return { valid: false, reason: 'JSON格式有效但缺少template_id字段', matchedCount: parsed.length }
      }
      return { valid: false, reason: `JSON数组长度不匹配，期望${expectedCount}，实际${parsed.length}`, matchedCount: parsed.length }
    }
    
    // 尝试正则匹配 template_id
    const regex = /"template_id"\s*:\s*(\d+)/g
    const matches = response.matchAll(regex)
    const matchedIds: number[] = []
    for (const match of matches) {
      matchedIds.push(Number(match[1]))
    }
    
    if (matchedIds.length === expectedCount) {
      return { valid: false, reason: 'JSON无效，但正则匹配到正确数量的template_id', matchedCount: matchedIds.length }
    }
    
    return { valid: false, reason: `JSON无效，正则匹配到${matchedIds.length}个template_id，期望${expectedCount}`, matchedCount: matchedIds.length }
  } catch (e) {
    return { valid: false, reason: `JSON解析失败: ${e instanceof Error ? e.message : String(e)}`, matchedCount: 0 }
  }
}

// 主处理函数
async function processBatch() {
  if (!workbook.value) {
    alert('请先选择Excel文件')
    return
  }

  if (!abilityId.value.trim()) {
    alert('请先填写能力ID（在单次调用模式中）')
    return
  }

  // 验证能力2需要HTML模板
  if (selectedAbility.value === 'ability2' && !htmlTemplateContent.value) {
    alert('能力2需要上传HTML模板文件')
    return
  }

  // 验证能力4需要模板文件夹
  if (selectedAbility.value === 'ability4' && templateFiles.value.size === 0) {
    alert('能力4需要选择模板文件夹')
    return
  }

  const sheetName = workbook.value.SheetNames[0]
  const sheet = workbook.value.Sheets[sheetName]
  const inputCol = findInputColumn(sheet)

  if (inputCol === null) {
    alert('未找到"输入语料"列')
    return
  }

  const prompts = getInputPrompts(sheet, inputCol)
  if (prompts.length === 0) {
    alert('未找到任何输入语料内容')
    return
  }

  isProcessing.value = true
  shouldStop.value = false
  logs.value = []
  progress.value = { current: 0, total: prompts.length, currentPrompt: '' }
  addLog(`开始处理 ${prompts.length} 条输入语料`)
  addLog(`使用能力: ${getBatchAbilityId()}`)
  addLog(`能力类型: ${selectedAbility.value}`)

  try {
    for (let i = 0; i < prompts.length; i++) {
      // 检查是否应该停止（在每次循环开始时检查）
      if (shouldStop.value) {
        addLog(`\n⚠️ 处理已停止，当前已完成 ${i} / ${prompts.length} 条`)
        // stopProcessing 已经导出了，这里不需要再次导出
        return
      }

      const information = prompts[i]
      const row = i + 1 // Excel行索引（0-based，跳过表头）

      progress.value = {
        current: i + 1,
        total: prompts.length,
        currentPrompt: information,
      }

      addLog(`\n========== 处理第 ${row + 1} 行: ${information.substring(0, 30)}... ==========`)

      // 能力4：两阶段处理
      if (selectedAbility.value === 'ability4') {
        // 第一阶段：选择模板
        const selectStartTime = Date.now()
        let selectDuration = 0
        
        try {
          addLog(`[行${row + 1}] 第一阶段：选择模板...`)
          const inputObj = buildBatchInput(information)
          addLog(`[行${row + 1}] 构建输入对象: ${JSON.stringify(inputObj).substring(0, 150)}...`)
          
          const selectResponse = await withTimeout(
            callKdocsAIGCFull(
              'wpp_choose_template_by_userInput_glmtest',
              inputObj,
              undefined,
              {}
            ),
            TIMEOUT_MS,
            '选择模板超时（4分钟）'
          )
          
          selectDuration = Date.now() - selectStartTime
          addLog(`[行${row + 1}] 第一阶段耗时: ${(selectDuration / 1000).toFixed(2)}秒`)
          
          // 解析返回的template_id
          const validation = validateJsonResponse(selectResponse, 1)
          if (!validation.valid) {
            throw new Error(`模板选择失败: ${validation.reason}`)
          }
          
          // 提取template_id
          const jsonMatch = selectResponse.match(/\[[\s\S]*\]/)
          if (!jsonMatch) {
            throw new Error('无法解析模板选择结果')
          }
          
          const parsed = JSON.parse(jsonMatch[0])
          if (!Array.isArray(parsed) || parsed.length === 0 || !parsed[0].template_id) {
            throw new Error('模板选择结果格式错误')
          }
          
          const templateId = Number(parsed[0].template_id)
          addLog(`[行${row + 1}] 选择的模板ID: ${templateId}`)
          
          // 写入第一阶段结果
          writeTextToExcel(row, inputCol + 1, selectResponse)
          writeTextToExcel(row, inputCol + 2, validation.valid ? '有效' : validation.reason)
          writeTextToExcel(row, inputCol + 3, `${(selectDuration / 1000).toFixed(2)}秒`)
          
          // 第二阶段：生成HTML
          const generateStartTime = Date.now()
          let generateDuration = 0
          
          try {
            let generateResponse: string
            
            // 如果 template_id >= 10000，使用无模板自由生成
            if (templateId >= 10000) {
              addLog(`[行${row + 1}] 模板ID >= 10000，使用无模板自由生成...`)
              const generateInputObj = {
                information,
                width: width.value,
                height: height.value
              }
              
              generateResponse = await withTimeout(
                callKdocsAIGCFull(
                  'wpp_create_html_without_template_glmtest',
                  generateInputObj,
                  undefined,
                  {}
                ),
                TIMEOUT_MS,
                '生成HTML超时（4分钟）'
              )
            } else {
              // 否则使用模板生成
              addLog(`[行${row + 1}] 第二阶段：加载模板 ${templateId}.html...`)
              const templateContent = await loadTemplateById(templateId)
              addLog(`[行${row + 1}] 模板加载成功，长度: ${templateContent.length} 字符`)
              
              addLog(`[行${row + 1}] 第二阶段：生成HTML...`)
              const generateInputObj = {
                information,
                htmlTemplate: templateContent,
                width: width.value,
                height: height.value
              }
              
              generateResponse = await withTimeout(
                callKdocsAIGCFull(
                  'wpp_create_html_with_template_glmtest',
                  generateInputObj,
                  undefined,
                  {}
                ),
                TIMEOUT_MS,
                '生成HTML超时（4分钟）'
              )
            }
            
            generateDuration = Date.now() - generateStartTime
            addLog(`[行${row + 1}] 第二阶段耗时: ${(generateDuration / 1000).toFixed(2)}秒`)
            
            const html = extractHtmlFromResponse(generateResponse)
            if (!html) {
              throw new Error('未找到HTML内容')
            }
            
            // 生成PNG、检测爆版
            const widthPx = Number(width.value || 1280)
            const heightPx = Number(height.value || 720)
            
            addLog(`[行${row + 1}] 生成PNG图片...`)
            const png = await htmlToPng(html, widthPx, heightPx)
            await insertPngToExcel(row, inputCol + 4, png)
            
            addLog(`[行${row + 1}] 检测爆版...`)
            const layoutCheck = await checkLayoutErrors(html, widthPx, heightPx)
            writeTextToExcel(row, inputCol + 5, layoutCheck.reason)
            
            writeTextToExcel(row, inputCol + 6, html)
            writeTextToExcel(row, inputCol + 7, `${(generateDuration / 1000).toFixed(2)}秒`)
            
            addLog(`[行${row + 1}] 完成`)
            
          } catch (e) {
            generateDuration = Date.now() - generateStartTime
            const errMsg = e instanceof Error ? e.message : String(e)
            addLog(`[行${row + 1}] 第二阶段失败: ${errMsg}`)
            writeTextToExcel(row, inputCol + 4, `失败: ${errMsg}`)
            writeTextToExcel(row, inputCol + 7, `${(generateDuration / 1000).toFixed(2)}秒`)
          }
          
        } catch (e) {
          selectDuration = Date.now() - selectStartTime
          const errMsg = e instanceof Error ? e.message : String(e)
          addLog(`[行${row + 1}] 第一阶段失败: ${errMsg}`)
          writeTextToExcel(row, inputCol + 1, `失败: ${errMsg}`)
          writeTextToExcel(row, inputCol + 3, `${(selectDuration / 1000).toFixed(2)}秒`)
        }
        
        continue // 跳过后续处理
      }

      // 记录开始时间
      const startTime = Date.now()
      let requestDuration = 0

      try {
        // 根据选择的能力和参数，构建输入对象（使用单次调用模式的格式）
        const inputObj = buildBatchInput(information)
        addLog(`[行${row + 1}] 构建输入对象: ${JSON.stringify(inputObj).substring(0, 150)}...`)

        // 使用单次调用模式中的能力ID来调用，添加超时控制
        const response = await withTimeout(
          callKdocsAIGCFull(
            getBatchAbilityId(),
            inputObj,
            undefined,
            {}
          ),
          TIMEOUT_MS,
          '请求超时（4分钟）'
        )
        
        // 记录请求耗时
        requestDuration = Date.now() - startTime
        addLog(`[行${row + 1}] 请求耗时: ${(requestDuration / 1000).toFixed(2)}秒`)

        // 检查响应是否包含HTML（能力1和2）还是JSON（能力3）
        const html = extractHtmlFromResponse(response)
        
        if (html) {
          // 能力1和2：生成PNG、检测爆版、写入HTML
          const widthPx = Number(width.value || 1280)
          const heightPx = Number(height.value || 720)

          addLog(`[行${row + 1}] 生成PNG图片...`)
          const png = await htmlToPng(html, widthPx, heightPx)
          await insertPngToExcel(row, inputCol + 1, png)

          addLog(`[行${row + 1}] 检测爆版...`)
          const layoutCheck = await checkLayoutErrors(html, widthPx, heightPx)
          writeTextToExcel(row, inputCol + 2, layoutCheck.reason)

          writeTextToExcel(row, inputCol + 3, html)
          
          // 写入耗时（能力1和2：第4列）
          writeTextToExcel(row, inputCol + 4, `${(requestDuration / 1000).toFixed(2)}秒`)
          addLog(`[行${row + 1}] 完成`)
        } else {
          // 能力3：输出JSON，验证有效性
          const expectedCount = Number(number.value || 3)
          const validation = validateJsonResponse(response, expectedCount)
          writeTextToExcel(row, inputCol + 1, response)
          writeTextToExcel(row, inputCol + 2, validation.valid ? '有效' : validation.reason)
          
          // 写入耗时（能力3：第3列）
          writeTextToExcel(row, inputCol + 3, `${(requestDuration / 1000).toFixed(2)}秒`)
          addLog(`[行${row + 1}] JSON有效性: ${validation.valid ? '有效' : validation.reason}`)
        }

      } catch (e) {
        // 记录请求耗时（即使失败也记录）
        requestDuration = Date.now() - startTime
        const errMsg = e instanceof Error ? e.message : String(e)
        addLog(`[行${row + 1}] 失败: ${errMsg}`)
        addLog(`[行${row + 1}] 请求耗时: ${(requestDuration / 1000).toFixed(2)}秒`)
        
        // 根据能力类型写入不同的列
        if (selectedAbility.value === 'ability3') {
          writeTextToExcel(row, inputCol + 1, `失败: ${errMsg}`)
          writeTextToExcel(row, inputCol + 2, '失败')
          writeTextToExcel(row, inputCol + 3, `${(requestDuration / 1000).toFixed(2)}秒`)
        } else {
          writeTextToExcel(row, inputCol + 1, `失败: ${errMsg}`)
          writeTextToExcel(row, inputCol + 4, `${(requestDuration / 1000).toFixed(2)}秒`)
        }
      }

      if (i < prompts.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_TESTS))
      }
    }

    await exportExcel()
    addLog(`\n✅ 处理完成`)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    addLog(`\n❌ 处理失败: ${errMsg}`)
    alert(`处理失败: ${errMsg}`)
  } finally {
    isProcessing.value = false
  }
}

// 导出Excel
async function exportExcel() {
  if (!exceljsWorkbook.value) {
    alert('没有可导出的Excel数据')
    return
  }

  try {
    const resultFilename = excelFile.value
      ? excelFile.value.name.replace(/\.(xlsx|xls)$/i, '_结果.xlsx')
      : '测试结果.xlsx'
    
    const buffer = await exceljsWorkbook.value.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = resultFilename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    addLog(`\n✅ 已导出结果: ${resultFilename}`)
    alert('已导出结果')
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    addLog(`\n❌ 导出失败: ${errMsg}`)
    alert(`导出失败: ${errMsg}`)
  }
}

// 停止处理
async function stopProcessing() {
  if (!isProcessing.value) return
  shouldStop.value = true
  addLog('\n⚠️ 用户请求停止处理，正在导出当前进度...')
  // 立即导出，不等待当前行处理完成
  await exportExcel()
}
</script>

<template>
  <div class="kpp-panel">
    <div class="panel-header">
      <h1>KPP能力</h1>
    </div>

    <!-- 模式切换 -->
    <div class="mode-switch">
      <button
        class="mode-btn"
        :class="{ active: testMode === 'single' }"
        @click="testMode = 'single'"
      >
        单次调用
      </button>
      <button
        class="mode-btn"
        :class="{ active: testMode === 'batch' }"
        @click="testMode = 'batch'"
      >
        批量测试
      </button>
    </div>

    <!-- 单次调用模式 -->
    <template v-if="testMode === 'single'">
      <div class="panel-content">
        <!-- 左侧：输入区域 -->
        <div class="input-section">
          <div class="form-section">
            <label for="ability-id">能力ID</label>
            <input
              id="ability-id"
              v-model="abilityId"
              type="text"
              placeholder="例如：wpp_generate_ppt_language_type"
              :disabled="isLoading"
              class="ability-input"
            />
          </div>

          <div class="form-section">
            <label for="user-input">输入内容（JSON）</label>
            <textarea
              id="user-input"
              v-model="userInput"
              placeholder='{"input": "你的内容"}'
              rows="12"
              :disabled="isLoading"
              class="user-input"
            ></textarea>
          </div>

          <!-- 操作按钮 -->
          <div class="actions">
            <button
              class="call-btn"
              @click="handleCall"
              :disabled="isLoading || !abilityId.trim() || !userInput.trim()"
            >
              <span v-if="isLoading" class="loading-spinner"></span>
              <span v-else>调用</span>
            </button>
            <button
              class="clear-btn"
              @click="handleClear"
              :disabled="isLoading"
            >
              清空
            </button>
          </div>

          <!-- 错误信息 -->
          <div v-if="error" class="error-box">
            <div class="error-header">
              <i class="fa-solid fa-triangle-exclamation"></i>
              <span>错误</span>
            </div>
            <div class="error-content">{{ error }}</div>
          </div>
        </div>

        <!-- 右侧：输出区域 -->
        <div class="output-section">
          <div class="result-header">
            <label>输出结果</label>
            <button v-if="result" class="copy-btn" @click="copyResult">
              <i class="fa-solid fa-copy"></i> 复制
            </button>
          </div>
          <textarea
            ref="resultTextareaRef"
            :value="result"
            readonly
            class="result-output"
            placeholder="结果将在此显示..."
          ></textarea>
        </div>
      </div>
    </template>

    <!-- 批量测试模式 -->
    <template v-else>
      <div class="batch-panel">
        <!-- 左侧：配置区域 -->
        <div class="batch-input-section">
          <div class="form-section">
            <label>能力ID（使用单次调用模式中的能力ID）</label>
            <input
              v-model="abilityId"
              type="text"
              class="ability-input"
              :disabled="isProcessing"
              placeholder="例如：wpp_create_html_without_template_glmtest"
            />
          </div>

          <div class="form-section">
            <label>选择能力类型</label>
            <select v-model="selectedAbility" class="ability-select" :disabled="isProcessing">
              <option value="ability1">能力1: wpp_create_html_without_template_glmtest</option>
              <option value="ability2">能力2: wpp_create_html_with_template_glmtest</option>
              <option value="ability3">能力3: wpp_choose_template_by_userInput_glmtest (模板选择)</option>
              <option value="ability4">能力4: 先选择模板再生成HTML</option>
            </select>
          </div>

          <div class="form-section">
            <label>上传Excel文件（包含"输入语料"列）</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              @change="handleExcelFileSelect"
              :disabled="isProcessing"
              class="file-input"
            />
            <div v-if="excelFile" class="file-info">已选择: {{ excelFile.name }}</div>
          </div>

          <div v-if="selectedAbility === 'ability2'" class="form-section">
            <label>上传HTML模板文件</label>
            <input
              type="file"
              accept=".html,.htm"
              @change="handleHtmlFileSelect"
              :disabled="isProcessing"
              class="file-input"
            />
            <div v-if="htmlTemplateFile" class="file-info">已选择: {{ htmlTemplateFile.name }}</div>
          </div>

          <div v-if="selectedAbility === 'ability4'" class="form-section">
            <label>选择模板文件夹（包含 {id}.html 格式的文件）</label>
            <input
              type="file"
              webkitdirectory
              directory
              multiple
              @change="handleTemplateFolderSelect"
              :disabled="isProcessing"
              class="file-input"
            />
            <div v-if="templateFiles.size > 0" class="file-info">
              已加载 {{ templateFiles.size }} 个模板文件
            </div>
          </div>

          <div v-if="selectedAbility !== 'ability3'" class="form-section">
            <label>宽度 (px)</label>
            <input v-model="width" type="text" class="param-input" :disabled="isProcessing" />
          </div>

          <div v-if="selectedAbility !== 'ability3'" class="form-section">
            <label>高度 (px)</label>
            <input v-model="height" type="text" class="param-input" :disabled="isProcessing" />
          </div>

          <div v-if="selectedAbility === 'ability3' || selectedAbility === 'ability4'" class="form-section">
            <label>模板列表 (JSON数组)</label>
            <textarea
              v-model="htmlList"
              rows="6"
              class="user-input"
              :disabled="isProcessing"
              placeholder='[{"id": 30, "结构特征": "...", ...}]'
            ></textarea>
          </div>

          <div v-if="selectedAbility === 'ability3'" class="form-section">
            <label>匹配数量</label>
            <input v-model="number" type="text" class="param-input" :disabled="isProcessing" />
          </div>

          <div class="actions">
            <button
              class="call-btn"
              @click="processBatch"
              :disabled="isProcessing || !excelFile || !abilityId.trim() || (selectedAbility === 'ability2' && !htmlTemplateContent) || (selectedAbility === 'ability4' && templateFiles.size === 0)"
            >
              <span v-if="isProcessing" class="loading-spinner"></span>
              <span v-else>开始批量测试</span>
            </button>
            <button
              v-if="isProcessing"
              class="stop-btn"
              @click="stopProcessing"
            >
              停止
            </button>
          </div>

          <div v-if="isProcessing" class="progress-info">
            <div>进度: {{ progress.current }} / {{ progress.total }}</div>
            <div v-if="progress.currentPrompt" class="current-prompt">
              当前: {{ progress.currentPrompt.substring(0, 50) }}...
            </div>
          </div>
        </div>

        <!-- 右侧：日志区域 -->
        <div class="batch-output-section">
          <div class="result-header">
            <label>处理日志</label>
            <button v-if="logs.length > 0" class="copy-btn" @click="copyLogs">
              <i class="fa-solid fa-copy"></i> 复制日志
            </button>
          </div>
          <textarea
            ref="logTextareaRef"
            :value="logs.join('\n')"
            readonly
            class="log-output"
            placeholder="处理日志将在此显示..."
          ></textarea>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.kpp-panel {
  padding: 24px;
  width: 100vw;
  max-width: 100vw;
  margin: 0;
  background: var(--panel-bg, #ffffff);
  min-height: 100vh;
  box-sizing: border-box;
  overflow-x: hidden;
}

.panel-header {
  margin-bottom: 24px;
  text-align: center;
}

.panel-header h1 {
  font-size: 2rem;
  font-weight: 700;
  color: var(--accent-color, #667eea);
  margin: 0;
}

.mode-switch {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 24px;
}

.mode-btn {
  padding: 10px 24px;
  background: var(--card-bg, #f7fafc);
  border: 2px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  color: var(--text-secondary, #4a5568);
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn:hover {
  border-color: var(--accent-color, #667eea);
  color: var(--accent-color, #667eea);
}

.mode-btn.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-color: transparent;
}

.panel-content {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 24px;
  align-items: start;
  width: 100%;
  max-width: 100%;
}

.batch-panel {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 24px;
  align-items: start;
  width: 100%;
  max-width: 100%;
}

.input-section,
.batch-input-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.output-section,
.batch-output-section {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.form-section {
  display: flex;
  flex-direction: column;
}

.form-section label {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-secondary, #4a5568);
  margin-bottom: 8px;
}

.user-input {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  font-size: 0.9rem;
  font-family: 'Consolas', 'Monaco', monospace;
  resize: vertical;
  background: var(--input-bg, #ffffff);
  color: var(--text-primary, #2d3748);
}

.user-input:focus {
  outline: none;
  border-color: var(--accent-color, #667eea);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.ability-input,
.param-input {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  font-size: 0.9rem;
  background: var(--input-bg, #ffffff);
  color: var(--text-primary, #2d3748);
}

.ability-input:focus,
.param-input:focus {
  outline: none;
  border-color: var(--accent-color, #667eea);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.ability-select {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  font-size: 0.9rem;
  background: var(--input-bg, #ffffff);
  color: var(--text-primary, #2d3748);
}

.ability-select:focus {
  outline: none;
  border-color: var(--accent-color, #667eea);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.file-input {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  font-size: 0.9rem;
}

.file-info {
  margin-top: 8px;
  font-size: 0.85rem;
  color: var(--text-secondary, #718096);
}

.form-hint {
  margin-top: 8px;
  font-size: 0.8rem;
  color: var(--text-secondary, #718096);
  padding: 8px;
  background: var(--card-bg, #f7fafc);
  border-radius: 4px;
}

.form-hint code {
  background: var(--input-bg, #ffffff);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.85em;
  color: var(--accent-color, #667eea);
}

.actions {
  display: flex;
  gap: 12px;
}

.call-btn {
  flex: 1;
  padding: 14px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.call-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
}

.call-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.stop-btn {
  padding: 14px 24px;
  background: #e53e3e;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.stop-btn:hover {
  background: #c53030;
}

.clear-btn {
  padding: 14px 24px;
  background: var(--card-bg, #f7fafc);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 10px;
  color: var(--text-secondary, #4a5568);
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn:hover:not(:disabled) {
  border-color: var(--accent-color, #667eea);
  color: var(--accent-color, #667eea);
}

.clear-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.progress-info {
  padding: 12px;
  background: var(--accent-bg, #edf2f7);
  border-radius: 8px;
  border-left: 4px solid var(--accent-color, #667eea);
  font-size: 0.9rem;
}

.current-prompt {
  margin-top: 8px;
  font-size: 0.85rem;
  color: var(--text-secondary, #718096);
}

.error-box {
  padding: 16px;
  background: #fed7d7;
  border: 1px solid #fc8181;
  border-radius: 8px;
  border-left: 4px solid #e53e3e;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #c53030;
  margin-bottom: 8px;
}

.error-content {
  color: #742a2a;
  font-size: 0.9rem;
  white-space: pre-wrap;
  word-break: break-word;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.result-header label {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-secondary, #4a5568);
  margin: 0;
}

.result-output,
.log-output {
  flex: 1;
  width: 100%;
  padding: 16px;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  font-size: 0.85rem;
  font-family: 'Consolas', 'Monaco', monospace;
  resize: none;
  background: var(--input-bg, #f8f9fa);
  color: var(--text-primary, #2d3748);
  min-height: 600px;
  line-height: 1.6;
}

.copy-btn {
  padding: 6px 12px;
  background: var(--card-bg, #f7fafc);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 6px;
  color: var(--text-secondary, #4a5568);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.copy-btn:hover {
  border-color: var(--accent-color, #667eea);
  color: var(--accent-color, #667eea);
}

textarea:disabled,
input:disabled,
select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 响应式布局 */
@media (max-width: 1200px) {
  .panel-content,
  .batch-panel {
    grid-template-columns: 1fr;
  }
  
  .result-output,
  .log-output {
    min-height: 400px;
  }
}
</style>
