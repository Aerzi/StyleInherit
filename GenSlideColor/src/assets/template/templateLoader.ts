// 本地 HTML 模板加载器
// 从 src/assets/template/html/ 目录动态加载模板

export interface HtmlTemplateInfo {
  id: number | string;  // 支持数字ID和字符串ID
  name: string;
  description: string;
  category?: 'styled' | 'unstyled';  // 分类：有样式版/无样式版
}

// 定义可用的模板列表及其描述（根据实际模板内容）
export const HTML_TEMPLATE_LIST: HtmlTemplateInfo[] = [
  { id: 1, name: '发展历程', description: '公司发展历程回顾 - 时间轴布局' },
  { id: 2, name: '用户增长', description: '用户增长趋势分析 - ECharts柱状图+折线图' },
  { id: 3, name: '招聘对比', description: '内部招聘与外部招聘优劣势分析 - 表格对比' },
  { id: 4, name: '流程对比', description: '标准化vs定制化产品生产流程 - 左右卡片' },
  { id: 5, name: '跨文化沟通', description: '跨文化沟通误区与技巧 - 双面板布局' },
  { id: 6, name: '项目阶段', description: '项目前中后期流程 - 三阶段展示' },
  { id: 7, name: '用户流失', description: '用户流失根本原因分析 - 痛点卡片' },
  { id: 8, name: '危机应对', description: '危机应对策略分析 - 雷达图+策略对比' },
  { id: 9, name: '路线图', description: '数据平台建设路线图 - 阶段规划' },
  { id: 10, name: '主动运维', description: '主动运维服务质量 - 三栏卡片' },
  { id: 11, name: '招聘信息', description: '高级运营专员招聘 - 岗位详情' },
  { id: 12, name: '岗位对比', description: '应用工程师vs流程工程师 - 职位对比' },
  { id: 13, name: '物流对比', description: '自建物流vs第三方物流 - 方案对比' },
  { id: 14, name: '飞轮效应', description: '飞轮效应在企业增长中的应用 - 循环图' },
  { id: 15, name: '第一性原理', description: '第一性原理创新思维 - 层级展示' },
  { id: 16, name: '品牌策略', description: '单一品牌vs多品牌策略 - 策略对比' },
  { id: 17, name: '对比分析', description: '左右对比/A vs B' },
  { id: 18, name: '运营支出', description: '年度运营支出对比分析 - 饼图+柱状图' },
  { id: 19, name: '发布会筹备', description: '线下发布会筹备流程 - 时间线' },
  { id: 20, name: '垃圾分类', description: '垃圾分类处理流程 - 流程图' },
  { id: 21, name: '数据仓库', description: '数据仓库架构 - 层级结构' },
  { id: 22, name: '云部署', description: '云部署模式对比分析 - 三栏对比' },
  { id: 23, name: '云计算', description: '云计算服务模式解析 - IaaS/PaaS/SaaS' },
  { id: 24, name: '区域分布', description: '地区分布/热力图' },
  { id: 25, name: '水务业务', description: '水务业务发展策略 - 目标卡片' },
  { id: 26, name: '留存率分析', description: '用户留存率下降归因分析 - 鱼骨图' },
  { id: 27, name: '消费偏好', description: '用户消费偏好分析 - 数据卡片' },
  { id: 28, name: '营销策略', description: '营销策略演进对比 - 年度对比' },
  { id: 29, name: '转化漏斗', description: '全渠道转化漏斗分析 - 漏斗图' },
  { id: 30, name: '市场份额', description: '市场占比分析' },
  { id: 31, name: '用户旅程', description: '客户/用户旅程地图' },
  { id: 32, name: '漏斗分析', description: '转化漏斗图' },
  { id: 33, name: '计划看板', description: '任务看板/Kanban' },
  { id: 34, name: '旅行计划', description: '年度全球旅行计划推荐 - 地图+时间线' },
  { id: 35, name: '流失分析', description: '用户流失根本原因分析 - 中心辐射' },
  { id: 36, name: '培训进度', description: '培训/学习进度' },
  { id: 37, name: '健康管理', description: '全面健康管理计划 - 多维度卡片' },
  { id: 38, name: '成本分析', description: '成本结构分析' },
  { id: 39, name: '数字化转型', description: '关于数字化转型的思考 - 思维导图' },
  { id: 40, name: '仆人式领导', description: '仆人式领导团队管理 - 特征展示' },
  { id: 41, name: '产品路线图', description: '产品迭代计划' },
  { id: 42, name: '数字化核心', description: '数字化转型的核心思考 - 中心辐射' },
  { id: 43, name: '投资回报', description: 'ROI分析报告' },
  { id: 44, name: '故障分析', description: '故障/问题统计' },
  { id: 45, name: '人力资源', description: 'HR数据看板' },
  { id: 46, name: '投诉处理', description: '客户投诉处理标准流程 - 流程图' },
  { id: 47, name: '职业规划', description: '个人职业发展路径规划 - 阶段展示' },
  { id: 48, name: '软件开发', description: '软件开发生命周期SDLC - 循环图' },
  { id: 49, name: '装修指南', description: '家庭装修全流程指南 - 步骤卡片' },
  { id: 50, name: '自我提升', description: '自我提升行动计划 - 目标分解' },
  { id: 51, name: '能源消耗', description: '能源/资源使用' },
  { id: 52, name: '客户反馈', description: '客户反馈分析与整改方案 - 表格+图表' },
  { id: 53, name: '企业文化', description: '企业文化建设与价值观落地 - 层级展示' },
  { id: 54, name: '短视频营销', description: '短视频营销与信息获取变革 - 对比展示' },
  { id: 55, name: '财务报表', description: 'Q4财务报表分析 - 表格+图表' },
  { id: 56, name: '工单数据', description: '本月工单数据分析 - KPI卡片+图表' },
  { id: 57, name: '库存周转', description: '库存周转率分析表 - 数据表格' },
  { id: 58, name: 'APP点击', description: 'APP功能模块点击分析 - 热力图+表格' },
  { id: 59, name: '绩效分布', description: '员工绩效分布概览 - 分布图+表格' },
  { id: 60, name: '愿景使命', description: '公司愿景/文化' },
  // === 无样式版模板（仅布局结构，样式由AI自由发挥）===
  { id: 'ns-text', name: '📝 文本展示(无样式)', description: '纯布局结构 - 标题+卡片+列表', category: 'unstyled' },
  { id: 'ns-table', name: '📊 数据表格(无样式)', description: '纯布局结构 - 多维数据表格', category: 'unstyled' },
  { id: 'ns-timeline', name: '⏳ 时间轴(无样式)', description: '纯布局结构 - 发展历程时间线', category: 'unstyled' },
];

// 使用 Vite 的 import.meta.glob 动态导入所有模板
const templateModules = import.meta.glob('./html/*.html', { 
  query: '?raw',
  import: 'default' 
});

/**
 * 获取所有可用的模板 ID 列表
 */
export function getAvailableTemplateIds(): (number | string)[] {
  const numericIds: number[] = [];
  const stringIds: string[] = [];
  
  for (const path of Object.keys(templateModules)) {
    // 从路径提取 ID，如 "./html/1.html" -> 1, "./html/ns-text.html" -> "ns-text"
    const numericMatch = path.match(/\/(\d+)\.html$/);
    const stringMatch = path.match(/\/(ns-[a-z-]+)\.html$/);
    
    if (numericMatch) {
      numericIds.push(parseInt(numericMatch[1], 10));
    } else if (stringMatch) {
      stringIds.push(stringMatch[1]);
    }
  }
  
  // 数字ID排序后，再添加字符串ID
  return [...numericIds.sort((a, b) => a - b), ...stringIds];
}

/**
 * 获取模板列表（只返回实际存在的模板）
 */
export function getTemplateList(): HtmlTemplateInfo[] {
  const availableIds = getAvailableTemplateIds();
  return HTML_TEMPLATE_LIST.filter(t => availableIds.includes(t.id));
}

/**
 * 加载指定 ID 的模板内容
 */
export async function loadTemplateById(id: number | string): Promise<string | null> {
  const path = `./html/${id}.html`;
  const loader = templateModules[path];
  
  if (!loader) {
    console.warn(`Template ${id} not found`);
    return null;
  }
  
  try {
    const content = await loader() as string;
    return content;
  } catch (error) {
    console.error(`Failed to load template ${id}:`, error);
    return null;
  }
}

/**
 * 预加载所有模板（可选，用于缓存）
 */
export async function preloadAllTemplates(): Promise<Map<number, string>> {
  const cache = new Map<number, string>();
  const ids = getAvailableTemplateIds();
  
  await Promise.all(
    ids.map(async (id) => {
      const content = await loadTemplateById(id);
      if (content) {
        cache.set(id, content);
      }
    })
  );
  
  return cache;
}

