/**
 * 图片对比工具
 * 将 HTML 渲染为图片，对比两张图片的像素差异
 */

export interface ImageCompareResult {
    diffPercent: number;  // 差异百分比 0-100
    totalPixels: number;
    diffPixels: number;
}

/**
 * 将 HTML 字符串渲染到隐藏 iframe 并截图为 canvas
 */
async function htmlToCanvas(
    html: string,
    width: number = 1280,
    height: number = 720
): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = `position:absolute;left:-9999px;width:${width}px;height:${height}px;border:none;`;
        iframe.sandbox.add('allow-same-origin', 'allow-scripts');
        document.body.appendChild(iframe);

        const cleanup = () => {
            if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
            }
        };

        try {
            const doc = iframe.contentDocument;
            if (!doc) {
                cleanup();
                reject(new Error('无法获取 iframe 文档'));
                return;
            }

            doc.open();
            doc.write(html);
            doc.close();

            // 等待渲染完成
            setTimeout(async () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');

                    if (!ctx) {
                        cleanup();
                        reject(new Error('无法获取 canvas context'));
                        return;
                    }

                    // 使用 html2canvas 逻辑或直接渲染
                    // 由于跨域限制，我们使用简化的方式：
                    // 遍历 DOM 绘制主要元素

                    await renderDomToCanvas(doc.body, ctx, width, height);
                    cleanup();
                    resolve(canvas);
                } catch (err) {
                    cleanup();
                    reject(err);
                }
            }, 500);
        } catch (err) {
            cleanup();
            reject(err);
        }
    });
}

/**
 * 简化的 DOM 到 Canvas 渲染
 * 提取主要视觉特征用于对比
 */
async function renderDomToCanvas(
    body: HTMLElement,
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
): Promise<void> {
    // 填充白色背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // 获取 body 的计算样式和背景
    const bodyStyle = window.getComputedStyle(body);
    const bgColor = bodyStyle.backgroundColor;
    if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);
    }

    // 遍历所有可见元素，绘制其边界框和颜色
    const elements = body.querySelectorAll('*');
    elements.forEach((el) => {
        const elem = el as HTMLElement;
        const rect = elem.getBoundingClientRect();
        const style = window.getComputedStyle(elem);

        // 跳过不可见元素
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return;
        }

        // 跳过视口外元素
        if (rect.right < 0 || rect.bottom < 0 || rect.left > width || rect.top > height) {
            return;
        }

        // 绘制背景色
        const bg = style.backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
            ctx.fillStyle = bg;
            ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
        }

        // 绘制边框
        const borderWidth = parseFloat(style.borderWidth) || 0;
        if (borderWidth > 0) {
            const borderColor = style.borderColor;
            if (borderColor && borderColor !== 'transparent') {
                ctx.strokeStyle = borderColor;
                ctx.lineWidth = borderWidth;
                ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);
            }
        }

        // 绘制文本（简化：用文字颜色填充小区域）
        if (elem.childNodes.length > 0) {
            for (const child of elem.childNodes) {
                if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
                    const color = style.color;
                    if (color && color !== 'transparent') {
                        ctx.fillStyle = color;
                        // 用小矩形表示文字区域
                        const fontSize = parseFloat(style.fontSize) || 12;
                        const textWidth = Math.min(child.textContent.length * fontSize * 0.5, rect.width);
                        ctx.fillRect(rect.left, rect.top, textWidth, fontSize);
                    }
                    break; // 只处理第一个文本节点
                }
            }
        }
    });
}

/**
 * 对比两张 canvas 的像素差异
 */
function compareCanvases(
    canvas1: HTMLCanvasElement,
    canvas2: HTMLCanvasElement,
    threshold: number = 30  // 颜色差异阈值
): ImageCompareResult {
    const width = Math.max(canvas1.width, canvas2.width);
    const height = Math.max(canvas1.height, canvas2.height);

    const ctx1 = canvas1.getContext('2d');
    const ctx2 = canvas2.getContext('2d');

    if (!ctx1 || !ctx2) {
        return { diffPercent: 0, totalPixels: 0, diffPixels: 0 };
    }

    const data1 = ctx1.getImageData(0, 0, width, height).data;
    const data2 = ctx2.getImageData(0, 0, width, height).data;

    const totalPixels = width * height;
    let diffPixels = 0;

    for (let i = 0; i < data1.length; i += 4) {
        const r1 = data1[i], g1 = data1[i + 1], b1 = data1[i + 2];
        const r2 = data2[i], g2 = data2[i + 1], b2 = data2[i + 2];

        // 计算颜色差异
        const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
        if (diff > threshold) {
            diffPixels++;
        }
    }

    const diffPercent = (diffPixels / totalPixels) * 100;

    return {
        diffPercent: Math.round(diffPercent * 100) / 100,  // 保留两位小数
        totalPixels,
        diffPixels
    };
}

/**
 * 对比两段 HTML 的视觉差异
 * @param html1 原始 HTML
 * @param html2 修复后的 HTML
 * @returns 差异百分比（0-100）
 */
export async function compareHtmlImages(
    html1: string,
    html2: string,
    width: number = 1280,
    height: number = 720
): Promise<ImageCompareResult> {
    try {
        const [canvas1, canvas2] = await Promise.all([
            htmlToCanvas(html1, width, height),
            htmlToCanvas(html2, width, height)
        ]);

        return compareCanvases(canvas1, canvas2);
    } catch (error) {
        console.error('图片对比失败:', error);
        return { diffPercent: -1, totalPixels: 0, diffPixels: 0 };  // -1 表示对比失败
    }
}

/**
 * 格式化差异百分比显示
 */
export function formatDiffPercent(diff: number): string {
    if (diff < 0) return '对比失败';
    if (diff === 0) return '完全相同';
    if (diff < 1) return `< 1%`;
    return `${diff.toFixed(1)}%`;
}

