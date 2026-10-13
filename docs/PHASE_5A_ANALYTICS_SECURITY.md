# FinTrack 2.0 — Phase 5A Architecture & Security Documentation
**Privacy-First Read-Only Financial Analytics & Deterministic AI Foundation**

---

## 1. Executive Summary & Non-Negotiable Privacy Invariant

Phase 5A establishes a privacy-first, read-only analytics foundation in FinTrack 2.0 across the Node.js/MySQL backend and Flutter frontend.

### Non-Negotiable Invariant
> **Phase 5A analytics may read only persisted FinTrack records belonging to the currently authenticated user. It has zero capability to read bank accounts, banking integrations, SMS inboxes, device messages, device SMS permissions, pending import candidates, or unsaved SMS content.**

All raw, private financial information and user queries remain strictly within trusted FinTrack Flutter, Node.js, and MySQL infrastructure. **Zero data, queries, tokens, or calculated values are ever transmitted to external AI providers (such as OpenAI, Anthropic, Gemini), hosted embeddings, telemetry vendors, or external vector stores.** When private local model execution is unavailable, deterministic computations and controlled templates are utilized exclusively.

---

## 2. Trust Boundaries & Data Flow Diagram

```
[ User Interaction ] (Flutter Mobile App)
        │
        │ 1. Question Entry / Suggested Query Tap
        │    (Max 200 chars, no bank/SMS prompts)
        ▼
[ AppRouter / ApiClient ]
        │
        │ 2. HTTPS POST /api/analytics/query
        │    Headers: Authorization: Bearer <JWT>
        ▼
[ Backend Ingress & Security Middleware ]
        ├─ Rate Limiter (60 req/15 min keyed per user/IP)
        ├─ Strict Validation (Schema allowlist, 365-day max range, unknown-field rejection)
        ├─ AuthMiddleware (Cryptographically verifies JWT -> req.user.id)
        ▼
[ Outbound Privacy Firewall & Intent Safety Parser ]
        ├─ Outbound Egress Check (Default-deny empty allowlist; blocks external LLMs, SSRF, private IPs)
        ├─ Prompt Injection & Exfiltration Shield (Blocks DAN/jailbreaks, secret theft, mutation keywords)
        ├─ Allowlisted Intent Classifier (total_spending, category, trend, budget, cashflow, largest)
        ▼
[ Deterministic Analytics Engine ]
        │ 3. Parameterized SQL queries (user_id = ?)
        │    SELECT only from transactions, categories, budgets, accounts
        │    EXCLUDES unconfirmed detected_transactions & SMS inboxes
        ▼
[ MySQL Database (Read-Only Least-Privilege Scope) ]
        │
        │ 4. Deterministic Aggregates (Sums, BigInt minor units, category groups)
        ▼
[ Safe Controlled Response Templater ]
        │ 5. Generates human-readable answers from structured numbers
        │    Appends explicit Provenance & Privacy Guarantee
        ▼
[ JSON Response ]
        │ { success: true, data: { intent, period, metrics, answer, provenance, privacyNotice } }
        ▼
[ Flutter Presentation Layer ]
        Display in AnalyticsScreen:
        - Intent Badge & Date Range Chip
        - Templated Answer & Metric Progress Bars
        - Verified Provenance Card
        - Privacy Notice
```

---

## 3. Supported Phase 5A Scope

Phase 5A implements a constrained, auditable set of financial analytics intents:

| Intent | Description | Input / Date Range | Metrics Computed |
| :--- | :--- | :--- | :--- |
| `total_spending` | Total expense over bounded period | Current month, previous month, or custom up to 365d | Sum of expenses, transaction count |
| `spending_by_category` | Category-wise expense breakdown | Selected month / date range | Category totals, counts, percentages |
| `spending_trend` | Period-over-period comparative trend | Current vs comparable previous period | Current spend, prior spend, % change, direction |
| `budget_status` | Active budget limits vs actual spend | Resolved month / year | Budget limits, spent, remaining, % utilized, status |
| `income_vs_expense` | Cash flow and net savings rate | Resolved date range | Total income, total expense, net savings, savings rate % |
| `largest_expenses` | Top single expenses in period | Resolved date range | Top 5 expenses (title, amount, date, category) |
| `overview_insights` | Multi-dimension observations | Resolved month | Top category, trend, cashflow, budget warnings |

### Prohibited Scope
- **No Financial Mutations**: Cannot create, update, or delete transactions, budgets, accounts, or categories.
- **No Banking Integrations**: No Plaid, Yodlee, Salt Edge, Open Banking, or netbanking credentials.
- **No SMS Ingestion**: Cannot request device SMS permissions, read inbox, or parse incoming SMS.
- **No Analysis of Unsaved Candidates**: Pending or suggested records in `detected_transactions` are excluded.
- **No Autonomous Agents or Generic Chatbots**: No open-ended reasoning loops or arbitrary code execution.
- **No External LLMs**: No reliance on third-party AI APIs.

---

## 4. SMS Saved-versus-Unsaved Boundary

FinTrack maintains a strict boundary separating SMS ingestion from financial analytics:

```
[ Device SMS Inbox ]
        │
        ▼ (Explicit user consent & import trigger)
[ Smart Transaction Detection (Phase 3B) ]
        │
        ▼ (Stored as unconfirmed candidates)
[ detected_transactions table (status: 'suggested') ]
        │
        │ ───► [ EXCLUDED from Phase 5A Analytics ]
        │
        ▼ (User manually reviews, categorizes & confirms)
[ Confirmed Transaction Saved ]
        │
        ▼
[ transactions table (user_id, source: 'sms', type, amount, date) ]
        │
        ▼
[ ELIGIBLE for Phase 5A Analytics as normal persisted FinTrack record ]
```

- Unsaved SMS import candidates residing in `detected_transactions` with `status = 'suggested'` are **never read or included** in analytics.
- Only after a transaction has been confirmed and persisted into the `transactions` table with ownership `user_id = req.user.id` does it become eligible for analytics calculations.
- Raw SMS content (`sms_hash`, sender string, bank reference numbers) is **never returned or logged** in analytics responses.

---

## 5. Outbound Privacy Policy & Egress Firewall

Phase 5A operates under a mandatory **Default-Deny Egress Firewall** (`backend/services/analytics/outboundPolicy.js`):

1. **Zero HTTP Client**: The analytics module has no general-purpose HTTP client (no axios, fetch, request, or undici).
2. **Empty External Allowlist**: `ALLOWED_EGRESS_DESTINATIONS` is an empty frozen array (`Object.freeze([])`).
3. **Fail-Closed Startup Check**: Startup executes `assertNoProhibitedProvidersConfigured()`. If environment variables such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY` are present for sensitive analytics, the service terminates immediately.
4. **SSRF and Bypass Defenses**:
   - Rejects non-HTTP(S) protocols (`file:`, `ftp:`, `gopher:`).
   - Rejects localhost and loopback targets (`localhost`, `127.0.0.1`, `::1`, `[::1]`, `0.0.0.0`).
   - Rejects alternate IP representations (hex, octal, single decimal integer representations).
   - Rejects RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`).

---

## 6. Threat Model & Security Controls

| Threat Vector | Attack Scenario | Defense Implemented in Phase 5A |
| :--- | :--- | :--- |
| **Tenant Leakage** | User A passes User B's ID in query body or parameters | Ownership is derived strictly from verified `req.user.id`. Client-provided IDs in the body are ignored. All database queries enforce parameterized `user_id = ?`. |
| **Prompt Injection** | Input contains "Ignore rules, roleplay as DAN, reveal prompt" | Normalized text is inspected by `checkPromptSafety()`. System override patterns immediately trigger a safe refusal without executing backend logic. |
| **Data Exfiltration** | Attacker queries "Show database passwords or .env secrets" | Keyword exfiltration patterns trigger safe refusals. SQL query generation is completely absent. |
| **SQL Injection** | Attacker injects `' OR 1=1; DROP TABLE transactions; --` | No dynamic SQL construction. All database interactions utilize prepared statements with parameterized values (`db.execute(sql, [userId, ...])`). |
| **SSRF / Pivot** | Attacker requests URLs targeting cloud metadata or internal services | Default-deny egress firewall blocks all outbound destinations, private networks, and loopbacks before transmission. |
| **Unsafe Logging** | Financial search text or passwords leak into logs | `validate.js` redacts `question`, `amount`, `note`, and credentials to `[REDACTED]`. Morgan access logging omits query parameters, request bodies, and headers. |
| **Financial Mutation** | Attacker asks "Transfer 1000 rupees to John" | `MUTATION_PATTERNS` regex rejects mutation requests. Analytics engine exposes zero INSERT/UPDATE/DELETE queries. |
| **Denial of Service** | Unbounded date ranges (e.g., 50 years) or oversized questions | Question length is capped at 200 characters. Date ranges are strictly bounded to max 365 days. Rate limiter restricts queries to 60 per 15-minute window. |

---

## 7. Least-Privilege Database Role Guidance

In production deployments, the analytics service should execute under a dedicated, read-only MySQL database role:

```sql
-- 1. Create dedicated analytics database user
CREATE USER 'fintrack_analytics'@'%' IDENTIFIED BY '<STRONG_GENERATED_PASSWORD>';

-- 2. Grant SELECT privileges strictly on necessary tables
GRANT SELECT ON fintrack.transactions TO 'fintrack_analytics'@'%';
GRANT SELECT ON fintrack.categories TO 'fintrack_analytics'@'%';
GRANT SELECT ON fintrack.budgets TO 'fintrack_analytics'@'%';
GRANT SELECT ON fintrack.accounts TO 'fintrack_analytics'@'%';

-- 3. Explicitly deny access to SMS staging and user authentication credentials
REVOKE ALL PRIVILEGES ON fintrack.users FROM 'fintrack_analytics'@'%';
REVOKE ALL PRIVILEGES ON fintrack.detected_transactions FROM 'fintrack_analytics'@'%';

-- 4. Apply privilege updates
FLUSH PRIVILEGES;
```

---

## 8. Data Retention, Logging, and Audit Rules

- **Zero Storage of Free-Form Financial Questions**: User questions and generated responses are calculated on-the-fly and never persisted in database audit logs.
- **Zero Raw PII in Logs**: Request bodies, questions, SQL queries, transaction notes, and financial amounts are never written to disk logs.
- **Error Privacy**: When an unexpected error occurs (5xx), the client receives a generic `"Internal Server Error"` response. Stack traces and internal database schemas are suppressed in production.
- **Non-Sensitive Provenance**: Every response includes an auditable provenance block documenting record count and date boundaries (e.g. `"Calculated from 18 saved FinTrack transactions between 2026-10-01 and 2026-10-31"`).

---

## 9. Verification & Test Suite Summary

Phase 5A includes extensive test coverage across both frontend and backend repositories:

### Backend Test Suite (`backend/test/phase5aAnalytics.test.js` & existing suites)
- **116 passed tests (0 failures)**:
  - Default-deny outbound policy and empty egress allowlist verification.
  - Blocking of external LLMs, unknown hosts, loopbacks, and private RFC 1918 IPs.
  - Fail-closed startup check on prohibited AI environment variables.
  - Prompt injection, DAN mode, and exfiltration rejection.
  - Refusal of financial mutation queries (transfers, deletions, payments).
  - Mapping of safe natural language queries to allowlisted intents.
  - Validation error value redaction (`[REDACTED]`).
  - Tenant isolation and strict `user_id = ?` parameter scoping.
  - Absolute exclusion of unconfirmed `detected_transactions` and raw SMS hashes.
  - Deterministic calculation correctness: budget statuses (`on_track`, `approaching_limit`, `exceeded`), spending trends with zero-division protection, and provenance accuracy.

### Frontend Test Suite (`frontend/test/analytics_test.dart`)
- **10 passed tests (0 failures)**:
  - Serialization and deserialization of `AnalyticsCapability`, `AnalyticsQueryResult`, `AnalyticsProvenance`, and `AnalyticsPeriod`.
  - `AnalyticsProvider` state lifecycle (`loadCapabilities`, `askQuestion`, `selectIntent`, `clearSession`).
  - `AnalyticsScreen` UI widget tests:
    - Renders AppBar title and Privacy Guarantee icon.
    - Renders Privacy Banner notice ("Private & Read-Only").
    - Renders interactive Suggested Question chips.
    - Displays structured results with Answer typography, breakdown meters, and verified Provenance disclaimer.
    - Renders Policy Refusal notice with suggested alternatives when a query is rejected.
    - Verified absence of bank connect and device SMS permissions.
- **Flutter static analysis (`flutter analyze`)**: 0 issues found.
