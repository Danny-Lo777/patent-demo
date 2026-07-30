# 台灣專利查詢分析系統

這是一個台灣專利查詢與 AI 輔助分析 Demo，可輸入台灣專利號或上傳文字型 PDF，擷取專利內容後產生 Claim Chart、侵權風險評估與 JSON 報告。

## Streamlit 版使用方式

建議使用 Streamlit 版：

```bash
pip install -r requirements-streamlit.txt
streamlit run streamlit_app.py --server.port 8501
```

Windows 可直接執行：

```text
start-streamlit.bat
```

啟動後開啟：

```text
http://localhost:8501/
```

## Node 版使用方式

保留早期 Node/HTML MVP：

```bash
node server.js
```

啟動後開啟 `http://localhost:8005/`。

Windows 可直接執行：

```text
start.bat
```

啟動後開啟：

```text
http://localhost:8005/
```

## 台灣專利查詢測試

目前系統以台灣專利為主。可輸入申請案號、公開號或公告號，例如：

- `I584190`
- `I624608`
- `I906771`
- `M123456`
- `D123456`

系統會自動嘗試多種台灣常見格式，例如輸入 `I606827` 時會嘗試 `I606827`、`TWI606827B`、`TWI606827`。若沒有找到、網路不可用、或抓不到摘要與 Claims，畫面會顯示 `DEMO 範例資料`，並自動使用範例內容讓後續分析流程可以繼續。

台灣 TIPO 的公開資訊查詢頁包含檢核碼，後端不會自動繞過驗證碼。輸入 TIPO 格式號碼時，系統會附上官方查詢頁連結並使用 DEMO 資料。

## 已完成

- Streamlit 版操作介面
- 台灣專利號查詢
- PDF 上傳與文字型 PDF 解析
- 整合 patent-analyzer-llm 的三階段分析流程
- Qwen / Ollama 分析設定
- 本機 fallback 分析
- Claim Chart
- 侵權風險評估
- JSON 報告下載
- 輸入區、分析區、報告區三欄式版面
- 專利號輸入與資料抓取流程雛形
- 無套件 Node 後端 `/api/patent`，可嘗試抓取 Google Patents 公開資料
- 找不到專利、外網失敗或資料不足時，自動回傳 DEMO 資料
- PDF 上傳與文字解析流程
- 摘要與 Claims 擷取
- Claim element 拆解
- Qwen / Llama 模型設定欄位
- 可接外部模型 endpoint 的分析流程
- 本機 fallback 分析
- Claim Chart
- 侵權風險評估
- 改善建議
- 本機 localStorage 向量庫
- 相似專利搜尋雛形
- 報告列印成 PDF
- JSON 匯出

## 後續正式化建議

1. 若要正式商用，建議將 `fetchPatentData` / `/api/patent` 改接 TIPO、USPTO、EPO 等官方 API 或授權資料庫。
2. 將 PDF 解析與 OCR 搬到後端，避免大型檔案卡住瀏覽器。
3. 將 Qwen API Key 放在後端，不要留在前端。
4. 將目前 localStorage 向量庫改為 Qdrant、Milvus、pgvector 或 Chroma。
5. 報告輸出可改由後端產生正式 PDF。
