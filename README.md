# 台灣專利查詢分析系統

這是一個 Streamlit 版台灣專利查詢與 AI 輔助分析 Demo。使用者可輸入台灣專利號或上傳文字型 PDF，系統會擷取專利內容，並根據產品 / 技術描述產生 Claim Chart、侵權風險初評與 JSON 報告。

## 使用方式

安裝依賴：

```bash
pip install -r requirements-streamlit.txt
```

啟動服務：

```bash
streamlit run streamlit_app.py --server.port 8501 --server.address 0.0.0.0 --server.headless true
```

Windows 也可直接執行：

```text
install-streamlit.bat
start-streamlit.bat
```

啟動後開啟：

```text
http://localhost:8501/
```

## 操作流程

### 1. 專利號查詢

可輸入台灣申請案號、公開號或公告號，例如：

```text
I584190
I624608
I906771
```

系統會自動嘗試台灣常見格式，例如輸入 `I584190` 時，會嘗試：

```text
I584190
TWI584190B
TWI584190
```

若 Google Patents 可取得摘要或 Claims，系統會使用真實公開資料。若查不到或資料不足，系統會改用 DEMO 資料。

### 2. PDF 上傳

可上傳文字型 PDF，系統會擷取 PDF 文字後進行分析。

目前不支援掃描型 PDF OCR。

### 3. 產品 / 技術描述

輸入要比對的產品、系統或技術內容，例如：

```text
本產品是一套伺服器例外處理系統，當應用程式發生錯誤時，會捕捉例外事件，記錄錯誤上下文，並依照預設規則產生修復流程。
```

### 4. 開始分析

按下「開始分析」後，系統會產生：

- Claim 技術要件拆解
- Claim Chart
- 符合 / 部分符合 / 不符合判斷
- 侵權風險高 / 中 / 低初評
- 證據高光
- 迴避設計建議
- JSON 報告下載

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

## 限制與注意事項

- 本系統為 AI 輔助分析工具，不構成法律意見。
- 目前主要資料來源為 Google Patents 台灣資料。
- TIPO 官方查詢頁含檢核碼，未自動爬取。
- PDF 目前僅支援文字型 PDF，不支援掃描型 OCR。
- 若啟用 Qwen / Ollama，需自行啟動 Ollama 並安裝模型。
- 未啟用 Qwen / Ollama 時，系統會使用本機 fallback 分析，速度較快但精準度較低。

## 後續正式化建議

1. 串接 TIPO 官方 API 或授權資料庫。
2. 加入掃描型 PDF OCR。
3. 加入使用者帳號、權限與歷史紀錄。
4. 匯出正式 PDF / Word 報告。
5. 後續若要做大量相似專利搜尋，再導入向量資料庫。
