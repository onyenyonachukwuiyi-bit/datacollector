# 🌱 AgroPlot — Plant Agronomic & Physiological Field Analytics

**AgroPlot** is a dedicated web application and Progressive Web App (PWA) tailored for field agronomists, crop physiologists, and agricultural researchers to collect, manage, visualize, and statistically analyze trial plot data directly from the field or laboratory.

---

## 🚀 Quick Start

### 1. Requirements
- Node.js (v18+)

### 2. Running the Application
The application is located in:
`C:\Users\ONYENYONACHUKWU\.gemini\antigravity\scratch\agroplot`

Open a terminal or command prompt in that directory and run:
```bash
node server/server.js
```

Then navigate to:
**[http://localhost:3000](http://localhost:3000)**

---

## 🌾 Core Features & Capabilities

### 1. Experimental Design Support
- **Designs supported**:
  - **RCBD** (Randomized Complete Block Design) with automatic block allocation.
  - **CRD** (Completely Randomized Design).
  - **Split-Plot Design**.
  - **Factorial Design**.
  - **Latin Square**.
- Automatic plot layout generator with assigned plot IDs (e.g., `#101` to `#112`), randomized treatments, replications, and block assignments.

### 2. Comprehensive Field Data Collection
Covers over 25 agronomic, phenological, physiological, and environmental traits:
- **Agronomic & Growth**: Plant height (cm), stem diameter (mm), leaf count, canopy cover (%), grain yield (kg/ha), biomass (kg/ha), 1000-grain weight (g), harvest index.
- **Physiology & Optics**: SPAD chlorophyll index, Leaf Area Index (LAI), NDVI canopy index, photosynthesis rate ($\mu\text{mol}/\text{m}^2\text{s}$), stomatal conductance ($\text{mol}/\text{m}^2\text{s}$), leaf water potential ($-\text{MPa}$).
- **Phenology**: Days to emergence, days to flowering, days to maturity.
- **Biotic Stress Scores**: Standard 1–9 disease scoring, pest incidence score, pest/pathogen notes.
- **Micro-climate & Soil**: Soil moisture (%), soil temperature (°C), air temperature, relative humidity.

### 3. Integrated Statistical Analysis Engine
- **ANOVA Engine**:
  - Full two-way ANOVA for **RCBD** (separating treatment effects, block/replication effects, and experimental error).
  - One-way ANOVA for **CRD**.
  - Automated degrees of freedom ($DF$), sums of squares ($SS$), mean squares ($MS$), $F$-statistic, and $p$-value calculations.
  - **Critical Difference (CD / LSD at $p = 0.05$)** and **Coefficient of Variation ($CV\%$)**.
- **Trait Correlation Matrix**:
  - Live Pearson correlation coefficients ($r$) across all physiological and agronomic traits to study links (e.g., SPAD vs. Grain Yield or NDVI vs. Biomass).
- **Descriptive Statistics**:
  - Sample size ($n$), mean, standard deviation, variance, median, min, max, and coefficient of variation.

### 4. Interactive Visualizations
- Real-time Chart.js interactive bar charts comparing treatment response means.
- Interactive spatial field grid reflecting block orientations with status indicators (Recorded vs. Empty plots).

### 5. Exporting & Interoperability
- **CSV Export**: Standard tabular export compatible with Microsoft Excel, LibreOffice Calc, or Google Sheets.
- **JSON Export**: Complete trial schema for cloud backups and API migrations.
- **R Script Generation**: Auto-generated R script (`agricolae` / `lme4`) pre-configured with ANOVA and post-hoc comparison models for your exported datasets.

### 6. Field & Offline Ready
- Progressive Web App (PWA) with Service Worker caching (`/sw.js`) and manifest.
- Local, lightweight SQLite database engine (`sql.js`) that persists trial records locally without requiring external cloud databases or native C++ compilers.
