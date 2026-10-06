const state = {
  patent: null,
  extractedText: "",
  claims: [],
  analysis: null,
};

const els = {
  storageStatus: document.querySelector("#storageStatus"),
  tabPatent: document.querySelector("#tabPatent"),
  tabPdf: document.querySelector("#tabPdf"),
  patentPage: document.querySelector("#patentPage"),
  pdfPage: document.querySelector("#pdfPage"),
  patentSource: document.querySelector("#patentSource"),
  patentNumber: document.querySelector("#patentNumber"),
  pdfFile: document.querySelector("#pdfFile"),
  productText: document.querySelector("#productText"),
  modelName: document.querySelector("#modelName"),
  apiEndpoint: document.querySelector("#apiEndpoint"),
  apiKey: document.querySelector("#apiKey"),
  fetchPatentBtn: document.querySelector("#fetchPatentBtn"),
  loadSampleBtn: document.querySelector("#loadSampleBtn"),
  analyzeBtn: document.querySelector("#analyzeBtn"),
  saveVectorBtn: document.querySelector("#saveVectorBtn"),
  searchSimilarBtn: document.querySelector("#searchSimilarBtn"),
  exportPdfBtn: document.querySelector("#exportPdfBtn"),
  downloadJsonBtn: document.querySelector("#downloadJsonBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  progress: document.querySelector("#progress"),
  metaList: document.querySelector("#metaList"),
  summaryOutput: document.querySelector("#summaryOutput"),
  claimsOutput: document.querySelector("#claimsOutput"),
  similarOutput: document.querySelector("#similarOutput"),
  claimChartBody: document.querySelector("#claimChartBody"),
  riskBox: document.querySelector("#riskBox"),
  recommendations: document.querySelector("#recommendations"),
  reportPreview: document.querySelector("#reportPreview"),
};

const samplePatentText = `
摘要
本發明揭露一種用於智慧製造設備的感測資料分析系統，包含資料擷取模組、特徵轉換模組、異常偵測模組以及回饋控制模組。系統可即時分析設備狀態並產生維護建議。

技術領域
本發明關於工業設備監測，尤其是一種結合機器學習與邊緣運算的設備異常偵測方法。

申請專利範圍
1. 一種感測資料分析系統，包含：資料擷取模組，用以接收至少一設備感測訊號；特徵轉換模組，用以將該設備感測訊號轉換為特徵向量；異常偵測模組，用以依據該特徵向量產生異常分數；以及回饋控制模組，用以根據該異常分數產生控制指令。
2. 如請求項1所述之系統，其中該異常偵測模組包含一機器學習模型。
3. 如請求項1所述之系統，其中該回饋控制模組進一步產生維護排程建議。
`;

function setProgress(message, running = false) {
  els.progress.classList.toggle("running", running);
  els.progress.querySelector("p").textContent = message;
}

function switchTab(next) {
  const isPatent = next === "patent";
  els.tabPatent.classList.toggle("active", isPatent);
  els.tabPdf.classList.toggle("active", !isPatent);
  els.patentPage.classList.toggle("active", isPatent);
  els.pdfPage.classList.toggle("active", !isPatent);
}

function detectPatentSource(rawNumber, selectedSource) {
  const value = rawNumber.trim().toUpperCase();
  if (selectedSource !== "auto") return selectedSource.toUpperCase();
  if (value.startsWith("US")) return "US";
  if (value.startsWith("TW") || value.startsWith("I") || value.startsWith("M") || value.startsWith("D") || /^\d{8,9}$/.test(value)) return "TW";
  if (value.startsWith("EP")) return "EP";
  if (value.startsWith("WO")) return "WIPO";
  return "TW";
}

async function fetchPatentData(number, source) {
  const detectedSource = detectPatentSource(number, source);
  if (location.protocol.startsWith("http")) {
    try {
      const response = await fetch(`/api/patent?number=${encodeURIComponent(number.trim())}&source=${encodeURIComponent(source)}`);
      if (response.ok) {
        const data = await response.json();
        if (data?.text) return data;
      }
    } catch (error) {
      console.warn("Patent API failed, fallback to sample data.", error);
    }
  }
  await delay(550);
  return {
    number: number.trim(),
    source: detectedSource,
    title: "待接專利局 API 的專利資料",
    applicant: "資料來源待確認",
    status: "前端模擬資料",
    text: samplePatentText.replace("感測資料分析系統", `專利 ${number.trim()} 之感測資料分析系統`),
  };
}

async function readPdfText(file) {
  if (!file) return "";
  let pdfjsLib = null;
  try {
    pdfjsLib = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  } catch {
    return `PDF 檔名：${file.name}\n\n目前離線環境無法載入 PDF.js CDN。正式部署時可改由後端解析 PDF 或提供本機 PDF.js。`;
  }
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pageTexts = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pageTexts.push(content.items.map((item) => item.str).join(" "));
  }
  return pageTexts.join("\n\n");
}

function extractPatentSections(text) {
  const normalized = text.replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const abstract = pickSection(normalized, ["摘要", "Abstract"], ["技術領域", "申請專利範圍", "Claims"]) || normalized.slice(0, 220);
  const claimsText = pickSection(normalized, ["申請專利範圍", "Claims"], ["圖式", "說明書摘要", "符號說明"]) || "";
  const claims = parseClaims(claimsText || normalized);
  return { abstract, claims };
}

function pickSection(text, starts, ends) {
  const lower = text.toLowerCase();
  const startMatch = starts
    .map((label) => ({ label, index: lower.indexOf(label.toLowerCase()) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index)[0];
  if (!startMatch) return "";
  const from = startMatch.index + startMatch.label.length;
  const endIndex = ends
    .map((label) => lower.indexOf(label.toLowerCase(), from + 1))
    .filter((index) => index > from)
    .sort((a, b) => a - b)[0];
  return text.slice(from, endIndex || undefined).trim();
}

function parseClaims(text) {
  const matches = [...text.matchAll(/(?:^|\n)\s*(\d+)[\.、]\s*([\s\S]*?)(?=(?:\n\s*\d+[\.、]\s*)|$)/g)];
  if (matches.length) {
    return matches.map((match) => ({
      number: Number(match[1]),
      type: /如請求項|依據請求項|according to claim/i.test(match[2]) ? "附屬項" : "獨立項",
      text: match[2].replace(/\s+/g, " ").trim(),
      elements: splitClaimElements(match[2]),
    }));
  }
  return [
    {
      number: 1,
      type: "待確認",
      text: text.slice(0, 500).replace(/\s+/g, " ").trim() || "未偵測到 Claims",
      elements: splitClaimElements(text),
    },
  ];
}

function splitClaimElements(claimText) {
  return claimText
    .split(/[；;。]/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 8)
    .slice(0, 8);
}

async function analyzeWithModel(patent, sections, productText) {
  const endpoint = els.apiEndpoint.value.trim();
  if (endpoint) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(els.apiKey.value.trim() ? { Authorization: `Bearer ${els.apiKey.value.trim()}` } : {}),
        },
        body: JSON.stringify({
          model: els.modelName.value,
          prompt: buildPrompt(patent, sections, productText),
          stream: false,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        const raw = data.response || data.output || data.message?.content || "";
        const parsed = safeJson(raw);
        if (parsed) return normalizeAnalysis(parsed, sections, productText);
      }
    } catch (error) {
      console.warn("Model endpoint failed, fallback to local analysis.", error);
    }
  }
  await delay(650);
  return localAnalysis(patent, sections, productText);
}

function buildPrompt(patent, sections, productText) {
  return `請以繁體中文輸出 JSON，不要輸出 markdown。欄位包含 summary, claimChart, risk, recommendations。
專利資料：${JSON.stringify(patent)}
摘要：${sections.abstract}
Claims：${JSON.stringify(sections.claims)}
產品/技術描述：${productText}`;
}

function safeJson(raw) {
  try {
    const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function localAnalysis(patent, sections, productText) {
  const chart = sections.claims.flatMap((claim) =>
    claim.elements.map((element) => {
      const score = compareText(element, productText);
      return {
        element: `Claim ${claim.number}: ${element}`,
        productMapping: productText ? findBestSentence(productText, element) : "尚未提供產品描述",
        decision: score > 0.34 ? "部分符合" : score > 0.18 ? "無法判斷" : "未明確揭露",
        reason: score > 0.34 ? "產品描述與此技術特徵有文字或語意重疊。" : "目前資料不足，需要補充規格、流程或元件描述。",
      };
    })
  );
  const matched = chart.filter((row) => row.decision === "部分符合").length;
  const riskLevel = matched >= 3 ? "高" : matched >= 1 ? "中" : "低";
  return {
    summary: `${patent?.title || "本專利"}主要涉及${sections.abstract.slice(0, 150)}${sections.abstract.length > 150 ? "..." : ""}`,
    claimChart: chart,
    risk: {
      level: riskLevel,
      reason:
        riskLevel === "高"
          ? "多個 Claim element 與產品描述出現重疊，建議進一步由專利專業人員確認。"
          : riskLevel === "中"
            ? "部分技術特徵可能重疊，但現有產品資料仍不足以形成完整判斷。"
            : "目前產品描述未明確落入主要 Claim element，但仍需確認完整規格。",
    },
    recommendations: [
      "補充產品架構圖、模組流程與資料處理步驟，以降低無法判斷項目。",
      "針對獨立項逐一確認必要技術特徵是否全部存在。",
      "若存在重疊特徵，評估移除、替換或改變控制流程的迴避設計。",
    ],
  };
}

function normalizeAnalysis(parsed, sections, productText) {
  return {
    summary: parsed.summary || parsed.專利摘要 || "",
    claimChart: Array.isArray(parsed.claimChart) ? parsed.claimChart : localAnalysis(null, sections, productText).claimChart,
    risk: parsed.risk || { level: "待確認", reason: "模型未回傳風險理由。" },
    recommendations: parsed.recommendations || parsed.改善建議 || [],
  };
}

function compareText(a, b) {
  if (!b) return 0;
  const wordsA = tokenize(a);
  const wordsB = tokenize(b);
  const overlap = [...wordsA].filter((word) => wordsB.has(word)).length;
  return overlap / Math.max(wordsA.size, 1);
}

function tokenize(text) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 2)
  );
}

function findBestSentence(text, element) {
  const sentences = text.split(/[。；;\n]/).map((item) => item.trim()).filter(Boolean);
  return sentences.sort((a, b) => compareText(b, element) - compareText(a, element))[0] || "未找到對應描述";
}

function hashEmbedding(text) {
  const vector = Array.from({ length: 32 }, () => 0);
  for (const token of tokenize(text)) {
    let hash = 0;
    for (let index = 0; index < token.length; index += 1) {
      hash = (hash * 31 + token.charCodeAt(index)) >>> 0;
    }
    vector[hash % vector.length] += 1;
  }
  const norm = Math.hypot(...vector) || 1;
  return vector.map((value) => value / norm);
}

function cosine(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function getVectorStore() {
  return JSON.parse(localStorage.getItem("patentVectorStore") || "[]");
}

function setVectorStore(items) {
  localStorage.setItem("patentVectorStore", JSON.stringify(items));
  updateStorageStatus();
}

function updateStorageStatus() {
  els.storageStatus.textContent = `本機向量庫 ${getVectorStore().length} 筆`;
}

function saveToVectorStore() {
  if (!state.extractedText) {
    alert("請先抓取專利資料或上傳 PDF。");
    return;
  }
  const item = {
    id: crypto.randomUUID(),
    number: state.patent?.number || "PDF 上傳",
    title: state.patent?.title || "使用者上傳文件",
    createdAt: new Date().toISOString(),
    text: state.extractedText.slice(0, 6000),
    embedding: hashEmbedding(state.extractedText),
  };
  setVectorStore([item, ...getVectorStore()]);
  setProgress("已存入本機向量庫");
}

function searchSimilar() {
  const query = [state.extractedText, els.productText.value].join("\n").trim();
  if (!query) {
    alert("請先輸入或解析資料。");
    return;
  }
  const queryEmbedding = hashEmbedding(query);
  const results = getVectorStore()
    .map((item) => ({ ...item, score: cosine(queryEmbedding, item.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  if (!results.length) {
    els.similarOutput.innerHTML = `<p class="empty">向量庫目前沒有資料。</p>`;
    return;
  }
  els.similarOutput.innerHTML = results
    .map((item) => `<div class="claim-item"><strong>${escapeHtml(item.title)}</strong><p>專利號：${escapeHtml(item.number)}｜相似度：${Math.round(item.score * 100)}%</p></div>`)
    .join("");
}

function renderPatent(patent, sections) {
  const rows = [
    ["輸入號碼", patent?.inputNumber || patent?.number || "PDF 上傳"],
    ["查詢號碼", patent?.number || "PDF 上傳"],
    ["來源", patent?.isDemo ? "DEMO 範例資料" : patent?.source || "使用者文件"],
    ["名稱", patent?.title || "待分析文件"],
    ["申請人", patent?.applicant || "待確認"],
    ["發明人", patent?.inventor || "待確認"],
    ["公開日", patent?.publicationDate || "待確認"],
    ["狀態", patent?.status || "待確認"],
  ];
  if (Array.isArray(patent?.attemptedNumbers) && patent.attemptedNumbers.length) {
    rows.push(["嘗試格式", patent.attemptedNumbers.join("、")]);
  }
  if (patent?.url) {
    rows.push(["連結", `<a href="${escapeHtml(patent.url)}" target="_blank" rel="noreferrer">查看來源</a>`]);
  }
  els.metaList.innerHTML = rows
    .map(([key, value]) => {
      const rowClass = key === "狀態" ? "meta-row status-row" : "meta-row";
      return `<div class="${rowClass}"><dt>${key}</dt><dd>${key === "連結" ? value : escapeHtml(value)}</dd></div>`;
    })
    .join("");
  els.summaryOutput.textContent = sections.abstract || "未擷取到摘要";
  els.summaryOutput.classList.remove("empty");
  els.claimsOutput.classList.remove("empty");
  els.claimsOutput.innerHTML = sections.claims
    .map((claim) => `<div class="claim-item"><strong>Claim ${claim.number}（${claim.type}）</strong><p>${escapeHtml(claim.text)}</p></div>`)
    .join("");
}

function renderAnalysis(analysis) {
  els.summaryOutput.textContent = analysis.summary;
  els.claimChartBody.innerHTML = analysis.claimChart.length
    ? analysis.claimChart
        .map(
          (row) => `<tr>
            <td>${escapeHtml(row.element)}</td>
            <td>${escapeHtml(row.productMapping)}</td>
            <td>${escapeHtml(row.decision)}</td>
            <td>${escapeHtml(row.reason)}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="4" class="empty-cell">沒有足夠資料產生 Claim Chart</td></tr>`;
  const levelClass = analysis.risk.level === "高" ? "high" : analysis.risk.level === "中" ? "medium" : "low";
  els.riskBox.className = `risk-box risk-${levelClass}`;
  els.riskBox.innerHTML = `<strong><span class="badge ${levelClass}">${escapeHtml(analysis.risk.level)}風險</span></strong><p>${escapeHtml(analysis.risk.reason)}</p>`;
  els.recommendations.innerHTML = analysis.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

async function runAnalysis() {
  if (!state.extractedText) {
    alert("請先輸入專利號抓取資料，或上傳 PDF。");
    return;
  }
  setProgress("正在擷取摘要與 Claims", true);
  const sections = extractPatentSections(state.extractedText);
  state.claims = sections.claims;
  renderPatent(state.patent, sections);
  setProgress(`正在使用 ${els.modelName.value} 進行分析`, true);
  state.analysis = await analyzeWithModel(state.patent, sections, els.productText.value.trim());
  renderAnalysis(state.analysis);
  setProgress("分析完成");
}

function exportPdfReport() {
  if (!state.analysis) {
    alert("請先完成分析。");
    return;
  }
  const printWindow = window.open("", "_blank", "width=980,height=720");
  const reportHtml = `
    <html>
      <head>
        <title>專利分析報告</title>
        <link rel="stylesheet" href="${new URL("./styles.css", location.href).href}" />
      </head>
      <body>
        <main class="panel" style="box-shadow:none;max-width:980px;margin:24px auto;">
          <h1>專利分析報告</h1>
          ${els.metaList.outerHTML}
          <h2>專利摘要</h2>
          <p>${escapeHtml(state.analysis.summary)}</p>
          ${els.reportPreview.innerHTML}
        </main>
        <script>window.onload = () => setTimeout(() => window.print(), 250);<\/script>
      </body>
    </html>`;
  printWindow.document.write(reportHtml);
  printWindow.document.close();
}

function downloadJson() {
  const payload = {
    patent: state.patent,
    extractedText: state.extractedText,
    claims: state.claims,
    analysis: state.analysis,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `patent-analysis-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function resetAll() {
  state.patent = null;
  state.extractedText = "";
  state.claims = [];
  state.analysis = null;
  els.metaList.innerHTML = "";
  els.summaryOutput.textContent = "尚未分析";
  els.summaryOutput.className = "empty";
  els.claimsOutput.textContent = "尚未擷取 Claims";
  els.claimsOutput.className = "claims-list empty";
  els.similarOutput.textContent = "尚未搜尋";
  els.similarOutput.className = "empty";
  els.claimChartBody.innerHTML = `<tr><td colspan="4" class="empty-cell">尚未產生 Claim Chart</td></tr>`;
  els.riskBox.className = "risk-box";
  els.riskBox.innerHTML = "<strong>尚未評估</strong><p>完成分析後會顯示風險等級、理由與改善建議。</p>";
  els.recommendations.innerHTML = "<li>尚未產生建議</li>";
  setProgress("已清除，等待輸入資料");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.tabPatent.addEventListener("click", () => switchTab("patent"));
els.tabPdf.addEventListener("click", () => switchTab("pdf"));
els.fetchPatentBtn.addEventListener("click", async () => {
  if (!els.patentNumber.value.trim()) {
    alert("請輸入專利號。");
    return;
  }
  setProgress("正在抓取專利資料", true);
  state.patent = await fetchPatentData(els.patentNumber.value, els.patentSource.value);
  state.extractedText = state.patent.text;
  renderPatent(state.patent, extractPatentSections(state.extractedText));
  setProgress(state.patent.isDemo ? "未找到真實專利資料，已載入 DEMO，可開始分析" : "已取得真實專利資料，可開始分析");
});

els.pdfFile.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  setProgress("正在解析 PDF", true);
  state.patent = {
    number: file.name,
    source: "PDF",
    title: file.name.replace(/\.pdf$/i, ""),
    applicant: "使用者上傳",
    status: "待分析",
  };
  state.extractedText = await readPdfText(file);
  renderPatent(state.patent, extractPatentSections(state.extractedText));
  setProgress("PDF 解析完成，可開始分析");
});

els.loadSampleBtn.addEventListener("click", () => {
  state.patent = {
    number: "SAMPLE-001",
    source: "範例",
    title: "智慧製造設備感測資料分析系統",
    applicant: "範例公司",
    status: "範例資料",
  };
  state.extractedText = samplePatentText;
  els.productText.value =
    "本產品包含設備感測資料收集器、特徵向量轉換服務、異常分數模型，以及依據異常分數通知維護人員的排程模組。";
  renderPatent(state.patent, extractPatentSections(state.extractedText));
  setProgress("範例內容已載入，可開始分析");
});

els.analyzeBtn.addEventListener("click", runAnalysis);
els.saveVectorBtn.addEventListener("click", saveToVectorStore);
els.searchSimilarBtn.addEventListener("click", searchSimilar);
els.exportPdfBtn.addEventListener("click", exportPdfReport);
els.downloadJsonBtn.addEventListener("click", downloadJson);
els.clearBtn.addEventListener("click", resetAll);

updateStorageStatus();
