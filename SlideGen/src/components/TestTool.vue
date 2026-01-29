<script setup lang="ts">
import { ref, watch } from "vue";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import html2canvas from "html2canvas";
import {
  generateSinglePageHtmlPpt,
  fixLayoutIssues,
  fetchModels,
  type GenerateRequest,
  type SlideResult,
  type ModelInfo,
} from "../services/llmService";
import { checkLayoutInIframe } from "../utils/layout-checker";
import { getAllTemplates, getTemplateById, loadHtmlTemplateContent } from "../templates";

// 状态
const excelFile = ref<File | null>(null);
const workbook = ref<XLSX.WorkBook | null>(null);
const exceljsWorkbook = ref<ExcelJS.Workbook | null>(null);
const isProcessing = ref(false);
const shouldStop = ref(false); // 停止标志
const progress = ref({ current: 0, total: 0, currentPrompt: "" });
const templates = ref<Array<{ id: string; name: string }>>([]);
const logs = ref<string[]>([]);
const logTextareaRef = ref<HTMLTextAreaElement | null>(null);

// 模型选择
const modelList = ref<ModelInfo[]>([]);
const selectedModel = ref("glm-4.6");
const maxTokens = ref(16000);
const isLoadingModels = ref(false);

// 场景选择
const enableScene1 = ref(true);
const enableScene2 = ref(true);
const selectedTemplateIds = ref<string[]>([]);

// 配置
const MAX_RETRIES = 6; // 最大重试次数
const TIMEOUT_MS = 200000; // 超时时间：200秒
const DELAY_BETWEEN_TESTS = 3000; // 测试项之间延迟：3秒

// 添加日志
function addLog(message: string) {
  const timestamp = new Date().toLocaleTimeString();
  logs.value.push(`[${timestamp}] ${message}`);
  // 自动滚动到底部
  setTimeout(() => {
    if (logTextareaRef.value) {
      logTextareaRef.value.scrollTop = logTextareaRef.value.scrollHeight;
    }
  }, 100);
}

// 加载模板列表
async function loadTemplates() {
  try {
    const allTemplates = await getAllTemplates();
    templates.value = allTemplates
      .filter((t: { type: string }) => t.type === "html")
      .map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }));
    addLog(`已加载 ${templates.value.length} 个HTML模板`);
  } catch (error) {
    addLog(`加载模板失败: ${error}`);
  }
}

// 加载模型列表
async function loadModels() {
  isLoadingModels.value = true;
  try {
    modelList.value = await fetchModels();
    addLog(`已加载 ${modelList.value.length} 个模型`);
  } catch (error) {
    addLog(`加载模型列表失败: ${error}`);
  } finally {
    isLoadingModels.value = false;
  }
}

// 模型对应的 max_tokens 预设
const modelMaxTokensPreset: Record<string, number> = {
  "glm-4.6": 131072,
  "gemini-3-pro-preview": 65536,
};

// 监听模型变化，自动设置对应的 max_tokens
watch(
  () => selectedModel.value,
  (newModel: string) => {
    if (newModel && modelMaxTokensPreset[newModel]) {
      maxTokens.value = modelMaxTokensPreset[newModel];
    } else {
      maxTokens.value = 16000;
    }
  },
  { immediate: true }
);

// 将文件转换为base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

loadTemplates();
loadModels();

// 读取Excel文件
async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  excelFile.value = file;
  const reader = new FileReader();

  reader.onload = async (e) => {
    const data = e.target?.result;
    if (data) {
      // 读取XLSX格式（用于数据读取）
      workbook.value = XLSX.read(data, { type: "binary" });
      
      // 读取ExcelJS格式（用于图片插入）
      const buffer = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      exceljsWorkbook.value = wb;
      
      addLog(`已加载Excel文件: ${file.name}`);
    }
  };

  reader.readAsBinaryString(file);
}

// 查找"输入语料"列
function findInputColumn(sheet: XLSX.WorkSheet): number | null {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  for (let col = 0; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
    const cell = sheet[cellAddress];
    if (cell && cell.v === "输入语料") {
      return col;
    }
  }
  return null;
}

// 获取所有输入语料内容
function getInputPrompts(sheet: XLSX.WorkSheet, colIndex: number): string[] {
  const prompts: string[] = [];
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  
  for (let row = 1; row <= range.e.r; row++) {
    const cellAddress = XLSX.utils.encode_cell({ r: row, c: colIndex });
    const cell = sheet[cellAddress];
    if (cell && cell.v && typeof cell.v === "string" && cell.v.trim()) {
      prompts.push(cell.v.trim());
    }
  }
  
  return prompts;
}

// 带超时的Promise包装器
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

// HTML转PNG
async function htmlToPng(html: string): Promise<string> {
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:absolute;left:-9999px;width:1280px;height:720px;border:none;";
  iframe.sandbox.add("allow-same-origin", "allow-scripts");
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("无法创建iframe文档");

    doc.open();
    doc.write(html);
    doc.close();

    await new Promise((resolve) => setTimeout(resolve, 2000)); // 增加等待时间

    const canvasPromise = html2canvas(iframe.contentDocument!.body, {
      width: 1280,
      height: 720,
      scale: 1,
      useCORS: true,
      logging: false,
      timeout: 60000, // html2canvas超时60秒
    } as any);

    const canvas = (await withTimeout(
      canvasPromise,
      TIMEOUT_MS,
      "HTML转PNG超时"
    )) as HTMLCanvasElement;

    return canvas.toDataURL("image/png");
  } finally {
    document.body.removeChild(iframe);
  }
}

// 检测爆版，返回是否爆版和原因
async function checkLayoutErrors(html: string): Promise<{ passed: boolean; reason: string }> {
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:absolute;left:-9999px;width:1280px;height:720px;border:none;";
  iframe.sandbox.add("allow-same-origin", "allow-scripts");
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) return { passed: false, reason: "无法访问iframe内容" };
    doc.open();
    doc.write(html);
    doc.close();

    await new Promise((resolve) => setTimeout(resolve, 500));
    const checkResult = checkLayoutInIframe(iframe);
    
    // 提取error级别的问题作为爆版原因
    const errorIssues = checkResult.issues.filter(i => i.severity === 'error');
    let reason = "否";
    if (errorIssues.length > 0) {
      // 提取主要问题类型，去重并格式化
      const issueTypes = new Set<string>();
      errorIssues.forEach(issue => {
        if (issue.type === 'scrollbar') {
          if (issue.message.includes('垂直')) issueTypes.add('垂直滚动条');
          if (issue.message.includes('水平')) issueTypes.add('水平滚动条');
        } else if (issue.type === 'overflow') {
          issueTypes.add('内容溢出');
        } else if (issue.type === 'hidden-content') {
          issueTypes.add('元素超出边界');
        } else if (issue.type === 'overlap') {
          issueTypes.add('元素重叠');
        }
      });
      reason = Array.from(issueTypes).join('、') || "是";
    }
    
    return { passed: checkResult.passed, reason };
  } finally {
    document.body.removeChild(iframe);
  }
}

// 带重试的生成函数
async function generateWithRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  errorMessage: string
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await withTimeout(fn(), TIMEOUT_MS, `${errorMessage}超时`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (i < retries - 1) {
        addLog(`${errorMessage}失败 (${i + 1}/${retries})，正在重试... 错误: ${errMsg}`);
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 重试前等待2秒
      } else {
        addLog(`${errorMessage}失败，已重试${retries}次: ${errMsg}`);
        throw error;
      }
    }
  }
  throw new Error("重试次数用尽");
}

// 生成PPT（不带修复）
async function generateWithoutFix(
  prompt: string,
  templateId?: string,
  imageFile?: File | null
): Promise<{ slide: SlideResult | null; png: string; hasError: boolean; errorReason: string }> {
  return generateWithRetry(async () => {
        const request: GenerateRequest = {
          prompt,
          model: selectedModel.value || undefined,
          maxTokens: maxTokens.value || 16000,
        };

    // 场景2：同时有图片和HTML模板
    if (templateId && imageFile) {
      const template = await getTemplateById(templateId);
      if (template && template.type === "html") {
        const htmlContent = await loadHtmlTemplateContent(template);
        const imageBase64 = await fileToBase64(imageFile);
        request.htmlTemplate = {
          content: htmlContent,
          filename: template.name,
        };
        request.imageReference = {
          content: imageBase64,
          filename: imageFile.name,
        };
      }
    } else if (templateId) {
      // 只有HTML模板
      const template = await getTemplateById(templateId);
      if (template && template.type === "html") {
        const content = await loadHtmlTemplateContent(template);
        request.referenceType = "custom";
        request.customReference = {
          type: "html",
          content,
          filename: template.name,
        };
      }
    } else {
      request.referenceType = "none";
    }

    const result = await generateSinglePageHtmlPpt(request, {
      onError(error) {
        addLog(`生成过程错误: ${error}`);
      },
    });

    const slide = result.slides[0] || null;
    if (!slide) {
      throw new Error("未生成幻灯片");
    }

    const html = wrapSlideHtml(slide.html);
    const png = await htmlToPng(html);
    const checkResult = await checkLayoutErrors(html);

    return { slide, png, hasError: !checkResult.passed, errorReason: checkResult.reason };
  }, MAX_RETRIES, "生成PPT");
}

// 判断是否是网络错误
function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("网络") ||
    msg.includes("network") ||
    msg.includes("fetch") ||
    msg.includes("timeout") ||
    msg.includes("超时") ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("网络请求失败")
  );
}

// 生成PPT（带修复）- 返回原始结果和修复后结果
async function generateWithFix(
  prompt: string,
  templateId?: string,
  imageFile?: File | null
): Promise<{
  original: { slide: SlideResult | null; png: string; hasError: boolean; errorReason: string };
  fixed: { slide: SlideResult | null; png: string; hasError: boolean; errorReason: string } | null;
  hasError: boolean; // 原始结果是否爆版
}> {
  // 先生成原始版本，如果失败（特别是网络错误）直接抛出，不进行修复
  let original: { slide: SlideResult | null; png: string; hasError: boolean; errorReason: string };
  try {
    original = await generateWithoutFix(prompt, templateId, imageFile);
  } catch (error) {
    // 如果是网络错误，直接抛出，不进行修复和重试
    if (isNetworkError(error)) {
      addLog(`检测到网络错误，中止处理: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
    // 其他错误也直接抛出
    throw error;
  }
  
  if (!original.slide) {
    return {
      original,
      fixed: null,
      hasError: original.hasError,
    };
  }

  // 检测问题（原始结果已经检测过了，这里再次检测是为了获取详细信息）
  const html = wrapSlideHtml(original.slide.html);
  const checkResult = await checkLayoutErrors(html);
  const hasError = !checkResult.passed;

  // 如果没有爆版，修复后结果和原始结果一样
  if (!hasError) {
    return {
      original,
      fixed: original, // 没爆版，修复后和原始一样
      hasError: false,
    };
  }

  // 有爆版，进行修复
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:absolute;left:-9999px;width:1280px;height:720px;border:none;";
  iframe.sandbox.add("allow-same-origin", "allow-scripts");
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) {
      return {
        original,
        fixed: { 
          slide: null, 
          png: "", 
          hasError: true,
          errorReason: "修复失败: 无法访问iframe内容"
        },
        hasError: true,
      };
    }
    doc.open();
    doc.write(html);
    doc.close();

    await new Promise((resolve) => setTimeout(resolve, 1000));
    const checkResult = checkLayoutInIframe(iframe);
    const errorIssues = checkResult.issues.filter((i) => i.severity === "error");

    if (errorIssues.length === 0) {
      // 再次确认没有错误，修复后和原始一样
      return {
        original,
        fixed: original,
        hasError: false,
      };
    }

    // 调用修复（带重试机制，网络错误重试3次）
    let fixedSlide;
    if (!original.slide) {
      return {
        original,
        fixed: { 
          slide: null, 
          png: "", 
          hasError: true,
          errorReason: original.errorReason || "生成失败"
        },
        hasError: true,
      };
    }
    
    // 使用重试机制调用修复
    try {
      fixedSlide = await generateWithRetry(
        async () => {
          return await fixLayoutIssues(
            {
              html: original.slide!.html,
              issues: errorIssues.map((i) => ({
                type: i.type,
                severity: i.severity,
                element: i.element,
                message: i.message,
                details: i.details,
              })),
              model: selectedModel.value || undefined,
            },
            {
              onError(error) {
                addLog(`修复过程错误: ${error}`);
              },
            }
          );
        },
        3, // 修复重试3次
        "修复PPT"
      );
    } catch (error) {
      // 重试3次后仍然失败
      const errMsg = error instanceof Error ? error.message : String(error);
      if (isNetworkError(error)) {
        addLog(`修复过程中网络错误，已重试3次仍失败: ${errMsg}`);
        return {
          original,
          fixed: { 
            slide: null, 
            png: "", 
            hasError: true,
            errorReason: `修复失败: 网络错误（已重试3次）`
          },
          hasError: true,
        };
      }
      // 其他错误
      addLog(`修复失败，已重试3次: ${errMsg}`);
      return {
        original,
        fixed: { 
          slide: null, 
          png: "", 
          hasError: true,
          errorReason: `修复失败: ${errMsg}（已重试3次）`
        },
        hasError: true,
      };
    }

    if (!fixedSlide) {
      return {
        original,
        fixed: { 
          slide: null, 
          png: "", 
          hasError: true,
          errorReason: "修复失败: 未生成修复后的幻灯片"
        },
        hasError: true,
      };
    }

    const fixedHtml = wrapSlideHtml(fixedSlide.html);
    const fixedPng = await htmlToPng(fixedHtml);
    const fixedCheckResult = await checkLayoutErrors(fixedHtml);

    return {
      original,
      fixed: { 
        slide: fixedSlide, 
        png: fixedPng, 
        hasError: !fixedCheckResult.passed,
        errorReason: fixedCheckResult.reason
      },
      hasError: true,
    };
  } finally {
    document.body.removeChild(iframe);
  }
}

// 包装HTML为完整文档
function wrapSlideHtml(html: string): string {
  if (
    html.trim().toLowerCase().startsWith("<!doctype") ||
    html.trim().toLowerCase().startsWith("<html")
  ) {
    return html;
  }
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1280, height=720">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 1280px; height: 720px; overflow: hidden; }
  </style>
</head>
<body>${html}</body>
</html>`;
}

// 将PNG插入Excel（使用ExcelJS插入图片）
async function insertPngToExcel(
  row: number,
  col: number,
  pngBase64: string
): Promise<void> {
  if (!exceljsWorkbook.value) return;

  try {
    const worksheet = exceljsWorkbook.value.worksheets[0];
    if (!worksheet) return;

    // 将base64转换为Uint8Array（浏览器环境）
    const base64Data = pngBase64.replace(/^data:image\/png;base64,/, "");
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 添加图片
    const imageId = exceljsWorkbook.value.addImage({
      buffer: bytes as any,
      extension: "png",
    });

    // 设置行高和列宽以适应图片（ExcelJS使用1-based索引）
    worksheet.getRow(row + 1).height = 120; // 约120像素高
    worksheet.getColumn(col + 1).width = 20; // 约20字符宽

    // 插入图片（ExcelJS使用0-based索引）
    worksheet.addImage(imageId, {
      tl: { col: col, row: row },
      ext: { width: 256, height: 144 }, // 缩略图尺寸（像素）
    });

    addLog(`图片已插入到Excel: 行${row + 1}, 列${col + 1}`);
  } catch (error) {
    addLog(`插入图片失败: ${error}`);
    // 如果插入失败，在XLSX格式中存储文件名
    if (workbook.value) {
      const sheet = workbook.value.Sheets[workbook.value.SheetNames[0]];
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      sheet[cellAddress] = { t: "s", v: "[图片插入失败]" };
    }
  }
}

// 写入爆版信息到Excel（同时写入XLSX和ExcelJS）
function writeHasErrorToExcel(
  row: number,
  col: number,
  hasError: boolean,
  errorReason?: string
) {
  // 如果有原因，使用原因；否则使用"是"/"否"
  const value = hasError ? (errorReason || "是") : "否";
  
  // 写入XLSX格式（用于数据）
  if (workbook.value) {
    const sheet = workbook.value.Sheets[workbook.value.SheetNames[0]];
    const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
    sheet[cellAddress] = { t: "s", v: value };
  }
  
  // 写入ExcelJS格式（用于最终保存）
  if (exceljsWorkbook.value) {
    const worksheet = exceljsWorkbook.value.worksheets[0];
    if (worksheet) {
      const cell = worksheet.getCell(row + 1, col + 1); // ExcelJS使用1-based索引
      cell.value = value;
      // 如果内容较长，自动调整列宽
      if (value.length > 20) {
        worksheet.getColumn(col + 1).width = Math.min(value.length + 2, 50);
      }
    }
  }
}

// 写入HTML到Excel（默认第14列，索引13）
function writeHtmlToExcel(
  row: number,
  html: string,
  columnIndex: number = 13 // 默认第14列（索引13），可以指定其他列
) {
  // 写入XLSX格式（用于数据）
  if (workbook.value) {
    const sheet = workbook.value.Sheets[workbook.value.SheetNames[0]];
    const cellAddress = XLSX.utils.encode_cell({ r: row, c: columnIndex });
    sheet[cellAddress] = { t: "s", v: html };
  }
  
  // 写入ExcelJS格式（用于最终保存）
  if (exceljsWorkbook.value) {
    const worksheet = exceljsWorkbook.value.worksheets[0];
    if (worksheet) {
      const cell = worksheet.getCell(row + 1, columnIndex + 1); // ExcelJS使用1-based索引
      cell.value = html;
      // 设置列宽以适应HTML内容（HTML可能很长）
      const column = worksheet.getColumn(columnIndex + 1);
      if (!column.width || column.width < 50) {
        column.width = 50;
      }
      // 设置单元格为文本格式，并允许换行
      cell.alignment = { wrapText: true, vertical: 'top' };
    }
  }
}

// 保存日志到本地文件
function saveLogsToFile() {
  try {
    const logContent = logs.value.join('\n');
    const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    a.download = `处理日志_${timestamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog(`日志已保存到本地文件`);
  } catch (error) {
    addLog(`保存日志失败: ${error}`);
  }
}

// 导出当前Excel（用于停止时导出）
async function exportCurrentExcel() {
  if (!exceljsWorkbook.value) {
    addLog("错误: 没有可导出的Excel数据");
    alert("没有可导出的Excel数据");
    return;
  }

  try {
    const resultFilename = excelFile.value
      ? excelFile.value.name.replace(/\.(xlsx|xls)$/i, "_结果_部分.xlsx")
      : "测试结果_部分.xlsx";
    
    const buffer = await exceljsWorkbook.value.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = resultFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog(`\n✅ 已导出部分结果: ${resultFilename}`);
    
    // 保存日志到本地
    saveLogsToFile();
    
    alert(`已导出部分结果和日志`);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    addLog(`\n❌ 导出失败: ${errMsg}`);
    alert(`导出失败: ${errMsg}`);
  }
}

// 停止处理
function stopProcessing() {
  if (!isProcessing.value) return;
  shouldStop.value = true;
  addLog("\n⚠️ 用户请求停止处理...");
}

// 主处理函数
async function processExcel() {
  if (!workbook.value) {
    addLog("错误: 请先选择Excel文件");
    alert("请先选择Excel文件");
    return;
  }

  const sheetName = workbook.value.SheetNames[0];
  const sheet = workbook.value.Sheets[sheetName];
  const inputCol = findInputColumn(sheet);

  if (inputCol === null) {
    addLog('错误: 未找到"输入语料"列');
    alert('未找到"输入语料"列');
    return;
  }

  const prompts = getInputPrompts(sheet, inputCol);
  if (prompts.length === 0) {
    addLog("错误: 未找到任何输入语料内容");
    alert("未找到任何输入语料内容");
    return;
  }

  // 验证场景选择
  if (!enableScene1.value && !enableScene2.value) {
    addLog("错误: 至少需要选择一个场景");
    alert("至少需要选择一个场景");
    return;
  }

  // 验证场景2模板选择
  if (enableScene2.value && selectedTemplateIds.value.length === 0) {
    addLog("错误: 场景2已启用，但未选择模板");
    alert("场景2已启用，请至少选择一个模板");
    return;
  }

  isProcessing.value = true;
  shouldStop.value = false; // 重置停止标志
  logs.value = []; // 清空日志
  progress.value = { current: 0, total: prompts.length, currentPrompt: "" };
  addLog(`开始处理 ${prompts.length} 条输入语料`);
  addLog(`使用模型: ${selectedModel.value}`);
  addLog(`场景1: ${enableScene1.value ? "启用" : "禁用"}`);
  addLog(`场景2: ${enableScene2.value ? "启用" : "禁用"}`);
  if (enableScene2.value && selectedTemplateIds.value.length > 0) {
    const templateNames = selectedTemplateIds.value
      .map((id: string) => templates.value.find((t: { id: string }) => t.id === id)?.name || id)
      .join(", ");
    addLog(`场景2使用模板: ${templateNames}`);
  }

  try {
    for (let i = 0; i < prompts.length; i++) {
      // 检查是否应该停止
      if (shouldStop.value) {
        addLog(`\n⚠️ 处理已停止，当前已完成 ${i} / ${prompts.length} 条`);
        await exportCurrentExcel();
        return;
      }
      const prompt = prompts[i];
      // getInputPrompts从row=1开始读取（跳过表头row=0），所以prompts[0]对应Excel第2行（XLSX索引1）
      // 因此row = i + 1 是正确的（i=0时，row=1对应Excel第2行）
      const row = i + 1; // XLSX索引（0-based），对应Excel第2行开始

      progress.value = {
        current: i + 1,
        total: prompts.length,
        currentPrompt: prompt,
      };

      addLog(`\n========== 处理第 ${row + 1} 行: ${prompt.substring(0, 30)}... ==========`);

      // 场景1：不带模板
      // 列4: 不带修复图片，列5: 不带修复爆版状态
      // 列6: 带修复图片，列7: 带修复爆版状态
      if (enableScene1.value) {
        addLog(`[行${row + 1}] 场景1: 开始生成（自动修复模式）...`);
        try {
          const result = await generateWithFix(prompt);
          
          // 写入不带修复的结果（列4和列5）
          if (result.original.png) {
            await insertPngToExcel(row, 3, result.original.png); // 列4（索引3）
            addLog(`[行${row + 1}] 场景1-无修复: 图片已插入Excel`);
          }
          writeHasErrorToExcel(row, 4, result.original.hasError, result.original.errorReason); // 列5（索引4）
          
          // 写入带修复的结果（列6和列7）
          if (result.fixed && result.fixed.png) {
            await insertPngToExcel(row, 5, result.fixed.png); // 列6（索引5）
            addLog(`[行${row + 1}] 场景1-有修复: 图片已插入Excel`);
          } else if (result.original.png) {
            // 如果没爆版，修复后和原始一样，所以也写入相同的图片
            await insertPngToExcel(row, 5, result.original.png); // 列6（索引5）
          }
          writeHasErrorToExcel(row, 6, result.fixed ? result.fixed.hasError : result.original.hasError, result.fixed ? result.fixed.errorReason : result.original.errorReason); // 列7（索引6）
          
          // 写入原始HTML到第14列
          if (result.original.slide) {
            writeHtmlToExcel(row, result.original.slide.html, 13); // 第14列（索引13）
          }
          // 写入修复后的HTML到第15列
          if (result.fixed && result.fixed.slide) {
            writeHtmlToExcel(row, result.fixed.slide.html, 14); // 第15列（索引14）
          } else if (result.original.slide) {
            // 如果没修复，修复后的和原始一样
            writeHtmlToExcel(row, result.original.slide.html, 14); // 第15列（索引14）
          }
          
          const statusText = result.hasError ? "是" : "否";
          addLog(`[行${row + 1}] 场景1: 生成完成，原始爆版: ${statusText}，修复后爆版: ${result.fixed ? (result.fixed.hasError ? "是" : "否") : "未知"}`);
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          addLog(`[行${row + 1}] 场景1: 失败 - ${errMsg}`);
          writeHasErrorToExcel(row, 4, true, `生成失败: ${errMsg}`); // 列5
          writeHasErrorToExcel(row, 6, true, `生成失败: ${errMsg}`); // 列7
        }
      }

      // 场景2：带模板
      // 列8: 不带修复图片，列9: 不带修复爆版状态
      // 列10: 带修复图片，列11: 带修复爆版状态
      if (enableScene2.value) {
        for (const templateId of selectedTemplateIds.value) {
          const template = templates.value.find((t: { id: string }) => t.id === templateId);
          if (!template) continue;

          addLog(`[行${row + 1}] 场景2: 开始生成（使用模板: ${template.name}，自动修复模式）...`);
          try {
            const result = await generateWithFix(prompt, templateId);
            
            // 写入不带修复的结果（列8和列9）
            if (result.original.png) {
              await insertPngToExcel(row, 7, result.original.png); // 列8（索引7）
              addLog(`[行${row + 1}] 场景2-无修复: 图片已插入Excel`);
            }
            writeHasErrorToExcel(row, 8, result.original.hasError, result.original.errorReason); // 列9（索引8）
            
            // 写入带修复的结果（列10和列11）
            if (result.fixed && result.fixed.png) {
              await insertPngToExcel(row, 9, result.fixed.png); // 列10（索引9）
              addLog(`[行${row + 1}] 场景2-有修复: 图片已插入Excel`);
            } else if (result.original.png) {
              // 如果没爆版，修复后和原始一样，所以也写入相同的图片
              await insertPngToExcel(row, 9, result.original.png); // 列10（索引9）
            }
            writeHasErrorToExcel(row, 10, result.fixed ? result.fixed.hasError : result.original.hasError, result.fixed ? result.fixed.errorReason : result.original.errorReason); // 列11（索引10）
            
            // 写入原始HTML到第14列（每个模板都写入，如果有多个模板，最后一个会覆盖）
            if (result.original.slide) {
              writeHtmlToExcel(row, result.original.slide.html, 13); // 第14列（索引13）
            }
            // 写入修复后的HTML到第15列
            if (result.fixed && result.fixed.slide) {
              writeHtmlToExcel(row, result.fixed.slide.html, 14); // 第15列（索引14）
            } else if (result.original.slide) {
              // 如果没修复，修复后的和原始一样
              writeHtmlToExcel(row, result.original.slide.html, 14); // 第15列（索引14）
            }
            
            const statusText = result.hasError ? "是" : "否";
            addLog(`[行${row + 1}] 场景2: 生成完成（模板: ${template.name}），原始爆版: ${statusText}，修复后爆版: ${result.fixed ? (result.fixed.hasError ? "是" : "否") : "未知"}`);
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            addLog(`[行${row + 1}] 场景2: 失败（模板: ${template.name}）- ${errMsg}`);
            writeHasErrorToExcel(row, 8, true, `生成失败: ${errMsg}`); // 列9
            writeHasErrorToExcel(row, 10, true, `生成失败: ${errMsg}`); // 列11
          }
        }
      }

      // 检查是否应该停止（在延迟前检查）
      if (shouldStop.value) {
        addLog(`\n⚠️ 处理已停止，当前已完成 ${i + 1} / ${prompts.length} 条`);
        await exportCurrentExcel();
        return;
      }

      // 延迟避免API限流
      if (i < prompts.length - 1) {
        addLog(`等待 ${DELAY_BETWEEN_TESTS / 1000} 秒后继续...`);
        await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_TESTS));
      }
    }

    // 保存Excel文件（使用ExcelJS保存，支持图片）
    const resultFilename = excelFile.value!.name.replace(/\.(xlsx|xls)$/i, "_结果.xlsx");
    if (exceljsWorkbook.value) {
      const buffer = await exceljsWorkbook.value.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = resultFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addLog(`\n✅ 处理完成！结果已保存: ${resultFilename}`);
    } else {
      // 降级方案：使用XLSX保存
      XLSX.writeFile(workbook.value, resultFilename);
      addLog(`\n✅ 处理完成！结果已保存（无图片）: ${resultFilename}`);
    }
    alert("处理完成！结果已保存");
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    addLog(`\n❌ 处理失败: ${errMsg}`);
    // 如果是因为停止导致的，不显示错误提示
    if (!shouldStop.value) {
      alert(`处理失败: ${errMsg}`);
    }
  } finally {
    isProcessing.value = false;
    shouldStop.value = false; // 重置停止标志
    if (!shouldStop.value) {
      addLog("处理已完成");
    }
  }
}
</script>

<template>
  <div class="test-tool">
    <div class="tool-header">
      <h1>PPT生成测试工具</h1>
    </div>

    <div class="tool-content">
      <!-- 左侧：配置区域 -->
      <div class="tool-content-left">
        <!-- Excel文件选择 -->
        <div class="form-section">
          <label>选择Excel文件</label>
          <input
            type="file"
            accept=".xlsx,.xls"
            @change="handleFileSelect"
            :disabled="isProcessing"
          />
          <div v-if="excelFile" class="file-info">
            已选择: {{ excelFile.name }}
          </div>
        </div>

        <!-- 模型选择 -->
        <div class="form-section">
          <label>选择模型</label>
          <div class="model-select-wrapper">
            <select
              v-model="selectedModel"
              :disabled="isProcessing || isLoadingModels"
              class="model-select"
            >
              <option v-if="isLoadingModels" value="">加载中...</option>
              <option
                v-else-if="modelList.length === 0"
                :value="selectedModel"
              >
                {{ selectedModel || "默认模型" }}
              </option>
              <option
                v-for="model in modelList"
                :key="model.id"
                :value="model.id"
              >
                {{ model.id }}
              </option>
            </select>
            <input
              type="number"
              v-model.number="maxTokens"
              :disabled="isProcessing"
              class="max-tokens-input"
              placeholder="max_tokens"
              title="最大输出 token 数"
              min="1000"
              max="200000"
              step="1000"
            />
          </div>
        </div>

        <!-- 场景选择 -->
        <div class="form-section scene-section">
          <label>场景选择</label>
          <div class="checkbox-group">
            <label class="checkbox-item">
              <input
                type="checkbox"
                v-model="enableScene1"
                :disabled="isProcessing"
              />
              <span>场景1：不带模板（自动修复模式：爆版则修复，否则使用原始结果）</span>
            </label>
            <label class="checkbox-item">
              <input
                type="checkbox"
                v-model="enableScene2"
                :disabled="isProcessing"
              />
              <span>场景2：带模板（自动修复模式：爆版则修复，否则使用原始结果）</span>
            </label>
          </div>
        </div>

        <!-- 场景2模板选择 -->
        <div v-if="enableScene2" class="form-section template-section">
          <label>场景2模板选择（可多选）</label>
          <div v-if="templates.length > 0" class="template-list">
            <label
              v-for="tpl in templates"
              :key="tpl.id"
              class="template-checkbox"
            >
              <input
                type="checkbox"
                :value="tpl.id"
                v-model="selectedTemplateIds"
                :disabled="isProcessing"
              />
              <span>{{ tpl.name }}</span>
            </label>
          </div>
          <div v-else class="warning-text">未找到HTML模板</div>
          <div v-if="selectedTemplateIds.length > 0" class="selected-info">
            已选择 {{ selectedTemplateIds.length }} 个模板
          </div>
        </div>

        <!-- 开始处理 -->
        <div class="form-section button-section">
          <button
            class="process-btn"
            @click="processExcel"
            :disabled="!workbook || isProcessing"
          >
            {{ isProcessing ? "处理中..." : "开始处理" }}
          </button>
          <button
            v-if="isProcessing"
            class="stop-btn"
            @click="stopProcessing"
          >
            ⏹️ 停止并导出
          </button>
        </div>

        <!-- 进度显示 -->
        <div v-if="isProcessing" class="progress-section">
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{
                width: `${(progress.current / progress.total) * 100}%`,
              }"
            ></div>
          </div>
          <div class="progress-text">
            进度: {{ progress.current }} / {{ progress.total }}
          </div>
          <div class="progress-prompt">
            当前处理: {{ progress.currentPrompt }}
          </div>
        </div>
      </div>

      <!-- 右侧：日志区域 -->
      <div class="tool-content-right">
        <div class="log-section">
          <div class="log-header">
            <label>处理日志</label>
            <button
              class="clear-log-btn"
              @click="logs = []"
              :disabled="isProcessing"
            >
              清空日志
            </button>
          </div>
          <textarea
            ref="logTextareaRef"
            class="log-textarea"
            :value="logs.join('\n')"
            readonly
            placeholder="处理日志将在此显示..."
          ></textarea>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.test-tool {
  padding: 24px;
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  gap: 20px;
  box-sizing: border-box;
}

.tool-header {
  margin-bottom: 8px;
  padding-bottom: 20px;
  border-bottom: 2px solid var(--border-color);
}

.tool-header h1 {
  font-size: 2rem;
  margin: 0;
  color: var(--text-primary);
  font-weight: 600;
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.5px;
}

.tool-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.tool-content-left {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  padding-right: 12px;
}

.tool-content-right {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  padding-left: 12px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 24px;
  background: var(--card-bg);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
}

.form-section label {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 1rem;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.form-section input[type="text"],
.form-section input[type="file"] {
  padding: 14px 16px;
  border: 2px solid var(--border-color);
  border-radius: 10px;
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 0.95rem;
  transition: all 0.2s;
}

.model-select-wrapper {
  display: flex;
  gap: 12px;
  align-items: center;
}

.model-select {
  flex: 1;
  padding: 14px 16px;
  border: 2px solid var(--border-color);
  border-radius: 10px;
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
}

.model-select:hover:not(:disabled) {
  border-color: var(--accent-color);
}

.model-select:focus {
  outline: none;
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px rgba(184, 115, 51, 0.1);
}

.model-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.max-tokens-input {
  width: 140px;
  padding: 14px 12px;
  border: 2px solid var(--border-color);
  border-radius: 10px;
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 0.9rem;
  text-align: center;
}

.max-tokens-input:hover:not(:disabled) {
  border-color: var(--accent-color);
}

.max-tokens-input:focus {
  outline: none;
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px rgba(184, 115, 51, 0.1);
}

.max-tokens-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-section input[type="text"]:focus,
.form-section input[type="file"]:focus {
  outline: none;
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px rgba(184, 115, 51, 0.1);
}

.form-section input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: var(--hover-bg);
}

.file-info {
  font-size: 0.9rem;
  color: var(--text-secondary);
  padding: 12px 16px;
  background: var(--accent-bg);
  border-radius: 8px;
  border: 1px solid var(--accent-color);
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.file-info::before {
  content: "✓";
  color: var(--accent-color);
  font-weight: bold;
  font-size: 1.1rem;
}

.scene-section {
  background: linear-gradient(135deg, var(--card-bg) 0%, var(--accent-bg) 100%);
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 4px;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--panel-bg);
  border-radius: 10px;
  border: 2px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s;
}

.checkbox-item:hover {
  border-color: var(--accent-color);
  background: var(--hover-bg);
  transform: translateX(4px);
}

.checkbox-item input[type="checkbox"] {
  width: 20px;
  height: 20px;
  accent-color: var(--accent-color);
  cursor: pointer;
  flex-shrink: 0;
}

.checkbox-item span {
  font-size: 0.95rem;
  color: var(--text-primary);
  user-select: none;
  line-height: 1.5;
}

.template-section {
  background: linear-gradient(135deg, var(--card-bg) 0%, rgba(184, 115, 51, 0.05) 100%);
}

.template-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  margin-top: 8px;
  max-height: 240px;
  overflow-y: auto;
  padding: 12px;
  background: var(--panel-bg);
  border-radius: 10px;
  border: 1px solid var(--border-color);
}

.template-checkbox {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: var(--input-bg);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9rem;
  border: 2px solid transparent;
}

.template-checkbox:hover {
  background: var(--hover-bg);
  border-color: var(--accent-color);
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.template-checkbox input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--accent-color);
  cursor: pointer;
  flex-shrink: 0;
}

.template-checkbox span {
  color: var(--text-secondary);
  user-select: none;
  line-height: 1.4;
}

.selected-info {
  margin-top: 12px;
  padding: 12px 16px;
  background: var(--accent-bg);
  border-radius: 8px;
  font-size: 0.9rem;
  color: var(--accent-color);
  font-weight: 500;
  border: 1px solid var(--accent-color);
}

.button-section {
  display: flex;
  gap: 12px;
  align-items: center;
}

.process-btn {
  flex: 1;
  padding: 16px 32px;
  background: var(--accent-gradient);
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 1.05rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: var(--shadow-md);
  letter-spacing: 0.5px;
}

.stop-btn {
  padding: 16px 24px;
  background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: var(--shadow-md);
  white-space: nowrap;
}

.stop-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(220, 53, 69, 0.35);
  background: linear-gradient(135deg, #c82333 0%, #bd2130 100%);
}

.stop-btn:active {
  transform: translateY(0);
}

.process-btn:hover:not(:disabled) {
  transform: translateY(-3px);
  box-shadow: 0 10px 28px rgba(184, 115, 51, 0.35);
}

.process-btn:active:not(:disabled) {
  transform: translateY(-1px);
}

.process-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.progress-section {
  margin-top: 8px;
  padding: 24px 28px;
  background: linear-gradient(135deg, var(--card-bg) 0%, var(--accent-bg) 100%);
  border-radius: 16px;
  border: 2px solid var(--accent-color);
  box-shadow: var(--shadow-md);
}

.progress-bar {
  width: 100%;
  height: 10px;
  background: var(--border-color);
  border-radius: 5px;
  overflow: hidden;
  margin-bottom: 16px;
}

.progress-fill {
  height: 100%;
  background: var(--accent-gradient);
  transition: width 0.3s;
  box-shadow: 0 0 10px rgba(184, 115, 51, 0.5);
}

.progress-text {
  font-size: 1rem;
  color: var(--text-primary);
  margin-bottom: 10px;
  font-weight: 500;
}

.progress-prompt {
  font-size: 0.9rem;
  color: var(--text-secondary);
  word-break: break-all;
  line-height: 1.5;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 6px;
}

.warning-text {
  color: var(--warning-color);
  padding: 14px 16px;
  background: rgba(212, 148, 10, 0.1);
  border-radius: 8px;
  border: 1px solid var(--warning-color);
  font-size: 0.9rem;
  margin-top: 12px;
  line-height: 1.5;
}

.log-section {
  padding: 20px 24px;
  background: var(--card-bg);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.log-header label {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 1rem;
}

.clear-log-btn {
  padding: 8px 16px;
  background: var(--hover-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-log-btn:hover:not(:disabled) {
  background: var(--accent-bg);
  border-color: var(--accent-color);
  color: var(--accent-color);
  transform: translateY(-1px);
}

.clear-log-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.log-textarea {
  width: 100%;
  flex: 1;
  min-height: 0;
  padding: 16px;
  background: #1e1e1e;
  border: 2px solid var(--border-color);
  border-radius: 10px;
  font-family: "Consolas", "Monaco", monospace;
  font-size: 0.85rem;
  line-height: 1.7;
  color: #d4d4d4;
  resize: none;
  overflow-y: auto;
}

.log-textarea:focus {
  outline: none;
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px rgba(184, 115, 51, 0.1);
}

/* 滚动条样式 */
.log-textarea::-webkit-scrollbar {
  width: 8px;
}

.log-textarea::-webkit-scrollbar-track {
  background: #2d2d2d;
  border-radius: 4px;
}

.log-textarea::-webkit-scrollbar-thumb {
  background: var(--accent-color);
  border-radius: 4px;
}

.log-textarea::-webkit-scrollbar-thumb:hover {
  background: var(--accent-hover);
}
</style>

