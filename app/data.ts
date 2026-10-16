// All portfolio content lives here. Edit this file to update the site.

export const profile = {
  name: "Yash Gupta",
  role: "Business Analyst · Data Analyst",
  tagline: "Turning complex data into clear decisions.",
  intro:
    "I'm a business analyst with an MSc in Business Analytics from Dublin Business School. I take messy, complex datasets and turn them into clean dashboards, sharp reports and AI-powered tools that people actually use to make decisions.",
  location: "New Delhi, India",
  availability: "Open to BA, Data Analyst & AI Analytics roles · Remote & Hybrid",
  email: "yashguptayg9013@gmail.com",
  links: {
    linkedin: "https://www.linkedin.com/in/yashguptayg9013",
    github: "https://github.com/yashguptayg9013",
  },
};


export const about = [
  "With 3+ years across SaaS, FMCG and supply chain, I bring both technical depth and business acumen to every project — from requirements workshops and stakeholder maps to Python pipelines and executive dashboards.",
  "Lately I've been building AI-powered analytics apps: LangChain agents that answer questions about your CSVs, Prophet forecasts with GPT-written insight reports, and a Claude-powered equity research tool. Deployed, not just prototyped.",
  "My superpower is bridging the gap between raw data and business strategy — translating numbers into narratives that non-technical stakeholders can act on.",
];

export const capabilities = [
  {
    title: "Business Analysis",
    body: "Requirements elicitation, BRDs, user stories, process flows and traceability — grounded in BABOK v3, MoSCoW and Agile delivery.",
  },
  {
    title: "Data Analysis",
    body: "EDA pipelines across financial, EV, FMCG and logistics domains. End-to-end from raw CSV to executive dashboard.",
  },
  {
    title: "AI-Powered Apps",
    body: "LangChain agents, LLM pipelines, Streamlit apps and Prophet forecasting that ship to real users.",
  },
  {
    title: "Business Intelligence",
    body: "Power BI and Tableau dashboards, DAX measures, and KPI storytelling for non-technical audiences.",
  },
  {
    title: "Financial Analytics",
    body: "Equity research, volatility modelling, moving-average strategies, sector performance and drawdown analysis.",
  },
  {
    title: "NLP & Sentiment",
    body: "Social-media text mining and sentiment analysis for competitive market intelligence — the subject of my MSc thesis.",
  },
];

export type Project = {
  name: string;
  description: string;
  tags: string[];
  code?: string;
  live?: string;
  label?: string;
};

const gh = (repo: string) => `https://github.com/yashguptayg9013/${repo}`;

export const featuredProjects: Project[] = [
  {
    name: "AlphaView",
    label: "AI · Finance",
    description:
      "AI-powered US equity research in a single HTML file. Enter a ticker and get an institutional-grade research note in ~30 seconds — rating, price target, bull/bear case, catalysts, valuation, technicals and analyst consensus — plus a watchlist and side-by-side compare.",
    tags: ["Claude API", "JavaScript", "Live market data"],
    code: gh("Alpha-View"),
  },
  {
    name: "Chat with Your Business Data",
    label: "AI · Analytics",
    description:
      "Upload any CSV and ask questions in plain English. A LangChain pandas agent powered by GPT-4o-mini writes and runs the analysis code internally and returns a direct answer — no SQL, no formulas.",
    tags: ["Streamlit", "LangChain", "GPT-4o-mini", "Pandas"],
    code: gh("Chat-with-Your-Business-Data-app"),
  },
  {
    name: "AI Sales Forecaster",
    label: "AI · Forecasting",
    description:
      "Upload historical sales data and get an interactive Prophet forecast with 90% confidence intervals, plus a GPT-4o-mini executive insight report. No code, no SQL — just upload and go.",
    tags: ["Meta Prophet", "OpenAI", "Plotly", "Streamlit"],
    code: gh("sales_forecaster"),
    live: "https://yashguptayg9013-ai-sales-forecaster.streamlit.app",
  },
  {
    name: "NorthStar Bank — Digital Loan Case Study",
    label: "Business Analysis",
    description:
      "End-to-end BA engagement for launching a digital personal-loan channel at a 2.3M-customer retail bank: problem statement, stakeholder register, as-is/to-be flows, full BRD, user stories and a requirements traceability matrix. Target: cut decision time from 4 days to under 24 hours.",
    tags: ["BABOK v3", "BRD", "User Stories", "RTM", "Scrum"],
    code: gh("northstar-bank-digital-loan-BA-casestudy"),
  },
  {
    name: "BA Requirements Management Toolkit",
    label: "Business Analysis",
    description:
      "A reusable toolkit of templates and worked examples for managing requirements across a project lifecycle — user stories, functional and non-functional specs, change-request logs and RACI matrices.",
    tags: ["INVEST", "Gherkin", "MoSCoW", "RACI"],
    code: gh("ba-requirements-management-toolkit"),
  },
  {
    name: "Resume JD Matcher",
    label: "AI · Tooling",
    description:
      "A production-minded Python CLI that uses an LLM to score how well a resume matches a job description (0–100), suggest concrete improvements, and validate every output field and score range.",
    tags: ["Python", "LLM", "CLI"],
    code: gh("resume-jd-matcher-"),
  },
];

export const moreProjects: Project[] = [
  {
    name: "Hyundai Motor Stock Analysis",
    description: "10-year equity deep-dive — returns, volatility and the 2026 ATH breakout.",
    tags: ["yfinance", "Matplotlib"],
    code: gh("hyundai-motor-stock-analysis"),
  },
  {
    name: "Mercedes Stock Analysis",
    description: "Cumulative returns, Sharpe ratio, MA crossovers and seasonality decomposition.",
    tags: ["Pandas", "Seaborn"],
    code: gh("mercedes-stock-analysis"),
  },
  {
    name: "S&P 500 Market Analysis",
    description: "Sector performance, rolling drawdowns and bull/bear cycle identification.",
    tags: ["yfinance", "Pandas"],
    code: gh("sp500-analysis"),
  },
  {
    name: "US Stock Alert System",
    description: "Automated pipeline that triggers price-movement alerts on configurable thresholds.",
    tags: ["Python", "Automation"],
    code: gh("US-Stock-Alert-System"),
  },
  {
    name: "EV Market 2026",
    description: "Adoption curves, top manufacturers, regional growth and infrastructure trends.",
    tags: ["Matplotlib", "Jupyter"],
    code: gh("ev_market_2026"),
  },
  {
    name: "EV Battery QC Analysis",
    description: "Statistical process control on battery manufacturing data — defects and anomalies.",
    tags: ["NumPy", "SPC"],
    code: gh("ev-battery-qc-analysis"),
  },
  {
    name: "Global Internet Speeds 2025",
    description: "EDA of broadband and mobile speeds across 157 countries and the digital divide.",
    tags: ["Pandas", "Seaborn"],
    code: gh("global-internet-speeds-2025"),
  },
];

export const skills = [
  { group: "Languages & Query", items: ["Python", "SQL", "DAX", "PostgreSQL"] },
  { group: "AI & LLM", items: ["OpenAI GPT-4o", "Claude API", "LangChain", "Streamlit", "Meta Prophet", "Plotly"] },
  { group: "BI & Visualisation", items: ["Power BI", "Tableau", "Excel", "Google Sheets"] },
  { group: "Libraries & ML", items: ["Pandas", "NumPy", "scikit-learn", "Matplotlib", "Seaborn", "NLTK", "yfinance"] },
  { group: "BA Practice", items: ["BABOK v3", "BRDs", "User Stories", "Process Mapping", "RTM", "MoSCoW", "Agile / Scrum"] },
  { group: "Workflow", items: ["Jupyter", "Git", "JIRA", "VS Code", "Notion"] },
];

export const domains = [
  "AI-powered apps",
  "Financial markets",
  "Electric vehicles",
  "Tech & digital",
  "Supply chain",
  "FMCG",
];

export const education = [
  {
    degree: "MSc Business Analytics",
    school: "Dublin Business School, Ireland",
    result: "2:1 Honours",
    years: "2024 — 2025",
    note: "Thesis: “Social Media Insights for Competitive Market Analysis” — NLP and sentiment-analysis pipelines extracting competitive intelligence from Twitter and Reddit data.",
  },
  {
    degree: "B.Com (Hons) Business & Finance",
    school: "GGSIPU, New Delhi",
    result: "CGPA 8.72 / 10",
    years: "2019 — 2022",
  },
];

export const stats = [
  { value: "3+", label: "Years across SaaS, FMCG & supply chain" },
  { value: String(featuredProjects.length + moreProjects.length), label: "Public analytics & AI projects" },
  { value: "2:1", label: "MSc Business Analytics, Honours" },
];

export const quote = {
  text: "Without data, you're just another person with an opinion.",
  author: "W. Edwards Deming",
};
