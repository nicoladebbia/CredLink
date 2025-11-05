# Cost Estimator

**Advanced Customer-Facing Cost Projection Tool**

**Version**: 1.0.0  
**Launch Date**: November 5, 2025  
**Target**: Finance teams and procurement professionals

---

## Estimator Overview

### Value Proposition

The Cost Estimator provides detailed financial projections for enterprise customers, including:
- **Total Cost of Ownership (TCO)** analysis
- **ROI calculations** based on compliance savings
- **Cash flow projections** for budget planning
- **Comparison tools** vs in-house solutions
- **Custom scenarios** for growth modeling

### Target Users

1. **CFOs/Finance Directors** - Budget planning and financial analysis
2. **Procurement Managers** - Vendor comparison and negotiation support
3. **IT Directors** - Total cost analysis vs internal solutions
4. **Compliance Officers** - Risk mitigation cost justification

---

## Cost Estimator Implementation

### HTML Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>C2 Concierge - Enterprise Cost Estimator</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body class="bg-gray-50">
    <!-- Professional Header -->
    <header class="bg-slate-900 text-white">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center py-6">
                <div class="flex items-center">
                    <img src="/logo-white.svg" alt="C2 Concierge" class="h-10 w-auto">
                    <div class="ml-4">
                        <h1 class="text-2xl font-bold">Enterprise Cost Estimator</h1>
                        <p class="text-slate-400 text-sm">Total Cost of Ownership Analysis</p>
                    </div>
                </div>
                <div class="flex items-center space-x-4">
                    <button class="text-slate-300 hover:text-white">
                        <i class="fas fa-download mr-2"></i>
                        Export PDF
                    </button>
                    <button class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">
                        <i class="fas fa-phone mr-2"></i>
                        Contact Sales
                    </button>
                </div>
            </div>
        </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <!-- Executive Summary -->
        <div class="bg-white rounded-lg shadow-lg p-8 mb-8">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div class="text-center">
                    <div class="text-4xl font-bold text-blue-600" id="monthlyTCO">$0</div>
                    <div class="text-sm text-gray-600 mt-1">Monthly TCO</div>
                </div>
                <div class="text-center">
                    <div class="text-4xl font-bold text-green-600" id="annualTCO">$0</div>
                    <div class="text-sm text-gray-600 mt-1">Annual TCO</div>
                </div>
                <div class="text-center">
                    <div class="text-4xl font-bold text-purple-600" id="roiPercentage">0%</div>
                    <div class="text-sm text-gray-600 mt-1">3-Year ROI</div>
                </div>
                <div class="text-center">
                    <div class="text-4xl font-bold text-orange-600" id="paybackMonths">0</div>
                    <div class="text-sm text-gray-600 mt-1">Payback (Months)</div>
                </div>
            </div>
        </div>

        <!-- Input Configuration -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- Configuration Panel -->
            <div class="lg:col-span-1">
                <!-- Business Profile -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">
                        <i class="fas fa-building mr-2"></i>
                        Business Profile
                    </h3>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Company Size
                            </label>
                            <select id="companySize" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="small">Small (1-100 employees)</option>
                                <option value="medium">Medium (101-1000 employees)</option>
                                <option value="large" selected>Large (1000+ employees)</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Industry
                            </label>
                            <select id="industry" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="media">Media & Publishing</option>
                                <option value="ecommerce">E-commerce</option>
                                <option value="enterprise">Enterprise</option>
                                <option value="government">Government</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Compliance Requirements
                            </label>
                            <div class="space-y-2">
                                <label class="flex items-center">
                                    <input type="checkbox" id="gdpr" class="mr-2" checked>
                                    <span class="text-sm">GDPR Compliance</span>
                                </label>
                                <label class="flex items-center">
                                    <input type="checkbox" id="soc2" class="mr-2" checked>
                                    <span class="text-sm">SOC 2 Required</span>
                                </label>
                                <label class="flex items-center">
                                    <input type="checkbox" id="fips" class="mr-2">
                                    <span class="text-sm">FIPS 140-2</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Usage Projections -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">
                        <i class="fas fa-chart-line mr-2"></i>
                        Usage Projections
                    </h3>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Monthly Content Volume
                            </label>
                            <input type="number" id="monthlyContent" value="50000" min="1000" max="1000000" 
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <div class="text-xs text-gray-500 mt-1">Assets per month</div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Annual Growth Rate
                            </label>
                            <input type="range" id="growthRate" min="0" max="100" value="25" 
                                   class="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer">
                            <div class="flex justify-between text-xs text-gray-600 mt-1">
                                <span>0%</span>
                                <span id="growthRateValue" class="font-semibold text-blue-600">25%</span>
                                <span>100%</span>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Verification Coverage
                            </label>
                            <input type="range" id="verificationCoverage" min="10" max="100" value="75" 
                                   class="w-full h-2 bg-green-200 rounded-lg appearance-none cursor-pointer">
                            <div class="flex justify-between text-xs text-gray-600 mt-1">
                                <span>10%</span>
                                <span id="verificationCoverageValue" class="font-semibold text-green-600">75%</span>
                                <span>100%</span>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Signing Coverage
                            </label>
                            <input type="range" id="signingCoverage" min="5" max="50" value="30" 
                                   class="w-full h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer">
                            <div class="flex justify-between text-xs text-gray-600 mt-1">
                                <span>5%</span>
                                <span id="signingCoverageValue" class="font-semibold text-purple-600">30%</span>
                                <span>50%</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Implementation Costs -->
                <div class="bg-white rounded-lg shadow-md p-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">
                        <i class="fas fa-cogs mr-2"></i>
                        Implementation Costs
                    </h3>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Integration Complexity
                            </label>
                            <select id="integrationComplexity" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="simple">Simple (API integration)</option>
                                <option value="moderate">Moderate (Custom workflows)</option>
                                <option value="complex" selected>Complex (Enterprise systems)</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Training Requirements
                            </label>
                            <select id="trainingRequirements" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="basic">Basic (10 hours)</option>
                                <option value="standard" selected>Standard (40 hours)</option>
                                <option value="comprehensive">Comprehensive (100+ hours)</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                Custom Development
                            </label>
                            <input type="checkbox" id="customDevelopment" class="mr-2">
                            <span class="text-sm">Requires custom development</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Results Panel -->
            <div class="lg:col-span-2">
                <!-- Cost Breakdown -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-lg font-semibold text-gray-900">
                            <i class="fas fa-dollar-sign mr-2"></i>
                            3-Year Cost Analysis
                        </h3>
                        <div class="flex space-x-2">
                            <button class="text-blue-600 hover:text-blue-700 text-sm">
                                <i class="fas fa-table mr-1"></i>
                                Table View
                            </button>
                            <button class="text-blue-600 hover:text-blue-700 text-sm">
                                <i class="fas fa-chart-bar mr-1"></i>
                                Chart View
                            </button>
                        </div>
                    </div>
                    
                    <!-- Cost Breakdown Chart -->
                    <div class="mb-6">
                        <canvas id="costBreakdownChart" width="400" height="200"></canvas>
                    </div>
                    
                    <!-- Detailed Cost Table -->
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Cost Category
                                    </th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Year 1
                                    </th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Year 2
                                    </th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Year 3
                                    </th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        3-Year Total
                                    </th>
                                </tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-gray-200" id="costBreakdownTable">
                                <!-- Populated by JavaScript -->
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- ROI Analysis -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">
                        <i class="fas fa-chart-pie mr-2"></i>
                        ROI Analysis
                    </h3>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- Benefits -->
                        <div>
                            <h4 class="font-semibold text-gray-900 mb-3">Quantified Benefits</h4>
                            <div class="space-y-2">
                                <div class="flex justify-between text-sm">
                                    <span>Compliance Cost Savings:</span>
                                    <span class="font-semibold text-green-600" id="complianceSavings">$0</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span>Operational Efficiency:</span>
                                    <span class="font-semibold text-green-600" id="operationalSavings">$0</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span>Risk Mitigation Value:</span>
                                    <span class="font-semibold text-green-600" id="riskMitigationValue">$0</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span>Competitive Advantage:</span>
                                    <span class="font-semibold text-green-600" id="competitiveAdvantage">$0</span>
                                </div>
                                <div class="flex justify-between text-sm font-semibold pt-2 border-t">
                                    <span>Total Benefits:</span>
                                    <span class="text-green-600" id="totalBenefits">$0</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- ROI Metrics -->
                        <div>
                            <h4 class="font-semibold text-gray-900 mb-3">ROI Metrics</h4>
                            <div class="space-y-2">
                                <div class="flex justify-between text-sm">
                                    <span>Net Present Value (NPV):</span>
                                    <span class="font-semibold text-blue-600" id="npv">$0</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span>Internal Rate of Return (IRR):</span>
                                    <span class="font-semibold text-blue-600" id="irr">0%</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span>Benefit-Cost Ratio:</span>
                                    <span class="font-semibold text-blue-600" id="benefitCostRatio">0.0</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span>Payback Period:</span>
                                    <span class="font-semibold text-blue-600" id="paybackPeriod">0 months</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Comparison with Alternatives -->
                <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">
                        <i class="fas fa-balance-scale mr-2"></i>
                        Alternative Solutions Comparison
                    </h3>
                    
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <!-- C2 Concierge -->
                        <div class="border-2 border-blue-500 rounded-lg p-4">
                            <h4 class="font-semibold text-blue-900 mb-2">C2 Concierge</h4>
                            <div class="space-y-2 text-sm">
                                <div class="flex justify-between">
                                    <span>Implementation:</span>
                                    <span class="font-semibold">$50,000</span>
                                </div>
                                <div class="flex justify-between">
                                    <span>Annual Cost:</span>
                                    <span class="font-semibold" id="c2AnnualCost">$0</span>
                                </div>
                                <div class="flex justify-between">
                                    <span>3-Year Total:</span>
                                    <span class="font-semibold" id="c2ThreeYearTotal">$0</span>
                                </div>
                            </div>
                            <div class="mt-3 pt-3 border-t">
                                <div class="text-xs text-green-600">
                                    <i class="fas fa-check mr-1"></i>
                                    Fully managed
                                </div>
                                <div class="text-xs text-green-600">
                                    <i class="fas fa-check mr-1"></i>
                                    Compliance included
                                </div>
                                <div class="text-xs text-green-600">
                                    <i class="fas fa-check mr-1"></i>
                                    24/7 support
                                </div>
                            </div>
                        </div>
                        
                        <!-- In-House -->
                        <div class="border border-gray-200 rounded-lg p-4">
                            <h4 class="font-semibold text-gray-900 mb-2">In-House Solution</h4>
                            <div class="space-y-2 text-sm">
                                <div class="flex justify-between">
                                    <span>Development:</span>
                                    <span class="font-semibold">$500,000</span>
                                </div>
                                <div class="flex justify-between">
                                    <span>Annual Ops:</span>
                                    <span class="font-semibold">$300,000</span>
                                </div>
                                <div class="flex justify-between">
                                    <span>3-Year Total:</span>
                                    <span class="font-semibold">$1,100,000</span>
                                </div>
                            </div>
                            <div class="mt-3 pt-3 border-t">
                                <div class="text-xs text-red-600">
                                    <i class="fas fa-times mr-1"></i>
                                    High upfront cost
                                </div>
                                <div class="text-xs text-red-600">
                                    <i class="fas fa-times mr-1"></i>
                                    Ongoing maintenance
                                </div>
                                <div class="text-xs text-yellow-600">
                                    <i class="fas fa-exclamation mr-1"></i>
                                    Compliance risk
                                </div>
                            </div>
                        </div>
                        
                        <!-- Competitor -->
                        <div class="border border-gray-200 rounded-lg p-4">
                            <h4 class="font-semibold text-gray-900 mb-2">Typical Competitor</h4>
                            <div class="space-y-2 text-sm">
                                <div class="flex justify-between">
                                    <span>Setup:</span>
                                    <span class="font-semibold">$100,000</span>
                                </div>
                                <div class="flex justify-between">
                                    <span>Annual Cost:</span>
                                    <span class="font-semibold" id="competitorAnnualCost">$0</span>
                                </div>
                                <div class="flex justify-between">
                                    <span>3-Year Total:</span>
                                    <span class="font-semibold" id="competitorThreeYearTotal">$0</span>
                                </div>
                            </div>
                            <div class="mt-3 pt-3 border-t">
                                <div class="text-xs text-yellow-600">
                                    <i class="fas fa-exclamation mr-1"></i>
                                    Limited features
                                </div>
                                <div class="text-xs text-yellow-600">
                                    <i class="fas fa-exclamation mr-1"></i>
                                    Compliance extra
                                </div>
                                <div class="text-xs text-red-600">
                                    <i class="fas fa-times mr-1"></i>
                                    Vendor lock-in
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Cash Flow Projection -->
                <div class="bg-white rounded-lg shadow-md p-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">
                        <i class="fas fa-money-bill-wave mr-2"></i>
                        Cash Flow Projection
                    </h3>
                    
                    <div class="mb-6">
                        <canvas id="cashFlowChart" width="400" height="200"></canvas>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
                        <div>
                            <div class="text-2xl font-bold text-gray-900" id="year1CashFlow">$0</div>
                            <div class="text-sm text-gray-600">Year 1 Cash Flow</div>
                        </div>
                        <div>
                            <div class="text-2xl font-bold text-gray-900" id="year2CashFlow">$0</div>
                            <div class="text-sm text-gray-600">Year 2 Cash Flow</div>
                        </div>
                        <div>
                            <div class="text-2xl font-bold text-gray-900" id="year3CashFlow">$0</div>
                            <div class="text-sm text-gray-600">Year 3 Cash Flow</div>
                        </div>
                        <div>
                            <div class="text-2xl font-bold text-green-600" id="cumulativeCashFlow">$0</div>
                            <div class="text-sm text-gray-600">Cumulative (3 Years)</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </main>

    <script src="cost-estimator.js"></script>
</body>
</html>
```

### JavaScript Implementation

```javascript
// cost-estimator.js
class EnterpriseCostEstimator {
    constructor() {
        this.initializeEventListeners();
        this.initializeCharts();
        this.calculate();
    }
    
    initializeEventListeners() {
        // Range inputs
        document.getElementById('growthRate').addEventListener('input', (e) => {
            document.getElementById('growthRateValue').textContent = e.target.value + '%';
            this.calculate();
        });
        
        document.getElementById('verificationCoverage').addEventListener('input', (e) => {
            document.getElementById('verificationCoverageValue').textContent = e.target.value + '%';
            this.calculate();
        });
        
        document.getElementById('signingCoverage').addEventListener('input', (e) => {
            document.getElementById('signingCoverageValue').textContent = e.target.value + '%';
            this.calculate();
        });
        
        // Select inputs
        const selects = ['companySize', 'industry', 'integrationComplexity', 'trainingRequirements'];
        selects.forEach(id => {
            document.getElementById(id).addEventListener('change', () => this.calculate());
        });
        
        // Number inputs
        document.getElementById('monthlyContent').addEventListener('input', () => this.calculate());
        
        // Checkboxes
        const checkboxes = ['gdpr', 'soc2', 'fips', 'customDevelopment'];
        checkboxes.forEach(id => {
            document.getElementById(id).addEventListener('change', () => this.calculate());
        });
    }
    
    initializeCharts() {
        // Cost Breakdown Chart
        const costCtx = document.getElementById('costBreakdownChart').getContext('2d');
        this.costBreakdownChart = new Chart(costCtx, {
            type: 'bar',
            data: {
                labels: ['Year 1', 'Year 2', 'Year 3'],
                datasets: [
                    {
                        label: 'Subscription',
                        data: [0, 0, 0],
                        backgroundColor: 'rgba(59, 130, 246, 0.8)',
                        stack: 'Stack 0'
                    },
                    {
                        label: 'Implementation',
                        data: [0, 0, 0],
                        backgroundColor: 'rgba(16, 185, 129, 0.8)',
                        stack: 'Stack 0'
                    },
                    {
                        label: 'Training',
                        data: [0, 0, 0],
                        backgroundColor: 'rgba(251, 146, 60, 0.8)',
                        stack: 'Stack 0'
                    },
                    {
                        label: 'Custom Development',
                        data: [0, 0, 0],
                        backgroundColor: 'rgba(139, 92, 246, 0.8)',
                        stack: 'Stack 0'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { stacked: true },
                    y: { 
                        stacked: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': $' + context.raw.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
        
        // Cash Flow Chart
        const cashFlowCtx = document.getElementById('cashFlowChart').getContext('2d');
        this.cashFlowChart = new Chart(cashFlowCtx, {
            type: 'line',
            data: {
                labels: ['Month 0', 'Month 6', 'Month 12', 'Month 18', 'Month 24', 'Month 30', 'Month 36'],
                datasets: [
                    {
                        label: 'Cumulative Benefits',
                        data: [0, 0, 0, 0, 0, 0, 0],
                        borderColor: 'rgba(16, 185, 129, 1)',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        fill: true
                    },
                    {
                        label: 'Cumulative Costs',
                        data: [0, 0, 0, 0, 0, 0, 0],
                        borderColor: 'rgba(239, 68, 68, 1)',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        fill: true
                    },
                    {
                        label: 'Net Cash Flow',
                        data: [0, 0, 0, 0, 0, 0, 0],
                        borderColor: 'rgba(59, 130, 246, 1)',
                        backgroundColor: 'transparent',
                        borderWidth: 3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        ticks: {
                            callback: function(value) {
                                return '$' + (value / 1000).toFixed(0) + 'K';
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': $' + context.raw.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    }
    
    calculate() {
        const inputs = this.gatherInputs();
        const projections = this.calculateProjections(inputs);
        const costs = this.calculateCosts(inputs, projections);
        const benefits = this.calculateBenefits(inputs, projections);
        const roi = this.calculateROI(costs, benefits);
        
        this.updateUI(costs, benefits, roi, projections);
        this.updateCharts(costs, benefits, roi);
    }
    
    gatherInputs() {
        return {
            companySize: document.getElementById('companySize').value,
            industry: document.getElementById('industry').value,
            monthlyContent: parseInt(document.getElementById('monthlyContent').value),
            growthRate: parseInt(document.getElementById('growthRate').value) / 100,
            verificationCoverage: parseInt(document.getElementById('verificationCoverage').value) / 100,
            signingCoverage: parseInt(document.getElementById('signingCoverage').value) / 100,
            integrationComplexity: document.getElementById('integrationComplexity').value,
            trainingRequirements: document.getElementById('trainingRequirements').value,
            customDevelopment: document.getElementById('customDevelopment').checked,
            gdpr: document.getElementById('gdpr').checked,
            soc2: document.getElementById('soc2').checked,
            fips: document.getElementById('fips').checked
        };
    }
    
    calculateProjections(inputs) {
        const baseContent = inputs.monthlyContent;
        const growthRate = inputs.growthRate;
        
        return {
            year1: {
                monthly: baseContent,
                annual: baseContent * 12
            },
            year2: {
                monthly: Math.round(baseContent * (1 + growthRate)),
                annual: Math.round(baseContent * (1 + growthRate) * 12)
            },
            year3: {
                monthly: Math.round(baseContent * Math.pow(1 + growthRate, 2)),
                annual: Math.round(baseContent * Math.pow(1 + growthRate, 2) * 12)
            }
        };
    }
    
    calculateCosts(inputs, projections) {
        // Implementation costs
        const implementationCosts = {
            simple: 25000,
            moderate: 50000,
            complex: 75000
        };
        
        const trainingCosts = {
            basic: 5000,
            standard: 15000,
            comprehensive: 35000
        };
        
        const customDevCost = inputs.customDevelopment ? 100000 : 0;
        
        // Calculate subscription costs based on usage
        const year1Subscription = this.calculateSubscriptionCost(
            projections.year1.annual,
            inputs.verificationCoverage,
            inputs.signingCoverage
        );
        
        const year2Subscription = this.calculateSubscriptionCost(
            projections.year2.annual,
            inputs.verificationCoverage,
            inputs.signingCoverage
        );
        
        const year3Subscription = this.calculateSubscriptionCost(
            projections.year3.annual,
            inputs.verificationCoverage,
            inputs.signingCoverage
        );
        
        return {
            implementation: implementationCosts[inputs.integrationComplexity],
            training: trainingCosts[inputs.trainingRequirements],
            customDevelopment: customDevCost,
            subscription: {
                year1: year1Subscription,
                year2: year2Subscription,
                year3: year3Subscription
            },
            total: {
                year1: implementationCosts[inputs.integrationComplexity] + trainingCosts[inputs.trainingRequirements] + customDevCost + year1Subscription,
                year2: year2Subscription,
                year3: year3Subscription,
                threeYear: implementationCosts[inputs.integrationComplexity] + trainingCosts[inputs.trainingRequirements] + customDevCost + year1Subscription + year2Subscription + year3Subscription
            }
        };
    }
    
    calculateSubscriptionCost(annualContent, verificationCoverage, signingCoverage) {
        const annualVerifies = Math.round(annualContent * verificationCoverage);
        const annualSigns = Math.round(annualContent * signingCoverage);
        
        // Determine appropriate plan based on usage
        let monthlyCost;
        if (annualVerifies <= 24000 && annualSigns <= 2400) {
            // Starter plan
            const monthlyVerifies = Math.round(annualVerifies / 12);
            const monthlySigns = Math.round(annualSigns / 12);
            const overageVerifies = Math.max(0, monthlyVerifies - 2000) * 0.04;
            const overageSigns = Math.max(0, monthlySigns - 200) * 0.15;
            monthlyCost = 199 + overageVerifies + overageSigns;
        } else if (annualVerifies <= 180000 && annualSigns <= 12000) {
            // Growth plan
            const monthlyVerifies = Math.round(annualVerifies / 12);
            const monthlySigns = Math.round(annualSigns / 12);
            const overageVerifies = Math.max(0, monthlyVerifies - 15000) * 0.03;
            const overageSigns = Math.max(0, monthlySigns - 1000) * 0.12;
            monthlyCost = 699 + overageVerifies + overageSigns;
        } else {
            // Scale plan
            const monthlyVerifies = Math.round(annualVerifies / 12);
            const monthlySigns = Math.round(annualSigns / 12);
            const overageVerifies = Math.max(0, monthlyVerifies - 60000) * 0.02;
            const overageSigns = Math.max(0, monthlySigns - 5000) * 0.10;
            monthlyCost = 2000 + overageVerifies + overageSigns;
        }
        
        return Math.round(monthlyCost * 12);
    }
    
    calculateBenefits(inputs, projections) {
        // Compliance savings based on industry and requirements
        const complianceSavings = this.calculateComplianceSavings(inputs, projections);
        
        // Operational efficiency savings
        const operationalSavings = this.calculateOperationalSavings(projections);
        
        // Risk mitigation value
        const riskMitigationValue = this.calculateRiskMitigationValue(inputs);
        
        // Competitive advantage (harder to quantify but important)
        const competitiveAdvantage = this.calculateCompetitiveAdvantage(inputs);
        
        const totalBenefits = {
            year1: complianceSavings.year1 + operationalSavings.year1 + riskMitigationValue + competitiveAdvantage,
            year2: complianceSavings.year2 + operationalSavings.year2 + riskMitigationValue + competitiveAdvantage,
            year3: complianceSavings.year3 + operationalSavings.year3 + riskMitigationValue + competitiveAdvantage,
            threeYear: complianceSavings.threeYear + operationalSavings.threeYear + (riskMitigationValue + competitiveAdvantage) * 3
        };
        
        return {
            compliance: complianceSavings,
            operational: operationalSavings,
            riskMitigation: riskMitigationValue,
            competitiveAdvantage: competitiveAdvantage,
            total: totalBenefits
        };
    }
    
    calculateComplianceSavings(inputs, projections) {
        // Base compliance savings by industry
        const industryMultipliers = {
            media: 1.2,
            ecommerce: 1.0,
            enterprise: 0.8,
            government: 1.5,
            other: 0.6
        };
        
        const baseSavings = 100000; // $100K base annual compliance savings
        const multiplier = industryMultipliers[inputs.industry] || 0.6;
        
        // Additional savings for specific compliance requirements
        let complianceMultiplier = 1;
        if (inputs.gdpr) complianceMultiplier += 0.3;
        if (inputs.soc2) complianceMultiplier += 0.2;
        if (inputs.fips) complianceMultiplier += 0.1;
        
        const annualSavings = baseSavings * multiplier * complianceMultiplier;
        
        return {
            year1: Math.round(annualSavings * 0.7), // Year 1 is lower as implementation ramps up
            year2: Math.round(annualSavings),
            year3: Math.round(annualSavings * 1.1), // Year 3 is higher as processes mature
            threeYear: Math.round(annualSavings * 0.7 + annualSavings + annualSavings * 1.1)
        };
    }
    
    calculateOperationalSavings(projections) {
        // Savings from automated verification vs manual processes
        const manualCostPerVerify = 0.50; // $0.50 per manual verification
        const automatedCostPerVerify = 0.02; // $0.02 per automated verification
        const savingsPerVerify = manualCostPerVerify - automatedCostPerVerify;
        
        const year1Savings = projections.year1.annual * savingsPerVerify;
        const year2Savings = projections.year2.annual * savingsPerVerify;
        const year3Savings = projections.year3.annual * savingsPerVerify;
        
        return {
            year1: Math.round(year1Savings),
            year2: Math.round(year2Savings),
            year3: Math.round(year3Savings),
            threeYear: Math.round(year1Savings + year2Savings + year3Savings)
        };
    }
    
    calculateRiskMitigationValue(inputs) {
        // Value of avoiding compliance breaches, reputational damage, etc.
        const companySizeMultipliers = {
            small: 0.5,
            medium: 1.0,
            large: 2.0
        };
        
        const baseRiskValue = 75000; // $75K annual risk mitigation value
        return Math.round(baseRiskValue * (companySizeMultipliers[inputs.companySize] || 1.0));
    }
    
    calculateCompetitiveAdvantage(inputs) {
        // Value of being first to market with C2PA compliance
        const industryAdvantage = {
            media: 100000,
            ecommerce: 80000,
            enterprise: 60000,
            government: 40000,
            other: 30000
        };
        
        return industryAdvantage[inputs.industry] || 30000;
    }
    
    calculateROI(costs, benefits) {
        const totalCosts = costs.total.threeYear;
        const totalBenefits = benefits.total.threeYear;
        const netBenefits = totalBenefits - totalCosts;
        
        // Simple ROI calculation
        const roiPercentage = Math.round((netBenefits / totalCosts) * 100);
        
        // Payback period calculation (simplified)
        const monthlyBenefit = totalBenefits / 36;
        const paybackMonths = Math.ceil(totalCosts.total.year1 / monthlyBenefit);
        
        // NPV calculation (10% discount rate)
        const npv = this.calculateNPV(costs.total, benefits.total, 0.10);
        
        // IRR calculation (simplified)
        const irr = this.calculateIRR(costs.total, benefits.total);
        
        // Benefit-Cost Ratio
        const benefitCostRatio = (totalBenefits / totalCosts).toFixed(2);
        
        return {
            roiPercentage,
            paybackMonths,
            npv,
            irr,
            benefitCostRatio,
            netBenefits
        };
    }
    
    calculateNPV(costs, benefits, discountRate) {
        let npv = 0;
        const cashFlows = [
            benefits.total.year1 - costs.total.year1,
            benefits.total.year2 - costs.total.year2,
            benefits.total.year3 - costs.total.year3
        ];
        
        cashFlows.forEach((cashFlow, year) => {
            npv += cashFlow / Math.pow(1 + discountRate, year + 1);
        });
        
        return Math.round(npv);
    }
    
    calculateIRR(costs, benefits) {
        // Simplified IRR calculation using iteration
        let irr = 0;
        const maxIterations = 100;
        const tolerance = 0.0001;
        
        for (let i = 0; i < maxIterations; i++) {
            const npv = this.calculateNPV(costs, benefits, irr);
            
            if (Math.abs(npv) < tolerance) {
                break;
            }
            
            if (npv > 0) {
                irr += 0.01;
            } else {
                irr -= 0.01;
                break;
            }
        }
        
        return Math.round(irr * 100);
    }
    
    updateUI(costs, benefits, roi, projections) {
        // Update executive summary
        document.getElementById('monthlyTCO').textContent = '$' + Math.round(costs.total.year1 / 12).toLocaleString();
        document.getElementById('annualTCO').textContent = '$' + costs.total.year1.toLocaleString();
        document.getElementById('roiPercentage').textContent = roi.roiPercentage + '%';
        document.getElementById('paybackMonths').textContent = roi.paybackMonths;
        
        // Update cost breakdown table
        this.updateCostBreakdownTable(costs);
        
        // Update ROI analysis
        this.updateROIAnalysis(benefits, roi);
        
        // Update comparison
        this.updateComparison(costs);
        
        // Update cash flow
        this.updateCashFlow(costs, benefits);
    }
    
    createCostRow(row, label, year1, year2, year3, total, isTotal = false) {
        const labelCell = document.createElement('td');
        labelCell.className = isTotal ? 'px-6 py-4 whitespace-nowrap text-sm text-gray-900' : 'px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900';
        labelCell.textContent = label;
        row.appendChild(labelCell);
        
        const year1Cell = document.createElement('td');
        year1Cell.className = isTotal ? 'px-6 py-4 whitespace-nowrap text-sm text-gray-900' : 'px-6 py-4 whitespace-nowrap text-sm text-gray-500';
        year1Cell.textContent = '$' + year1.toLocaleString();
        row.appendChild(year1Cell);
        
        const year2Cell = document.createElement('td');
        year2Cell.className = isTotal ? 'px-6 py-4 whitespace-nowrap text-sm text-gray-900' : 'px-6 py-4 whitespace-nowrap text-sm text-gray-500';
        year2Cell.textContent = '$' + year2.toLocaleString();
        row.appendChild(year2Cell);
        
        const year3Cell = document.createElement('td');
        year3Cell.className = isTotal ? 'px-6 py-4 whitespace-nowrap text-sm text-gray-900' : 'px-6 py-4 whitespace-nowrap text-sm text-gray-500';
        year3Cell.textContent = '$' + year3.toLocaleString();
        row.appendChild(year3Cell);
        
        const totalCell = document.createElement('td');
        totalCell.className = isTotal ? 'px-6 py-4 whitespace-nowrap text-sm text-gray-900' : 'px-6 py-4 whitespace-nowrap text-sm text-gray-500';
        totalCell.textContent = '$' + total.toLocaleString();
        row.appendChild(totalCell);
    }
    
    updateCostBreakdownTable(costs) {
        const tbody = document.getElementById('costBreakdownTable');
        tbody.innerHTML = '';
        
        // Implementation row
        const implRow = document.createElement('tr');
        this.createCostRow(implRow, 'Implementation', costs.implementation, 0, 0, costs.implementation);
        tbody.appendChild(implRow);
        
        // Training row
        const trainingRow = document.createElement('tr');
        this.createCostRow(trainingRow, 'Training', costs.training, 0, 0, costs.training);
        tbody.appendChild(trainingRow);
        
        // Custom Development row
        const devRow = document.createElement('tr');
        this.createCostRow(devRow, 'Custom Development', costs.customDevelopment, 0, 0, costs.customDevelopment);
        tbody.appendChild(devRow);
        
        // Subscription row
        const subRow = document.createElement('tr');
        this.createCostRow(subRow, 'Subscription', costs.subscription.year1, costs.subscription.year2, costs.subscription.year3, 
            costs.subscription.year1 + costs.subscription.year2 + costs.subscription.year3);
        tbody.appendChild(subRow);
        
        // Total row
        const totalRow = document.createElement('tr');
        totalRow.className = 'bg-gray-50 font-semibold';
        this.createCostRow(totalRow, 'Total', costs.total.year1, costs.total.year2, costs.total.year3, costs.total.threeYear, true);
        tbody.appendChild(totalRow);
    }
    
    updateROIAnalysis(benefits, roi) {
        document.getElementById('complianceSavings').textContent = '$' + benefits.compliance.threeYear.toLocaleString();
        document.getElementById('operationalSavings').textContent = '$' + benefits.operational.threeYear.toLocaleString();
        document.getElementById('riskMitigationValue').textContent = '$' + (benefits.riskMitigation * 3).toLocaleString();
        document.getElementById('competitiveAdvantage').textContent = '$' + (benefits.competitiveAdvantage * 3).toLocaleString();
        document.getElementById('totalBenefits').textContent = '$' + benefits.total.threeYear.toLocaleString();
        
        document.getElementById('npv').textContent = '$' + roi.npv.toLocaleString();
        document.getElementById('irr').textContent = roi.irr + '%';
        document.getElementById('benefitCostRatio').textContent = roi.benefitCostRatio;
        document.getElementById('paybackPeriod').textContent = roi.paybackMonths + ' months';
    }
    
    updateComparison(costs) {
        document.getElementById('c2AnnualCost').textContent = '$' + costs.subscription.year1.toLocaleString();
        document.getElementById('c2ThreeYearTotal').textContent = '$' + costs.total.threeYear.toLocaleString();
        
        // Competitor pricing (typically 30% higher)
        const competitorAnnual = Math.round(costs.subscription.year1 * 1.3);
        const competitorThreeYear = Math.round(costs.total.threeYear * 1.3);
        
        document.getElementById('competitorAnnualCost').textContent = '$' + competitorAnnual.toLocaleString();
        document.getElementById('competitorThreeYearTotal').textContent = '$' + competitorThreeYear.toLocaleString();
    }
    
    updateCashFlow(costs, benefits) {
        const year1CashFlow = benefits.total.year1 - costs.total.year1;
        const year2CashFlow = benefits.total.year2 - costs.total.year2;
        const year3CashFlow = benefits.total.year3 - costs.total.year3;
        const cumulativeCashFlow = year1CashFlow + year2CashFlow + year3CashFlow;
        
        document.getElementById('year1CashFlow').textContent = '$' + year1CashFlow.toLocaleString();
        document.getElementById('year2CashFlow').textContent = '$' + year2CashFlow.toLocaleString();
        document.getElementById('year3CashFlow').textContent = '$' + year3CashFlow.toLocaleString();
        document.getElementById('cumulativeCashFlow').textContent = '$' + cumulativeCashFlow.toLocaleString();
    }
    
    updateCharts(costs, benefits, roi) {
        // Update cost breakdown chart
        this.costBreakdownChart.data.datasets[0].data = [
            costs.subscription.year1,
            costs.subscription.year2,
            costs.subscription.year3
        ];
        this.costBreakdownChart.data.datasets[1].data = [
            costs.implementation,
            0,
            0
        ];
        this.costBreakdownChart.data.datasets[2].data = [
            costs.training,
            0,
            0
        ];
        this.costBreakdownChart.data.datasets[3].data = [
            costs.customDevelopment,
            0,
            0
        ];
        this.costBreakdownChart.update();
        
        // Update cash flow chart
        const months = [0, 6, 12, 18, 24, 30, 36];
        const cumulativeBenefits = months.map(month => {
            const year = Math.floor(month / 12);
            const monthInYear = month % 12;
            let total = 0;
            
            for (let i = 0; i <= year; i++) {
                if (i === year) {
                    total += (benefits.total['year' + (i + 1)] / 12) * monthInYear;
                } else {
                    total += benefits.total['year' + (i + 1)];
                }
            }
            
            return total;
        });
        
        const cumulativeCosts = months.map(month => {
            const year = Math.floor(month / 12);
            const monthInYear = month % 12;
            let total = 0;
            
            if (year === 0) {
                total = costs.implementation + costs.training + costs.customDevelopment;
            }
            
            for (let i = 0; i <= year; i++) {
                if (i === year) {
                    total += (costs.subscription['year' + (i + 1)] / 12) * monthInYear;
                } else {
                    total += costs.subscription['year' + (i + 1)];
                }
            }
            
            return total;
        });
        
        const netCashFlow = cumulativeBenefits.map((benefit, index) => benefit - cumulativeCosts[index]);
        
        this.cashFlowChart.data.datasets[0].data = cumulativeBenefits;
        this.cashFlowChart.data.datasets[1].data = cumulativeCosts;
        this.cashFlowChart.data.datasets[2].data = netCashFlow;
        this.cashFlowChart.update();
    }
}

// Initialize estimator when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new EnterpriseCostEstimator();
});
```

---

## Advanced Features

### PDF Export Functionality

```javascript
// PDF export using jsPDF
function exportToPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(20);
    doc.text('C2 Concierge Cost Analysis', 20, 20);
    
    // Add executive summary
    doc.setFontSize(12);
    doc.text('Executive Summary', 20, 40);
    doc.setFontSize(10);
    doc.text(`Monthly TCO: ${document.getElementById('monthlyTCO').textContent}`, 20, 50);
    doc.text(`Annual TCO: ${document.getElementById('annualTCO').textContent}`, 20, 60);
    doc.text(`3-Year ROI: ${document.getElementById('roiPercentage').textContent}`, 20, 70);
    doc.text(`Payback Period: ${document.getElementById('paybackMonths').textContent} months`, 20, 80);
    
    // Add detailed breakdown
    // ... more PDF generation code
    
    doc.save('c2-concierge-cost-analysis.pdf');
}
```

### Scenario Comparison

```javascript
class ScenarioComparison {
    constructor() {
        this.scenarios = new Map();
        this.currentScenario = 'base';
    }
    
    saveScenario(name, inputs) {
        this.scenarios.set(name, {
            inputs: inputs,
            timestamp: new Date().toISOString()
        });
    }
    
    compareScenarios(scenario1, scenario2) {
        const data1 = this.scenarios.get(scenario1);
        const data2 = this.scenarios.get(scenario2);
        
        // Generate comparison table
        return this.generateComparison(data1, data2);
    }
    
    generateComparison(data1, data2) {
        // Implementation for side-by-side comparison
    }
}
```

---

*Last Updated: November 5, 2025*  
**Target Users**: Enterprise finance and procurement teams  
**Integration**: Salesforce for lead generation  
**Analytics**: Detailed user behavior tracking for optimization
