/**
 * 图片清洗提示词
 * 用于根据样式提取结果，生成一张去除噪点（文字、图表、具体内容）的干净背景图片
 */

export const CLEAN_IMAGE_PROMPT = `
# Role: 高级视觉设计师 & 幻灯片底版还原专家

## Task: Visual DNA Extraction & Background Reconstruction
你将作为一名视觉还原专家。你的任务是根据提供的 {styleDescription}，生成一张 16:9 的纯净幻灯片背景图。这张图必须看起来像是该 PPT 的原始官方空白母版。

## Constraints (Must Follow):
1. **Zero Content Policy (核心禁令)**: 严禁出现任何可读文字、数字、具体图标、数据图表或人物。画布必须是“空白”的，仅保留视觉环境。
2. **Spatial Layout (空间布局)**: 
   - **Center (中宫)**: 保持大面积纯净留白，无任何遮挡。
   - **Margins & Corners (边缘与角落)**: 仅允许保留原有的视觉锚点（如 Logo 位置的占位色块、页码区的装饰线条、边角装饰几何体）。
3. **Style Consistency (风格对齐)**:
   - **Color**: 严格遵循 {styleDescription} 中的主色调和渐变方案（如：#001529 深入 #003366 的 45度线性渐变）。
   - **Texture**: 还原磨砂、毛玻璃（Glassmorphism）、微光、或纯平设计的质感。

## Visual Elements to RENDER:
- [ ] 原始的底色、渐变与光影。
- [ ] 装饰性的视觉锚点（如：右上角的品牌辅助图形、底部的装饰线）。
- [ ] 整体的氛围感（如：科技感的蓝紫调、商务感的极简白）。

## Visual Elements to REMOVE:
- [X] 标题、副标题、正文、页码数字。
- [X] 信息承载容器（如：白色的圆角矩形内容卡片）。
- [X] 所有的 3D 资产和业务配图。

## Output Quality:
- 生成结果必须是超高清、无噪点、平滑的视觉底版。
- 效果要求：无法察觉人为涂抹或擦除痕迹，仿佛原始背景文件的重新渲染。
`;


