/**
 * 图片对比打分工具
 * 根据参考图，对大模型给两张「根据样式生成的 PPT 图」打分；支持单组与批量（适配批量测试 ZIP）
 */

import React, { useState, useRef } from 'react';
import { scoreTwoCandidates, type TwoCandidateScoreResult } from '../../keepstyle/styleAuditService';
import JSZip from 'jszip';

type RowStatus = 'pending' | 'running' | 'done' | 'error';

interface BatchRow {
  taskId: string;
  refName: string;
  candAName: string;
  candBName: string;
  refBase64: string;
  candABase64: string;
  candBBase64: string;
  status: RowStatus;
  result?: TwoCandidateScoreResult;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** 从批量测试 ZIP 解析出：每个任务 01=参考图，03=候选B，05=候选A */
async function parseWhiteboxZipForScore(zipFile: File): Promise<BatchRow[]> {
  const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
  const rows: BatchRow[] = [];
  const taskFolders = Object.keys(zip.files)
    .filter((p) => p.match(/^task_\d{3}\/$/))
    .sort();

  for (const folder of taskFolders) {
    const taskId = folder.replace(/\/$/, '');
    const refPath = `${folder}01_original.png`;
    const candBPath = `${folder}03_cleaned.png`;
    const candAPath = `${folder}05_result.png`;

    const refFile = zip.file(refPath);
    const candAFile = zip.file(candAPath);
    const candBFile = zip.file(candBPath);

    if (!refFile) continue;
    const refBase64 = 'data:image/png;base64,' + (await refFile.async('base64'));
    let candABase64 = '';
    let candBBase64 = '';

    if (candAFile) candABase64 = 'data:image/png;base64,' + (await candAFile.async('base64'));
    if (candBFile) candBBase64 = 'data:image/png;base64,' + (await candBFile.async('base64'));

    if (!candABase64 && !candBBase64) continue;
    if (!candABase64) candABase64 = candBBase64;
    if (!candBBase64) candBBase64 = candABase64;

    rows.push({
      taskId,
      refName: '01_original',
      candAName: '05_result',
      candBName: '03_cleaned',
      refBase64,
      candABase64,
      candBBase64,
      status: 'pending',
    });
  }
  return rows;
}

export const ImageScorePanel: React.FC = () => {
  const [mode, setMode] = useState<'single' | 'batch'>('single');

  const [refFile, setRefFile] = useState<File | null>(null);
  const [candAFile, setCandAFile] = useState<File | null>(null);
  const [candBFile, setCandBFile] = useState<File | null>(null);
  const [singleResult, setSingleResult] = useState<TwoCandidateScoreResult | null>(null);
  const [singleLoading, setSingleLoading] = useState(false);

  const [batchRows, setBatchRows] = useState<BatchRow[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchDelayMs, setBatchDelayMs] = useState(2000);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const handleSingleScore = async () => {
    if (!refFile || !candAFile || !candBFile) return;
    setSingleLoading(true);
    setSingleResult(null);
    try {
      const ref = await fileToBase64(refFile);
      const candA = await fileToBase64(candAFile);
      const candB = await fileToBase64(candBFile);
      const result = await scoreTwoCandidates(ref, candA, candB);
      setSingleResult(result);
    } catch (e) {
      setSingleResult({
        scoreA: 0,
        scoreB: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSingleLoading(false);
    }
  };

  const handleZipImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseWhiteboxZipForScore(file);
      setBatchRows(rows);
    } catch (err) {
      console.error(err);
      setBatchRows([]);
    }
    e.target.value = '';
  };

  const handleBatchScore = async () => {
    if (batchRows.length === 0) return;
    setBatchLoading(true);
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < batchRows.length; i++) {
      setBatchRows((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], status: 'running' };
        return next;
      });
      try {
        const result = await scoreTwoCandidates(
          batchRows[i].refBase64,
          batchRows[i].candABase64,
          batchRows[i].candBBase64
        );
        setBatchRows((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], status: 'done', result };
          return next;
        });
      } catch {
        setBatchRows((prev) => {
          const next = [...prev];
          next[i] = {
            ...next[i],
            status: 'error',
            result: { scoreA: 0, scoreB: 0, error: '请求失败' },
          };
          return next;
        });
      }
      if (i < batchRows.length - 1 && batchDelayMs > 0) await delay(batchDelayMs);
    }
    setBatchLoading(false);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      <div className="p-6 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-bold text-gray-800">图片对比打分</h1>
        <p className="text-sm text-gray-500 mt-1">
          根据参考图，对大模型给两张「根据样式生成的 PPT 图」打分（0-100）；支持单组上传或从批量测试 ZIP 批量导入。
        </p>
      </div>

      <div className="flex gap-4 p-4 flex-1 min-h-0">
        <div className="w-72 flex flex-col gap-4 shrink-0">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setMode('single')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${
                  mode === 'single' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                单组
              </button>
              <button
                type="button"
                onClick={() => setMode('batch')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${
                  mode === 'batch' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                批量
              </button>
            </div>

            {mode === 'single' && (
              <>
                <label className="block text-sm text-gray-600 mt-2">参考图</label>
                <input
                  type="file"
                  accept="image/*"
                  className="w-full text-sm mt-1"
                  onChange={(e) => setRefFile(e.target.files?.[0] ?? null)}
                />
                <label className="block text-sm text-gray-600 mt-2">候选图 A</label>
                <input
                  type="file"
                  accept="image/*"
                  className="w-full text-sm mt-1"
                  onChange={(e) => setCandAFile(e.target.files?.[0] ?? null)}
                />
                <label className="block text-sm text-gray-600 mt-2">候选图 B</label>
                <input
                  type="file"
                  accept="image/*"
                  className="w-full text-sm mt-1"
                  onChange={(e) => setCandBFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={handleSingleScore}
                  disabled={singleLoading || !refFile || !candAFile || !candBFile}
                  className="w-full mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  {singleLoading ? '打分中…' : '开始打分'}
                </button>
              </>
            )}

            {mode === 'batch' && (
              <>
                <label className="block text-sm text-gray-600 mt-2">批量测试 ZIP</label>
                <input
                  ref={zipInputRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={handleZipImport}
                />
                <button
                  type="button"
                  onClick={() => zipInputRef.current?.click()}
                  className="w-full mt-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm"
                >
                  选择 ZIP
                </button>
                <p className="text-xs text-gray-500 mt-1">
                  解析 task_xxx 下 01_original=参考，05_result=A，03_cleaned=B
                </p>
                {batchRows.length > 0 && (
                  <>
                    <p className="text-sm text-gray-600 mt-2">共 {batchRows.length} 条</p>
                    <label className="block text-sm text-gray-600 mt-2">任务间隔 (ms)</label>
                    <input
                      type="number"
                      min={0}
                      value={batchDelayMs}
                      onChange={(e) => setBatchDelayMs(Number(e.target.value) || 0)}
                      className="w-full mt-1 px-3 py-2 border border-gray-300 rounded text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleBatchScore}
                      disabled={batchLoading}
                      className="w-full mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {batchLoading ? '批量打分中…' : '批量打分'}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-white rounded-lg border border-gray-200 flex flex-col min-w-0">
          {mode === 'single' && (
            <div className="p-4">
              {singleResult === null && !singleLoading && (
                <p className="text-gray-500 text-sm">上传三张图并点击「开始打分」查看结果</p>
              )}
              {singleLoading && <p className="text-gray-600">正在调用模型打分…</p>}
              {singleResult && !singleResult.error && (
                <div className="space-y-3">
                  <div className="flex gap-6">
                    <div className="flex-1 rounded-lg border border-gray-200 p-3 bg-gray-50">
                      <div className="text-sm font-medium text-gray-500">候选 A 得分</div>
                      <div className="text-2xl font-bold text-indigo-600">{singleResult.scoreA}</div>
                      {singleResult.reasonA && (
                        <p className="text-sm text-gray-600 mt-1">{singleResult.reasonA}</p>
                      )}
                    </div>
                    <div className="flex-1 rounded-lg border border-gray-200 p-3 bg-gray-50">
                      <div className="text-sm font-medium text-gray-500">候选 B 得分</div>
                      <div className="text-2xl font-bold text-indigo-600">{singleResult.scoreB}</div>
                      {singleResult.reasonB && (
                        <p className="text-sm text-gray-600 mt-1">{singleResult.reasonB}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {singleResult?.error && (
                <p className="text-red-600 text-sm">错误：{singleResult.error}</p>
              )}
            </div>
          )}

          {mode === 'batch' && (
            <div className="flex-1 overflow-auto p-4">
              {batchRows.length === 0 && (
                <p className="text-gray-500 text-sm">导入批量测试 ZIP 后在此显示任务列表并执行批量打分</p>
              )}
              {batchRows.length > 0 && (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-600">
                      <th className="pb-2 pr-4">任务</th>
                      <th className="pb-2 pr-4">状态</th>
                      <th className="pb-2 pr-4">得分 A</th>
                      <th className="pb-2 pr-4">得分 B</th>
                      <th className="pb-2">说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchRows.map((row) => (
                      <tr key={row.taskId} className="border-b border-gray-100">
                        <td className="py-2 pr-4 font-mono">{row.taskId}</td>
                        <td className="py-2 pr-4">
                          {row.status === 'pending' && <span className="text-gray-400">待执行</span>}
                          {row.status === 'running' && <span className="text-amber-600">运行中</span>}
                          {row.status === 'done' && <span className="text-green-600">完成</span>}
                          {row.status === 'error' && <span className="text-red-600">失败</span>}
                        </td>
                        <td className="py-2 pr-4">
                          {row.result != null ? (
                            <span className="font-medium">{row.result.scoreA}</span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          {row.result != null ? (
                            <span className="font-medium">{row.result.scoreB}</span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-2 text-gray-600 max-w-xs truncate">
                          {row.result?.error ?? (row.result?.reasonA ? `${row.result.reasonA} / ${row.result.reasonB}` : '')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
