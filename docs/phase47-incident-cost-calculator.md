# Phase 47: Incident Cost Calculator

## Frontend Implementation

### HTML Structure
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Content Credentials Incident Cost Calculator</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
</head>
<body class="bg-gradient-to-br from-gray-900 via-red-900 to-gray-900 min-h-screen">
    <div class="container mx-auto px-4 py-8">
        <!-- Header -->
        <header class="text-center mb-12">
            <h1 class="text-4xl md:text-5xl font-bold text-white mb-4">
                <i class="fas fa-calculator text-red-400 mr-3"></i>
                Incident Cost Calculator
            </h1>
            <p class="text-xl text-gray-300">
                Calculate the financial impact of content credentials failures
            </p>
            <div class="mt-4 flex justify-center space-x-4">
                <button onclick="setMode('standard')" id="standardMode" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Standard Mode
                </button>
                <button onclick="setMode('eu')" id="euMode" class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">
                    EU AI Act Mode
                </button>
            </div>
        </header>

        <!-- Main Calculator -->
        <main class="max-w-4xl mx-auto">
            <div class="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-8">
                <form id="calculatorForm" class="space-y-8">
                    <!-- Basic Information -->
                    <section>
                        <h2 class="text-2xl font-bold text-white mb-6">
                            <i class="fas fa-info-circle mr-2"></i>Basic Information
                        </h2>
                        
                        <div class="grid md:grid-cols-2 gap-6">
                            <div>
                                <label for="monthlyViews" class="block text-sm font-medium text-gray-200 mb-2">
                                    Monthly Image Views
                                </label>
                                <input 
                                    type="number" 
                                    id="monthlyViews" 
                                    name="monthlyViews" 
                                    required
                                    min="1000"
                                    step="1000"
                                    placeholder="100000"
                                    class="w-full px-4 py-3 bg-white/20 border border-white/30 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                    oninput="updateCalculation()"
                                >
                                <p class="mt-2 text-sm text-gray-400">
                                    Total monthly image views across all platforms
                                </p>
                            </div>
                            
                            <div>
                                <label for="reusePercentage" class="block text-sm font-medium text-gray-200 mb-2">
                                    % Reused Externally
                                </label>
                                <input 
                                    type="number" 
                                    id="reusePercentage" 
                                    name="reusePercentage" 
                                    required
                                    min="0"
                                    max="100"
                                    step="5"
                                    placeholder="25"
                                    class="w-full px-4 py-3 bg-white/20 border border-white/30 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                    oninput="updateCalculation()"
                                >
                                <p class="mt-2 text-sm text-gray-400">
                                    Percentage of images shared on external platforms
                                </p>
                            </div>
                        </div>
                    </section>

                    <!-- Vertical Selection -->
                    <section>
                        <h2 class="text-2xl font-bold text-white mb-6">
                            <i class="fas fa-industry mr-2"></i>Industry Vertical
                        </h2>
                        
                        <div class="grid md:grid-cols-3 gap-4">
                            <label class="cursor-pointer">
                                <input type="radio" name="vertical" value="newsroom" class="sr-only peer" onchange="updateCalculation()">
                                <div class="p-4 bg-white/10 border-2 border-white/30 rounded-lg peer-checked:border-red-500 peer-checked:bg-red-500/20">
                                    <div class="text-center">
                                        <i class="fas fa-newspaper text-2xl mb-2"></i>
                                        <h3 class="font-semibold text-white">Newsroom</h3>
                                        <p class="text-sm text-gray-400">Photo journalism</p>
                                    </div>
                                </div>
                            </label>
                            
                            <label class="cursor-pointer">
                                <input type="radio" name="vertical" value="advertising" class="sr-only peer" onchange="updateCalculation()">
                                <div class="p-4 bg-white/10 border-2 border-white/30 rounded-lg peer-checked:border-red-500 peer-checked:bg-red-500/20">
                                    <div class="text-center">
                                        <i class="fas fa-ad text-2xl mb-2"></i>
                                        <h3 class="font-semibold text-white">Advertising</h3>
                                        <p class="text-sm text-gray-400">Campaign assets</p>
                                    </div>
                                </div>
                            </label>
                            
                            <label class="cursor-pointer">
                                <input type="radio" name="vertical" value="marketplace" class="sr-only peer" onchange="updateCalculation()">
                                <div class="p-4 bg-white/10 border-2 border-white/30 rounded-lg peer-checked:border-red-500 peer-checked:bg-red-500/20">
                                    <div class="text-center">
                                        <i class="fas fa-store text-2xl mb-2"></i>
                                        <h3 class="font-semibold text-white">Marketplace</h3>
                                        <p class="text-sm text-gray-400">Product listings</p>
                                    </div>
                                </div>
                            </label>
                        </div>
                    </section>

                    <!-- Technology Stack -->
                    <section>
                        <h2 class="text-2xl font-bold text-white mb-6">
                            <i class="fas fa-cogs mr-2"></i>Technology Stack
                        </h2>
                        
                        <div class="grid md:grid-cols-2 gap-6">
                            <div>
                                <label class="block text-sm font-medium text-gray-200 mb-3">CDN Provider</label>
                                <select name="cdn" class="w-full px-4 py-3 bg-white/20 border border-white/30 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent" onchange="updateCalculation()">
                                    <option value="">Select CDN</option>
                                    <option value="cloudflare">Cloudflare</option>
                                    <option value="fastly">Fastly</option>
                                    <option value="akamai">Akamai</option>
                                    <option value="aws">AWS CloudFront</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-200 mb-3">CMS Platform</label>
                                <select name="cms" class="w-full px-4 py-3 bg-white/20 border border-white/30 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:border-transparent" onchange="updateCalculation()">
                                    <option value="">Select CMS</option>
                                    <option value="wordpress">WordPress</option>
                                    <option value="shopify">Shopify</option>
                                    <option value="custom">Custom CMS</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    <!-- EU AI Act Section (Hidden by default) -->
                    <section id="euSection" class="hidden">
                        <h2 class="text-2xl font-bold text-white mb-6">
                            <i class="fas fa-balance-scale mr-2"></i>EU AI Act Compliance
                        </h2>
                        
                        <div class="bg-red-500/20 border border-red-500/30 rounded-lg p-6 mb-6">
                            <h3 class="font-semibold text-red-300 mb-3">Article 50 Disclosure Requirements</h3>
                            <p class="text-gray-300 mb-4">
                                The EU AI Act requires disclosure of AI-generated or AI-altered content. 
                                Non-compliance can result in significant fines.
                            </p>
                        </div>
                        
                        <div class="grid md:grid-cols-2 gap-6">
                            <div>
                                <label for="aiGeneratedPercentage" class="block text-sm font-medium text-gray-200 mb-2">
                                    % AI-Generated Content
                                </label>
                                <input 
                                    type="number" 
                                    id="aiGeneratedPercentage" 
                                    name="aiGeneratedPercentage" 
                                    min="0"
                                    max="100"
                                    step="5"
                                    placeholder="10"
                                    class="w-full px-4 py-3 bg-white/20 border border-white/30 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                    oninput="updateCalculation()"
                                >
                            </div>
                            
                            <div>
                                <label for="euRevenue" class="block text-sm font-medium text-gray-200 mb-2">
                                    Annual EU Revenue (€)
                                </label>
                                <input 
                                    type="number" 
                                    id="euRevenue" 
                                    name="euRevenue" 
                                    min="0"
                                    step="100000"
                                    placeholder="10000000"
                                    class="w-full px-4 py-3 bg-white/20 border border-white/30 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                    oninput="updateCalculation()"
                                >
                            </div>
                        </div>
                    </section>

                    <!-- Results Section -->
                    <section id="resultsSection" class="hidden">
                        <h2 class="text-2xl font-bold text-white mb-6">
                            <i class="fas fa-chart-line mr-2"></i>Cost Analysis Results
                        </h2>
                        
                        <div class="grid md:grid-cols-3 gap-6 mb-8">
                            <div class="bg-red-500/20 border border-red-500/30 rounded-lg p-6 text-center">
                                <i class="fas fa-exclamation-triangle text-3xl text-red-400 mb-3"></i>
                                <h3 class="text-lg font-semibold text-white mb-2">Risk Cost</h3>
                                <p class="text-3xl font-bold text-red-400" id="riskCost">€0</p>
                                <p class="text-sm text-gray-400 mt-2">Annual risk from misattribution</p>
                            </div>
                            
                            <div class="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-6 text-center">
                                <i class="fas fa-tools text-3xl text-yellow-400 mb-3"></i>
                                <h3 class="text-lg font-semibold text-white mb-2">Ops Cost</h3>
                                <p class="text-3xl font-bold text-yellow-400" id="opsCost">€0</p>
                                <p class="text-sm text-gray-400 mt-2">Manual fixes & support</p>
                            </div>
                            
                            <div class="bg-green-500/20 border border-green-500/30 rounded-lg p-6 text-center">
                                <i class="fas fa-piggy-bank text-3xl text-green-400 mb-3"></i>
                                <h3 class="text-lg font-semibold text-white mb-2">Savings</h3>
                                <p class="text-3xl font-bold text-green-400" id="savingsAmount">€0</p>
                                <p class="text-sm text-gray-400 mt-2">Potential annual savings</p>
                            </div>
                        </div>

                        <!-- Chart -->
                        <div class="bg-white/10 rounded-lg p-6 mb-8">
                            <h3 class="text-lg font-semibold text-white mb-4">Cost Breakdown</h3>
                            <canvas id="costChart" width="400" height="200"></canvas>
                        </div>

                        <!-- EU AI Act Specific Results -->
                        <div id="euResults" class="hidden">
                            <div class="bg-red-500/20 border border-red-500/30 rounded-lg p-6 mb-6">
                                <h3 class="font-semibold text-red-300 mb-3">EU AI Act Compliance Impact</h3>
                                <div class="grid md:grid-cols-2 gap-6">
                                    <div>
                                        <p class="text-gray-300">Potential fines for non-compliance:</p>
                                        <p class="text-2xl font-bold text-red-400" id="complianceFines">€0</p>
                                    </div>
                                    <div>
                                        <p class="text-gray-300">Compliance deadline urgency:</p>
                                        <p class="text-2xl font-bold text-yellow-400" id="complianceUrgency">Medium</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Recommendations -->
                        <div class="bg-blue-500/20 border border-blue-500/30 rounded-lg p-6">
                            <h3 class="font-semibold text-blue-300 mb-3">Recommendations</h3>
                            <div id="recommendations" class="text-gray-300 space-y-2">
                                <!-- Recommendations will be inserted here -->
                            </div>
                        </div>
                    </section>

                    <!-- Action Buttons -->
                    <div class="flex flex-col sm:flex-row gap-4">
                        <button type="button" onclick="calculateCosts()" class="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-6 rounded-lg duration-200 transform hover:scale-[1.02]">
                            <i class="fas fa-calculator mr-2"></i>Calculate Costs
                        </button>
                        <button type="button" onclick="generateReport()" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg duration-200">
                            <i class="fas fa-download mr-2"></i>Download Report
                        </button>
                        <button type="button" onclick="schedulePilot()" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg duration-200">
                            <i class="fas fa-rocket mr-2"></i>Schedule Pilot
                        </button>
                    </div>
                </form>
            </div>
        </main>
    </div>
</body>
</html>
```

### JavaScript Implementation
```javascript
class IncidentCostCalculator {
    constructor() {
        this.mode = 'standard';
        this.chart = null;
        this.results = {};
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadDefaults();
    }

    setupEventListeners() {
        // Form inputs
        const inputs = document.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.addEventListener('change', () => this.updateCalculation());
        });
    }

    loadDefaults() {
        // Set reasonable defaults
        document.getElementById('monthlyViews').value = '100000';
        document.getElementById('reusePercentage').value = '25';
    }

    setMode(mode) {
        this.mode = mode;
        
        // Update UI
        const standardBtn = document.getElementById('standardMode');
        const euBtn = document.getElementById('euMode');
        const euSection = document.getElementById('euSection');
        
        if (mode === 'eu') {
            standardBtn.className = 'px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700';
            euBtn.className = 'px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700';
            euSection.classList.remove('hidden');
        } else {
            standardBtn.className = 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700';
            euBtn.className = 'px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700';
            euSection.classList.add('hidden');
        }
        
        this.updateCalculation();
    }

    updateCalculation() {
        const formData = this.getFormData();
        if (!this.isValidFormData(formData)) {
            return;
        }

        this.results = this.calculateCosts(formData);
        this.updateUI();
    }

    getFormData() {
        return {
            monthlyViews: parseInt(document.getElementById('monthlyViews').value) || 0,
            reusePercentage: parseInt(document.getElementById('reusePercentage').value) || 0,
            vertical: document.querySelector('input[name="vertical"]:checked')?.value || '',
            cdn: document.querySelector('select[name="cdn"]').value || '',
            cms: document.querySelector('select[name="cms"]').value || '',
            aiGeneratedPercentage: this.mode === 'eu' ? (parseInt(document.getElementById('aiGeneratedPercentage').value) || 0) : 0,
            euRevenue: this.mode === 'eu' ? (parseInt(document.getElementById('euRevenue').value) || 0) : 0
        };
    }

    isValidFormData(data) {
        return data.monthlyViews > 0 && 
               data.vertical !== '' && 
               data.cdn !== '' && 
               data.cms !== '';
    }

    calculateCosts(data) {
        // Base risk calculations
        const baseRiskPerView = this.getBaseRiskPerView(data.vertical);
        const reusedViews = data.monthlyViews * (data.reusePercentage / 100);
        
        // Risk cost calculation
        const monthlyRiskCost = reusedViews * baseRiskPerView;
        const annualRiskCost = monthlyRiskCost * 12;
        
        // Operations cost calculation
        const opsCostPerView = this.getOpsCostPerView(data.cdn, data.cms);
        const monthlyOpsCost = data.monthlyViews * opsCostPerView;
        const annualOpsCost = monthlyOpsCost * 12;
        
        // Savings calculation
        const savingsPercentage = this.getSavingsPercentage(data.cdn, data.cms);
        const annualSavings = (annualRiskCost + annualOpsCost) * (savingsPercentage / 100);
        
        // EU AI Act specific calculations
        let complianceFines = 0;
        let complianceUrgency = 'Low';
        
        if (this.mode === 'eu') {
            complianceFines = this.calculateComplianceFines(data);
            complianceUrgency = this.getComplianceUrgency(data.aiGeneratedPercentage, data.euRevenue);
        }
        
        return {
            riskCost: annualRiskCost,
            opsCost: annualOpsCost,
            totalCost: annualRiskCost + annualOpsCost,
            savings: annualSavings,
            complianceFines,
            complianceUrgency,
            recommendations: this.generateRecommendations(data, this.results)
        };
    }

    getBaseRiskPerView(vertical) {
        const riskMultipliers = {
            newsroom: 0.05,      // €0.05 per view for newsroom
            advertising: 0.08,   // €0.08 per view for advertising
            marketplace: 0.12    // €0.12 per view for marketplace
        };
        return riskMultipliers[vertical] || 0.05;
    }

    getOpsCostPerView(cdn, cms) {
        const cdnMultipliers = {
            cloudflare: 0.01,
            fastly: 0.015,
            akamai: 0.02,
            aws: 0.018,
            other: 0.025
        };
        
        const cmsMultipliers = {
            wordpress: 0.005,
            shopify: 0.003,
            custom: 0.02,
            other: 0.015
        };
        
        return (cdnMultipliers[cdn] || 0.02) + (cmsMultipliers[cms] || 0.015);
    }

    getSavingsPercentage(cdn, cms) {
        // Higher savings for platforms that support content credentials
        const cdnSavings = {
            cloudflare: 85,
            fastly: 70,
            akamai: 75,
            aws: 60,
            other: 50
        };
        
        const cmsSavings = {
            wordpress: 80,
            shopify: 75,
            custom: 65,
            other: 55
        };
        
        return Math.round((cdnSavings[cdn] + cmsSavings[cms]) / 2);
    }

    calculateComplianceFines(data) {
        // EU AI Act fines: up to €35M or 7% of global annual turnover
        const baseFine = Math.min(35000000, data.euRevenue * 0.07);
        const aiContentMultiplier = data.aiGeneratedPercentage / 100;
        
        return Math.round(baseFine * aiContentMultiplier * 0.3); // 30% probability of detection
    }

    getComplianceUrgency(aiPercentage, euRevenue) {
        if (aiPercentage > 20 && euRevenue > 50000000) return 'Critical';
        if (aiPercentage > 10 || euRevenue > 10000000) return 'High';
        if (aiPercentage > 5 || euRevenue > 1000000) return 'Medium';
        return 'Low';
    }

    generateRecommendations(data, results) {
        const recommendations = [];
        
        // CDN recommendations
        if (data.cdn === 'cloudflare') {
            recommendations.push('✅ Enable Cloudflare\'s "Preserve Content Credentials" feature for immediate improvement');
        } else {
            recommendations.push('⚠️ Consider migrating to Cloudflare for better content credentials support');
        }
        
        // CMS recommendations
        if (data.cms === 'wordpress') {
            recommendations.push('📝 Install our WordPress plugin for automatic manifest injection');
        } else if (data.cms === 'shopify') {
            recommendations.push('🛒 Use our Shopify app for product image provenance');
        } else {
            recommendations.push('🔧 Implement our CDN-level solution for custom CMS integration');
        }
        
        // Volume recommendations
        if (data.monthlyViews > 1000000) {
            recommendations.push('📈 High volume detected - Enterprise pilot recommended');
        } else {
            recommendations.push('🚀 Start with Pro pilot for immediate ROI');
        }
        
        // EU AI Act recommendations
        if (this.mode === 'eu' && data.aiGeneratedPercentage > 0) {
            recommendations.push('🇪🇺 EU AI Act compliance critical - Pilot should include disclosure workflows');
        }
        
        return recommendations;
    }

    updateUI() {
        if (!this.results.riskCost) return;
        
        // Show results section
        document.getElementById('resultsSection').classList.remove('hidden');
        
        // Update cost displays
        document.getElementById('riskCost').textContent = this.formatCurrency(this.results.riskCost);
        document.getElementById('opsCost').textContent = this.formatCurrency(this.results.opsCost);
        document.getElementById('savingsAmount').textContent = this.formatCurrency(this.results.savings);
        
        // Update EU results if applicable
        if (this.mode === 'eu') {
            document.getElementById('euResults').classList.remove('hidden');
            document.getElementById('complianceFines').textContent = this.formatCurrency(this.results.complianceFines);
            document.getElementById('complianceUrgency').textContent = this.results.complianceUrgency;
        }
        
        // Update recommendations
        const recommendationsDiv = document.getElementById('recommendations');
        recommendationsDiv.innerHTML = this.results.recommendations
            .map(rec => `<p>${rec}</p>`)
            .join('');
        
        // Update chart
        this.updateChart();
    }

    updateChart() {
        const ctx = document.getElementById('costChart').getContext('2d');
        
        if (this.chart) {
            this.chart.destroy();
        }
        
        this.chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Risk Cost', 'Operations Cost', 'Potential Savings'],
                datasets: [{
                    data: [this.results.riskCost, this.results.opsCost, this.results.savings],
                    backgroundColor: [
                        'rgba(239, 68, 68, 0.8)',
                        'rgba(245, 158, 11, 0.8)',
                        'rgba(34, 197, 94, 0.8)'
                    ],
                    borderColor: [
                        'rgba(239, 68, 68, 1)',
                        'rgba(245, 158, 11, 1)',
                        'rgba(34, 197, 94, 1)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: 'white',
                            padding: 20
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return context.label + ': ' + this.formatCurrency(context.raw);
                            }
                        }
                    }
                }
            }
        });
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-EU', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    }

    calculateCosts() {
        this.updateCalculation();
        document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
        
        // Track calculation event
        this.trackEvent('cost_calculated', {
            mode: this.mode,
            risk_cost: this.results.riskCost,
            savings: this.results.savings
        });
    }

    generateReport() {
        const reportData = {
            ...this.getFormData(),
            ...this.results,
            mode: this.mode,
            timestamp: new Date().toISOString()
        };
        
        // Generate PDF report (implementation would depend on backend)
        this.downloadReport(reportData);
        
        this.trackEvent('report_downloaded', { mode: this.mode });
    }

    downloadReport(data) {
        // Create a text report for now
        const report = this.generateTextReport(data);
        const blob = new Blob([report], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `incident-cost-report-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    generateTextReport(data) {
        return `
Content Credentials Incident Cost Report
Generated: ${new Date().toLocaleString()}
Mode: ${data.mode.toUpperCase()}

INPUT PARAMETERS:
- Monthly Image Views: ${data.monthlyViews.toLocaleString()}
- % Reused Externally: ${data.reusePercentage}%
- Industry Vertical: ${data.vertical}
- CDN Provider: ${data.cdn}
- CMS Platform: ${data.cms}
${data.mode === 'eu' ? `- AI-Generated Content: ${data.aiGeneratedPercentage}%\n- EU Revenue: €${data.euRevenue.toLocaleString()}` : ''}

COST ANALYSIS:
- Annual Risk Cost: ${this.formatCurrency(data.riskCost)}
- Annual Operations Cost: ${this.formatCurrency(data.opsCost)}
- Total Annual Cost: ${this.formatCurrency(data.totalCost)}
- Potential Annual Savings: ${this.formatCurrency(data.savings)}
${data.mode === 'eu' ? `- EU AI Act Compliance Fines: ${this.formatCurrency(data.complianceFines)}\n- Compliance Urgency: ${data.complianceUrgency}` : ''}

RECOMMENDATIONS:
${data.recommendations.join('\n')}

ROI SUMMARY:
Implementation Cost: ~€2,000-€10,000 (depending on scale)
First Year Savings: ${this.formatCurrency(data.savings)}
Payback Period: ${Math.round(2000 / (data.savings / 12))} months

Next Steps:
1. Schedule a 14-day pilot to validate savings
2. Implement recommended CDN/CMS configurations
3. Monitor survival rates and cost reductions
4. Scale to full implementation based on pilot results

For questions or to schedule your pilot, contact: sales@c2concierge.dev
        `.trim();
    }

    schedulePilot() {
        const pilotData = {
            source: 'cost-calculator',
            mode: this.mode,
            estimated_savings: this.results.savings,
            vertical: this.getFormData().vertical
        };
        
        // Redirect to pilot scheduling
        window.location.href = `/pilot-signup?${new URLSearchParams(pilotData).toString()}`;
    }

    trackEvent(action, data = {}) {
        if (typeof gtag !== 'undefined') {
            gtag('event', action, {
                event_category: 'cost_calculator',
                ...data
            });
        }
    }
}

// Global functions for button onclick handlers
function setMode(mode) {
    window.calculator.setMode(mode);
}

function updateCalculation() {
    window.calculator.updateCalculation();
}

function calculateCosts() {
    window.calculator.calculateCosts();
}

function generateReport() {
    window.calculator.generateReport();
}

function schedulePilot() {
    window.calculator.schedulePilot();
}

// Initialize calculator when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.calculator = new IncidentCostCalculator();
});
```

### Backend API Implementation
```javascript
// API endpoint for cost calculation
app.post('/api/calculate-costs', async (req, res) => {
    try {
        const {
            monthlyViews,
            reusePercentage,
            vertical,
            cdn,
            cms,
            aiGeneratedPercentage,
            euRevenue,
            mode
        } = req.body;

        // Validate inputs
        if (!monthlyViews || !vertical || !cdn || !cms) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Calculate costs using the same logic as frontend
        const results = calculateIncidentCosts({
            monthlyViews: parseInt(monthlyViews),
            reusePercentage: parseInt(reusePercentage),
            vertical,
            cdn,
            cms,
            aiGeneratedPercentage: mode === 'eu' ? parseInt(aiGeneratedPercentage) : 0,
            euRevenue: mode === 'eu' ? parseInt(euRevenue) : 0
        });

        // Track calculation for analytics
        await trackCostCalculation({
            ...req.body,
            results,
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            ...results
        });

    } catch (error) {
        console.error('Cost calculation error:', error);
        res.status(500).json({ error: 'Cost calculation failed' });
    }
});

function calculateIncidentCosts(data) {
    // Implementation matches frontend logic
    const baseRiskPerView = {
        newsroom: 0.05,
        advertising: 0.08,
        marketplace: 0.12
    }[data.vertical] || 0.05;

    const reusedViews = data.monthlyViews * (data.reusePercentage / 100);
    const annualRiskCost = reusedViews * baseRiskPerView * 12;

    const opsCostPerView = {
        cloudflare: 0.01,
        fastly: 0.015,
        akamai: 0.02,
        aws: 0.018,
        other: 0.025
    }[data.cdn] + {
        wordpress: 0.005,
        shopify: 0.003,
        custom: 0.02,
        other: 0.015
    }[data.cms];

    const annualOpsCost = data.monthlyViews * opsCostPerView * 12;

    const savingsPercentage = Math.round((
        { cloudflare: 85, fastly: 70, akamai: 75, aws: 60, other: 50 }[data.cdn] +
        { wordpress: 80, shopify: 75, custom: 65, other: 55 }[data.cms]
    ) / 2);

    const annualSavings = (annualRiskCost + annualOpsCost) * (savingsPercentage / 100);

    let complianceFines = 0;
    let complianceUrgency = 'Low';

    if (data.mode === 'eu') {
        const baseFine = Math.min(35000000, data.euRevenue * 0.07);
        complianceFines = Math.round(baseFine * (data.aiGeneratedPercentage / 100) * 0.3);
        
        if (data.aiGeneratedPercentage > 20 && data.euRevenue > 50000000) complianceUrgency = 'Critical';
        else if (data.aiGeneratedPercentage > 10 || data.euRevenue > 10000000) complianceUrgency = 'High';
        else if (data.aiGeneratedPercentage > 5 || data.euRevenue > 1000000) complianceUrgency = 'Medium';
    }

    return {
        riskCost: annualRiskCost,
        opsCost: annualOpsCost,
        totalCost: annualRiskCost + annualOpsCost,
        savings: annualSavings,
        complianceFines,
        complianceUrgency
    };
}
```
