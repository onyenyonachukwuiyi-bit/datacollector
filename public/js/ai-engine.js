/**
 * AgroPlot AI Vision & Agronomic Analytics Engine
 * Provides dual AI capabilities:
 * 1. Embedded Computer Vision (Edge/Offline):
 *    - Normalized Difference Vegetation Index (NDVI) simulation from RGB channels
 *    - Green Leaf Area Index (GLAI / LAI estimation) from excess green index (ExG = 2G - R - B)
 *    - SPAD Chlorophyll estimation from green-to-red spectral ratios
 *    - Canopy coverage percentage (%) segmentation
 *    - Biotic foliar necrosis & chlorosis damage scoring (1-9 scale)
 * 2. LLM Multimodal Vision (Gemini / OpenAI / Custom Vision API):
 *    - Plant height & stem thickness estimation with field reference
 *    - Phenological growth stage recognition
 *    - Disease pathogen & insect pest diagnosis
 *    - Automated statistical trial narrative & recommendations
 */

class AgroAI {
  constructor() {
    this.apiKey = localStorage.getItem('agroplot_ai_api_key') || '';
    this.apiProvider = localStorage.getItem('agroplot_ai_provider') || 'embedded'; // 'embedded' | 'gemini' | 'openai'
    this.selectedModel = localStorage.getItem('agroplot_ai_model') || 'gemini-1.5-flash';
  }

  saveConfig(provider, apiKey, model) {
    this.apiProvider = provider;
    this.apiKey = apiKey;
    this.selectedModel = model || this.selectedModel;
    localStorage.setItem('agroplot_ai_provider', provider);
    localStorage.setItem('agroplot_ai_api_key', apiKey);
    localStorage.setItem('agroplot_ai_model', this.selectedModel);
  }

  /**
   * Performs real-time pixel analysis on HTML5 Canvas / Image
   * Computes optical indices: VARI / ExG, Canopy Cover %, estimated Chlorophyll & Stress
   */
  async analyzeImagePixels(canvas) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const totalPixels = width * height;

    let greenCanopyPixels = 0;
    let diseasedPixels = 0;
    let sumExG = 0;
    let sumVARI = 0;
    let sumGreenRatio = 0;

    // Sample pixels for speed (step = 2 for high frame performance)
    const step = 2;
    let sampledCount = 0;

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Excess Green Index: ExG = 2G - R - B
        const exg = (2 * g) - r - b;
        // Visible Atmospherically Resistant Index (VARI): (G - R) / (G + R - B)
        const variDenom = (g + r - b);
        const vari = variDenom !== 0 ? (g - r) / variDenom : 0;

        sampledCount++;

        // Green canopy detection threshold (ExG > 20 and Green dominates)
        if (exg > 20 && g > r && g > b) {
          greenCanopyPixels++;
          sumExG += exg;
          sumVARI += Math.max(-1, Math.min(1, vari));
          sumGreenRatio += g / (r + g + b + 0.001);
        } else if (r > g && r > 90 && g > 40 && (r - g) > 25) {
          // Foliar chlorosis / brown necrotic lesion detection
          diseasedPixels++;
        }
      }
    }

    const canopyPct = Number(((greenCanopyPixels / sampledCount) * 100).toFixed(1));
    const meanVARI = greenCanopyPixels > 0 ? (sumVARI / greenCanopyPixels) : 0;
    const meanExG = greenCanopyPixels > 0 ? (sumExG / greenCanopyPixels) : 0;
    const meanGRatio = greenCanopyPixels > 0 ? (sumGreenRatio / greenCanopyPixels) : 0.33;

    // Calibrated empirical models for physiological parameters
    // 1. NDVI approximation derived from VARI and ExG canopy brightness
    let estimatedNdvi = Math.max(0.20, Math.min(0.92, 0.40 + (meanVARI * 0.45) + (canopyPct / 250)));
    estimatedNdvi = Number(estimatedNdvi.toFixed(3));

    // 2. Leaf Area Index (LAI) derived from canopy cover fraction and green volume
    let estimatedLai = Math.max(0.5, Math.min(6.5, -Math.log(Math.max(0.01, 1 - (canopyPct / 100))) * 1.55));
    if (isNaN(estimatedLai)) estimatedLai = Number((canopyPct * 0.045).toFixed(2));
    else estimatedLai = Number(estimatedLai.toFixed(2));

    // 3. Chlorophyll (SPAD) Index estimation from spectral greenness ratio
    // Higher green/red saturation correlates with SPAD 30-58 in active cereals
    let estimatedSpad = Math.max(20.0, Math.min(62.0, (meanGRatio * 80) + (meanVARI * 15)));
    estimatedSpad = Number(estimatedSpad.toFixed(1));

    // 4. Biotic stress (disease score 1-9)
    const diseaseRatio = greenCanopyPixels > 0 ? (diseasedPixels / (greenCanopyPixels + diseasedPixels)) : 0;
    let diseaseScore = 1.0;
    if (diseaseRatio > 0.40) diseaseScore = 8.5;
    else if (diseaseRatio > 0.25) diseaseScore = 7.0;
    else if (diseaseRatio > 0.15) diseaseScore = 5.0;
    else if (diseaseRatio > 0.08) diseaseScore = 3.5;
    else if (diseaseRatio > 0.02) diseaseScore = 2.0;

    return {
      canopy_cover_pct: canopyPct,
      ndvi: estimatedNdvi,
      lai: estimatedLai,
      chlorophyll_spad: estimatedSpad,
      disease_score_1_9: Number(diseaseScore.toFixed(1)),
      diagnostics: {
        variIndex: Number(meanVARI.toFixed(3)),
        exgIndex: Number(meanExG.toFixed(1)),
        canopyPixels: greenCanopyPixels,
        lesionPixels: diseasedPixels
      }
    };
  }

  /**
   * Calls Cloud Multimodal Vision (Gemini / OpenAI API) if user provides key
   * Performs deep agronomic diagnosis, stage recognition, and height/diameter estimate
   */
  async analyzeWithCloudAI(base64Image, cropType, plotInfo = {}) {
    if (!this.apiKey) {
      throw new Error('API Key not set. Configure your Gemini or OpenAI API Key in AI Settings.');
    }

    const promptText = `
You are an expert crop physiologist, field agronomist, and biometrician evaluating a field trial plot for ${cropType || 'Field Crops'}.
Plot Info: Plot #${plotInfo.plot_number || 'N/A'}, Treatment: ${plotInfo.treatment_name || 'N/A'}.

Inspect this crop image carefully and return a STRICT JSON object with these estimated agronomic & physiological traits:
{
  "plant_height_cm": <estimated average height in cm, number or null>,
  "stem_diameter_mm": <estimated base stem thickness in mm, number or null>,
  "leaf_count": <average visible leaf count per plant, integer or null>,
  "canopy_cover_pct": <canopy soil coverage percentage 0-100, number>,
  "growth_stage": "<precise BBCH or agronomic stage, e.g. V6, R1 Silking, Anthesis, Ripening>",
  "chlorophyll_spad": <estimated SPAD chlorophyll index 20-65, number>,
  "lai": <estimated Leaf Area Index 0.5-6.5, number>,
  "ndvi": <estimated NDVI 0.20-0.95, number>,
  "disease_score_1_9": <1.0 to 9.0 where 1 is immune and 9 is lethal necrosis, number>,
  "pest_score_1_9": <1.0 to 9.0 pest damage rating, number>,
  "disease_name": "<identified foliar symptoms, e.g. Northern Corn Leaf Blight, Rust, Cercospora, or 'Healthy'>",
  "pest_name": "<identified pest symptoms, e.g. Fall Armyworm, Aphids, Stem Borer, or 'None'>",
  "biomass_kg_ha": <projected biomass in kg/ha, number or null>,
  "grain_yield_kg_ha": <projected harvest yield in kg/ha, number or null>,
  "confidence_score": <confidence percentage 0-100, number>,
  "agronomic_notes": "<concise 2-sentence agronomic observations regarding vigor, canopy architecture, and stress indicators>"
}
Only output valid JSON with no markdown wrapping.`;

    if (this.apiProvider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.selectedModel || 'gemini-1.5-flash'}:generateContent?key=${this.apiKey}`;
      const payload = {
        contents: [
          {
            parts: [
              { text: promptText },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Image.replace(/^data:image\/[a-z]+;base64,/, "")
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2
        }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Gemini API returned HTTP ${res.status}`);
      }

      const resData = await res.json();
      const text = resData.candidates?.[0]?.content?.parts?.[0]?.text;
      return JSON.parse(text);
    } else if (this.apiProvider === 'openai') {
      const url = 'https://api.openai.com/v1/chat/completions';
      const payload = {
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptText },
              {
                type: "image_url",
                image_url: { url: base64Image }
              }
            ]
          }
        ],
        temperature: 0.2
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `OpenAI API returned HTTP ${res.status}`);
      }

      const resData = await res.json();
      const content = resData.choices?.[0]?.message?.content;
      return JSON.parse(content);
    }
  }

  /**
   * Generates automated trial analysis & executive agronomy report
   * Synthesizes ANOVA outcomes, treatment contrasts, and optimal recommendations
   */
  async generateNarrativeSynthesis(experiment, anovaData, observations) {
    if (this.apiKey && this.apiProvider !== 'embedded') {
      const promptText = `
You are a Principal Agricultural Biometrician writing an official experimental trial report.
Trial Name: ${experiment.name}
Crop: ${experiment.crop} (${experiment.variety || 'Standard Variety'})
Experimental Design: ${experiment.design_type} with ${experiment.replications} replications.
Selected Trait: ${anovaData.trait}

ANOVA Results:
- Grand Mean: ${anovaData.overallDescriptive?.mean}
- Model: ${anovaData.anova?.design || 'ANOVA'}
- F-value (Treatments): ${anovaData.anova?.fTreatment || anovaData.anova?.fValue}
- P-value: ${anovaData.anova?.pTreatment || anovaData.anova?.pValue}
- Significant (p < 0.05): ${anovaData.anova?.significantTreatment ?? anovaData.anova?.significant}
- Critical Difference (LSD/CD at 5%): ${anovaData.anova?.cd5 || anovaData.anova?.lsd}
- Coefficient of Variation (CV%): ${anovaData.anova?.cvPercent}%

Treatment Means:
${JSON.stringify(anovaData.treatmentStats, null, 2)}

Provide a comprehensive, publication-grade analytical narrative with:
1. Executive Agronomic Summary
2. Statistical Interpretation of Treatment Effects (Highlight F-test and significance)
3. Superior Treatment Identification (Which treatment outperformed the control beyond LSD)
4. Field Recommendations for Farmers and Agronomists.
Keep formatting in clean markdown with bold points.`;

      try {
        if (this.apiProvider === 'gemini') {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.selectedModel || 'gemini-1.5-flash'}:generateContent?key=${this.apiKey}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptText }] }]
            })
          });
          const json = await res.json();
          return json.candidates?.[0]?.content?.parts?.[0]?.text;
        } else if (this.apiProvider === 'openai') {
          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [{ role: "user", content: promptText }]
            })
          });
          const json = await res.json();
          return json.choices?.[0]?.message?.content;
        }
      } catch (err) {
        console.warn('Cloud synthesis failed, using rule-based synthesis engine:', err);
      }
    }

    // High quality offline rule-based synthesis engine
    return this.generateOfflineNarrative(experiment, anovaData);
  }

  generateOfflineNarrative(experiment, anovaData) {
    const anova = anovaData.anova;
    const isSig = anova ? (anova.significantTreatment ?? anova.significant) : false;
    const pVal = anova ? (anova.pTreatment || anova.pValue) : 1;
    const fVal = anova ? (anova.fTreatment || anova.fValue) : 0;
    const cd = anova ? (anova.cd5 || anova.lsd) : 0;
    const cv = anova ? anova.cvPercent : 0;

    const trtStats = anovaData.treatmentStats || {};
    const sortedTrts = Object.entries(trtStats).sort((a, b) => b[1].mean - a[1].mean);
    const topTrt = sortedTrts[0] ? sortedTrts[0] : ['N/A', { mean: 0 }];
    const lowestTrt = sortedTrts[sortedTrts.length - 1] ? sortedTrts[sortedTrts.length - 1] : ['N/A', { mean: 0 }];
    const diff = Number((topTrt[1].mean - lowestTrt[1].mean).toFixed(2));

    return `
### 🌿 AI Agronomic & Biometric Synthesis Report

**1. Executive Evaluation**
The field evaluation of **${experiment.name}** conducted under a **${experiment.design_type}** layout with **${experiment.replications} replications** revealed ${isSig ? '**statistically significant treatment divergence**' : '**no statistically significant difference at the 5% level**'} for **${anovaData.trait}**. The trial exhibited an experimental precision with an overall trial **CV of ${cv}%**, indicating ${cv < 10 ? 'high experiment reliability and low soil heterogeneity noise' : cv < 20 ? 'acceptable field trial precision' : 'moderate environmental variability across blocks'}.

**2. Biometrical Significance & Variance Analysis**
- **F-Calculated**: \`${fVal}\` (p-value: \`${pVal}\`)
- **Significance Status**: ${isSig ? '✅ Significant at p < 0.05 (*)' : '⚠️ Non-significant (p ≥ 0.05)'}
- **Critical Difference (LSD / CD at 5%)**: \`${cd}\`
${isSig ? `Because the calculated F-value exceeds the critical F-distribution threshold, the null hypothesis is rejected. The treatments exerted true biological variations beyond residual experimental error.` : `Treatment variations did not exceed the experimental error threshold at the 95% confidence interval.`}

**3. Superior Treatment Ranking**
- **Top Performing Treatment**: **${topTrt[0]}** (Mean: **${topTrt[1].mean.toLocaleString()}**)
- **Baseline / Lowest Treatment**: **${lowestTrt[0]}** (Mean: **${lowestTrt[1].mean.toLocaleString()}**)
- **Margin of Gain**: **+${diff.toLocaleString()}** (LSD threshold = ${cd})
${diff > cd ? `🏆 **Treatment ${topTrt[0]}** achieved a statistically significant gain over ${lowestTrt[0]} exceeding the critical difference (${diff} > ${cd}).` : `The numerical difference between treatments did not exceed the LSD boundary.`}

**4. Field & Physiological Recommendation**
${isSig ? `Agronomists are advised to adopt treatment **${topTrt[0]}** as the optimal management strategy for ${experiment.crop}. The physiological canopy architecture and photosynthetic capacity under this regime delivered maximum yield efficiency.` : `Further multi-environment sampling or increased replication is recommended to distinguish subtle treatment variations.`}
`;
  }
}

// Global singleton instance
window.AgroAI = new AgroAI();
