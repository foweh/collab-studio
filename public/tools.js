// ─── 工具集(阶段四: 纯前端本地工具) ────────────────────
// 所有工具在浏览器本地执行, 不上传服务器, 不增服务器算力
// 库: marked/jspdf/xlsx/jszip/pdf.js/mammoth(已本地化到 vendor/)

(function () {
  // pdf.js worker 配置
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.js';
  }

  const TOOLS = [
    {
      id: 'pdf2img', icon: '🖼️', title: 'PDF 转图片',
      desc: '上传 PDF,每页渲染为 PNG 图片下载(支持逐页/全部)',
      render: function (box) {
        box.innerHTML = `
          <input type="file" accept="application/pdf,.pdf" id="t-pdf2img-file" style="margin-bottom:10px">
          <div style="display:flex;gap:6px;margin-bottom:10px">
            <button class="tool-btn" id="t-pdf2img-all" style="background:#3b82f6;color:#fff;border:none">🖼️ 全部转图片</button>
            <span id="t-pdf2img-status" style="font-size:12px;color:var(--text-dim);align-self:center"></span>
          </div>
          <div id="t-pdf2img-preview" style="display:flex;flex-wrap:wrap;gap:8px"></div>`;
        const file = box.querySelector('#t-pdf2img-file');
        const allBtn = box.querySelector('#t-pdf2img-all');
        const status = box.querySelector('#t-pdf2img-status');
        let pdfDoc = null;
        file.onchange = async () => {
          const f = file.files[0]; if (!f) return;
          status.textContent = '⏳ 解析 PDF...';
          try {
            const buf = await f.arrayBuffer();
            pdfDoc = await window.pdfjsLib.getDocument({ data: buf }).promise;
            status.textContent = `📄 ${pdfDoc.numPages} 页`;
            // 预览第一页
            const page = await pdfDoc.getPage(1);
            const vp = page.getViewport({ scale: 0.5 });
            const canvas = document.createElement('canvas');
            canvas.width = vp.width; canvas.height = vp.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
            box.querySelector('#t-pdf2img-preview').innerHTML = '';
            box.querySelector('#t-pdf2img-preview').appendChild(canvas);
          } catch (e) { status.textContent = '❌ ' + e.message; }
        };
        allBtn.onclick = async () => {
          if (!pdfDoc) { alert('先选择 PDF 文件'); return; }
          status.textContent = '⏳ 转换中...';
          try {
            for (let i = 1; i <= pdfDoc.numPages; i++) {
              const page = await pdfDoc.getPage(i);
              const vp = page.getViewport({ scale: 1.5 });
              const canvas = document.createElement('canvas');
              canvas.width = vp.width; canvas.height = vp.height;
              await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
              const link = document.createElement('a');
              link.href = canvas.toDataURL('image/png');
              link.download = `page-${i}.png`;
              link.click();
            }
            status.textContent = `✅ ${pdfDoc.numPages} 页已导出`;
          } catch (e) { status.textContent = '❌ ' + e.message; }
        };
      },
    },
    {
      id: 'img2pdf', icon: '📄', title: '图片转 PDF',
      desc: '多张图片合成一个 PDF(自动适配页面)',
      render: function (box) {
        box.innerHTML = `
          <input type="file" accept="image/*" multiple id="t-img2pdf-file" style="margin-bottom:10px">
          <div style="display:flex;gap:6px;margin-bottom:10px">
            <button class="tool-btn" id="t-img2pdf-go" style="background:#3b82f6;color:#fff;border:none">📄 生成 PDF</button>
            <span id="t-img2pdf-status" style="font-size:12px;color:var(--text-dim);align-self:center"></span>
          </div>
          <div id="t-img2pdf-preview" style="display:flex;flex-wrap:wrap;gap:8px"></div>`;
        const file = box.querySelector('#t-img2pdf-file');
        const go = box.querySelector('#t-img2pdf-go');
        const status = box.querySelector('#t-img2pdf-status');
        const preview = box.querySelector('#t-img2pdf-preview');
        let imgs = [];
        file.onchange = () => {
          imgs = Array.from(file.files);
          preview.innerHTML = imgs.map((f, i) => `<img src="${URL.createObjectURL(f)}" style="max-width:100px;max-height:100px;border:1px solid var(--border);border-radius:4px" title="${f.name}">`).join('');
          status.textContent = `📷 ${imgs.length} 张`;
        };
        go.onclick = () => {
          if (!imgs.length) { alert('先选择图片'); return; }
          status.textContent = '⏳ 生成中...';
          const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
          let done = 0;
          imgs.forEach((f, idx) => {
            const img = new Image();
            img.onload = () => {
              if (idx > 0) pdf.addPage();
              const pw = pdf.internal.pageSize.getWidth();
              const ph = pdf.internal.pageSize.getHeight();
              const ratio = Math.min(pw / img.width, ph / img.height);
              const w = img.width * ratio, h = img.height * ratio;
              const x = (pw - w) / 2, y = (ph - h) / 2;
              pdf.addImage(img, 'JPEG', x, y, w, h);
              done++;
              if (done === imgs.length) {
                pdf.save('图片合集.pdf');
                status.textContent = '✅ PDF 已生成';
              }
            };
            img.src = URL.createObjectURL(f);
          });
        };
      },
    },
    {
      id: 'word2pdf', icon: '📝', title: 'Word 转 PDF',
      desc: '上传 .docx,解析为 HTML 预览,浏览器打印即可存为 PDF',
      render: function (box) {
        box.innerHTML = `
          <input type="file" accept=".docx" id="t-word2pdf-file" style="margin-bottom:10px">
          <div style="display:flex;gap:6px;margin-bottom:10px">
            <button class="tool-btn" id="t-word2pdf-print" style="background:#3b82f6;color:#fff;border:none">🖨️ 打印/存为 PDF</button>
            <span id="t-word2pdf-status" style="font-size:12px;color:var(--text-dim);align-self:center"></span>
          </div>
          <div id="t-word2pdf-preview" style="border:1px solid var(--border);border-radius:8px;padding:16px;background:#fff;color:#333;max-height:400px;overflow-y:auto"></div>`;
        const file = box.querySelector('#t-word2pdf-file');
        const printBtn = box.querySelector('#t-word2pdf-print');
        const status = box.querySelector('#t-word2pdf-status');
        const preview = box.querySelector('#t-word2pdf-preview');
        let html = '';
        file.onchange = async () => {
          const f = file.files[0]; if (!f) return;
          status.textContent = '⏳ 解析 Word...';
          try {
            const buf = await f.arrayBuffer();
            const result = await window.mammoth.convertToHtml({ arrayBuffer: buf });
            html = result.value;
            preview.innerHTML = html;
            status.textContent = '✅ 解析完成,可打印存 PDF';
          } catch (e) { status.textContent = '❌ ' + e.message; }
        };
        printBtn.onclick = () => {
          if (!html) { alert('先上传 Word 文件'); return; }
          const w = window.open('', '_blank');
          w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Word转PDF</title><style>body{font-family:'Microsoft YaHei';max-width:800px;margin:40px auto;padding:0 20px;line-height:1.8}</style></head><body>${html}</body></html>`);
          w.document.close();
          w.focus();
          w.print();
        };
      },
    },
    {
      id: 'md2pdf', icon: '📑', title: 'Markdown 转 PDF/HTML',
      desc: '粘贴 Markdown,渲染预览,打印存 PDF 或下载 HTML',
      render: function (box) {
        box.innerHTML = `
          <textarea id="t-md2pdf-input" placeholder="粘贴 Markdown 内容..." style="width:100%;height:180px;padding:10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:monospace;box-sizing:border-box;margin-bottom:10px"></textarea>
          <div style="display:flex;gap:6px;margin-bottom:10px">
            <button class="tool-btn" id="t-md2pdf-render" style="background:#3b82f6;color:#fff;border:none">👁️ 渲染预览</button>
            <button class="tool-btn" id="t-md2pdf-print">🖨️ 打印存 PDF</button>
            <button class="tool-btn" id="t-md2pdf-dl">⬇️ 下载 HTML</button>
          </div>
          <div id="t-md2pdf-preview" style="border:1px solid var(--border);border-radius:8px;padding:16px;background:#fff;color:#333;max-height:400px;overflow-y:auto"></div>`;
        const input = box.querySelector('#t-md2pdf-input');
        const render = box.querySelector('#t-md2pdf-render');
        const print = box.querySelector('#t-md2pdf-print');
        const dl = box.querySelector('#t-md2pdf-dl');
        const preview = box.querySelector('#t-md2pdf-preview');
        const fullHtml = () => `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><style>body{font-family:'Microsoft YaHei';max-width:800px;margin:40px auto;padding:0 20px;line-height:1.8;color:#333}h1{border-bottom:2px solid #4f46e5;padding-bottom:8px}pre,code{background:#f4f4f5;padding:2px 6px;border-radius:4px}blockquote{border-left:4px solid #ddd;padding-left:16px;color:#666}</style></head><body>${window.marked.parse(input.value || '')}</body></html>`;
        render.onclick = () => { preview.innerHTML = window.marked.parse(input.value || ''); };
        print.onclick = () => {
          const w = window.open('', '_blank');
          w.document.write(fullHtml());
          w.document.close(); w.focus(); w.print();
        };
        dl.onclick = () => {
          const blob = new Blob([fullHtml()], { type: 'text/html;charset=utf-8' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = 'markdown.html'; a.click();
        };
      },
    },
    {
      id: 'excel', icon: '📊', title: 'Excel 表格工具',
      desc: '考勤表/预算表/物资表模板 + 生成 Excel',
      render: function (box) {
        box.innerHTML = `
          <div style="margin-bottom:10px;font-size:13px">选择模板:</div>
          <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
            <button class="tool-btn" id="t-excel-attend" style="background:#3b82f6;color:#fff;border:none">👥 考勤表模板</button>
            <button class="tool-btn" id="t-excel-budget" style="background:#10b981;color:#fff;border:none">💰 预算表模板</button>
            <button class="tool-btn" id="t-excel-assets" style="background:#8b5cf6;color:#fff;border:none">📦 物资表模板</button>
            <button class="tool-btn" id="t-excel-csv">⬇️ CSV 导出器(通用)</button>
          </div>
          <div style="margin-bottom:8px;font-size:12px;color:var(--text-dim)">CSV 导出器: 每行一个条目,逗号分隔</div>
          <textarea id="t-excel-csv-input" placeholder="姓名,部门,值班日期&#10;张三,秘书处,2026-09-01&#10;李四,秘书处,2026-09-02" style="width:100%;height:120px;padding:10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:monospace;box-sizing:border-box"></textarea>`;
        const gen = (name, headers, rows) => {
          const ws = window.XLSX.utils.aoa_to_sheet([headers, ...rows]);
          const wb = window.XLSX.utils.book_new();
          window.XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
          window.XLSX.writeFile(wb, name + '.xlsx');
        };
        box.querySelector('#t-excel-attend').onclick = () => gen('考勤表', ['序号', '姓名', '部门', '日期', '出勤', '备注'], [['1', '', '', '', '✓', '']]);
        box.querySelector('#t-excel-budget').onclick = () => gen('预算表', ['序号', '项目', '单价', '数量', '小计', '备注'], [['1', '', '', '', '', ''], ['', '合计', '', '', '', '']]);
        box.querySelector('#t-excel-assets').onclick = () => gen('物资表', ['序号', '物资名称', '类别', '数量', '存放位置', '保管人'], [['1', '', '', '', '', '']]);
        box.querySelector('#t-excel-csv').onclick = () => {
          const text = box.querySelector('#t-excel-csv-input').value;
          if (!text.trim()) { alert('先输入内容'); return; }
          const blob = new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = 'data.csv'; a.click();
        };
      },
    },
    {
      id: 'image-tools', icon: '🖌️', title: '图片压缩/格式转换',
      desc: '压缩图片或转换格式(JPEG/PNG/WebP),全部本地处理',
      render: function (box) {
        box.innerHTML = `
          <input type="file" accept="image/*" id="t-img-file" style="margin-bottom:10px">
          <div style="display:flex;gap:6px;margin-bottom:10px;align-items:center;flex-wrap:wrap">
            <label style="font-size:12px">质量:</label>
            <input type="range" id="t-img-quality" min="0.1" max="1" step="0.05" value="0.7" style="width:140px">
            <span id="t-img-quality-label" style="font-size:12px;color:var(--text-dim)">70%</span>
            <select id="t-img-format" style="padding:4px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text)">
              <option value="image/jpeg">JPEG</option>
              <option value="image/png">PNG</option>
              <option value="image/webp">WebP</option>
            </select>
            <button class="tool-btn" id="t-img-go" style="background:#3b82f6;color:#fff;border:none">⬇️ 转换下载</button>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <div id="t-img-orig" style="font-size:11px;color:var(--text-dim)"></div>
            <div id="t-img-new" style="font-size:11px;color:var(--text-dim)"></div>
          </div>`;
        const file = box.querySelector('#t-img-file');
        const quality = box.querySelector('#t-img-quality');
        const qLabel = box.querySelector('#t-img-quality-label');
        const format = box.querySelector('#t-img-format');
        const go = box.querySelector('#t-img-go');
        const orig = box.querySelector('#t-img-orig');
        const nw = box.querySelector('#t-img-new');
        let selected = null;
        quality.oninput = () => { qLabel.textContent = Math.round(quality.value * 100) + '%'; };
        file.onchange = () => { selected = file.files[0]; if (selected) orig.textContent = `原图: ${(selected.size / 1024).toFixed(1)}KB`; };
        go.onclick = () => {
          if (!selected) { alert('先选择图片'); return; }
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            canvas.getContext('2d').drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL(format.value, parseFloat(quality.value));
            const bytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4);
            nw.textContent = `新图: ${(bytes / 1024).toFixed(1)}KB`;
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = 'converted.' + (format.value === 'image/png' ? 'png' : format.value === 'image/webp' ? 'webp' : 'jpg');
            a.click();
          };
          img.src = URL.createObjectURL(selected);
        };
      },
    },
    {
      id: 'qrcode', icon: '🔗', title: '二维码生成',
      desc: '生成任意文本/链接的二维码(本地生成)',
      render: function (box) {
        box.innerHTML = `
          <input type="text" id="t-qr-text" placeholder="输入文本或链接..." style="width:100%;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);box-sizing:border-box;margin-bottom:10px">
          <button class="tool-btn" id="t-qr-go" style="background:#3b82f6;color:#fff;border:none;margin-bottom:10px">🔗 生成二维码</button>
          <div id="t-qr-result"></div>`;
        const input = box.querySelector('#t-qr-text');
        const go = box.querySelector('#t-qr-go');
        const result = box.querySelector('#t-qr-result');
        go.onclick = () => {
          const text = input.value.trim();
          if (!text) { alert('先输入内容'); return; }
          if (!window.QRCode) { result.innerHTML = '<span style="color:#ef4444">二维码库未加载</span>'; return; }
          result.innerHTML = '';
          const qr = new window.QRCode(result, { text, width: 200, height: 200 });
          const link = document.createElement('a');
          link.href = result.querySelector('canvas') ? result.querySelector('canvas').toDataURL() : '';
          if (link.href) { link.download = 'qrcode.png'; link.textContent = '⬇️ 下载二维码'; link.style.display = 'block'; link.style.marginTop = '8px'; result.appendChild(link); }
        };
      },
    },
  ];

  function renderTools() {
    const body = document.getElementById('tools-body');
    if (!body) return;
    body.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px">' + TOOLS.map(t => `
      <div style="border:1px solid var(--border);border-radius:12px;padding:14px;background:var(--card-bg)">
        <div style="font-size:15px;font-weight:600;margin-bottom:4px">${t.icon} ${t.title}</div>
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:10px">${t.desc}</div>
        <div data-tool="${t.id}"></div>
      </div>`).join('') + '</div>';
    TOOLS.forEach(t => {
      const box = body.querySelector(`[data-tool="${t.id}"]`);
      if (box) t.render(box);
    });
  }

  // 暴露给 app.js 的 switchModule
  window.ToolsModule = { render: renderTools };

  // 注册到 CollabStudio
  if (window.CollabStudio) {
    window.CollabStudio.modules['tools'] = { open: () => renderTools() };
  }

  // 自动渲染(若当前面板已激活)
  document.addEventListener('DOMContentLoaded', () => { renderTools(); });
})();
