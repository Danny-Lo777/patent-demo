const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 8005);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

const sampleText = `
摘要
本發明揭露一種用於智慧製造設備的感測資料分析系統，包含資料擷取模組、特徵轉換模組、異常偵測模組以及回饋控制模組。系統可即時分析設備狀態並產生維護建議。

申請專利範圍
1. 一種感測資料分析系統，包含：資料擷取模組，用以接收至少一設備感測訊號；特徵轉換模組，用以將該設備感測訊號轉換為特徵向量；異常偵測模組，用以依據該特徵向量產生異常分數；以及回饋控制模組，用以根據該異常分數產生控制指令。
2. 如請求項1所述之系統，其中該異常偵測模組包含一機器學習模型。
3. 如請求項1所述之系統，其中該回饋控制模組進一步產生維護排程建議。
`;

const knownTaiwanPatents = {
  TWI872589B: {
    inputNumber: "I872589",
    number: "TWI872589B",
    source: "內建真實公開範例",
    title: "資料查證系統",
    applicant: "華南商業銀行股份有限公司",
    inventor: "李靜斐",
    publicationDate: "2025-02-11",
    applicationNumber: "TW112124002A",
    status: "已載入內建真實公開專利資料；適合在無外網環境 DEMO",
    isDemo: false,
    url: "https://patents.google.com/patent/TWI872589B/zh",
    attemptedNumbers: ["I872589", "TWI872589B", "TWI872589"],
    text: `
摘要
一種資料查證系統，包含請求裝置、查證伺服器、兩平台伺服器及對應的兩資料庫。請求裝置用於發出關聯於特定客戶資料的查證請求。查證伺服器用於根據查證請求產生並向外部發送查證訊息。平台伺服器接收查證訊息後，從預存客戶資料中查找查證資料，再回傳至查證伺服器。查證伺服器根據多個查證資料產生查證結果。

技術內容
本專利關於資料查證系統，透過多方平台伺服器回傳查證資料，並依據資料品質、回覆速度、來源可信度等因素進行加權運算，以產生查證結果並更新平台資料。

申請專利範圍
1. 一種資料查證系統，包含：一請求裝置，用於發出關聯於一筆特定客戶資料的一查證請求；一查證伺服器，用於根據該查證請求產生並向外部發送一查證訊息；一第一資料庫及一第一平台伺服器，用於接收該查證訊息並查找一第一查證資料；一第二資料庫及一第二平台伺服器，用於接收該查證訊息並查找一第二查證資料；其中，該查證伺服器根據該第一查證資料及該第二查證資料產生一查證結果，並根據資料品質及回覆速度進行加權運算。
2. 如請求項1所述的資料查證系統，更包含一雲端伺服器，訊號連接於該查證伺服器、該第一平台伺服器及該第二平台伺服器。
3. 如請求項1所述的資料查證系統，其中該查證訊息與該第一平台伺服器及該第二平台伺服器之間各自具有至少一關聯性，且該查證伺服器根據該至少一關聯性判定可信度。
4. 如請求項1所述的資料查證系統，更包含一第三資料庫及一第三平台伺服器，用於回傳一第三查證資料，使該查證伺服器根據多筆查證資料產生該查證結果。
5. 如請求項1所述的資料查證系統，其中該第一平台伺服器及該第二平台伺服器更用於分別根據該查證結果更新資料庫。
`.trim(),
  },
};

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": contentTypes[".json"] });
  response.end(JSON.stringify(payload));
}

function sendFile(response, filePath) {
  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
    response.end(data);
  });
}

async function fetchPatent(number, source = "tw") {
  const normalized = number.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) throw new Error("專利號不可為空");
  const candidates = buildPatentCandidates(normalized, source);
  const knownPatent = findKnownPatent(candidates, normalized);
  if (knownPatent) return knownPatent;
  const errors = [];
  for (const candidate of candidates) {
    try {
      return await fetchGooglePatent(candidate, normalized, candidates);
    } catch (error) {
      errors.push(`${candidate}: ${error.message}`);
    }
  }
  const tipoNote = isTipoNumber(normalized) ? "TIPO 官方查詢頁需要人工輸入檢核碼；" : "";
  throw new Error(`${tipoNote}已嘗試 ${candidates.join("、")}，仍未找到可解析的公開資料`);
}

function findKnownPatent(candidates, inputNumber) {
  const hitKey = candidates.find((candidate) => knownTaiwanPatents[candidate]);
  if (!hitKey) return null;
  return {
    ...knownTaiwanPatents[hitKey],
    inputNumber,
    attemptedNumbers: candidates,
  };
}

async function fetchGooglePatent(candidate, inputNumber, attemptedNumbers) {
  const url = `https://patents.google.com/patent/${encodeURIComponent(candidate)}/zh`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 PatentAnalysisPrototype/1.0",
      Accept: "text/html",
    },
  });
  if (!response.ok) throw new Error(`Google Patents response ${response.status}`);
  const html = await response.text();
  const title = extractTitle(html) || `專利 ${candidate}`;
  const abstract = extractGoogleSection(html, "abstract");
  const claims = extractGoogleClaims(html);
  const inventor = pickMeta(html, "DC.contributor") || pickMeta(html, "citation_inventor") || "待確認";
  const applicant = pickMeta(html, "DC.assignee") || pickMeta(html, "citation_assignee") || "待確認";
  const publicationDate = pickMeta(html, "DC.date") || pickMeta(html, "citation_publication_date") || "待確認";
  const applicationNumber = pickMeta(html, "citation_application_number") || "待確認";
  if (!abstract && !claims) {
    throw new Error("查無摘要與 Claims，可能不是有效專利號或資料來源未提供全文");
  }
  return {
    inputNumber,
    number: candidate,
    source: isTipoNumber(inputNumber) ? "Google Patents 台灣資料" : "Google Patents",
    title: cleanup(title),
    applicant: cleanup(applicant),
    inventor: cleanup(inventor),
    publicationDate: cleanup(publicationDate),
    applicationNumber: cleanup(applicationNumber),
    status: isTipoNumber(inputNumber) ? "已使用台灣候選格式抓取公開資料" : "已抓取公開資料",
    isDemo: false,
    url,
    attemptedNumbers,
    text: `摘要\n${cleanup(abstract)}\n\n申請專利範圍\n${claims}`.trim(),
  };
}

function pickMeta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i");
  return html.match(pattern)?.[1] || "";
}

function extractTitle(html) {
  return (
    pickMeta(html, "DC.title") ||
    pickMeta(html, "citation_title") ||
    html.match(/<span[^>]+itemprop=["']title["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] ||
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
    ""
  );
}

function extractGoogleSection(html, itemprop) {
  const pattern = new RegExp(`<section[^>]+itemprop=["']${itemprop}["'][^>]*>([\\s\\S]*?)<\\/section>`, "i");
  return html.match(pattern)?.[1] || "";
}

function extractGoogleClaims(html) {
  const claimsSection = extractGoogleSection(html, "claims");
  if (!claimsSection) return "";
  const claimMatches = [...claimsSection.matchAll(/<div[^>]+class=["'][^"']*claim[^"']*["'][^>]*>([\s\S]*?)(?=<div[^>]+class=["'][^"']*claim[^"']*["']|<\/section>)/gi)];
  const claimTexts = claimMatches
    .map((match) => cleanup(match[1]))
    .filter((text) => /^\d+\./.test(text) || text.length > 40);
  if (claimTexts.length) return claimTexts.join("\n");
  return cleanup(claimsSection).replace(/\s+(?=\d+\.\s)/g, "\n");
}

function cleanup(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function isTipoNumber(number) {
  return /^(?:\d{9}|I\d{6,}|M\d{6,}|D\d{6,}|TW.+)$/i.test(number);
}

function buildPatentCandidates(number, source) {
  const raw = number.replace(/\s+/g, "").toUpperCase();
  const values = [];
  const add = (value) => {
    if (value && !values.includes(value)) values.push(value);
  };

  add(raw);
  if (source === "tw" || source === "auto" || isTipoNumber(raw)) {
    if (raw.startsWith("TW")) {
      add(raw);
      add(raw.replace(/^TW\s*/, "TW"));
    } else if (/^I\d{6,}$/.test(raw)) {
      add(`TW${raw}B`);
      add(`TW${raw}`);
    } else if (/^M\d{6,}$/.test(raw)) {
      add(`TW${raw}U`);
      add(`TW${raw}`);
    } else if (/^D\d{6,}$/.test(raw)) {
      add(`TW${raw}S`);
      add(`TW${raw}`);
    } else if (/^\d{9}$/.test(raw)) {
      add(`TW${raw}A`);
      add(`TW${raw}`);
    } else if (/^\d{8}$/.test(raw)) {
      add(`TW${raw}A`);
      add(`TW${raw}B`);
      add(`TW${raw}`);
    }
  }
  return values;
}

function getFallbackUrl(number) {
  if (isTipoNumber(number.trim().toUpperCase().replace(/\s+/g, ""))) {
    return "https://tiponet.tipo.gov.tw/S092_OUT/2022/query";
  }
  return "";
}

function demoPatent(number, reason) {
  const normalized = number.trim().toUpperCase().replace(/\s+/g, "");
  return {
    inputNumber: number,
    number: normalized,
    source: "DEMO",
    title: "智慧製造設備感測資料分析系統",
    applicant: "範例公司",
    inventor: "範例發明人",
    publicationDate: "DEMO",
    applicationNumber: "DEMO",
    status: `未找到對應專利或資料抓取失敗，已使用 DEMO：${reason}`,
    isDemo: true,
    url: getFallbackUrl(number),
    attemptedNumbers: buildPatentCandidates(normalized || number, "tw"),
    text: sampleText,
  };
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === "/api/patent") {
    const number = url.searchParams.get("number");
    if (!number) {
      sendJson(response, 400, { error: "missing patent number" });
      return;
    }
    try {
      sendJson(response, 200, await fetchPatent(number, url.searchParams.get("source") || "tw"));
    } catch (error) {
      sendJson(response, 200, demoPatent(number, error.message));
    }
    return;
  }

  const filePath = path.join(root, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname));
  sendFile(response, filePath);
});

server.listen(port, () => {
  console.log(`專利查詢分析網頁：http://localhost:${port}/`);
});
