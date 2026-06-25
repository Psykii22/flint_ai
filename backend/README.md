# ArcOps Backend

ArcOps is a Multi-cloud FinOps Agent designed to securely pull, analyze, and manage cloud infrastructure data across various cloud providers (AWS, GCP, Azure). Leveraging graph intelligence (TigerGraph) and strong authentication (Supabase), ArcOps provides actionable insights on cloud expenditure and resource utilization.

## 🚀 Key Features
- **Multi-Cloud Integration:** Fetch live organizational data from AWS, GCP, and Azure.
- **Graph Intelligence Engine:** Stores and connects complex resource and billing datasets via TigerGraph.
- **Agentic Interactions:** Uses advanced AI/ADK tools via MCP (Model Context Protocol) to resolve billing and guard queries.
- **Secure Authentication:** Implements a Supabase-backed OTP integration handling frictionless signup & magic-link flows.

## 🛠️ Technology Stack
- **Framework:** [FastAPI](https://fastapi.tiangolo.com/) (Python >= 3.11)
- **Database:** PostgreSQL (via Supabase CLI/Cloud) & [TigerGraph](https://www.tigergraph.com/)
- **Auth:** Supabase Auth (GoTrue API)
- **Cloud Providers:** AWS (`boto3`), GCP SDK, Azure SDK integrations
- **Package Management:** `uv`
- **Containerization:** Docker & Docker Compose

## 📁 Repository Structure
```
arcops-backend/
├── .env.example           # Example required environment variables
├── pyproject.toml         # Requirements and uv/hatchling project metadata
├── README.md              # Project documentation
├── schema.sql             # SQL DB Schemas 
├── API_DOCS_INDEX.md      # API Reference Details
├── docker-compose.yml     # Core infra container setup
├── src/                   # Main Application Code
│   ├── main.py            # FastAPI Entry Point
│   ├── database/          # Postgres & TigerGraph Connection logic
│   ├── agents/            # ADK Agents & MCP Toolbox (billing_agent, guard_agent)
│   ├── services/          # Multi-cloud fetchers (AWS, GCP, Azure) & Login mapping
│   └── utils/             # Mapping & Encryption logic (normalizer)
└── tests/                 # Unit & Integration debugging for cloud scopes
```

## ⚙️ Prerequisites
- Python 3.11 or higher
- [uv](https://github.com/astral-sh/uv) (Extremely fast Python package installer and resolver)
- Docker & Docker Compose (for spinning up local external services)
- Active credentials for AWS, GCP, Azure, TigerGraph, and Supabase

## 🏃 Installation & Local Setup

1. **Clone the repository:**
   ```bash
   git clone <your-repo-link>
   cd arcops-backend
   ```

2. **Setup the Virtual Environment & Dependencies:**
   We recommend using `uv` to manage dependencies seamlessly:
   ```bash
   uv venv
   source .venv/bin/activate
   uv sync
   ```

3. **Configure Environment Variables:**
   ```bash
   cp .env.example .env
   # Open .env and add your valid Cloud, Supabase, TigerGraph, and Database keys/secrets
   ```

4. **Launch Local Services:**
   Depending on your environment, launch the services using Docker:

   **For Production / Default:**
   ```bash
   docker compose up --build
   ```

   **For Development:**
   ```bash
   docker compose -f docker-compose.dev.yml up --build
   ```
   *Note: When running the dev environment, you must also start the frontend Vite server.*
   ```bash
   cd landing_page
   npm run dev
   ```

5. **Start the FastAPI Server (If running locally instead of docker):**
   ```bash
   uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
   ```

## 📚 API & Documentation
Auto-generated interactive API docs are available once the server is actively running.
- **Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc:** [http://localhost:8000/redoc](http://localhost:8000/redoc)

Please refer to `API_DOCS_INDEX.md` for extended internal API routing documentation and detailed payload expectations.

## 🧪 Testing
We use `pytest` for all unit and integration tests.
```bash
pytest tests/ -v
```
