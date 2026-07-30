import json
import re
from dataclasses import dataclass
from typing import Any

import requests
import streamlit as st
from bs4 import BeautifulSoup
from PyPDF2 import PdfReader


st.set_page_config(
    page_title="台灣專利查詢分析系統",
    page_icon="⚖️",
    layout="wide",
)

st.markdown(
    """
    <style>
    .patent-meta-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin: 6px 0 20px;
    }
    .patent-meta-item {
      border: 1px solid rgba(250, 250, 250, 0.16);
      border-radius: 8px;
      padding: 12px 14px;
      min-width: 0;
    }
    .patent-meta-item span {
      display: block;
      color: rgba(250, 250, 250, 0.72);
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .patent-meta-item strong {
      display: block;
      color: #fff;
      font-size: 18px;
      line-height: 1.4;
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    @media (max-width: 900px) {
      .patent-meta-grid {
        grid-template-columns: 1fr;
      }
    }
    </style>
    """,
    unsafe_allow_html=True,
)

DEFAULT_OLLAMA_URL = "http://localhost:11434/api/generate"
DEFAULT_MODEL = "qwen2.5"
TIPO_QUERY_URL = "https://tiponet.tipo.gov.tw/S092_OUT/2022/query"


SAMPLE_TEXT = """
摘要
本發明揭露一種用於智慧製造設備的感測資料分析系統，包含資料擷取模組、特徵轉換模組、異常偵測模組以及回饋控制模組。系統可即時分析設備狀態並產生維護建議。

申請專利範圍
1. 一種感測資料分析系統，包含：資料擷取模組，用以接收至少一設備感測訊號；特徵轉換模組，用以將該設備感測訊號轉換為特徵向量；異常偵測模組，用以依據該特徵向量產生異常分數；以及回饋控制模組，用以根據該異常分數產生控制指令。
2. 如請求項1所述之系統，其中該異常偵測模組包含一機器學習模型。
3. 如請求項1所述之系統，其中該回饋控制模組進一步產生維護排程建議。
""".strip()


@dataclass
class PatentRecord:
    input_number: str
    number: str
    source: str
    title: str
    applicant: str
    inventor: str
    publication_date: str
    status: str
    url: str
    text: str
    attempted_numbers: list[str]
    is_demo: bool = False


def cleanup(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def is_tipo_number(number: str) -> bool:
    return bool(re.match(r"^(?:\d{8,9}|I\d{6,}|M\d{6,}|D\d{6,}|TW.+)$", number, re.I))


def build_patent_candidates(number: str) -> list[str]:
    raw = re.sub(r"\s+", "", number.upper())
    values: list[str] = []

    def add(value: str) -> None:
        if value and value not in values:
            values.append(value)

    add(raw)
    if raw.startswith("TW"):
        add(raw)
    elif re.match(r"^I\d{6,}$", raw):
        add(f"TW{raw}B")
        add(f"TW{raw}")
    elif re.match(r"^M\d{6,}$", raw):
        add(f"TW{raw}U")
        add(f"TW{raw}")
    elif re.match(r"^D\d{6,}$", raw):
        add(f"TW{raw}S")
        add(f"TW{raw}")
    elif re.match(r"^\d{9}$", raw):
        add(f"TW{raw}A")
        add(f"TW{raw}")
    elif re.match(r"^\d{8}$", raw):
        add(f"TW{raw}A")
        add(f"TW{raw}B")
        add(f"TW{raw}")
    return values


def extract_section(soup: BeautifulSoup, itemprop: str) -> str:
    section = soup.find("section", {"itemprop": itemprop})
    return section.get_text("\n", strip=True) if section else ""


def fetch_google_patent(candidate: str, input_number: str, attempted: list[str]) -> PatentRecord:
    url = f"https://patents.google.com/patent/{candidate}/zh"
    response = requests.get(
        url,
        headers={"User-Agent": "Mozilla/5.0 PatentAnalysisStreamlit/1.0"},
        timeout=20,
    )
    response.raise_for_status()
    response.encoding = "utf-8"
    soup = BeautifulSoup(response.content, "html.parser", from_encoding="utf-8")

    title = ""
    title_meta = soup.find("meta", {"name": "DC.title"})
    if title_meta:
        title = title_meta.get("content", "")
    if not title and soup.title:
        title = soup.title.get_text(" ", strip=True)

    abstract = extract_section(soup, "abstract")
    claims = extract_section(soup, "claims")
    if not abstract and not claims:
        raise ValueError("頁面沒有可解析的摘要與 Claims")

    applicant = ""
    inventor = ""
    date = ""
    for meta in soup.find_all("meta"):
        name = meta.get("name") or meta.get("property")
        content = meta.get("content", "")
        if name == "DC.assignee" and not applicant:
            applicant = content
        elif name in {"DC.contributor", "citation_inventor"} and not inventor:
            inventor = content
        elif name in {"DC.date", "citation_publication_date"} and not date:
            date = content

    return PatentRecord(
        input_number=input_number,
        number=candidate,
        source="Google Patents 台灣資料" if is_tipo_number(input_number) else "Google Patents",
        title=cleanup(title) or candidate,
        applicant=cleanup(applicant) or "待確認",
        inventor=cleanup(inventor) or "待確認",
        publication_date=cleanup(date) or "待確認",
        status="已抓取公開資料",
        url=url,
        attempted_numbers=attempted,
        text=f"摘要\n{cleanup(abstract)}\n\n申請專利範圍\n{cleanup(claims)}",
        is_demo=False,
    )


def fetch_patent(number: str) -> PatentRecord:
    normalized = re.sub(r"\s+", "", number.upper())
    attempted = build_patent_candidates(normalized)
    errors = []
    for candidate in attempted:
        try:
            return fetch_google_patent(candidate, normalized, attempted)
        except Exception as exc:
            errors.append(f"{candidate}: {exc}")

    tipo_note = "TIPO 官方查詢頁需要人工輸入檢核碼；" if is_tipo_number(normalized) else ""
    return PatentRecord(
        input_number=number,
        number=normalized,
        source="DEMO",
        title="智慧製造設備感測資料分析系統",
        applicant="範例公司",
        inventor="範例發明人",
        publication_date="DEMO",
        status=f"未找到對應專利或資料抓取失敗，已使用 DEMO：{tipo_note}已嘗試 {'、'.join(attempted)}",
        url=TIPO_QUERY_URL if is_tipo_number(normalized) else "",
        attempted_numbers=attempted,
        text=SAMPLE_TEXT,
        is_demo=True,
    )


def extract_pdf_text(uploaded_file) -> str:
    reader = PdfReader(uploaded_file)
    page_texts = []
    for page_index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if text.strip():
            page_texts.append(f"第 {page_index} 頁\n{text.strip()}")
    return "\n\n".join(page_texts).strip()


def build_pdf_record(uploaded_file, text: str) -> PatentRecord:
    return PatentRecord(
        input_number=uploaded_file.name,
        number=uploaded_file.name,
        source="PDF 上傳",
        title=re.sub(r"\.pdf$", "", uploaded_file.name, flags=re.I),
        applicant="使用者上傳",
        inventor="待確認",
        publication_date="待確認",
        status="已解析文字型 PDF；若內容不完整，可能需要 OCR",
        url="",
        attempted_numbers=[],
        text=text,
        is_demo=False,
    )


def parse_claims(text: str) -> list[dict[str, Any]]:
    match = re.search(r"(申請專利範圍|Claims)(.*)", text, flags=re.I | re.S)
    claims_text = match.group(2) if match else text
    found = re.findall(r"(?:^|\n)\s*(\d+)[\.、]\s*(.*?)(?=\n\s*\d+[\.、]|\Z)", claims_text, flags=re.S)
    if not found:
        return [{"number": 1, "text": cleanup(claims_text[:1200])}]
    return [{"number": int(num), "text": cleanup(body)} for num, body in found[:12]]


def parse_json(raw: str) -> Any:
    cleaned = re.sub(r"```(?:json)?|```", "", raw).strip()
    idx_arr = cleaned.find("[")
    idx_obj = cleaned.find("{")
    if idx_arr == -1 and idx_obj == -1:
        raise ValueError("找不到 JSON")
    start = idx_obj if idx_arr == -1 else idx_arr if idx_obj == -1 else min(idx_arr, idx_obj)
    cleaned = cleaned[start:]
    end = max(cleaned.rfind("]"), cleaned.rfind("}"))
    return json.loads(cleaned[: end + 1])


def ollama_generate(prompt: str, endpoint: str, model: str) -> str:
    payload = {"model": model, "prompt": prompt, "stream": False}
    response = requests.post(endpoint, json=payload, timeout=180)
    response.raise_for_status()
    data = response.json()
    return data.get("response") or data.get("output") or data.get("message", {}).get("content", "")


def split_elements_fallback(claim_text: str) -> list[dict[str, str]]:
    parts = [cleanup(part) for part in re.split(r"[；;。]", claim_text) if len(cleanup(part)) > 8]
    return [
        {
            "element_id": chr(65 + idx),
            "element_name": part[:20],
            "description": part,
            "boundary_description": "需確認產品是否具備此技術特徵。",
        }
        for idx, part in enumerate(parts[:8])
    ]


def extract_elements(claim_text: str, endpoint: str, model: str, use_llm: bool) -> list[dict[str, Any]]:
    if not use_llm:
        return split_elements_fallback(claim_text)
    prompt = f"""你是資深專利工程師。請從下列專利請求項拆解技術要件。
請只輸出 JSON array，不要 markdown。

格式：
[
  {{
    "element_id": "A",
    "element_name": "短名稱",
    "description": "完整技術要件描述",
    "boundary_description": "侵權比對時的判斷邊界"
  }}
]

專利請求項：
{claim_text}

JSON output:"""
    return parse_json(ollama_generate(prompt, endpoint, model))


def compare_product(elements: list[dict[str, Any]], product_desc: str, endpoint: str, model: str, use_llm: bool) -> list[dict[str, Any]]:
    if not use_llm:
        return compare_product_fallback(elements, product_desc)
    prompt = f"""你是專利侵權分析專家，請套用 All Elements Rule。
請逐一比對專利要件與產品描述，並只輸出 JSON array。

Patent elements:
{json.dumps(elements, ensure_ascii=False, indent=2)}

Product description:
{product_desc}

格式：
[
  {{
    "element_id": "A",
    "element_name": "名稱",
    "patent_description": "專利要件",
    "product_mapping": "產品對應特徵或無對應",
    "verdict": "符合 or 部分符合 or 不符合",
    "reason": "繁體中文判斷理由"
  }}
]

JSON output:"""
    return parse_json(ollama_generate(prompt, endpoint, model))


def compare_product_fallback(elements: list[dict[str, Any]], product_desc: str) -> list[dict[str, Any]]:
    product_tokens = set(re.findall(r"[\w\u4e00-\u9fff]{2,}", product_desc.lower()))
    rows = []
    for element in elements:
        desc = element.get("description", "")
        tokens = set(re.findall(r"[\w\u4e00-\u9fff]{2,}", desc.lower()))
        overlap = len(tokens & product_tokens) / max(len(tokens), 1)
        verdict = "部分符合" if overlap > 0.18 else "不符合"
        rows.append(
            {
                "element_id": element.get("element_id"),
                "element_name": element.get("element_name"),
                "patent_description": desc,
                "product_mapping": product_desc[:180] if overlap > 0.18 else "目前產品描述未明確揭露對應特徵",
                "verdict": verdict,
                "reason": "以關鍵詞重疊進行本機初步比對；正式分析建議啟用 Qwen/Ollama。",
            }
        )
    return rows


def assess_risk(claim_chart: list[dict[str, Any]], endpoint: str, model: str, use_llm: bool) -> dict[str, Any]:
    if not use_llm:
        return assess_risk_fallback(claim_chart)
    summary = [{"id": row.get("element_id"), "verdict": row.get("verdict"), "reason": row.get("reason", "")} for row in claim_chart]
    prompt = f"""你是專利侵權風險顧問。請根據 Claim Chart 摘要產生風險評估。
請只輸出 JSON object，不要 markdown。

Claim chart summary:
{json.dumps(summary, ensure_ascii=False, indent=2)}

格式：
{{
  "risk_level": "高 or 中 or 低",
  "risk_summary": "繁體中文一句話摘要",
  "matched_count": 0,
  "partial_count": 0,
  "unmatched_count": 0,
  "avoidance_advice": "具體迴避設計建議",
  "evidence_highlight": "關鍵技術要件"
}}

JSON output:"""
    try:
        return parse_json(ollama_generate(prompt, endpoint, model))
    except Exception:
        return assess_risk_fallback(claim_chart)


def assess_risk_fallback(claim_chart: list[dict[str, Any]]) -> dict[str, Any]:
    matched = sum(1 for row in claim_chart if row.get("verdict") == "符合")
    partial = sum(1 for row in claim_chart if row.get("verdict") == "部分符合")
    unmatched = sum(1 for row in claim_chart if row.get("verdict") == "不符合")
    level = "高" if matched >= 3 else "中" if matched + partial >= 2 else "低"
    return {
        "risk_level": level,
        "risk_summary": f"共 {matched} 項符合、{partial} 項部分符合、{unmatched} 項不符合。",
        "matched_count": matched,
        "partial_count": partial,
        "unmatched_count": unmatched,
        "avoidance_advice": "建議補充產品架構、流程與模組差異，再針對重疊要件做迴避設計。",
        "evidence_highlight": "請參考要件比對表中的專利要件描述。",
    }


st.title("台灣專利查詢分析系統")
st.caption("Streamlit 版 · 整合 patent-analyzer-llm 分析流程 · 台灣專利優先")

with st.sidebar:
    st.header("設定")
    model = st.text_input("Ollama 模型", value=DEFAULT_MODEL)
    endpoint = st.text_input("Ollama API Endpoint", value=DEFAULT_OLLAMA_URL)
    use_llm = st.toggle("使用 Qwen/Ollama 分析", value=False)
    st.caption("未啟用時會使用本機 fallback，比較快但精準度較低。")

input_col, result_col = st.columns([0.9, 1.4], gap="large")

with input_col:
    st.subheader("輸入區")
    input_mode = st.radio("輸入方式", ["專利號查詢", "PDF 上傳"], horizontal=True)
    patent_no = ""
    uploaded_pdf = None
    if input_mode == "專利號查詢":
        patent_no = st.text_input("台灣專利查詢號碼", placeholder="例如 I584190、I624608、105126084")
    else:
        uploaded_pdf = st.file_uploader("上傳專利 PDF", type=["pdf"])
        st.caption("目前支援文字型 PDF；掃描型 PDF 需要後續加 OCR。")
    product_desc = st.text_area("產品 / 技術描述", height=180, placeholder="貼上要比對的產品規格或技術說明。")
    fetch_label = "抓取專利資料" if input_mode == "專利號查詢" else "解析 PDF"
    fetch_clicked = st.button(fetch_label, type="primary", use_container_width=True)
    analyze_clicked = st.button("開始分析", use_container_width=True)

if fetch_clicked:
    if input_mode == "專利號查詢" and not patent_no.strip():
        st.warning("請輸入專利號。")
    elif input_mode == "PDF 上傳" and uploaded_pdf is None:
        st.warning("請先上傳 PDF。")
    else:
        if input_mode == "專利號查詢":
            with st.spinner("正在查詢專利資料..."):
                st.session_state["patent"] = fetch_patent(patent_no)
        else:
            with st.spinner("正在解析 PDF 文字..."):
                try:
                    pdf_text = extract_pdf_text(uploaded_pdf)
                except Exception as exc:
                    st.error(f"PDF 解析失敗：{exc}")
                    st.stop()
                if not pdf_text:
                    st.error("此 PDF 沒有可擷取文字，可能是掃描檔。請改用文字型 PDF，或後續加入 OCR。")
                    st.stop()
                st.session_state["patent"] = build_pdf_record(uploaded_pdf, pdf_text)

with result_col:
    st.subheader("專利資料")
    patent: PatentRecord | None = st.session_state.get("patent")
    if not patent:
        st.info("請先輸入專利號抓取資料，或上傳 PDF 解析文字。可先試 I584190。")
    else:
        st.markdown(
            f"""
            <div class="patent-meta-grid">
              <div class="patent-meta-item"><span>來源</span><strong>{patent.source}</strong></div>
              <div class="patent-meta-item"><span>查詢號碼</span><strong>{patent.number}</strong></div>
              <div class="patent-meta-item"><span>DEMO</span><strong>{"是" if patent.is_demo else "否"}</strong></div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.markdown(f"**名稱：** {patent.title}")
        st.markdown(f"**申請人：** {patent.applicant}")
        st.markdown(f"**發明人：** {patent.inventor}")
        st.markdown(f"**狀態：** {patent.status}")
        if patent.url:
            st.link_button("查看來源", patent.url)
        with st.expander("查看擷取文字", expanded=False):
            st.text_area("專利文字", value=patent.text, height=260)

if analyze_clicked:
    patent = st.session_state.get("patent")
    if not patent:
        st.warning("請先抓取專利資料。")
        st.stop()
    if not product_desc.strip():
        st.warning("請輸入產品 / 技術描述。")
        st.stop()

    claims = parse_claims(patent.text)
    main_claim = claims[0]["text"]
    try:
        with st.spinner("步驟 1/3：拆解 Claim 技術要件..."):
            elements = extract_elements(main_claim, endpoint, model, use_llm)
        with st.spinner("步驟 2/3：逐要件比對產品..."):
            claim_chart = compare_product(elements, product_desc, endpoint, model, use_llm)
        with st.spinner("步驟 3/3：產生風險評估..."):
            risk = assess_risk(claim_chart, endpoint, model, use_llm)
    except requests.exceptions.ConnectionError:
        st.error("無法連線 Ollama。請確認 Ollama 已啟動，或先關閉『使用 Qwen/Ollama 分析』。")
        st.stop()
    except Exception as exc:
        st.error(f"分析失敗：{exc}")
        st.stop()

    st.divider()
    st.header("分析結果")
    level = risk.get("risk_level", "待確認")
    st.subheader(f"{level}風險")
    st.write(risk.get("risk_summary", ""))
    c1, c2, c3 = st.columns(3)
    c1.metric("符合", risk.get("matched_count", 0))
    c2.metric("部分符合", risk.get("partial_count", 0))
    c3.metric("不符合", risk.get("unmatched_count", 0))

    st.subheader("Claim Chart")
    st.dataframe(claim_chart, use_container_width=True)

    st.subheader("證據高光")
    st.info(risk.get("evidence_highlight", ""))
    st.subheader("迴避設計建議")
    st.warning(risk.get("avoidance_advice", ""))

    report = {"patent": patent.__dict__, "claims": claims, "claim_chart": claim_chart, "risk": risk}
    st.download_button(
        "下載 JSON 報告",
        data=json.dumps(report, ensure_ascii=False, indent=2),
        file_name="patent-analysis-report.json",
        mime="application/json",
    )
