<script setup lang="ts">
import { ref, computed } from "vue";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import html2canvas from "html2canvas";
import { checkLayoutInIframe, type LayoutCheckResult } from "../utils/layout-checker";

// 处理结果项
interface FixResultItem {
  rowIndex: number; // Excel行索引（0-based，包含表头）
  originalHtml: string; // 原始HTML（I列）
  fixedHtml: string; // 修复后的HTML（J列）
  previewImage: string; // 预览截图base64（K列）
}

const isProcessing = ref(false);
const shouldStop = ref(false); // 停止标志
const progress = ref({ current: 0, total: 0 });
const fixResults = ref<FixResultItem[]>([]);
const currentPreviewIndex = ref(0);
const logs = ref<string[]>([]);
const excelFile = ref<File | null>(null);
const sourceExcelFileName = ref<string>(""); // 当前使用的源Excel文件名（用于导出命名）
const currentWorkbook = ref<ExcelJS.Workbook | null>(null); // 当前处理的Excel工作簿
const logsTextareaRef = ref<HTMLTextAreaElement | null>(null); // 日志textarea引用
const fixedHtmlIframeRef = ref<HTMLIFrameElement | null>(null); // 修复后HTML的iframe引用

// Sheet 选择相关
const availableSheets = ref<string[]>([]); // 可用的 sheet 列表
const selectedSheet = ref<string>(""); // 当前选中的 sheet
const showSheetSelector = ref(false); // 是否显示 sheet 选择弹窗
const pendingAction = ref<"preview" | "fixAll" | "fixUnprocessed" | null>(null); // 待执行的操作

// 列选择相关（A=0, B=1, C=2...）
const columnLetters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];
const selectedOriginalCol = ref("I");   // 原始HTML列（默认I列）
const selectedFixedCol = ref("J");      // 修复后HTML列（默认J列）
const selectedImageCol = ref("K");      // 预览图片列（默认K列，仅修复模式）

// 爆版检测相关
const isCheckingLayout = ref(false);    // 是否正在检测爆版
const selectedHtmlColForCheck = ref("I"); // 要检测的HTML列（默认I列）
const selectedResultCol = ref("L");     // 爆版信息输出列（默认L列）
const selectedLayoutImageCol = ref("M"); // HTML图片输出列（默认M列，用于爆版检测）
const htmlFolderInput = ref<HTMLInputElement | null>(null); // HTML文件夹选择输入
const htmlFilesList = ref<File[]>([]); // HTML文件列表（按顺序）
const useFolderMode = ref(false); // 是否使用文件夹模式
const selectedHtmlOutputCol = ref("I"); // HTML输出列（默认I列，用于将HTML文件内容写入Excel）

// 列字母转索引（A=0, B=1...）
function colLetterToIndex(letter: string): number {
  return letter.toUpperCase().charCodeAt(0) - 65;
}

// 生成导出文件名：原文件名 + "-修复结果" + 原扩展名
function buildOutputFileName(inputName: string): string {
  const raw = (inputName || "").trim();
  if (!raw) return "修复结果.xlsx";
  const nameOnly = raw.split(/[\\/]/).pop() || raw;
  const dotIndex = nameOnly.lastIndexOf(".");
  if (dotIndex > 0 && dotIndex < nameOnly.length - 1) {
    const base = nameOnly.slice(0, dotIndex);
    const ext = nameOnly.slice(dotIndex);
    return `${base}-修复结果${ext}`;
  }
  return `${nameOnly}-修复结果.xlsx`;
}

// 添加日志
function addLog(message: string) {
  const timestamp = new Date().toLocaleTimeString();
  logs.value.push(`[${timestamp}] ${message}`);
  
  // 自动滚动到底部
  setTimeout(() => {
    if (logsTextareaRef.value) {
      logsTextareaRef.value.scrollTop = logsTextareaRef.value.scrollHeight;
    }
  }, 0);
}

// 处理HTML：在body中查找header元素，再查找header中的h1元素，保留h1及其父级元素，删除header中的其他元素
function processHtml(html: string): string {
  try {
    // 创建临时DOM解析器
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    
    if (!doc.body) {
      return html;
    }

    // 一、先处理底部footer-bar
    const footerBar = doc.querySelector('.footer-bar');
    if (footerBar) {
      footerBar.textContent = '';
    }
    // 在body中查找第一个header元素
    const headerElement = doc.body.querySelector("header") || doc.body.querySelector(".header");
    
    if (!headerElement) {
      // 如果没有header，返回原始HTML
      return doc.documentElement.outerHTML;
    }

    // 二、处理header=========================
    // 1.清除header的底部边框线
    headerElement.style.borderBottom = 'none';

    //2.如果header存在于类名包含section的类中，则保留全部内容
    if(headerElement.closest('[class*="section"]')){
      return doc.documentElement.outerHTML;
    }
    // 否则：按要求对header处理过滤
    // 3.清除header的副标题
    const subTitles = headerElement.querySelectorAll('.sub-title');

    if (subTitles.length > 0) {
      subTitles.forEach(el => {
        el.remove();
      });
    }
    // 在header中查找第一个h1元素
    const h1 = headerElement.querySelector("h1");
    
    if (!h1) {
      // 如果header中没有h1，返回处理后的HTML
      return doc.documentElement.outerHTML;
    }
    
    // 找到从h1到header的路径上的所有元素
    const pathToKeep = new Set<Element>();
    
    // 从h1向上遍历到header，记录路径上的所有元素
    let current: Element | null = h1;
    while (current && current !== headerElement) {
      pathToKeep.add(current);
      current = current.parentElement;
    }
    // 也保留h1本身和header本身
    pathToKeep.add(h1);
    pathToKeep.add(headerElement);
    
    // 清理header内部：删除不在路径上的直接子元素
    const childrenToRemove: Element[] = [];
    for (let i = 0; i < headerElement.children.length; i++) {
      const child = headerElement.children[i] as Element;
      // 检查这个子元素是否在保留路径上
      let isInPath = false;
      let checkElement: Element | null = child;
      while (checkElement && checkElement !== headerElement) {
        if (pathToKeep.has(checkElement)) {
          isInPath = true;
          break;
        }
        checkElement = checkElement.parentElement;
      }
      
      // 如果不在路径上，标记为删除
      if (!isInPath) {
        childrenToRemove.push(child);
      }
    }
    
    // 删除不在路径上的子元素
    childrenToRemove.forEach((child) => {
      headerElement.removeChild(child);
    });
    
    // 对于路径上的元素，也需要清理其不在路径上的子元素
    pathToKeep.forEach((element) => {
      if (element === headerElement) {
        return; // header本身不需要清理子元素（已经在上面处理过了）
      }
      
      const childrenToRemove: Element[] = [];
      for (let i = 0; i < element.children.length; i++) {
        const child = element.children[i] as Element;
        // 如果这个子元素不在路径上，标记为删除
        if (!pathToKeep.has(child)) {
          childrenToRemove.push(child);
        }
      }
      
      // 删除不在路径上的子元素
      childrenToRemove.forEach((child) => {
        element.removeChild(child);
      });
    });
    
    // 返回处理后的HTML（保留整个文档结构，只清理了header内部）
    return doc.documentElement.outerHTML;
  } catch (error) {
    addLog(`处理HTML失败: ${error}`);
    return html; // 出错时返回原始HTML
  }
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

    // 包装HTML为完整文档
    const fullHtml = wrapHtml(html);
    
    doc.open();
    doc.write(fullHtml);
    doc.close();

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const canvas = await html2canvas(iframe.contentDocument!.body, {
      width: 1280,
      height: 720,
      scale: 1,
      useCORS: true,
      logging: false,
    });

    return canvas.toDataURL("image/png");
  } finally {
    document.body.removeChild(iframe);
  }
}

// 包装HTML为完整文档
function wrapHtml(html: string): string {
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

// 选择Excel文件
function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    excelFile.value = file;
    sourceExcelFileName.value = file.name || "";
    addLog(`已选择文件: ${file.name}`);
  }
}

// 读取Excel文件
async function loadExcelFile(): Promise<{ workbook: XLSX.WorkBook; exceljsWorkbook: ExcelJS.Workbook }> {
  try {
    let arrayBuffer: ArrayBuffer;
    
    // 如果用户选择了文件，使用选择的文件
    if (excelFile.value) {
      arrayBuffer = await excelFile.value.arrayBuffer();
      sourceExcelFileName.value = excelFile.value.name || sourceExcelFileName.value;

    } else {
      // 尝试从assets目录读取文件（尝试多个路径）
      let response: Response | null = null;
      const paths = [
        "/assets/HTML单页生成评测原始语料集合gemini-精选.xlsx",
        "/HTML单页生成评测原始语料集合gemini-精选.xlsx",
      ];//不上传文件时直接预览和修复的文件路径
      let usedPath = "";
      
      for (const path of paths) {
        try {
          response = await fetch(path);
          if (response.ok) {
            usedPath = path;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!response || !response.ok) {
        throw new Error("无法自动加载Excel文件，请先选择文件");
      }
      
      arrayBuffer = await response.arrayBuffer();
      // 记录默认读取的文件名，用于导出命名
      if (usedPath) {
        sourceExcelFileName.value = usedPath.split("/").pop() || sourceExcelFileName.value;
      }
    }
    
    // 读取XLSX格式（用于数据读取）
    const binaryString = Array.from(new Uint8Array(arrayBuffer))
      .map((b) => String.fromCharCode(b))
      .join("");
    const workbook = XLSX.read(binaryString, { type: "binary" });
    
    // 读取ExcelJS格式（用于图片插入和写入）
    const exceljsWorkbook = new ExcelJS.Workbook();
    await exceljsWorkbook.xlsx.load(arrayBuffer);
    
    return { workbook, exceljsWorkbook };
  } catch (error) {
    throw new Error(`读取Excel文件失败: ${error}`);
  }
}

// 停止处理
function stopProcessing() {
  if (!isProcessing.value) return;
  shouldStop.value = true;
  addLog("\n⚠️ 用户请求停止处理...");
}

// 获取 Excel 文件中的所有 Sheet 名称
async function getSheetNames(): Promise<string[]> {
  try {
    const { workbook } = await loadExcelFile();
    return workbook.SheetNames;
  } catch (error) {
    addLog(`获取Sheet列表失败: ${error}`);
    return [];
  }
}

// 显示 Sheet 选择弹窗
async function showSheetSelection(action: "preview" | "fixAll" | "fixUnprocessed") {
  if (isProcessing.value) return;
  
  logs.value = [];
  addLog("正在读取Sheet列表...");
  
  const sheets = await getSheetNames();
  if (sheets.length === 0) {
    addLog("未找到可用的Sheet，请先选择Excel文件");
    alert("未找到可用的Sheet，请先选择Excel文件");
    return;
  }
  
  availableSheets.value = sheets;
  // 默认选择第1个 sheet
  selectedSheet.value = sheets[0];
  pendingAction.value = action;
  showSheetSelector.value = true;
  
  addLog(`找到 ${sheets.length} 个Sheet: ${sheets.join(", ")}`);
}

// 确认选择 Sheet 并执行操作
async function confirmSheetSelection() {
  showSheetSelector.value = false;
  
  if (!selectedSheet.value || !pendingAction.value) {
    return;
  }
  
  const action = pendingAction.value;
  pendingAction.value = null;
  
  switch (action) {
    case "preview":
      await doStartPreview(selectedSheet.value);
      break;
    case "fixAll":
      await doStartFix(selectedSheet.value, false);
      break;
    case "fixUnprocessed":
      await doStartFix(selectedSheet.value, true);
      break;
  }
}

// 取消选择
function cancelSheetSelection() {
  showSheetSelector.value = false;
  pendingAction.value = null;
  logs.value = [];
}

// 开始预览（入口）
function startPreview() {
  showSheetSelection("preview");
}

// 开始修复（入口）
function startFix(onlyUnprocessed: boolean = false) {
  showSheetSelection(onlyUnprocessed ? "fixUnprocessed" : "fixAll");
}

// 开始预览：读取Excel中的修复前后HTML并显示预览
async function doStartPreview(sheetName: string) {
  if (isProcessing.value) return;
  
  isProcessing.value = true;
  fixResults.value = [];
  currentPreviewIndex.value = 0;
  
  try {
    addLog("开始加载Excel文件...");
    const { workbook } = await loadExcelFile();
    addLog("Excel文件加载成功");
    
    // 使用用户选择的 sheet
    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
    
    // 使用用户选择的列
    const colOriginal = colLetterToIndex(selectedOriginalCol.value); // 原始HTML列
    const colFixed = colLetterToIndex(selectedFixedCol.value);       // 修复后HTML列
    
    addLog(`使用列配置：原始HTML=${selectedOriginalCol.value}列，最新HTML=${selectedFixedCol.value}列`);
    
    // 找到修复后HTML列有数据的最后一行（预览以该列为准）
    let lastRow = 0;
    for (let row = range.e.r; row >= 1; row--) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: colFixed });
      const cell = sheet[cellAddress];
      if (cell && cell.v && typeof cell.v === "string" && cell.v.trim()) {
        lastRow = row;
        break;
      }
    }
    
    if (lastRow === 0) {
      addLog(`${selectedFixedCol.value}列没有数据，无法预览`);
      return;
    }
    
    // 先统计有效数据条数（原始列和修复列都有内容）
    let totalCount = 0;
    for (let row = 1; row <= lastRow; row++) {
      const cellAddressOriginal = XLSX.utils.encode_cell({ r: row, c: colOriginal });
      const cellOriginal = sheet[cellAddressOriginal];
      const cellAddressFixed = XLSX.utils.encode_cell({ r: row, c: colFixed });
      const cellFixed = sheet[cellAddressFixed];
      
      const hasOriginal = cellOriginal && cellOriginal.v && typeof cellOriginal.v === "string" && cellOriginal.v.trim();
      const hasFixed = cellFixed && cellFixed.v && typeof cellFixed.v === "string" && cellFixed.v.trim();
      
      if (hasOriginal && hasFixed) {
        totalCount++;
      }
    }
    
    if (totalCount === 0) {
      addLog(`未找到可预览的数据（需要${selectedOriginalCol.value}列和${selectedFixedCol.value}列都有内容）`);
      return;
    }
    
    progress.value = { current: 0, total: totalCount };
    addLog(`正在读取工作表: ${sheetName}，共 ${totalCount} 条可预览数据...`);
    
    const previewResults: FixResultItem[] = [];
    
    for (let row = 1; row <= lastRow; row++) {
      // 读取原始HTML列
      const cellAddressOriginal = XLSX.utils.encode_cell({ r: row, c: colOriginal });
      const cellOriginal = sheet[cellAddressOriginal];
      
      // 读取修复后HTML列
      const cellAddressFixed = XLSX.utils.encode_cell({ r: row, c: colFixed });
      const cellFixed = sheet[cellAddressFixed];
      
      // 如果两列都有内容，才添加到预览列表
      const originalHtml = cellOriginal && cellOriginal.v && typeof cellOriginal.v === "string" ? cellOriginal.v.trim() : "";
      const fixedHtml = cellFixed && cellFixed.v && typeof cellFixed.v === "string" ? cellFixed.v.trim() : "";
      
      if (originalHtml && fixedHtml) {
        // 直接添加预览数据，不需要生成截图
        previewResults.push({
          rowIndex: row,
          originalHtml,
          fixedHtml,
          previewImage: "", // 预览模式下不需要截图
        });
        
        progress.value = { current: previewResults.length, total: totalCount };
        addLog(`第 ${row + 1} 行：预览数据已加载`);
      }
    }
    
    fixResults.value = previewResults;
    
    if (previewResults.length > 0) {
      currentPreviewIndex.value = 0;
      addLog(`预览加载完成！共加载 ${previewResults.length} 条数据`);
    }
  } catch (error) {
    addLog(`预览加载失败: ${error}`);
    alert(`预览加载失败: ${error}`);
  } finally {
    isProcessing.value = false;
  }
}

// 保存Excel文件并下载
async function downloadExcelFile(exceljsWorkbook: ExcelJS.Workbook) {
  try {
    addLog("正在导出Excel文件...");
    const buffer = await exceljsWorkbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = buildOutputFileName(sourceExcelFileName.value || excelFile.value?.name || "");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog("Excel文件已下载");
  } catch (error) {
    addLog(`导出文件失败: ${error}`);
    alert(`导出文件失败: ${error}`);
  }
}


// 开始修复（实际执行）
async function doStartFix(sheetName: string, onlyUnprocessed: boolean = false) {
  if (isProcessing.value) return;
  
  isProcessing.value = true;
  shouldStop.value = false; // 重置停止标志
  fixResults.value = [];
  currentPreviewIndex.value = 0;
  
  try {
    addLog("开始加载Excel文件...");
    const { workbook, exceljsWorkbook } = await loadExcelFile();
    currentWorkbook.value = exceljsWorkbook; // 保存工作簿引用，用于后续下载
    addLog("Excel文件加载成功");
    
    // 使用用户选择的 sheet
    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
    
    // 使用用户选择的列
    const colOriginal = colLetterToIndex(selectedOriginalCol.value); // 原始HTML列
    const colFixed = colLetterToIndex(selectedFixedCol.value);       // 修复后HTML列
    const colImage = colLetterToIndex(selectedImageCol.value);       // 预览图片列
    
    addLog(`使用列配置：原始HTML=${selectedOriginalCol.value}列，修复后HTML=${selectedFixedCol.value}列，预览图片=${selectedImageCol.value}列`);
    
    // 获取对应的 worksheet 用于写入 (确保与读取的 sheet 一致)
    const worksheet = exceljsWorkbook.getWorksheet(sheetName);
    if (!worksheet) {
      throw new Error(`无法获取工作表: ${sheetName}`);
    }
    
    // 找到原始HTML列有数据的最后一行
    let lastRow = 0;
    for (let row = range.e.r; row >= 1; row--) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: colOriginal });
      const cell = sheet[cellAddress];
      if (cell && cell.v && typeof cell.v === "string" && cell.v.trim()) {
        lastRow = row;
        break;
      }
    }
    
    if (lastRow === 0) {
      addLog(`${selectedOriginalCol.value}列没有数据，无法修复`);
      return;
    }
    
    // 先统计原始HTML列有数据的总条数
    let totalCount = 0;
    for (let row = 1; row <= lastRow; row++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: colOriginal });
      const cell = sheet[cellAddress];
      if (cell && cell.v && typeof cell.v === "string" && cell.v.trim()) {
        totalCount++;
      }
    }
    
    progress.value = { current: 0, total: totalCount };
    
    addLog(`正在处理工作表: ${sheetName}，共 ${totalCount} 条数据`);
    if (onlyUnprocessed) {
      addLog("开始处理未修复的模板...");
    } else {
      addLog(`开始处理 ${totalCount} 条数据...`);
    }
    
    let processedCount = 0;
    let skippedCount = 0;
    let currentCount = 0; // 当前处理进度
    
    for (let row = 1; row <= lastRow; row++) {
      // 检查是否应该停止
      if (shouldStop.value) {
        addLog(`\n⚠️ 处理已停止，当前已完成 ${currentCount} / ${totalCount} 条`);
        addLog("提示：可以点击\"下载文件\"按钮导出当前进度");
        return;
      }
      
      // 读取原始HTML列
      const cellAddressOriginal = XLSX.utils.encode_cell({ r: row, c: colOriginal });
      const cellOriginal = sheet[cellAddressOriginal];
      
      // 跳过原始HTML列为空的行
      if (!cellOriginal || !cellOriginal.v || typeof cellOriginal.v !== "string" || !cellOriginal.v.trim()) {
        continue;
      }
      
      // 更新进度
      currentCount++;
      progress.value = { current: currentCount, total: totalCount };
      
      // 如果只处理未修复的模板，检查修复后HTML列和图片列是否已有内容
      if (onlyUnprocessed) {
        const cellAddressFixed = XLSX.utils.encode_cell({ r: row, c: colFixed });
        const cellFixed = sheet[cellAddressFixed];
        
        // 检查修复后HTML列是否有文本内容
        const hasFixedContent = cellFixed && cellFixed.v && typeof cellFixed.v === "string" && cellFixed.v.trim().length > 0;
        
        // 检查图片列是否有图片（通过检查worksheet中是否有图片或行高）
        let hasImage = false;
        try {
          const cellImageObj = worksheet.getCell(row + 1, colImage + 1);
          // 如果单元格有值，或者行高大于50（通常有图片的行会设置行高），认为已处理
          if (cellImageObj.value || (worksheet.getRow(row + 1).height && worksheet.getRow(row + 1).height > 50)) {
            hasImage = true;
          }
        } catch (e) {
          // 忽略错误
        }
        
        // 如果修复后HTML列有文本且图片列有图片，跳过这一行
        if (hasFixedContent && hasImage) {
          skippedCount++;
          continue;
        }
      }
      
      const originalHtml = cellOriginal.v.trim();
      
      addLog(`处理第 ${row + 1} 行...`);
      
      try {
        // 处理HTML
        const fixedHtml = processHtml(originalHtml);
        
        // 生成预览截图
        addLog(`第 ${row + 1} 行：生成预览截图...`);
        const previewImage = await htmlToPng(fixedHtml);
        
        // 写入修复后HTML列
        const cellFixedOut = worksheet.getCell(row + 1, colFixed + 1);
        cellFixedOut.value = fixedHtml;
        
        // 写入图片列（预览截图）
        await insertPngToExcel(exceljsWorkbook, worksheet, row, colImage, previewImage);
        
        // 保存结果用于预览
        fixResults.value.push({
          rowIndex: row,
          originalHtml,
          fixedHtml,
          previewImage,
        });
        
        processedCount++;
        addLog(`第 ${row + 1} 行：处理完成`);
      } catch (error) {
        addLog(`第 ${row + 1} 行：处理失败 - ${error}`);
      }
    }
    
    if (onlyUnprocessed) {
      addLog(`\n处理完成！共处理 ${processedCount} 条，跳过 ${skippedCount} 条已修复的模板`);
    }
    
    // 处理完成
    if (!shouldStop.value) {
      addLog("处理完成！可以点击\"下载文件\"按钮导出结果");
    }
    
    // 如果有结果，显示第一个预览
    if (fixResults.value.length > 0) {
      currentPreviewIndex.value = 0;
    }
  } catch (error) {
    addLog(`处理失败: ${error}`);
    alert(`处理失败: ${error}`);
  } finally {
    isProcessing.value = false;
  }
}

// 将PNG插入Excel
async function insertPngToExcel(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  row: number,
  col: number,
  pngBase64: string
): Promise<void> {
  try {
    // 将base64转换为Uint8Array
    const base64Data = pngBase64.replace(/^data:image\/png;base64,/, "");
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 添加图片到workbook（ExcelJS在浏览器中可以直接使用Uint8Array）
    const imageId = workbook.addImage({
      buffer: bytes.buffer,
      extension: "png",
    });

    // 设置行高和列宽以适应图片
    worksheet.getRow(row + 1).height = 120;
    worksheet.getColumn(col + 1).width = 20;

    // 插入图片
    worksheet.addImage(imageId, {
      tl: { col: col, row: row },
      ext: { width: 256, height: 144 }, // 缩略图尺寸
    });
  } catch (error) {
    addLog(`插入图片失败: ${error}`);
    // 如果插入失败，在单元格中存储文本标记
    const cell = worksheet.getCell(row + 1, col + 1);
    cell.value = "[预览图片]";
  }
}

// 上一张
function prevPreview() {
  if (currentPreviewIndex.value > 0) {
    currentPreviewIndex.value--;
  }
}

// 下一张
function nextPreview() {
  if (currentPreviewIndex.value < fixResults.value.length - 1) {
    currentPreviewIndex.value++;
  }
}

// 复制修复后的HTML到剪贴板（从iframe中获取最新的HTML）
async function copyFixedHtml() {
  if (!currentPreview.value || !fixedHtmlIframeRef.value) return;
  
  try {
    const iframe = fixedHtmlIframeRef.value;
    
    if (!iframe.contentDocument) {
      throw new Error("无法访问iframe内容");
    }
    
    // 从iframe中获取当前的HTML内容（包括可能的修改）
    const iframeDoc = iframe.contentDocument;
    const html = iframeDoc.documentElement.outerHTML;
    
    await navigator.clipboard.writeText(html);
    addLog("修复后的HTML（iframe最新内容）已复制到剪贴板");
    // 显示成功提示
    // alert("修复后的HTML（iframe最新内容）已复制到剪贴板！");
  } catch (error) {
    addLog(`复制失败: ${error}`);
    // 如果clipboard API失败，使用备用方法
    try {
      const iframe = fixedHtmlIframeRef.value;
      
      if (!iframe || !iframe.contentDocument) {
        throw new Error("无法访问iframe内容");
      }
      
      const iframeDoc = iframe.contentDocument;
      const html = iframeDoc.documentElement.outerHTML;
      
      const textArea = document.createElement("textarea");
      textArea.value = html;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      addLog("修复后的HTML（iframe最新内容）已复制到剪贴板（备用方法）");
    //   alert("修复后的HTML（iframe最新内容）已复制到剪贴板！");
    } catch (fallbackError) {
      addLog(`复制失败（备用方法）: ${fallbackError}`);
      alert(`复制失败: ${fallbackError}`);
    }
  }
}

// 复制修复后的图片到剪贴板
async function copyFixedImage() {
  if (!currentPreview.value || !fixedHtmlIframeRef.value) return;
  
  try {
    const iframe = fixedHtmlIframeRef.value;
    
    if (!iframe.contentDocument || !iframe.contentDocument.body) {
      throw new Error("无法访问iframe内容");
    }
    
    addLog("正在生成图片...");
    
    
    // 使用 html2canvas 将 iframe 内容转换为 canvas
    const canvas = await html2canvas(iframe.contentDocument.body, {
      width: 1280,
      height: 720,
      scale: 1,
      useCORS: true,
      logging: false,
    });
    
    // 将 canvas 转换为 Blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("无法生成图片Blob"));
        }
      }, "image/png");
    });
    
    // 使用 Clipboard API 复制图片到剪贴板
    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": blob,
      }),
    ]);
    
    addLog("修复后的图片已复制到剪贴板");
  } catch (error) {
    addLog(`复制图片失败: ${error}`);
    alert(`复制图片失败: ${error}`);
  }
}

// 当前预览项
const currentPreview = computed(() => {
  return fixResults.value[currentPreviewIndex.value] || null;
});

// 处理HTML文件夹选择
function handleHtmlFolderSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!files || files.length === 0) {
    htmlFilesList.value = [];
    return;
  }

  htmlFilesList.value = [];
  
  // 将所有HTML文件存储到数组中（按文件名排序）
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.type === 'text/html' || file.name.toLowerCase().endsWith('.html')) {
      htmlFilesList.value.push(file);
    }
  }
  
  // 按文件名排序
  htmlFilesList.value.sort((a, b) => a.name.localeCompare(b.name));
  
  addLog(`已选择HTML文件夹，包含 ${htmlFilesList.value.length} 个HTML文件`);
}

// 触发HTML文件夹选择
function triggerHtmlFolderSelect() {
  htmlFolderInput.value?.click();
}

// 读取HTML文件内容
async function readHtmlFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content === 'string') {
        resolve(content);
      } else {
        reject(new Error('无法读取文件内容'));
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

// 爆版检测功能
async function checkLayoutIssues() {
  if (isCheckingLayout.value || isProcessing.value) return;
  
  if (!excelFile.value) {
    alert("请先选择Excel文件");
    return;
  }
  
  isCheckingLayout.value = true;
  shouldStop.value = false;
  
  try {
    addLog("开始加载Excel文件...");
    const { workbook, exceljsWorkbook } = await loadExcelFile();
    currentWorkbook.value = exceljsWorkbook;
    addLog("Excel文件加载成功");
    
    // 获取第一个sheet（或用户选择的sheet）
    const sheetName = selectedSheet.value || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
    
    const worksheet = exceljsWorkbook.getWorksheet(sheetName);
    if (!worksheet) {
      throw new Error(`无法获取工作表: ${sheetName}`);
    }
    
    const colResult = colLetterToIndex(selectedResultCol.value);
    const colImage = selectedLayoutImageCol.value ? colLetterToIndex(selectedLayoutImageCol.value) : null;
    
    // 创建隐藏的iframe用于检测
    const iframe = document.createElement("iframe");
    iframe.style.position = "absolute";
    iframe.style.left = "-9999px";
    iframe.style.width = "1280px";
    iframe.style.height = "720px";
    document.body.appendChild(iframe);
    
    let processedCount = 0;
    let totalCount = 0;
    
    if (useFolderMode.value) {
      // 文件夹模式：从文件夹读取HTML文件，写入Excel列，然后检测
      if (htmlFilesList.value.length === 0) {
        alert("请先选择HTML文件夹");
        return;
      }
      
      const colHtmlOutput = colLetterToIndex(selectedHtmlOutputCol.value);
      addLog(`开始检测爆版（文件夹模式）：HTML输出列=${selectedHtmlOutputCol.value}，结果列=${selectedResultCol.value}`);
      
      // 先将HTML文件内容写入Excel列
      addLog(`正在将 ${htmlFilesList.value.length} 个HTML文件写入Excel的${selectedHtmlOutputCol.value}列...`);
      for (let i = 0; i < htmlFilesList.value.length; i++) {
        const htmlFile = htmlFilesList.value[i];
        const excelRow = i + 2; // 从第2行开始（第1行是表头）
        
        try {
          const htmlContent = await readHtmlFile(htmlFile);
          const htmlCell = worksheet.getCell(excelRow, colHtmlOutput + 1);
          htmlCell.value = htmlContent;
          addLog(`[行${excelRow}] 已写入HTML文件: ${htmlFile.name}`);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          addLog(`[行${excelRow}] 写入HTML文件失败: ${errMsg}`);
        }
      }
      
      addLog(`HTML文件已全部写入Excel，开始检测...`);
      
      // 统计需要检测的行数（有HTML内容的行）
      totalCount = htmlFilesList.value.length;
      
      addLog(`共找到 ${totalCount} 条HTML数据，开始检测...`);
      progress.value = { current: 0, total: totalCount };
      
      // 遍历每一行，检测HTML（从第2行开始，第1行是表头）
      for (let i = 0; i < htmlFilesList.value.length; i++) {
        if (shouldStop.value) {
          addLog("用户停止检测");
          break;
        }
        
        const row = i + 1; // Excel行索引（0-based，包含表头）
        const excelRow = row + 1; // Excel行号（1-based）
        
        // 从worksheet读取HTML内容
        const htmlCell = worksheet.getCell(excelRow, colHtmlOutput + 1);
        if (!htmlCell || !htmlCell.value || typeof htmlCell.value !== "string" || !htmlCell.value.trim()) {
          continue;
        }
        
        const htmlContent = htmlCell.value.trim();
        processedCount++;
        progress.value = { current: processedCount, total: totalCount };
        
        addLog(`[行${excelRow}] 正在检测...`);
        
        try {
          // 将HTML加载到iframe中
          iframe.srcdoc = htmlContent;
          
          // 等待iframe加载完成
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error("iframe加载超时"));
            }, 5000);
            
            iframe.onload = () => {
              clearTimeout(timeout);
              setTimeout(() => {
                resolve();
              }, 100);
            };
            
            iframe.onerror = () => {
              clearTimeout(timeout);
              reject(new Error("iframe加载失败"));
            };
          });
          
          // 检测爆版
          const checkResult = checkLayoutInIframe(iframe);
        
          // 辅助函数：查找元素在HTML源代码中的行号
          function findElementLineInHtml(html: string, selector: string | undefined): number | null {
            if (!selector || !iframe.contentDocument) return null;
          
          try {
            const doc = iframe.contentDocument;
            const element = doc.querySelector(selector);
            if (!element) return null;
            
            // 获取元素的唯一标识信息
            const tagName = element.tagName.toLowerCase();
            const id = element.id;
            const className = element.className && typeof element.className === 'string' 
              ? element.className.split(' ').filter(c => c).join('.')
              : '';
            const textContent = element.textContent?.trim().substring(0, 30) || '';
            
            // 在原始HTML中查找元素
            const lines = html.split('\n');
            
            // 方法1: 如果有ID，直接查找ID
            if (id) {
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes(`id="${id}"`) || lines[i].includes(`id='${id}'`)) {
                  return i + 1;
                }
              }
            }
            
            // 方法2: 查找包含标签名和类名的行
            if (className) {
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.includes(`<${tagName}`) && line.includes(className.split('.')[0])) {
                  return i + 1;
                }
              }
            }
            
            // 方法3: 查找包含标签名和文本内容的行
            if (textContent) {
              const searchText = textContent.substring(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.includes(`<${tagName}`) && new RegExp(searchText, 'i').test(line)) {
                  return i + 1;
                }
              }
            }
            
            // 方法4: 只查找标签名（最后的手段）
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(`<${tagName}`)) {
                return i + 1;
              }
            }
          } catch (e) {
            // 忽略错误
          }
          
          return null;
        }
        
        // 生成爆版信息文本
        let resultText = "";
        if (checkResult.passed) {
          resultText = "✓ 无爆版";
        } else {
          const errorCount = checkResult.summary.errors;
          const warningCount = checkResult.summary.warnings;
          resultText = `✗ 爆版（错误:${errorCount}，警告:${warningCount}）\n`;
          
          // 添加详细信息，按严重程度排序（错误优先）
          const sortedIssues = [...checkResult.issues].sort((a, b) => {
            const severityOrder = { error: 0, warning: 1, info: 2 };
            return severityOrder[a.severity] - severityOrder[b.severity];
          });
          
          sortedIssues.forEach((issue, index) => {
            // 查找元素在HTML中的行号
            const lineNumber = findElementLineInHtml(htmlContent, issue.selector);
            
            // 构建详细信息
            let detailLine = `\n[${index + 1}] `;
            
            // 严重程度
            if (issue.severity === "error") {
              detailLine += "【错误】";
            } else if (issue.severity === "warning") {
              detailLine += "【警告】";
            } else {
              detailLine += "【提示】";
            }
            
            // 错误类型
            const typeMap: Record<string, string> = {
              'overflow': '内容溢出',
              'scrollbar': '滚动条',
              'truncation': '文本截断',
              'hidden-content': '内容隐藏',
              'empty': '空内容',
              'overlap': '元素重叠'
            };
            detailLine += ` ${typeMap[issue.type] || issue.type}`;
            
            // 元素信息
            detailLine += `\n  元素: ${issue.element}`;
            
            // 选择器
            if (issue.selector) {
              detailLine += `\n  选择器: ${issue.selector}`;
            }
            
            // 行号
            if (lineNumber) {
              detailLine += `\n  代码行号: 第${lineNumber}行`;
            }
            
            // 错误消息
            detailLine += `\n  问题: ${issue.message}`;
            
            // 详细信息
            if (issue.details) {
              detailLine += `\n  详情: ${issue.details}`;
            }
            
            // 元素位置（如果有）
            if (issue.rect) {
              detailLine += `\n  位置: (${Math.round(issue.rect.left)}, ${Math.round(issue.rect.top)}) 尺寸: ${Math.round(issue.rect.width)}×${Math.round(issue.rect.height)}`;
            }
            
            resultText += detailLine;
          });
        }
        
          // 写入Excel（文件夹模式中excelRow已经定义）
          const resultCell = worksheet.getCell(excelRow, colResult + 1);
          resultCell.value = resultText;
          
          // 如果配置了图片输出列，生成并插入图片
          if (colImage !== null) {
            try {
              addLog(`[行${excelRow}] 正在生成HTML图片...`);
              const pngBase64 = await htmlToPng(htmlContent);
              await insertPngToExcel(exceljsWorkbook, worksheet, excelRow - 1, colImage, pngBase64);
              addLog(`[行${excelRow}] ✓ 图片已插入`);
            } catch (imgError) {
              const imgErrMsg = imgError instanceof Error ? imgError.message : String(imgError);
              addLog(`[行${excelRow}] 图片生成失败: ${imgErrMsg}`);
            }
          }
          
          if (checkResult.passed) {
            addLog(`[行${excelRow}] ✓ 无爆版`);
          } else {
            addLog(`[行${excelRow}] ✗ 爆版：${checkResult.summary.errors}个错误，${checkResult.summary.warnings}个警告`);
          }
          
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          addLog(`[行${excelRow}] 检测失败: ${errMsg}`);
          
          // 写入错误信息
          const resultCell = worksheet.getCell(excelRow, colResult + 1);
          resultCell.value = `检测失败: ${errMsg}`;
        }
      }
      
    } else {
      // Excel列模式：从Excel列读取HTML
      const colHtml = colLetterToIndex(selectedHtmlColForCheck.value);
      addLog(`开始检测爆版（Excel列模式）：HTML列=${selectedHtmlColForCheck.value}，结果列=${selectedResultCol.value}`);
      
      // 找到有数据的最后一行
      let lastRow = 0;
      for (let row = range.e.r; row >= 1; row--) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: colHtml });
        const cell = sheet[cellAddress];
        if (cell && cell.v && typeof cell.v === "string" && cell.v.trim()) {
          lastRow = row;
          break;
        }
      }
      
      if (lastRow === 0) {
        addLog(`${selectedHtmlColForCheck.value}列没有数据`);
        return;
      }
      
      // 统计总数
      for (let row = 1; row <= lastRow; row++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: colHtml });
        const cell = sheet[cellAddress];
        if (cell && cell.v && typeof cell.v === "string" && cell.v.trim()) {
          totalCount++;
        }
      }
      
      addLog(`共找到 ${totalCount} 条HTML数据，开始检测...`);
      progress.value = { current: 0, total: totalCount };
      
      // 遍历每一行
      for (let row = 1; row <= lastRow; row++) {
        if (shouldStop.value) {
          addLog("用户停止检测");
          break;
        }
        
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: colHtml });
        const cell = sheet[cellAddress];
        
        if (!cell || !cell.v || typeof cell.v !== "string" || !cell.v.trim()) {
          continue;
        }
        
        const htmlContent = cell.v.trim();
        processedCount++;
        progress.value = { current: processedCount, total: totalCount };
        
        addLog(`[行${row + 1}] 正在检测...`);
        
        try {
          // 将HTML加载到iframe中
          iframe.srcdoc = htmlContent;
          
          // 等待iframe加载完成
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error("iframe加载超时"));
            }, 5000);
            
            iframe.onload = () => {
              clearTimeout(timeout);
              setTimeout(() => {
                resolve();
              }, 100);
            };
            
            iframe.onerror = () => {
              clearTimeout(timeout);
              reject(new Error("iframe加载失败"));
            };
          });
          
          // 检测爆版
          const checkResult = checkLayoutInIframe(iframe);
          
          // 辅助函数：查找元素在HTML源代码中的行号
          function findElementLineInHtml(html: string, selector: string | undefined): number | null {
            if (!selector || !iframe.contentDocument) return null;
            
            try {
              const doc = iframe.contentDocument;
              const element = doc.querySelector(selector);
              if (!element) return null;
              
              // 获取元素的唯一标识信息
              const tagName = element.tagName.toLowerCase();
              const id = element.id;
              const className = element.className && typeof element.className === 'string' 
                ? element.className.split(' ').filter(c => c).join('.')
                : '';
              const textContent = element.textContent?.trim().substring(0, 30) || '';
              
              // 在原始HTML中查找元素
              const lines = html.split('\n');
              
              // 方法1: 如果有ID，直接查找ID
              if (id) {
                for (let i = 0; i < lines.length; i++) {
                  if (lines[i].includes(`id="${id}"`) || lines[i].includes(`id='${id}'`)) {
                    return i + 1;
                  }
                }
              }
              
              // 方法2: 查找包含标签名和类名的行
              if (className) {
                for (let i = 0; i < lines.length; i++) {
                  const line = lines[i];
                  if (line.includes(`<${tagName}`) && line.includes(className.split('.')[0])) {
                    return i + 1;
                  }
                }
              }
              
              // 方法3: 查找包含标签名和文本内容的行
              if (textContent) {
                const searchText = textContent.substring(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                for (let i = 0; i < lines.length; i++) {
                  const line = lines[i];
                  if (line.includes(`<${tagName}`) && new RegExp(searchText, 'i').test(line)) {
                    return i + 1;
                  }
                }
              }
              
              // 方法4: 只查找标签名（最后的手段）
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes(`<${tagName}`)) {
                  return i + 1;
                }
              }
            } catch (e) {
              // 忽略错误
            }
            
            return null;
          }
          
          // 生成爆版信息文本
          let resultText = "";
          if (checkResult.passed) {
            resultText = "✓ 无爆版";
          } else {
            const errorCount = checkResult.summary.errors;
            const warningCount = checkResult.summary.warnings;
            resultText = `✗ 爆版（错误:${errorCount}，警告:${warningCount}）\n`;
            
            // 添加详细信息，按严重程度排序（错误优先）
            const sortedIssues = [...checkResult.issues].sort((a, b) => {
              const severityOrder = { error: 0, warning: 1, info: 2 };
              return severityOrder[a.severity] - severityOrder[b.severity];
            });
            
            sortedIssues.forEach((issue, index) => {
              // 查找元素在HTML中的行号
              const lineNumber = findElementLineInHtml(htmlContent, issue.selector);
              
              // 构建详细信息
              let detailLine = `\n[${index + 1}] `;
              
              // 严重程度
              if (issue.severity === "error") {
                detailLine += "【错误】";
              } else if (issue.severity === "warning") {
                detailLine += "【警告】";
              } else {
                detailLine += "【提示】";
              }
              
              // 错误类型
              const typeMap: Record<string, string> = {
                'overflow': '内容溢出',
                'scrollbar': '滚动条',
                'truncation': '文本截断',
                'hidden-content': '内容隐藏',
                'empty': '空内容',
                'overlap': '元素重叠'
              };
              detailLine += ` ${typeMap[issue.type] || issue.type}`;
              
              // 元素信息
              detailLine += `\n  元素: ${issue.element}`;
              
              // 选择器
              if (issue.selector) {
                detailLine += `\n  选择器: ${issue.selector}`;
              }
              
              // 行号
              if (lineNumber) {
                detailLine += `\n  代码行号: 第${lineNumber}行`;
              }
              
              // 错误消息
              detailLine += `\n  问题: ${issue.message}`;
              
              // 详细信息
              if (issue.details) {
                detailLine += `\n  详情: ${issue.details}`;
              }
              
              // 元素位置（如果有）
              if (issue.rect) {
                detailLine += `\n  位置: (${Math.round(issue.rect.left)}, ${Math.round(issue.rect.top)}) 尺寸: ${Math.round(issue.rect.width)}×${Math.round(issue.rect.height)}`;
              }
              
              resultText += detailLine;
            });
          }
          
          // 写入Excel
          const excelRow = row + 1;
          const resultCell = worksheet.getCell(excelRow, colResult + 1);
          resultCell.value = resultText;
          
          // 如果配置了图片输出列，生成并插入图片
          if (colImage !== null) {
            try {
              addLog(`[行${row + 1}] 正在生成HTML图片...`);
              const pngBase64 = await htmlToPng(htmlContent);
              await insertPngToExcel(exceljsWorkbook, worksheet, excelRow - 1, colImage, pngBase64);
              addLog(`[行${row + 1}] ✓ 图片已插入`);
            } catch (imgError) {
              const imgErrMsg = imgError instanceof Error ? imgError.message : String(imgError);
              addLog(`[行${row + 1}] 图片生成失败: ${imgErrMsg}`);
            }
          }
          
          if (checkResult.passed) {
            addLog(`[行${row + 1}] ✓ 无爆版`);
          } else {
            addLog(`[行${row + 1}] ✗ 爆版：${checkResult.summary.errors}个错误，${checkResult.summary.warnings}个警告`);
          }
          
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          addLog(`[行${row + 1}] 检测失败: ${errMsg}`);
          
          // 写入错误信息
          const excelRow = row + 1;
          const resultCell = worksheet.getCell(excelRow, colResult + 1);
          resultCell.value = `检测失败: ${errMsg}`;
        }
      }
    }
    
    // 清理iframe
    document.body.removeChild(iframe);
    
    addLog(`检测完成！共处理 ${processedCount} 条数据`);
    
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    addLog(`检测过程出错: ${errMsg}`);
    alert(`检测失败: ${errMsg}`);
  } finally {
    isCheckingLayout.value = false;
    progress.value = { current: 0, total: 0 };
  }
}
</script>

<template>
  <div class="template-fix-page">
    <div class="header">
      <h1>🔧 模板修复工具</h1>
      <div class="header-actions">
        <label class="file-select-label">
          <input
            type="file"
            accept=".xlsx"
            @change="handleFileSelect"
            :disabled="isProcessing"
            style="display: none"
          />
          <span class="file-select-btn">选择Excel文件</span>
        </label>
        <button
          v-if="!isProcessing"
          class="preview-btn"
          @click="startPreview"
        >
          开始预览
        </button>
        <button
          v-if="!isProcessing"
          class="start-btn"
          @click="() => startFix(false)"
        >
          修复全部模板
        </button>
        <button
          v-if="!isProcessing"
          class="start-btn-unprocessed"
          @click="() => startFix(true)"
        >
          仅修复未处理模板
        </button>
        <button
          v-else
          class="stop-btn"
          @click="stopProcessing"
        >
          停止处理
        </button>
        <button
          class="download-btn"
          :disabled="!currentWorkbook || isProcessing"
          @click="downloadExcelFile(currentWorkbook!)"
        >
          下载修复后的表格
        </button>
        <button
          v-if="!isCheckingLayout"
          class="check-layout-btn"
          :disabled="isProcessing || !excelFile"
          @click="checkLayoutIssues"
        >
          检测爆版
        </button>
        <button
          v-else
          class="stop-btn"
          @click="shouldStop = true"
        >
          停止检测
        </button>
      </div>
    </div>

    <div class="content">
      <!-- 爆版检测配置 -->
      <div class="config-section" v-if="excelFile">
        <h3>爆版检测配置</h3>
        
        <!-- 模式选择 -->
        <div class="config-group">
          <div class="config-item">
            <label class="config-label">
              <input
                type="radio"
                v-model="useFolderMode"
                :value="false"
                :disabled="isCheckingLayout || isProcessing"
                style="margin-right: 8px;"
              />
              从Excel列读取HTML
            </label>
          </div>
          <div class="config-item">
            <label class="config-label">
              <input
                type="radio"
                v-model="useFolderMode"
                :value="true"
                :disabled="isCheckingLayout || isProcessing"
                style="margin-right: 8px;"
              />
              从文件夹读取HTML
            </label>
          </div>
        </div>
        
        <!-- Excel列模式配置 -->
        <div v-if="!useFolderMode" class="config-group">
          <div class="config-item">
            <label class="config-label">要检测的HTML列：</label>
            <select v-model="selectedHtmlColForCheck" class="config-select" :disabled="isCheckingLayout || isProcessing">
              <option v-for="col in columnLetters" :key="col" :value="col">
                {{ col }} 列
              </option>
            </select>
          </div>
          <div class="config-item">
            <label class="config-label">爆版信息输出列：</label>
            <select v-model="selectedResultCol" class="config-select" :disabled="isCheckingLayout || isProcessing">
              <option v-for="col in columnLetters" :key="col" :value="col">
                {{ col }} 列
              </option>
            </select>
          </div>
          <div class="config-item">
            <label class="config-label">HTML图片输出列：</label>
            <select v-model="selectedLayoutImageCol" class="config-select" :disabled="isCheckingLayout || isProcessing">
              <option value="">不保存图片</option>
              <option v-for="col in columnLetters" :key="col" :value="col">
                {{ col }} 列
              </option>
            </select>
          </div>
        </div>
        
        <!-- 文件夹模式配置 -->
        <div v-if="useFolderMode" class="config-group">
          <div class="config-item">
            <label class="config-label">HTML文件夹：</label>
            <input
              ref="htmlFolderInput"
              type="file"
              webkitdirectory
              directory
              multiple
              @change="handleHtmlFolderSelect"
              :disabled="isCheckingLayout || isProcessing"
              style="display: none;"
            />
            <button
              class="folder-select-btn"
              @click="triggerHtmlFolderSelect"
              :disabled="isCheckingLayout || isProcessing"
            >
              {{ htmlFilesList.length > 0 ? `已选择 ${htmlFilesList.length} 个文件` : '选择HTML文件夹' }}
            </button>
          </div>
          <div class="config-item">
            <label class="config-label">HTML输出列（将HTML文件内容写入此列）：</label>
            <select v-model="selectedHtmlOutputCol" class="config-select" :disabled="isCheckingLayout || isProcessing">
              <option v-for="col in columnLetters" :key="col" :value="col">
                {{ col }} 列
              </option>
            </select>
          </div>
          <div class="config-item">
            <label class="config-label">爆版信息输出列：</label>
            <select v-model="selectedResultCol" class="config-select" :disabled="isCheckingLayout || isProcessing">
              <option v-for="col in columnLetters" :key="col" :value="col">
                {{ col }} 列
              </option>
            </select>
          </div>
          <div class="config-item">
            <label class="config-label">HTML图片输出列：</label>
            <select v-model="selectedLayoutImageCol" class="config-select" :disabled="isCheckingLayout || isProcessing">
              <option value="">不保存图片</option>
              <option v-for="col in columnLetters" :key="col" :value="col">
                {{ col }} 列
              </option>
            </select>
          </div>
        </div>
      </div>

      <!-- 处理进度 -->
      <div class="progress-section" v-if="isProcessing || isCheckingLayout || progress.total > 0">
        <div class="progress-info">
          <span>进度: {{ progress.current }} / {{ progress.total }}</span>
          <span v-if="progress.total > 0">
            ({{ Math.round((progress.current / progress.total) * 100) }}%)
          </span>
        </div>
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{
              width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%',
            }"
          ></div>
        </div>
      </div>

      <!-- 日志区域 -->
      <div class="logs-section">
        <h3>处理日志</h3>
        <textarea
          ref="logsTextareaRef"
          class="logs-textarea"
          :value="logs.join('\n')"
          readonly
          rows="10"
        ></textarea>
      </div>

      <!-- 对比预览区域 -->
      <div class="preview-section" v-if="fixResults.length > 0">
        <h3>对比预览</h3>
        <div class="preview-controls">
          <button
            class="nav-btn"
            :disabled="currentPreviewIndex === 0"
            @click="prevPreview"
          >
            ← 上一张
          </button>
          <span class="preview-index">
            第 {{ currentPreviewIndex + 1 }} / {{ fixResults.length }} 张
            (Excel第 {{ currentPreview?.rowIndex + 1 }} 行)
          </span>
          <button
            class="nav-btn"
            :disabled="currentPreviewIndex === fixResults.length - 1"
            @click="nextPreview"
          >
            下一张 →
          </button>
        </div>

        <div class="preview-content" v-if="currentPreview">
          <div class="preview-item">
            <h4>原始HTML (I列)</h4>
            <div class="html-preview">
              <iframe
                :srcdoc="wrapHtml(currentPreview.originalHtml)"
                class="preview-iframe"
              ></iframe>
            </div>
          </div>
          <div class="preview-item">
            <div class="preview-item-header">
              <h4>修复后HTML (J列)</h4>
              <div class="copy-btns">
                <button
                  class="copy-btn"
                  @click="copyFixedHtml"
                  title="复制修复后的HTML到剪贴板"
                >
                  📋 复制HTML
                </button>
                <button
                  class="copy-btn copy-img-btn"
                  @click="copyFixedImage"
                  title="复制修复后的图片到剪贴板"
                >
                  🖼️ 复制图片
                </button>
              </div>
            </div>
            <div class="html-preview">
              <iframe
                ref="fixedHtmlIframeRef"
                :srcdoc="wrapHtml(currentPreview.fixedHtml)"
                class="preview-iframe"
              ></iframe>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Sheet 和列选择弹窗 -->
    <div class="sheet-selector-overlay" v-if="showSheetSelector" @click.self="cancelSheetSelection">
      <div class="sheet-selector-modal">
        <h3>{{ pendingAction === 'preview' ? '预览设置' : '修复设置' }}</h3>
        
        <!-- Sheet 选择 -->
        <div class="selector-group">
          <label class="selector-label">选择工作表：</label>
          <select v-model="selectedSheet" class="sheet-select">
            <option v-for="sheet in availableSheets" :key="sheet" :value="sheet">
              {{ sheet }}
            </option>
          </select>
        </div>
        
        <!-- 原始HTML列选择 -->
        <div class="selector-group">
          <label class="selector-label">原始HTML列：</label>
          <select v-model="selectedOriginalCol" class="column-select">
            <option v-for="col in columnLetters" :key="col" :value="col">
              {{ col }} 列
            </option>
          </select>
        </div>
        
        <!-- 修复后HTML列选择 -->
        <div class="selector-group">
          <label class="selector-label">{{ pendingAction === 'preview' ? '最新HTML列' : '修复后HTML列' }}：</label>
          <select v-model="selectedFixedCol" class="column-select">
            <option v-for="col in columnLetters" :key="col" :value="col">
              {{ col }} 列
            </option>
          </select>
        </div>
        
        <!-- 预览图片列选择（仅修复模式） -->
        <div class="selector-group" v-if="pendingAction !== 'preview'">
          <label class="selector-label">预览图片列：</label>
          <select v-model="selectedImageCol" class="column-select">
            <option v-for="col in columnLetters" :key="col" :value="col">
              {{ col }} 列
            </option>
          </select>
        </div>
        
        <div class="sheet-selector-actions">
          <button class="cancel-btn" @click="cancelSheetSelection">取消</button>
          <button class="confirm-btn" @click="confirmSheetSelection">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-fix-page {
  padding: 24px;
  padding-top: 100px;
  flex: 1;
  height: 100vh;
  overflow-y: auto;
  background: var(--main-bg, #f5f5f5);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding: 16px;
  background: var(--panel-bg, #fff);
  border-radius: 8px;
  box-shadow: var(--shadow-md, 0 2px 8px rgba(0, 0, 0, 0.1));
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.file-select-label {
  cursor: pointer;
}

.file-select-btn {
  display: inline-block;
  padding: 12px 24px;
  background: var(--card-bg, #fafafa);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-primary, #333);
}

.file-select-btn:hover {
  border-color: var(--accent-color, #667eea);
  color: var(--accent-color, #667eea);
}

.file-select-label input:disabled + .file-select-btn {
  opacity: 0.6;
  cursor: not-allowed;
}

.header h1 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--text-primary, #333);
}

.start-btn {
  padding: 12px 24px;
  background: var(--accent-gradient, linear-gradient(135deg, #667eea 0%, #764ba2 100%));
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  cursor: pointer;
  transition: opacity 0.2s;
}

.start-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.start-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.start-btn-unprocessed {
  padding: 12px 24px;
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  cursor: pointer;
  transition: opacity 0.2s;
}

.start-btn-unprocessed:hover:not(:disabled) {
  opacity: 0.9;
}

.start-btn-unprocessed:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.preview-btn {
  padding: 12px 24px;
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  cursor: pointer;
  transition: opacity 0.2s;
}

.preview-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.preview-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.stop-btn {
  padding: 12px 24px;
  background: #ff4757;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  cursor: pointer;
  transition: opacity 0.2s;
}

.stop-btn:hover {
  opacity: 0.9;
}

.stop-btn {
  padding: 12px 24px;
  background: #ff4757;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  cursor: pointer;
  transition: opacity 0.2s;
}

.stop-btn:hover {
  opacity: 0.9;
}

.download-btn {
  padding: 12px 24px;
  background: #2ecc71;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  cursor: pointer;
  transition: opacity 0.2s;
}

.download-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.download-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.progress-section {
  padding: 16px;
  background: var(--panel-bg, #fff);
  border-radius: 8px;
  box-shadow: var(--shadow-md, 0 2px 8px rgba(0, 0, 0, 0.1));
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 0.9rem;
  color: var(--text-secondary, #666);
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: var(--border-color, #e0e0e0);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent-gradient, linear-gradient(135deg, #667eea 0%, #764ba2 100%));
  transition: width 0.3s;
}

.logs-section {
  padding: 16px;
  background: var(--panel-bg, #fff);
  border-radius: 8px;
  box-shadow: var(--shadow-md, 0 2px 8px rgba(0, 0, 0, 0.1));
}

.logs-section h3 {
  margin: 0 0 12px 0;
  font-size: 1.1rem;
  color: var(--text-primary, #333);
}

.logs-textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.85rem;
  resize: vertical;
  background: var(--card-bg, #fafafa);
  color: var(--text-primary, #333);
}

.preview-section {
  padding: 16px;
  background: var(--panel-bg, #fff);
  border-radius: 8px;
  box-shadow: var(--shadow-md, 0 2px 8px rgba(0, 0, 0, 0.1));
}

.preview-section h3 {
  margin: 0 0 16px 0;
  font-size: 1.1rem;
  color: var(--text-primary, #333);
}

.preview-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding: 12px;
  background: var(--card-bg, #fafafa);
  border-radius: 6px;
}

.nav-btn {
  padding: 8px 16px;
  background: var(--card-bg, #fafafa);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-primary, #333);
}

.nav-btn:hover:not(:disabled) {
  border-color: var(--accent-color, #667eea);
  color: var(--accent-color, #667eea);
}

.nav-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.preview-index {
  font-size: 0.9rem;
  color: var(--text-secondary, #666);
}

.preview-item {
  display: flex;
  flex-direction: column;
}

.preview-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.preview-item h4 {
  margin: 0;
  font-size: 1rem;
  color: var(--text-primary, #333);
}

.copy-btns {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.copy-btn {
  padding: 6px 12px;
  background: var(--card-bg, #fafafa);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-primary, #333);
}

.copy-btn:hover {
  border-color: var(--accent-color, #667eea);
  color: var(--accent-color, #667eea);
  background: var(--panel-bg, #fff);
}

.copy-img-btn:hover {
  border-color: #2ecc71;
  color: #2ecc71;
}

/* 爆版检测配置样式 */
.config-section {
  margin-bottom: 24px;
  padding: 16px;
  background: var(--panel-bg, #fff);
  border-radius: 8px;
  box-shadow: var(--shadow-md, 0 2px 8px rgba(0, 0, 0, 0.1));
}

.config-section h3 {
  margin: 0 0 16px 0;
  font-size: 1.1rem;
  color: var(--text-primary, #333);
}

.config-group {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.config-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.config-label {
  font-size: 0.9rem;
  color: var(--text-secondary, #666);
  white-space: nowrap;
}

.config-select {
  padding: 6px 12px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 4px;
  font-size: 0.9rem;
  background: var(--card-bg, #fafafa);
  color: var(--text-primary, #333);
  cursor: pointer;
  min-width: 100px;
}

.config-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.folder-select-btn {
  padding: 8px 16px;
  background: var(--card-bg, #fafafa);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-primary, #333);
}

.folder-select-btn:hover:not(:disabled) {
  border-color: var(--accent-color, #667eea);
  color: var(--accent-color, #667eea);
  background: var(--panel-bg, #fff);
}

.folder-select-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.check-layout-btn {
  padding: 10px 20px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.check-layout-btn:hover:not(:disabled) {
  background: #2980b9;
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(52, 152, 219, 0.3);
}

.check-layout-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.html-preview {
  width: 1280px;
  height: 720px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 4px;
  overflow: hidden;
  background: #fff;
}

.preview-iframe {
  width: 1280px;
  height: 720px;
  border: none;
  display: block;
}

/* Sheet 选择弹窗样式 */
.sheet-selector-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.sheet-selector-modal {
  background: var(--panel-bg, #fff);
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  min-width: 320px;
  max-width: 90vw;
}

.sheet-selector-modal h3 {
  margin: 0 0 20px 0;
  font-size: 1.25rem;
  color: var(--text-primary, #333);
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.selector-group {
  margin-bottom: 16px;
}

.selector-label {
  display: block;
  margin-bottom: 6px;
  font-size: 0.9rem;
  color: var(--text-secondary, #666);
  font-weight: 500;
}

.sheet-select,
.column-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  font-size: 1rem;
  background: var(--card-bg, #fafafa);
  color: var(--text-primary, #333);
  cursor: pointer;
}

.sheet-select:focus,
.column-select:focus {
  outline: none;
  border-color: var(--accent-color, #667eea);
}

.sheet-selector-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.cancel-btn {
  padding: 10px 20px;
  background: var(--card-bg, #fafafa);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  font-size: 0.95rem;
  cursor: pointer;
  color: var(--text-primary, #333);
  transition: all 0.2s;
}

.cancel-btn:hover {
  border-color: var(--text-secondary, #666);
}

.confirm-btn {
  padding: 10px 20px;
  background: var(--accent-gradient, linear-gradient(135deg, #667eea 0%, #764ba2 100%));
  border: none;
  border-radius: 6px;
  font-size: 0.95rem;
  cursor: pointer;
  color: #fff;
  transition: opacity 0.2s;
}

.confirm-btn:hover {
  opacity: 0.9;
}
</style>
