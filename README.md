# Odoo Server Sizing Calculator

A lightweight static web calculator for estimating Odoo server capacity.

It provides two sizing approaches:

- **Basic Mode** — quick sizing using total users, concurrency, workload type, current/initial data size, and expected annual storage growth.
- **Advanced Mode** — configurable sizing using workload, transaction and customization factors, workers, cron/queue load, memory assumptions, observed storage growth, backups, and safety margins.

The project is a single static HTML application. It has no backend, database, npm dependency, or build process.

> **Disclaimer**
>
> This is an independent capacity-planning tool. It is not affiliated with, endorsed by, or maintained by Odoo S.A. Results are estimates and should be validated with load testing and production monitoring before making infrastructure decisions.

## Demo

After enabling GitHub Pages:

```text
https://<your-github-dimastriann>.github.io/odoo-server-calculator/
```

## Features

- Basic and Advanced sizing modes
- Live calculations in the browser
- Concurrent-user estimation
- Effective workload calculation
- HTTP worker estimation
- Cron and queue workload modelling
- vCPU recommendation with headroom
- RAM estimation
- Database and filestore capacity planning
- Storage growth planning
- WAL/temp reserve
- Backup-copy planning
- Storage safety margin
- Fully client-side; no input data is sent anywhere

## Quick Start

Clone the repository:

```bash
git clone https://github.com/<your-github-dimastriann>/odoo-server-calculator.git
cd odoo-server-calculator
```

Open `index.html` directly in your browser.

Or run a simple local server:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

---

## Basic Mode

Basic Mode is designed for a quick first estimate when only a few infrastructure inputs are known.

### Inputs

- Total Users
- Concurrency %
- Workload Type
- Current / Initial Database Size
- Current / Initial Filestore Size
- Annual Storage Growth %
- Planning Period in Years
- Storage Safety %

For a **new Odoo implementation**, database and filestore size should represent the estimated size at go-live after opening balances, master data, historical imports, attachments, and other migration data are loaded.

For an **existing Odoo installation**, enter the current production database and filestore sizes.

### Suggested Basic Workload Factors

| Workload | Factor |
|---|---:|
| Light — CRM / Sales / Purchase | 0.8 |
| Normal — Inventory / mixed ERP | 1.0 |
| Medium — Accounting | 1.2 |
| Heavy — POS / MRP | 1.3 |
| Very Heavy — reports / imports | 1.5 |

These factors are calculator assumptions, not official Odoo benchmark values.

### Basic Formula

```text
Concurrent Users
= Total Users × Concurrency %

Effective Concurrent Load
= Concurrent Users × Workload Factor

HTTP Workers
= ceil(Effective Concurrent Load / 6)

Worker Equivalent
= HTTP Workers + 1 Cron Worker

Minimum CPU
≈ (Worker Equivalent - 1) / 2

Recommended CPU
= Minimum CPU × 1.30

Odoo RAM
≈ Worker Equivalent × 325 MB

325 MB ≈ (80% × 150 MB) + (20% × 1 GB)

Recommended RAM
≈ (Odoo RAM
   + PostgreSQL RAM
   + OS / Services
   + Cache)
  × 1.15
```

The worker-memory mix and six-concurrent-users-per-worker rule follow Odoo's deployment guide. The PostgreSQL, OS, cache, and 15% headroom values are calculator planning assumptions for a combined server. The raw result is rounded upward to a practical server-memory tier.

### Basic Storage Formula

```text
Current Data
= Database + Filestore

Future Data
= Current Data × (1 + Annual Growth Rate) ^ Planning Years

WAL / Temp Reserve
≈ Future Data × 15%

Backup Storage
≈ 1 full copy of Future Data

Recommended Storage
= (Future Data
   + WAL / Temp Reserve
   + Backup Storage)
  × (1 + Storage Safety Margin)
```

Example:

```text
Database        = 50 GB
Filestore       = 50 GB
Annual Growth   = 50%
Planning Period = 2 years

Current Data
= 100 GB

Future Data
= 100 × 1.5²
= 225 GB
```

The calculator then adds WAL/temp reserve, backup capacity, and the storage safety margin.

---

## Advanced Mode

Advanced Mode is intended for more detailed production planning.

### User and Workload Inputs

- Total Users
- Concurrency %
- Workload Factor
- Transaction Factor
- Customization Factor
- Users per Worker

### Background Processing Inputs

- Cron Workers
- Queue Worker Equivalent
- CPU Headroom %

### Memory Inputs

- Average RAM per Worker
- PostgreSQL RAM
- OS + Services RAM
- Cache / Buffer RAM
- RAM Headroom %

### Storage Inputs

- Current / Initial Database Size
- Current / Initial Filestore Size
- Observed Growth in GB
- Growth Period: Day / Week / Month / Year
- Planning Period in Months
- Backup Copies
- WAL / Temp Reserve %
- Storage Safety %

### Effective Concurrent Load

```text
Concurrent Users
= Total Users × Concurrency %

Effective Concurrent Load (ECL)
= Concurrent Users
  × Workload Factor
  × Transaction Factor
  × Customization Factor
```

This allows the same number of users to represent different levels of load.

For example, 40 CRM users do not necessarily create the same workload as 40 active POS users.

### HTTP Workers

```text
HTTP Workers
= ceil(ECL / Users Per Worker)
```

The default is:

```text
Users Per Worker = 6
```

This is a planning baseline and should be replaced by measured values when available.

### Background Workload

```text
Worker Equivalent
= HTTP Workers
  + Cron Workers
  + Queue Worker Equivalent
```

### CPU Formula

```text
Minimum CPU
≈ (Worker Equivalent - 1) / 2

Recommended CPU
= Minimum CPU × (1 + CPU Headroom)
```

The result is rounded upward to a practical vCPU size.

### RAM Formula

```text
Odoo RAM
= Worker Equivalent × Average Worker RAM

Base RAM
= Odoo RAM
  + PostgreSQL RAM
  + OS / Services RAM
  + Cache / Buffer RAM

Recommended RAM
= Base RAM × (1 + RAM Headroom)
```

The default average worker memory is a configurable planning assumption. Actual worker RSS measurements are preferable for existing installations.

### Advanced Storage Growth

Advanced Mode uses an observed growth rate:

```text
GB / Day
GB / Week
GB / Month
GB / Year
```

The value is normalized to an approximate monthly growth rate.

```text
Added Growth
= Observed Monthly Growth × Planning Months

Future Data
= Current Database
  + Current Filestore
  + Added Growth
```

### WAL / Temp Reserve

```text
WAL / Temp Reserve
= Future Data × WAL Reserve %
```

This is a storage-capacity reserve, not a PostgreSQL configuration recommendation.

### Backup Storage

```text
Backup Storage
= Future Data × Backup Copies
```

Example:

```text
Future Data   = 800 GB
Backup Copies = 2

Backup Storage
= 1,600 GB
```

Real backup requirements can differ when using incremental backups, compression, snapshots, remote/object storage, or retention policies.

### Final Storage Formula

```text
Recommended Storage
= (Future Data
   + WAL / Temp Reserve
   + Backup Storage)
  × (1 + Storage Safety Margin)
```

---

## How to Choose Concurrency

Do not treat all registered users as simultaneously active.

Example:

```text
Total Users = 200
Concurrency = 25%

Peak Concurrent Users
= 200 × 25%
= 50
```

Concurrency should approximate the number of users actively making requests during peak periods.

Different business processes can have very different patterns:

- office ERP users may have lower concurrency,
- POS terminals may remain active most of the day,
- warehouse users may create short but frequent bursts,
- reporting users may create expensive queries with relatively few sessions.

---

## What Database Size Means

**Database Size** means the PostgreSQL database size at the beginning of the capacity-planning period.

For a new deployment:

```text
Estimated database size at go-live
after migration/opening data
```

For an existing deployment:

```text
Current production database size
```

It does not necessarily mean the size of an empty Odoo database immediately after installation.

---

## Database Size vs Workload

Raw database size alone does not determine server capacity.

For example:

```text
500 GB database + 10 active users
```

may require less CPU than:

```text
50 GB database + 100 active POS users
```

Important workload characteristics include:

- concurrent requests
- transaction frequency
- expensive reports
- custom computed fields
- automated actions
- PostgreSQL query efficiency
- indexes
- cron jobs
- queue jobs
- third-party integrations
- imports and exports
- POS traffic
- MRP processing

---

## Recommended Planning Workflow

For a new implementation:

```text
Estimate users
→ Estimate peak concurrency
→ Select workload
→ Estimate go-live data size
→ Estimate growth
→ Calculate initial infrastructure
→ Load test
→ Adjust
```

For an existing production system:

```text
Measure current CPU/RAM
→ Measure worker memory
→ Measure DB/filestore growth
→ Inspect slow queries
→ Review cron/queue workload
→ Identify peak concurrency
→ Enter measured values
→ Add future growth/headroom
```

Measured production data should take priority over generic assumptions.

---

## Initial DB Size Estimator

For new implementations, the calculator includes an optional helper to estimate initial PostgreSQL size from expected standard Odoo data: Contacts, Products, Sale/Purchase Orders and lines, Invoices/Bills and journal lines, Stock Pickings/Moves, and POS Orders/Lines.

```text
Estimated DB
= Estimated Standard Odoo Record Footprint
  × (1 + DB / Index Overhead)
  × (1 + Migration Safety)
```

Attachments are excluded and belong in the Filestore estimate. The estimator includes an Odoo 16–19 selector, but currently uses the same conservative baseline factors across versions until version-specific coefficients can be calibrated from real standard databases. Users can apply the estimate to the DB Size input or override it manually.

---


## Rough Attachment / Filestore Growth

The calculator also accepts an estimated total attachment size per month.

```text
Yearly Filestore Growth
= Monthly Attachment Size × 12
```

This value is shown as a reference only and does not overwrite the current Filestore Size input. Attachments include uploaded PDFs, images, documents, and similar files.

## Theme

The page supports light and dark themes with a dependency-free inline SVG sun/moon icon. The user's theme choice is stored locally in the browser.



## Separate PostgreSQL Server

The calculator includes an optional **Separate PostgreSQL Server** toggle.

- **Off:** Odoo and PostgreSQL are sized as one combined server.
- **On:** results are split into an Odoo Application Server and a PostgreSQL Server.

The application server is sized mainly from workers, CPU, and Odoo/Python memory. The PostgreSQL server uses a separate planning heuristic based on database size and effective concurrent load. A database up to 20 GB with low effective load starts at 4 GB RAM and 2 vCPU; RAM and CPU move through larger tiers as database size or effective load increases.

The displayed `shared_buffers` starting point is 25% of recommended PostgreSQL-server RAM. The PostgreSQL RAM/CPU recommendation is a calculator heuristic and should be replaced by measured production data when available.


## Project Structure

```text
odoo-server-calculator/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── app.js
├── README.md
├── LICENSE
└── .gitignore
```

The project is plain HTML, CSS, and JavaScript with no build step or runtime dependency.

## Privacy

All calculations happen locally in the browser.

The calculator:

- does not send inputs to a server,
- does not require an account,
- does not use analytics,
- does not use cookies,
- does not store infrastructure information remotely.

---

## Limitations

This calculator is a planning aid, not a benchmark.

It cannot automatically account for:

- inefficient custom code
- missing PostgreSQL indexes
- bad queries
- unusually heavy reports
- storage latency
- virtualization contention
- network latency
- third-party API behavior
- pathological cron jobs
- traffic spikes
- differences in deployment architecture

Always validate important production deployments with monitoring and load testing.

---

## Contributing

Contributions are welcome.

Possible improvements include:

- multiple user-group modelling
- additional workload profiles
- PostgreSQL sizing guidance
- deployment architecture options
- import/export of sizing scenarios
- benchmark-based presets
- current-vs-future infrastructure comparison
- charts and capacity visualizations
- additional documentation and examples

Typical workflow:

```bash
git checkout -b feature/my-improvement
# make changes
git add .
git commit -m "Add my improvement"
git push origin feature/my-improvement
```

Then open a pull request.

---

## License

Released under the MIT License. See [LICENSE](LICENSE).
