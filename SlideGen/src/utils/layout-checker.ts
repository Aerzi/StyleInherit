/**
 * PPT 排版检测工具
 * 检测内容溢出、截断、滚动条等排版问题
 */

export interface LayoutIssue {
  type: 'overflow' | 'scrollbar' | 'truncation' | 'hidden-content' | 'empty' | 'overlap';
  severity: 'error' | 'warning' | 'info';
  element: string; // 元素描述
  selector?: string; // CSS 选择器，用于高亮
  message: string;
  details?: string;
  rect?: { top: number; left: number; width: number; height: number };
  isInvisible?: boolean; // 元素完全不可见（在视口外或被隐藏）
}

export interface LayoutCheckResult {
  passed: boolean;
  issues: LayoutIssue[];
  summary: {
    total: number;
    errors: number;
    warnings: number;
    info: number;
  };
  timestamp: number;
}

/**
 * 获取元素的简短描述
 */
function getElementDescription(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const classes = el.className && typeof el.className === 'string'
    ? '.' + el.className.split(' ').filter(c => c).slice(0, 2).join('.')
    : '';
  const text = el.textContent?.trim().slice(0, 20) || '';
  const textPart = text ? ` "${text}${text.length >= 20 ? '...' : ''}"` : '';
  return `<${tag}${id}${classes}>${textPart}`;
}

/**
 * 生成元素的唯一 CSS 选择器
 */
function getUniqueSelector(el: Element): string {
  // 如果有 id，直接使用
  if (el.id) {
    return `#${el.id}`;
  }

  // 构建路径选择器
  const path: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector = `#${current.id}`;
      path.unshift(selector);
      break;
    }

    // 添加类名（取前2个）
    if (current.className && typeof current.className === 'string') {
      const classes = current.className.split(' ').filter(c => c && !c.includes(':')).slice(0, 2);
      if (classes.length > 0) {
        selector += '.' + classes.join('.');
      }
    }

    // 如果需要，添加 nth-child
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(c => c.tagName === current!.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(' > ');
}

/**
 * 检测元素是否有滚动条
 */
function hasScrollbar(el: Element): { horizontal: boolean; vertical: boolean } {
  const style = window.getComputedStyle(el);
  const overflowX = style.overflowX;
  const overflowY = style.overflowY;

  const hasVertical = el.scrollHeight > el.clientHeight &&
    (overflowY === 'auto' || overflowY === 'scroll');
  const hasHorizontal = el.scrollWidth > el.clientWidth &&
    (overflowX === 'auto' || overflowX === 'scroll');

  return { horizontal: hasHorizontal, vertical: hasVertical };
}

/**
 * 检测元素内容是否溢出（被 overflow: hidden 裁剪）
 */
function isContentOverflowing(el: Element): { horizontal: boolean; vertical: boolean } {
  const style = window.getComputedStyle(el);
  const overflowX = style.overflowX;
  const overflowY = style.overflowY;

  const verticalOverflow = el.scrollHeight > el.clientHeight && overflowY === 'hidden';
  const horizontalOverflow = el.scrollWidth > el.clientWidth && overflowX === 'hidden';

  return { horizontal: horizontalOverflow, vertical: verticalOverflow };
}

/**
 * 检测文本是否被 ellipsis 截断
 */
function isTextTruncated(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (style.textOverflow !== 'ellipsis') return false;

  // 检查是否实际发生了截断
  return el.scrollWidth > el.clientWidth;
}

/**
 * 检测元素是否超出父容器边界
 */
function isOutOfBounds(el: Element, container: Element): boolean {
  const elRect = el.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  return (
    elRect.right > containerRect.right + 1 ||
    elRect.bottom > containerRect.bottom + 1 ||
    elRect.left < containerRect.left - 1 ||
    elRect.top < containerRect.top - 1
  );
}

/**
 * 检测元素是否完全不可见（完全在视口外）
 */
function isCompletelyInvisible(el: Element, container: Element): boolean {
  const elRect = el.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  // 完全在视口外的任意一边
  return (
    elRect.right <= containerRect.left ||
    elRect.left >= containerRect.right ||
    elRect.bottom <= containerRect.top ||
    elRect.top >= containerRect.bottom
  );
}

/**
 * 检测两个矩形是否重叠
 */
function rectsOverlap(rect1: DOMRect, rect2: DOMRect): boolean {
  return !(
    rect1.right <= rect2.left ||
    rect1.left >= rect2.right ||
    rect1.bottom <= rect2.top ||
    rect1.top >= rect2.bottom
  );
}

/**
 * 计算重叠面积
 */
function getOverlapArea(rect1: DOMRect, rect2: DOMRect): number {
  const xOverlap = Math.max(0, Math.min(rect1.right, rect2.right) - Math.max(rect1.left, rect2.left));
  const yOverlap = Math.max(0, Math.min(rect1.bottom, rect2.bottom) - Math.max(rect1.top, rect2.top));
  return xOverlap * yOverlap;
}

/**
 * 判断元素是否为关键内容元素（图片、文字块等）
 */
function isKeyElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  const style = window.getComputedStyle(el);

  // 图片元素
  if (tag === 'img' || tag === 'svg' || tag === 'canvas') return true;

  // 有背景图的元素
  if (style.backgroundImage && style.backgroundImage !== 'none') return true;

  // 文字内容元素（有实际文本且不是容器）
  const hasDirectText = Array.from(el.childNodes).some(
    node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
  );
  if (hasDirectText) return true;

  // 标题元素
  if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'li', 'td', 'th'].includes(tag)) {
    if (el.textContent?.trim()) return true;
  }

  return false;
}

/**
 * 判断两个元素是否应该检测重叠（排除预期的重叠情况）
 */
function shouldCheckOverlap(el1: Element, el2: Element): boolean {
  // 排除父子关系
  if (el1.contains(el2) || el2.contains(el1)) return false;

  // 排除同一父元素下的绝对定位元素（可能是故意叠放的装饰）
  const style1 = window.getComputedStyle(el1);
  const style2 = window.getComputedStyle(el2);

  // 如果一个是背景/装饰元素（opacity很低或z-index很低），跳过
  const opacity1 = parseFloat(style1.opacity);
  const opacity2 = parseFloat(style2.opacity);
  if (opacity1 < 0.3 || opacity2 < 0.3) return false;

  // 两个都是图片或背景，可能是故意叠放
  const isImg1 = el1.tagName.toLowerCase() === 'img' || (style1.backgroundImage !== 'none');
  const isImg2 = el2.tagName.toLowerCase() === 'img' || (style2.backgroundImage !== 'none');
  const hasText1 = el1.textContent?.trim();
  const hasText2 = el2.textContent?.trim();

  // 只关注图片与文字、文字与文字的重叠
  if (isImg1 && isImg2 && !hasText1 && !hasText2) return false;

  return true;
}

interface KeyElementInfo {
  element: Element;
  rect: DOMRect;
  description: string;
  selector: string;
  isImage: boolean;
  hasText: boolean;
}

/**
 * 检测关键元素之间的重叠
 */
function detectOverlaps(elements: Element[]): LayoutIssue[] {
  const issues: LayoutIssue[] = [];

  // 收集关键元素信息
  const keyElements: KeyElementInfo[] = [];

  for (const el of elements) {
    if (!isKeyElement(el)) continue;

    const rect = el.getBoundingClientRect();
    // 跳过太小的元素
    if (rect.width < 10 || rect.height < 10) continue;

    const tag = el.tagName.toLowerCase();
    const style = window.getComputedStyle(el);

    keyElements.push({
      element: el,
      rect,
      description: getElementDescription(el),
      selector: getUniqueSelector(el),
      isImage: tag === 'img' || tag === 'svg' || (style.backgroundImage !== 'none'),
      hasText: !!el.textContent?.trim()
    });
  }

  // 检测两两重叠
  for (let i = 0; i < keyElements.length; i++) {
    for (let j = i + 1; j < keyElements.length; j++) {
      const el1 = keyElements[i];
      const el2 = keyElements[j];

      if (!shouldCheckOverlap(el1.element, el2.element)) continue;
      if (!rectsOverlap(el1.rect, el2.rect)) continue;

      const overlapArea = getOverlapArea(el1.rect, el2.rect);
      const smallerArea = Math.min(
        el1.rect.width * el1.rect.height,
        el2.rect.width * el2.rect.height
      );

      // 重叠面积占较小元素面积的比例
      const overlapRatio = overlapArea / smallerArea;

      // 只报告显著重叠（超过30%）
      if (overlapRatio < 0.3) continue;

      // 确定严重程度
      let severity: 'error' | 'warning' | 'info' = 'warning';
      let message = '';

      // 图片与文字重叠，且文字可能被遮挡
      if ((el1.isImage && el2.hasText) || (el2.isImage && el1.hasText)) {
        severity = overlapRatio > 0.5 ? 'error' : 'warning';
        message = '图片与文字发生重叠';
      }
      // 文字与文字重叠
      else if (el1.hasText && el2.hasText) {
        severity = overlapRatio > 0.5 ? 'error' : 'warning';
        message = '文字内容发生重叠';
      }
      // 其他重叠
      else {
        message = '元素发生重叠';
      }

      issues.push({
        type: 'overlap',
        severity,
        element: el1.description,
        selector: el1.selector,
        message,
        details: `与 ${el2.description} 重叠 ${Math.round(overlapRatio * 100)}%`,
        rect: { top: el1.rect.top, left: el1.rect.left, width: el1.rect.width, height: el1.rect.height }
      });
    }
  }

  return issues;
}

/**
 * 在 iframe 中执行排版检测
 */
export function checkLayoutInIframe(iframe: HTMLIFrameElement): LayoutCheckResult {
  const issues: LayoutIssue[] = [];

  try {
    const doc = iframe.contentDocument;
    if (!doc) {
      return createErrorResult('无法访问 iframe 内容');
    }

    const body = doc.body;
    if (!body) {
      return createErrorResult('iframe 中没有 body 元素');
    }

    // 1. 检测 body/html 是否有滚动条（最严重的问题）
    const htmlEl = doc.documentElement;
    const bodyScrollbar = hasScrollbar(body);
    const htmlScrollbar = hasScrollbar(htmlEl);

    if (bodyScrollbar.vertical || htmlScrollbar.vertical) {
      issues.push({
        type: 'scrollbar',
        severity: 'error',
        element: '<body>',
        message: '页面出现垂直滚动条',
        details: '内容超出 720px 高度限制，需要减少内容或调整布局'
      });
    }

    if (bodyScrollbar.horizontal || htmlScrollbar.horizontal) {
      issues.push({
        type: 'scrollbar',
        severity: 'error',
        element: '<body>',
        message: '页面出现水平滚动条',
        details: '内容超出 1280px 宽度限制，需要调整布局'
      });
    }

    // 2. 遍历所有元素检测问题
    const allElements = body.querySelectorAll('*');

    allElements.forEach((el) => {
      // 跳过 script, style 等非可视元素
      const tag = el.tagName.toLowerCase();
      if (['script', 'style', 'link', 'meta', 'br', 'hr'].includes(tag)) {
        return;
      }

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;

      // 检测内部滚动条
      const scrollbar = hasScrollbar(el);
      if (scrollbar.vertical || scrollbar.horizontal) {
        issues.push({
          type: 'scrollbar',
          severity: 'warning',
          element: getElementDescription(el),
          selector: getUniqueSelector(el),
          message: `元素内部出现${scrollbar.vertical ? '垂直' : ''}${scrollbar.horizontal ? '水平' : ''}滚动条`,
          details: '建议增加容器尺寸或减少内容',
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
        });
      }

      // 检测内容溢出被裁剪
      const overflow = isContentOverflowing(el);
      if (overflow.vertical || overflow.horizontal) {
        // 只报告有实际文本内容的元素
        if (el.textContent?.trim()) {
          issues.push({
            type: 'overflow',
            severity: 'warning',
            element: getElementDescription(el),
            selector: getUniqueSelector(el),
            message: `内容被裁剪${overflow.vertical ? '（垂直）' : ''}${overflow.horizontal ? '（水平）' : ''}`,
            details: '部分内容可能不可见',
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
          });
        }
      }

      // 检测文本截断
      if (isTextTruncated(el)) {
        issues.push({
          type: 'truncation',
          severity: 'info',
          element: getElementDescription(el),
          selector: getUniqueSelector(el),
          message: '文本被省略号截断',
          details: `完整文本: "${el.textContent?.trim().slice(0, 50)}..."`,
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
        });
      }

      // 检测元素超出页面边界
      if (isOutOfBounds(el, body)) {
        const completelyInvisible = isCompletelyInvisible(el, body);
        issues.push({
          type: 'hidden-content',
          severity: 'error',
          element: getElementDescription(el),
          selector: getUniqueSelector(el),
          message: completelyInvisible ? '元素完全不可见' : '元素超出页面边界',
          details: completelyInvisible ? '该元素完全在可视区域外，用户无法看到' : '该元素部分在可视区域外',
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
          isInvisible: completelyInvisible
        });
      }
    });

    // 3. 检测元素重叠
    const overlapIssues = detectOverlaps(Array.from(allElements));
    issues.push(...overlapIssues);

    // 4. 检测页面整体高度
    const pageHeight = Math.max(
      body.scrollHeight,
      body.offsetHeight,
      htmlEl.scrollHeight,
      htmlEl.offsetHeight
    );

    if (pageHeight > 720) {
      const existingScrollbarIssue = issues.find(i => i.type === 'scrollbar' && i.element === '<body>');
      if (!existingScrollbarIssue) {
        issues.push({
          type: 'overflow',
          severity: 'error',
          element: '<body>',
          message: `页面内容高度 (${pageHeight}px) 超出限制 (720px)`,
          details: '需要减少内容或调整字体/间距'
        });
      }
    }

    // 5. 检测页面宽度
    const pageWidth = Math.max(
      body.scrollWidth,
      body.offsetWidth,
      htmlEl.scrollWidth,
      htmlEl.offsetWidth
    );

    if (pageWidth > 1280) {
      const existingScrollbarIssue = issues.find(i =>
        i.type === 'scrollbar' && i.element === '<body>' && i.message.includes('水平')
      );
      if (!existingScrollbarIssue) {
        issues.push({
          type: 'overflow',
          severity: 'error',
          element: '<body>',
          message: `页面内容宽度 (${pageWidth}px) 超出限制 (1280px)`,
          details: '需要调整布局或减少水平内容'
        });
      }
    }

  } catch (error) {
    return createErrorResult(`检测过程出错: ${error}`);
  }

  // 去重和排序
  const dedupedIssues = deduplicateIssues(issues);
  const sortedIssues = sortIssues(dedupedIssues);

  return {
    passed: sortedIssues.filter(i => i.severity === 'error').length === 0,
    issues: sortedIssues,
    summary: {
      total: sortedIssues.length,
      errors: sortedIssues.filter(i => i.severity === 'error').length,
      warnings: sortedIssues.filter(i => i.severity === 'warning').length,
      info: sortedIssues.filter(i => i.severity === 'info').length
    },
    timestamp: Date.now()
  };
}

/**
 * 去重问题
 */
function deduplicateIssues(issues: LayoutIssue[]): LayoutIssue[] {
  const seen = new Set<string>();
  return issues.filter(issue => {
    const key = `${issue.type}-${issue.element}-${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 按严重程度排序
 */
function sortIssues(issues: LayoutIssue[]): LayoutIssue[] {
  const severityOrder = { error: 0, warning: 1, info: 2 };
  return [...issues].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

/**
 * 创建错误结果
 */
function createErrorResult(message: string): LayoutCheckResult {
  return {
    passed: false,
    issues: [{
      type: 'overflow',
      severity: 'error',
      element: 'system',
      message
    }],
    summary: { total: 1, errors: 1, warnings: 0, info: 0 },
    timestamp: Date.now()
  };
}

