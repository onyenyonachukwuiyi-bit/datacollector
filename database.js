const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'agroplot.sqlite');
let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const filebuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(filebuffer);
  } else {
    db = new SQL.Database();
  }

  // Initialize tables
  db.run(`
    CREATE TABLE IF NOT EXISTS experiments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      crop TEXT NOT NULL,
      variety TEXT,
      season TEXT,
      location TEXT,
      design_type TEXT NOT NULL, -- RCBD, CRD, Split-plot, Latin Square, Factorial
      replications INTEGER DEFAULT 3,
      num_treatments INTEGER DEFAULT 4,
      num_blocks INTEGER DEFAULT 3,
      start_date TEXT,
      end_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS treatments (
      id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      factor_a TEXT,
      factor_b TEXT,
      color TEXT,
      FOREIGN KEY(experiment_id) REFERENCES experiments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS plots (
      id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      treatment_id TEXT NOT NULL,
      plot_number INTEGER NOT NULL,
      replication INTEGER NOT NULL,
      block INTEGER,
      row_idx INTEGER,
      col_idx INTEGER,
      area_m2 REAL,
      notes TEXT,
      FOREIGN KEY(experiment_id) REFERENCES experiments(id) ON DELETE CASCADE,
      FOREIGN KEY(treatment_id) REFERENCES treatments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS observations (
      id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      plot_id TEXT NOT NULL,
      observation_date TEXT NOT NULL,
      growth_stage TEXT,
      observer TEXT,
      
      -- Agronomic Growth & Yield
      plant_height_cm REAL,
      stem_diameter_mm REAL,
      leaf_count INTEGER,
      canopy_cover_pct REAL,
      biomass_kg_ha REAL,
      grain_yield_kg_ha REAL,
      thousand_grain_weight_g REAL,
      harvest_index REAL,
      
      -- Phenological
      days_to_emergence INTEGER,
      days_to_flowering INTEGER,
      days_to_maturity INTEGER,
      flowering_date TEXT,
      maturity_date TEXT,
      
      -- Physiological
      chlorophyll_spad REAL,
      lai REAL,
      ndvi REAL,
      photosynthesis_rate REAL,
      stomatal_conductance REAL,
      leaf_water_potential REAL,
      
      -- Biotic Stress
      disease_score_1_9 REAL,
      pest_score_1_9 REAL,
      disease_name TEXT,
      pest_name TEXT,
      
      -- Environmental
      soil_moisture_pct REAL,
      soil_temp_c REAL,
      air_temp_c REAL,
      relative_humidity_pct REAL,
      
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(experiment_id) REFERENCES experiments(id) ON DELETE CASCADE,
      FOREIGN KEY(plot_id) REFERENCES plots(id) ON DELETE CASCADE
    );
  `);

  saveDb();
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Helpers for sql.js queries returning objects
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params && params.length) {
    stmt.bind(params);
  }
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const res = queryAll(sql, params);
  return res.length > 0 ? res[0] : null;
}

function runSql(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

module.exports = {
  getDb,
  saveDb,
  queryAll,
  queryOne,
  runSql
};
