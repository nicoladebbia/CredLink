# ROI Calculator

**Advanced Return on Investment Analysis Tool**

**Version**: 1.0.0  
**Launch Date**: November 5, 2025  
**Target**: C-level executives and decision makers

---

## ROI Calculator Overview

### Strategic Value Proposition

The ROI Calculator translates C2PA implementation costs into quantifiable business value, helping executives justify investments through:

- **Hard ROI Metrics** - Direct financial returns and cost savings
- **Soft ROI Benefits** - Risk mitigation, brand value, competitive positioning
- **Industry Benchmarks** - Comparison with peer organizations
- **Scenario Modeling** - Best/worst case projections
- **Investment Thesis** - Compelling business case documentation

### Executive Decision Support

1. **CFOs** - Financial justification and budget planning
2. **CEOs** - Strategic value and competitive advantage
3. **CIOs/CTOs** - Technology investment optimization
4. **CMOs** - Brand protection and customer trust metrics
5. **CROs** - Revenue impact and market positioning

---

## ROI Calculator Implementation

### HTML Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>C2 Concierge - Executive ROI Calculator</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
</head>
<body class="bg-gradient-to-br from-slate-900 to-slate-800 text-white">
    <!-- Executive Header -->
    <header class="bg-slate-900/50 backdrop-blur-sm border-b border-slate-700">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center py-6">
                <div class="flex items-center">
                    <img src="/logo-white.svg" alt="C2 Concierge" class="h-12 w-auto">
                    <div class="ml-4">
                        <h1 class="text-3xl font-bold">Executive ROI Calculator</h1>
                        <p class="text-slate-400">Strategic Investment Analysis for C2PA Implementation</p>
                    </div>
                </div>
                <div class="flex items-center space-x-4">
                    <button id="saveScenario" class="bg-slate-700 text-white px-4 py-2 rounded-md hover:bg-slate-600 transition-colors">
                        <i class="fas fa-save mr-2"></i>
                        Save Scenario
                    </button>
                    <button id="generateReport" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors">
                        <i class="fas fa-file-download mr-2"></i>
                        Generate Report
                    </button>
                    <button id="scheduleConsultation" class="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors">
                        <i class="fas fa-calendar mr-2"></i>
                        Schedule Consultation
                    </button>
                </div>
            </div>
        </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <!-- Key Metrics Dashboard -->
        <div class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-2xl p-8 mb-8 border border-slate-700">
            <div class="grid grid-cols-1 md:grid-cols-5 gap-6">
                <div class="text-center">
                    <div class="text-5xl font-bold text-green-400" id="totalROI">0%</div>
                    <div class="text-slate-400 mt-2">3-Year Total ROI</div>
                    <div class="text-xs text-slate-500 mt-1">Net Benefits / Investment</div>
                </div>
                <div class="text-center">
                    <div class="text-5xl font-bold text-blue-400" id="netPresentValue">$0</div>
                    <div class="text-slate-400 mt-2">Net Present Value</div>
                    <div class="text-xs text-slate-500 mt-1">10% discount rate</div>
                </div>
                <div class="text-center">
                    <div class="text-5xl font-bold text-purple-400" id="paybackPeriod">0</div>
                    <div class="text-slate-400 mt-2">Payback Period</div>
                    <div class="text-xs text-slate-500 mt-1">Months to break-even</div>
                </div>
                <div class="text-center">
                    <div class="text-5xl font-bold text-orange-400" id="irr">0%</div>
                    <div class="text-slate-400 mt-2">Internal Rate of Return</div>
                    <div class="text-xs text-slate-500 mt-1">Annualized return</div>
                </div>
                <div class="text-center">
                    <div class="text-5xl font-bold text-cyan-400" id="benefitCostRatio">0.0</div>
                    <div class="text-slate-400 mt-2">Benefit-Cost Ratio</div>
                    <div class="text-xs text-slate-500 mt-1">Value created per $ invested</div>
                </div>
            </div>
        </div>

        <!-- Input Configuration -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- Configuration Panel -->
            <div class="lg:col-span-1">
                <!-- Company Profile -->
                <div class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-xl p-6 mb-6 border border-slate-700">
                    <h3 class="text-xl font-semibold text-white mb-4">
                        <i class="fas fa-building mr-2 text-blue-400"></i>
                        Company Profile
                    </h3>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-slate-300 mb-1">
                                Annual Revenue
                            </label>
                            <select id="annualRevenue" class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="small"><$10M</option>
                                <option value="medium">$10M - $100M</option>
                                <option value="large" selected>$100M - $1B</option>
                                <option value="enterprise">>$1B</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-slate-300 mb-1">
                                Industry Sector
                            </label>
                            <select id="industrySector" class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="media">Media & Publishing</option>
                                <option value="ecommerce">E-commerce & Retail</option>
                                <option value="finance">Financial Services</option>
                                <option value="healthcare">Healthcare</option>
                                <option value="government">Government & Public Sector</option>
                                <option value="enterprise">Enterprise Software</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-slate-300 mb-1">
                                Geographic Scope
                            </label>
                            <select id="geographicScope" class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="regional">Regional</option>
                                <option value="national" selected>National</option>
                                <option value="international">International</option>
                                <option value="global">Global</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-slate-300 mb-1">
                                Regulatory Environment
                            </label>
                            <div class="space-y-2">
                                <label class="flex items-center text-slate-300">
                                    <input type="checkbox" id="gdprCompliance" class="mr-2" checked>
                                    <span class="text-sm">GDPR Compliance Required</span>
                                </label>
                                <label class="flex items-center text-slate-300">
                                    <input type="checkbox" id="ccpaCompliance" class="mr-2" checked>
                                    <span class="text-sm">CCPA/CPRA Compliance</span>
                                </label>
                                <label class="flex items-center text-slate-300">
                                    <input type="checkbox" id="sectorSpecific" class="mr-2">
                                    <span class="text-sm">Sector-Specific Regulations</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Current State Analysis -->
                <div class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-xl p-6 mb-6 border border-slate-700">
                    <h3 class="text-xl font-semibold text-white mb-4">
                        <i class="fas fa-chart-line mr-2 text-green-400"></i>
                        Current State Analysis
                    </h3>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-slate-300 mb-1">
                                Monthly Content Volume
                            </label>
                            <input type="number" id="monthlyContentVolume" value="10000" min="1000" max="1000000" 
                                   class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <div class="text-xs text-slate-500 mt-1">Digital assets created monthly</div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-slate-300 mb-1">
                                Current Verification Process
                            </label>
                            <select id="currentVerification" class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="none">No verification process</option>
                                <option value="manual">Manual verification only</option>
                                <option value="partial">Partial automated verification</option>
                                <option value="basic">Basic in-house tools</option>
                                <option value="competitor">Using competitor solution</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-slate-300 mb-1">
                                Annual Content Security Incidents
                            </label>
                            <input type="number" id="securityIncidents" value="5" min="0" max="100" 
                                   class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <div class="text-xs text-slate-500 mt-1">Deepfakes, unauthorized use, etc.</div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-slate-300 mb-1">
                                Current Compliance Costs
                            </label>
                            <input type="number" id="currentComplianceCosts" value="250000" min="0" max="10000000" step="10000"
                                   class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <div class="text-xs text-slate-500 mt-1">Annual spending on compliance</div>
                        </div>
                    </div>
                </div>

                <!-- Investment Parameters -->
                <div class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-xl p-6 border border-slate-700">
                    <h3 class="text-xl font-semibold text-white mb-4">
                        <i class="fas fa-coins mr-2 text-yellow-400"></i>
                        Investment Parameters
                    </h3>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-slate-300 mb-1">
                                Implementation Timeline
                            </label>
                            <select id="implementationTimeline" class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="rapid">Rapid (3 months)</option>
                                <option value="standard" selected>Standard (6 months)</option>
                                <option value="comprehensive">Comprehensive (12 months)</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-slate-300 mb-1">
                                Integration Scope
                            </label>
                            <select id="integrationScope" class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="basic">Basic API integration</option>
                                <option value="standard" selected>Standard workflow integration</option>
                                <option value="comprehensive">Comprehensive enterprise integration</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-slate-300 mb-1">
                                Training & Change Management
                            </label>
                            <select id="trainingScope" class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="minimal">Minimal (self-service)</option>
                                <option value="standard" selected>Standard (team training)</option>
                                <option value="comprehensive">Comprehensive (organization-wide)</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-slate-300 mb-1">
                                Expected Growth Rate
                            </label>
                            <input type="range" id="expectedGrowthRate" min="0" max="100" value="20" 
                                   class="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer">
                            <div class="flex justify-between text-xs text-slate-500 mt-1">
                                <span>0%</span>
                                <span id="growthRateValue" class="font-semibold text-blue-400">20%</span>
                                <span>100%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Results Panel -->
            <div class="lg:col-span-2">
                <!-- ROI Analysis -->
                <div class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-xl p-6 mb-6 border border-slate-700">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-xl font-semibold text-white">
                            <i class="fas fa-chart-pie mr-2 text-purple-400"></i>
                            Comprehensive ROI Analysis
                        </h3>
                        <div class="flex space-x-2">
                            <button class="text-blue-400 hover:text-blue-300 text-sm">
                                <i class="fas fa-sync-alt mr-1"></i>
                                Recalculate
                            </button>
                            <button class="text-green-400 hover:text-green-300 text-sm">
                                <i class="fas fa-download mr-1"></i>
                                Export Data
                            </button>
                        </div>
                    </div>
                    
                    <!-- ROI Components Chart -->
                    <div class="mb-6">
                        <canvas id="roiComponentsChart" width="400" height="250"></canvas>
                    </div>
                    
                    <!-- Detailed ROI Breakdown -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- Hard Benefits -->
                        <div>
                            <h4 class="font-semibold text-green-400 mb-3 flex items-center">
                                <i class="fas fa-dollar-sign mr-2"></i>
                                Hard Benefits (Quantifiable)
                            </h4>
                            <div class="space-y-2">
                                <div class="flex justify-between text-sm">
                                    <span class="text-slate-300">Compliance Cost Reduction:</span>
                                    <span class="font-semibold text-green-400" id="complianceReduction">$0</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span class="text-slate-300">Operational Efficiency:</span>
                                    <span class="font-semibold text-green-400" id="operationalEfficiency">$0</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span class="text-slate-300">Content Security Savings:</span>
                                    <span class="font-semibold text-green-400" id="securitySavings">$0</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span class="text-slate-300">Legal Risk Reduction:</span>
                                    <span class="font-semibold text-green-400" id="legalRiskReduction">$0</span>
                                </div>
                                <div class="flex justify-between text-sm font-semibold pt-2 border-t border-slate-600">
                                    <span class="text-green-400">Total Hard Benefits:</span>
                                    <span class="text-green-400" id="totalHardBenefits">$0</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Soft Benefits -->
                        <div>
                            <h4 class="font-semibold text-blue-400 mb-3 flex items-center">
                                <i class="fas fa-chart-line mr-2"></i>
                                Soft Benefits (Strategic Value)
                            </h4>
                            <div class="space-y-2">
                                <div class="flex justify-between text-sm">
                                    <span class="text-slate-300">Brand Trust Enhancement:</span>
                                    <span class="font-semibold text-blue-400" id="brandTrustValue">$0</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span class="text-slate-300">Competitive Advantage:</span>
                                    <span class="font-semibold text-blue-400" id="competitiveAdvantageValue">$0</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span class="text-slate-300">Customer Confidence:</span>
                                    <span class="font-semibold text-blue-400" id="customerConfidenceValue">$0</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span class="text-slate-300">Market Leadership:</span>
                                    <span class="font-semibold text-blue-400" id="marketLeadershipValue">$0</span>
                                </div>
                                <div class="flex justify-between text-sm font-semibold pt-2 border-t border-slate-600">
                                    <span class="text-blue-400">Total Soft Benefits:</span>
                                    <span class="text-blue-400" id="totalSoftBenefits">$0</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Investment Breakdown -->
                <div class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-xl p-6 mb-6 border border-slate-700">
                    <h3 class="text-xl font-semibold text-white mb-4">
                        <i class="fas fa-wallet mr-2 text-orange-400"></i>
                        Investment Breakdown
                    </h3>
                    
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div class="text-center p-4 bg-slate-700/50 rounded-lg">
                            <div class="text-3xl font-bold text-orange-400" id="totalInvestment">$0</div>
                            <div class="text-slate-400 text-sm mt-1">Total Investment</div>
                        </div>
                        <div class="text-center p-4 bg-slate-700/50 rounded-lg">
                            <div class="text-3xl font-bold text-yellow-400" id="annualizedCost">$0</div>
                            <div class="text-slate-400 text-sm mt-1">Annualized Cost</div>
                        </div>
                        <div class="text-center p-4 bg-slate-700/50 rounded-lg">
                            <div class="text-3xl font-bold text-red-400" id="monthlyCashFlow">$0</div>
                            <div class="text-slate-400 text-sm mt-1">Monthly Cash Flow</div>
                        </div>
                    </div>
                    
                    <!-- Investment Timeline Chart -->
                    <div class="mb-6">
                        <canvas id="investmentTimelineChart" width="400" height="200"></canvas>
                    </div>
                    
                    <!-- Detailed Investment Table -->
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-slate-700">
                            <thead class="bg-slate-700/50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                                        Investment Category
                                    </th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                                        Year 1
                                    </th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                                        Year 2
                                    </th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                                        Year 3
                                    </th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                                        Total
                                    </th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-700" id="investmentTable">
                                <!-- Populated by JavaScript -->
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Scenario Analysis -->
                <div class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-xl p-6 mb-6 border border-slate-700">
                    <h3 class="text-xl font-semibold text-white mb-4">
                        <i class="fas fa-analytics mr-2 text-cyan-400"></i>
                        Scenario Analysis
                    </h3>
                    
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <!-- Conservative Scenario -->
                        <div class="p-4 bg-slate-700/50 rounded-lg border border-slate-600">
                            <h4 class="font-semibold text-slate-300 mb-2">Conservative</h4>
                            <div class="space-y-2 text-sm">
                                <div class="flex justify-between">
                                    <span class="text-slate-400">ROI:</span>
                                    <span class="font-semibold text-yellow-400" id="conservativeROI">0%</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-slate-400">Payback:</span>
                                    <span class="font-semibold text-yellow-400" id="conservativePayback">0 mo</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-slate-400">NPV:</span>
                                    <span class="font-semibold text-yellow-400" id="conservativeNPV">$0</span>
                                </div>
                            </div>
                            <div class="mt-3 pt-3 border-t border-slate-600">
                                <div class="text-xs text-slate-500">
                                    Lower adoption, slower growth
                                </div>
                            </div>
                        </div>
                        
                        <!-- Base Case Scenario -->
                        <div class="p-4 bg-slate-700/50 rounded-lg border-2 border-blue-500">
                            <h4 class="font-semibold text-blue-400 mb-2">Base Case</h4>
                            <div class="space-y-2 text-sm">
                                <div class="flex justify-between">
                                    <span class="text-slate-400">ROI:</span>
                                    <span class="font-semibold text-blue-400" id="baseROI">0%</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-slate-400">Payback:</span>
                                    <span class="font-semibold text-blue-400" id="basePayback">0 mo</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-slate-400">NPV:</span>
                                    <span class="font-semibold text-blue-400" id="baseNPV">$0</span>
                                </div>
                            </div>
                            <div class="mt-3 pt-3 border-t border-slate-600">
                                <div class="text-xs text-blue-400">
                                    Expected performance
                                </div>
                            </div>
                        </div>
                        
                        <!-- Optimistic Scenario -->
                        <div class="p-4 bg-slate-700/50 rounded-lg border border-slate-600">
                            <h4 class="font-semibold text-slate-300 mb-2">Optimistic</h4>
                            <div class="space-y-2 text-sm">
                                <div class="flex justify-between">
                                    <span class="text-slate-400">ROI:</span>
                                    <span class="font-semibold text-green-400" id="optimisticROI">0%</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-slate-400">Payback:</span>
                                    <span class="font-semibold text-green-400" id="optimisticPayback">0 mo</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-slate-400">NPV:</span>
                                    <span class="font-semibold text-green-400" id="optimisticNPV">$0</span>
                                </div>
                            </div>
                            <div class="mt-3 pt-3 border-t border-slate-600">
                                <div class="text-xs text-slate-500">
                                    High adoption, market leadership
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Risk Assessment -->
                <div class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-xl p-6 border border-slate-700">
                    <h3 class="text-xl font-semibold text-white mb-4">
                        <i class="fas fa-shield-alt mr-2 text-red-400"></i>
                        Risk Assessment & Mitigation
                    </h3>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- Risk Matrix -->
                        <div>
                            <h4 class="font-semibold text-slate-300 mb-3">Risk Matrix</h4>
                            <div class="space-y-2">
                                <div class="flex items-center justify-between p-2 bg-slate-700/50 rounded">
                                    <span class="text-sm text-slate-300">Technology Risk</span>
                                    <span class="text-xs bg-yellow-500 text-slate-900 px-2 py-1 rounded">Medium</span>
                                </div>
                                <div class="flex items-center justify-between p-2 bg-slate-700/50 rounded">
                                    <span class="text-sm text-slate-300">Adoption Risk</span>
                                    <span class="text-xs bg-yellow-500 text-slate-900 px-2 py-1 rounded">Medium</span>
                                </div>
                                <div class="flex items-center justify-between p-2 bg-slate-700/50 rounded">
                                    <span class="text-sm text-slate-300">Regulatory Risk</span>
                                    <span class="text-xs bg-green-500 text-slate-900 px-2 py-1 rounded">Low</span>
                                </div>
                                <div class="flex items-center justify-between p-2 bg-slate-700/50 rounded">
                                    <span class="text-sm text-slate-300">Competitive Risk</span>
                                    <span class="text-xs bg-red-500 text-slate-900 px-2 py-1 rounded">High</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Mitigation Strategies -->
                        <div>
                            <h4 class="font-semibold text-slate-300 mb-3">Mitigation Strategies</h4>
                            <div class="space-y-2 text-sm text-slate-400">
                                <div class="flex items-start">
                                    <i class="fas fa-check-circle text-green-400 mr-2 mt-0.5"></i>
                                    <span>Phased rollout with pilot program</span>
                                </div>
                                <div class="flex items-start">
                                    <i class="fas fa-check-circle text-green-400 mr-2 mt-0.5"></i>
                                    <span>Comprehensive training and change management</span>
                                </div>
                                <div class="flex items-start">
                                    <i class="fas fa-check-circle text-green-400 mr-2 mt-0.5"></i>
                                    <span>Regular compliance audits and updates</span>
                                </div>
                                <div class="flex items-start">
                                    <i class="fas fa-check-circle text-green-400 mr-2 mt-0.5"></i>
                                    <span>Continuous innovation and feature updates</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </main>

    <script src="roi-calculator.js"></script>
</body>
</html>
```

### JavaScript Implementation

```javascript
// roi-calculator.js
class ExecutiveROICalculator {
    constructor() {
        this.initializeEventListeners();
        this.initializeCharts();
        this.calculate();
    }
    
    initializeEventListeners() {
        // Range inputs
        document.getElementById('expectedGrowthRate').addEventListener('input', (e) => {
            document.getElementById('growthRateValue').textContent = e.target.value + '%';
            this.calculate();
        });
        
        // All select inputs
        const selects = [
            'annualRevenue', 'industrySector', 'geographicScope',
            'currentVerification', 'implementationTimeline',
            'integrationScope', 'trainingScope'
        ];
        selects.forEach(id => {
            document.getElementById(id).addEventListener('change', () => this.calculate());
        });
        
        // Number inputs
        const numberInputs = [
            'monthlyContentVolume', 'securityIncidents', 'currentComplianceCosts'
        ];
        numberInputs.forEach(id => {
            document.getElementById(id).addEventListener('input', () => this.calculate());
        });
        
        // Checkboxes
        const checkboxes = ['gdprCompliance', 'ccpaCompliance', 'sectorSpecific'];
        checkboxes.forEach(id => {
            document.getElementById(id).addEventListener('change', () => this.calculate());
        });
        
        // Action buttons
        document.getElementById('saveScenario').addEventListener('click', () => this.saveScenario());
        document.getElementById('generateReport').addEventListener('click', () => this.generateReport());
        document.getElementById('scheduleConsultation').addEventListener('click', () => this.scheduleConsultation());
    }
    
    initializeCharts() {
        // ROI Components Chart
        const roiCtx = document.getElementById('roiComponentsChart').getContext('2d');
        this.roiComponentsChart = new Chart(roiCtx, {
            type: 'doughnut',
            data: {
                labels: [
                    'Compliance Savings',
                    'Operational Efficiency', 
                    'Security Savings',
                    'Legal Risk Reduction',
                    'Brand Trust',
                    'Competitive Advantage',
                    'Customer Confidence',
                    'Market Leadership'
                ],
                datasets: [{
                    data: [0, 0, 0, 0, 0, 0, 0, 0],
                    backgroundColor: [
                        'rgba(34, 197, 94, 0.8)',
                        'rgba(34, 197, 94, 0.8)',
                        'rgba(34, 197, 94, 0.8)',
                        'rgba(34, 197, 94, 0.8)',
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(59, 130, 246, 0.8)'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: 'rgba(203, 213, 225, 1)',
                            font: {
                                size: 11
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = '$' + context.raw.toLocaleString();
                                const percentage = Math.round((context.raw / context.dataset.data.reduce((a, b) => a + b, 0)) * 100);
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
        
        // Investment Timeline Chart
        const timelineCtx = document.getElementById('investmentTimelineChart').getContext('2d');
        this.investmentTimelineChart = new Chart(timelineCtx, {
            type: 'line',
            data: {
                labels: ['Month 0', 'Month 3', 'Month 6', 'Month 12', 'Month 18', 'Month 24', 'Month 30', 'Month 36'],
                datasets: [
                    {
                        label: 'Cumulative Investment',
                        data: [0, 0, 0, 0, 0, 0, 0, 0],
                        borderColor: 'rgba(239, 68, 68, 1)',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        fill: true
                    },
                    {
                        label: 'Cumulative Benefits',
                        data: [0, 0, 0, 0, 0, 0, 0, 0],
                        borderColor: 'rgba(34, 197, 94, 1)',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        fill: true
                    },
                    {
                        label: 'Net Position',
                        data: [0, 0, 0, 0, 0, 0, 0, 0],
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
                            color: 'rgba(203, 213, 225, 1)',
                            callback: function(value) {
                                return '$' + (value / 1000).toFixed(0) + 'K';
                            }
                        },
                        grid: {
                            color: 'rgba(71, 85, 105, 0.3)'
                        }
                    },
                    x: {
                        ticks: {
                            color: 'rgba(203, 213, 225, 1)'
                        },
                        grid: {
                            color: 'rgba(71, 85, 105, 0.3)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: 'rgba(203, 213, 225, 1)'
                        }
                    },
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
        const investment = this.calculateInvestment(inputs);
        const benefits = this.calculateBenefits(inputs);
        const roi = this.calculateROI(investment, benefits);
        const scenarios = this.calculateScenarios(inputs, investment, benefits);
        
        this.updateUI(investment, benefits, roi, scenarios);
        this.updateCharts(investment, benefits, roi);
    }
    
    gatherInputs() {
        return {
            annualRevenue: document.getElementById('annualRevenue').value,
            industrySector: document.getElementById('industrySector').value,
            geographicScope: document.getElementById('geographicScope').value,
            gdprCompliance: document.getElementById('gdprCompliance').checked,
            ccpaCompliance: document.getElementById('ccpaCompliance').checked,
            sectorSpecific: document.getElementById('sectorSpecific').checked,
            monthlyContentVolume: parseInt(document.getElementById('monthlyContentVolume').value),
            currentVerification: document.getElementById('currentVerification').value,
            securityIncidents: parseInt(document.getElementById('securityIncidents').value),
            currentComplianceCosts: parseInt(document.getElementById('currentComplianceCosts').value),
            implementationTimeline: document.getElementById('implementationTimeline').value,
            integrationScope: document.getElementById('integrationScope').value,
            trainingScope: document.getElementById('trainingScope').value,
            expectedGrowthRate: parseInt(document.getElementById('expectedGrowthRate').value) / 100
        };
    }
    
    calculateInvestment(inputs) {
        // Implementation costs based on timeline and scope
        const implementationCosts = {
            rapid: { basic: 50000, standard: 75000, comprehensive: 100000 },
            standard: { basic: 75000, standard: 125000, comprehensive: 175000 },
            comprehensive: { basic: 100000, standard: 175000, comprehensive: 250000 }
        };
        
        const trainingCosts = {
            minimal: 10000,
            standard: 25000,
            comprehensive: 50000
        };
        
        const integrationCosts = {
            basic: 25000,
            standard: 50000,
            comprehensive: 100000
        };
        
        const implementationCost = implementationCosts[inputs.implementationTimeline][inputs.integrationScope];
        const trainingCost = trainingCosts[inputs.trainingScope];
        const integrationCost = integrationCosts[inputs.integrationScope];
        
        // Annual subscription costs
        const annualSubscription = this.calculateAnnualSubscription(inputs);
        
        return {
            implementation: implementationCost,
            training: trainingCost,
            integration: integrationCost,
            subscription: {
                year1: annualSubscription,
                year2: Math.round(annualSubscription * 1.1), // 10% growth
                year3: Math.round(annualSubscription * 1.21) // 21% total growth
            },
            total: {
                year1: implementationCost + trainingCost + integrationCost + annualSubscription,
                year2: Math.round(annualSubscription * 1.1),
                year3: Math.round(annualSubscription * 1.21),
                threeYear: implementationCost + trainingCost + integrationCost + annualSubscription + Math.round(annualSubscription * 1.1) + Math.round(annualSubscription * 1.21)
            }
        };
    }
    
    calculateAnnualSubscription(inputs) {
        const monthlyVerifies = inputs.monthlyContentVolume;
        const monthlySigns = Math.round(inputs.monthlyContentVolume * 0.3); // 30% signing rate
        
        // Determine appropriate plan
        if (monthlyVerifies <= 2000 && monthlySigns <= 200) {
            return 199 * 12; // Starter
        } else if (monthlyVerifies <= 15000 && monthlySigns <= 1000) {
            return 699 * 12; // Growth
        } else {
            return 2000 * 12; // Scale
        }
    }
    
    calculateBenefits(inputs) {
        // Hard benefits
        const complianceReduction = this.calculateComplianceReduction(inputs);
        const operationalEfficiency = this.calculateOperationalEfficiency(inputs);
        const securitySavings = this.calculateSecuritySavings(inputs);
        const legalRiskReduction = this.calculateLegalRiskReduction(inputs);
        
        // Soft benefits
        const brandTrustValue = this.calculateBrandTrustValue(inputs);
        const competitiveAdvantageValue = this.calculateCompetitiveAdvantageValue(inputs);
        const customerConfidenceValue = this.calculateCustomerConfidenceValue(inputs);
        const marketLeadershipValue = this.calculateMarketLeadershipValue(inputs);
        
        const hardBenefits = {
            compliance: complianceReduction,
            operational: operationalEfficiency,
            security: securitySavings,
            legal: legalRiskReduction,
            total: complianceReduction + operationalEfficiency + securitySavings + legalRiskReduction
        };
        
        const softBenefits = {
            brand: brandTrustValue,
            competitive: competitiveAdvantageValue,
            customer: customerConfidenceValue,
            leadership: marketLeadershipValue,
            total: brandTrustValue + competitiveAdvantageValue + customerConfidenceValue + marketLeadershipValue
        };
        
        return {
            hard: hardBenefits,
            soft: softBenefits,
            total: {
                year1: Math.round(hardBenefits.total * 0.7 + softBenefits.total),
                year2: Math.round(hardBenefits.total * 0.85 + softBenefits.total),
                year3: Math.round(hardBenefits.total + softBenefits.total),
                threeYear: Math.round((hardBenefits.total * 0.7 + softBenefits.total) + (hardBenefits.total * 0.85 + softBenefits.total) + (hardBenefits.total + softBenefits.total))
            }
        };
    }
    
    calculateComplianceReduction(inputs) {
        const baseReduction = inputs.currentComplianceCosts * 0.4; // 40% reduction
        const complianceMultiplier = (inputs.gdprCompliance ? 1.2 : 1) * 
                                     (inputs.ccpaCompliance ? 1.1 : 1) * 
                                     (inputs.sectorSpecific ? 1.15 : 1);
        return Math.round(baseReduction * complianceMultiplier);
    }
    
    calculateOperationalEfficiency(inputs) {
        const efficiencyPerVerify = 0.15; // $0.15 saved per verify
        const annualVerifies = inputs.monthlyContentVolume * 12;
        return Math.round(annualVerifies * efficiencyPerVerify);
    }
    
    calculateSecuritySavings(inputs) {
        const costPerIncident = 50000; // $50K average cost per security incident
        const incidentReduction = 0.8; // 80% reduction in incidents
        return Math.round(inputs.securityIncidents * costPerIncident * incidentReduction);
    }
    
    calculateLegalRiskReduction(inputs) {
        const revenueMultipliers = {
            small: 0.001,
            medium: 0.002,
            large: 0.003,
            enterprise: 0.005
        };
        
        const revenueRanges = {
            small: 5000000,
            medium: 50000000,
            large: 500000000,
            enterprise: 2000000000
        };
        
        const estimatedRevenue = revenueRanges[inputs.annualRevenue] || 50000000;
        return Math.round(estimatedRevenue * revenueMultipliers[inputs.annualRevenue]);
    }
    
    calculateBrandTrustValue(inputs) {
        const industryMultipliers = {
            media: 200000,
            ecommerce: 150000,
            finance: 300000,
            healthcare: 250000,
            government: 100000,
            enterprise: 175000,
            other: 75000
        };
        
        return industryMultipliers[inputs.industrySector] || 75000;
    }
    
    calculateCompetitiveAdvantageValue(inputs) {
        const geographicMultipliers = {
            regional: 50000,
            national: 100000,
            international: 150000,
            global: 250000
        };
        
        return geographicMultipliers[inputs.geographicScope] || 100000;
    }
    
    calculateCustomerConfidenceValue(inputs) {
        const revenueRanges = {
            small: 25000,
            medium: 75000,
            large: 150000,
            enterprise: 300000
        };
        
        return revenueRanges[inputs.annualRevenue] || 75000;
    }
    
    calculateMarketLeadershipValue(inputs) {
        const industryLeadership = {
            media: 100000,
            ecommerce: 75000,
            finance: 125000,
            healthcare: 100000,
            government: 50000,
            enterprise: 87500,
            other: 37550
        };
        
        return industryLeadership[inputs.industrySector] || 50000;
    }
    
    calculateROI(investment, benefits) {
        const totalInvestment = investment.total.threeYear;
        const totalBenefits = benefits.total.threeYear;
        const netBenefits = totalBenefits - totalInvestment;
        
        // ROI calculations
        const totalROI = Math.round((netBenefits / totalInvestment) * 100);
        const npv = this.calculateNPV(investment.total, benefits.total, 0.10);
        const irr = this.calculateIRR(investment.total, benefits.total);
        const paybackMonths = this.calculatePaybackPeriod(investment, benefits);
        const benefitCostRatio = (totalBenefits / totalInvestment).toFixed(2);
        
        return {
            totalROI,
            npv,
            irr,
            paybackMonths,
            benefitCostRatio,
            netBenefits
        };
    }
    
    calculateNPV(costs, benefits, discountRate) {
        let npv = 0;
        const cashFlows = [
            benefits.year1 - costs.year1,
            benefits.year2 - costs.year2,
            benefits.year3 - costs.year3
        ];
        
        cashFlows.forEach((cashFlow, year) => {
            npv += cashFlow / Math.pow(1 + discountRate, year + 1);
        });
        
        return Math.round(npv);
    }
    
    calculateIRR(costs, benefits) {
        // Simplified IRR calculation
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
    
    calculatePaybackPeriod(investment, benefits) {
        const monthlyBenefits = benefits.total.year1 / 12;
        const monthlyInvestment = investment.total.year1 / 12;
        const monthlyNetCashFlow = monthlyBenefits - monthlyInvestment;
        
        if (monthlyNetCashFlow <= 0) {
            return 36; // No payback within 3 years
        }
        
        return Math.ceil(investment.total.year1 / monthlyNetCashFlow);
    }
    
    calculateScenarios(inputs, investment, benefits) {
        // Conservative scenario (70% of base case benefits)
        const conservativeBenefits = {
            year1: Math.round(benefits.total.year1 * 0.7),
            year2: Math.round(benefits.total.year2 * 0.7),
            year3: Math.round(benefits.total.year3 * 0.7),
            threeYear: Math.round(benefits.total.threeYear * 0.7)
        };
        
        // Optimistic scenario (130% of base case benefits)
        const optimisticBenefits = {
            year1: Math.round(benefits.total.year1 * 1.3),
            year2: Math.round(benefits.total.year2 * 1.3),
            year3: Math.round(benefits.total.year3 * 1.3),
            threeYear: Math.round(benefits.total.threeYear * 1.3)
        };
        
        return {
            conservative: this.calculateROI(investment, { total: conservativeBenefits }),
            base: this.calculateROI(investment, benefits),
            optimistic: this.calculateROI(investment, { total: optimisticBenefits })
        };
    }
    
    updateUI(investment, benefits, roi, scenarios) {
        // Update key metrics
        document.getElementById('totalROI').textContent = roi.totalROI + '%';
        document.getElementById('netPresentValue').textContent = '$' + roi.npv.toLocaleString();
        document.getElementById('paybackPeriod').textContent = roi.paybackMonths;
        document.getElementById('irr').textContent = roi.irr + '%';
        document.getElementById('benefitCostRatio').textContent = roi.benefitCostRatio;
        
        // Update hard benefits
        document.getElementById('complianceReduction').textContent = '$' + benefits.hard.compliance.toLocaleString();
        document.getElementById('operationalEfficiency').textContent = '$' + benefits.hard.operational.toLocaleString();
        document.getElementById('securitySavings').textContent = '$' + benefits.hard.security.toLocaleString();
        document.getElementById('legalRiskReduction').textContent = '$' + benefits.hard.legal.toLocaleString();
        document.getElementById('totalHardBenefits').textContent = '$' + benefits.hard.total.toLocaleString();
        
        // Update soft benefits
        document.getElementById('brandTrustValue').textContent = '$' + benefits.soft.brand.toLocaleString();
        document.getElementById('competitiveAdvantageValue').textContent = '$' + benefits.soft.competitive.toLocaleString();
        document.getElementById('customerConfidenceValue').textContent = '$' + benefits.soft.customer.toLocaleString();
        document.getElementById('marketLeadershipValue').textContent = '$' + benefits.soft.leadership.toLocaleString();
        document.getElementById('totalSoftBenefits').textContent = '$' + benefits.soft.total.toLocaleString();
        
        // Update investment breakdown
        document.getElementById('totalInvestment').textContent = '$' + investment.total.threeYear.toLocaleString();
        document.getElementById('annualizedCost').textContent = '$' + Math.round(investment.total.threeYear / 3).toLocaleString();
        document.getElementById('monthlyCashFlow').textContent = '$' + Math.round((benefits.total.year1 - investment.total.year1) / 12).toLocaleString();
        
        // Update scenarios
        document.getElementById('conservativeROI').textContent = scenarios.conservative.totalROI + '%';
        document.getElementById('conservativePayback').textContent = scenarios.conservative.paybackMonths + ' mo';
        document.getElementById('conservativeNPV').textContent = '$' + scenarios.conservative.npv.toLocaleString();
        
        document.getElementById('baseROI').textContent = scenarios.base.totalROI + '%';
        document.getElementById('basePayback').textContent = scenarios.base.paybackMonths + ' mo';
        document.getElementById('baseNPV').textContent = '$' + scenarios.base.npv.toLocaleString();
        
        document.getElementById('optimisticROI').textContent = scenarios.optimistic.totalROI + '%';
        document.getElementById('optimisticPayback').textContent = scenarios.optimistic.paybackMonths + ' mo';
        document.getElementById('optimisticNPV').textContent = '$' + scenarios.optimistic.npv.toLocaleString();
        
        // Update investment table
        this.updateInvestmentTable(investment);
    }
    
    createInvestmentRow(row, label, year1, year2, year3, total, isTotal = false) {
        const labelCell = document.createElement('td');
        labelCell.className = isTotal ? 'px-6 py-4 whitespace-nowrap text-sm text-slate-300' : 'px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-300';
        labelCell.textContent = label;
        row.appendChild(labelCell);
        
        const year1Cell = document.createElement('td');
        year1Cell.className = isTotal ? 'px-6 py-4 whitespace-nowrap text-sm text-slate-300' : 'px-6 py-4 whitespace-nowrap text-sm text-slate-400';
        year1Cell.textContent = '$' + year1.toLocaleString();
        row.appendChild(year1Cell);
        
        const year2Cell = document.createElement('td');
        year2Cell.className = isTotal ? 'px-6 py-4 whitespace-nowrap text-sm text-slate-300' : 'px-6 py-4 whitespace-nowrap text-sm text-slate-400';
        year2Cell.textContent = '$' + year2.toLocaleString();
        row.appendChild(year2Cell);
        
        const year3Cell = document.createElement('td');
        year3Cell.className = isTotal ? 'px-6 py-4 whitespace-nowrap text-sm text-slate-300' : 'px-6 py-4 whitespace-nowrap text-sm text-slate-400';
        year3Cell.textContent = '$' + year3.toLocaleString();
        row.appendChild(year3Cell);
        
        const totalCell = document.createElement('td');
        totalCell.className = isTotal ? 'px-6 py-4 whitespace-nowrap text-sm text-slate-300' : 'px-6 py-4 whitespace-nowrap text-sm text-slate-400';
        totalCell.textContent = '$' + total.toLocaleString();
        row.appendChild(totalCell);
    }
    
    updateInvestmentTable(investment) {
        const tbody = document.getElementById('investmentTable');
        tbody.innerHTML = '';
        
        // Implementation row
        const implRow = document.createElement('tr');
        this.createInvestmentRow(implRow, 'Implementation', investment.implementation, 0, 0, investment.implementation);
        tbody.appendChild(implRow);
        
        // Training row
        const trainingRow = document.createElement('tr');
        this.createInvestmentRow(trainingRow, 'Training', investment.training, 0, 0, investment.training);
        tbody.appendChild(trainingRow);
        
        // Integration row
        const integrationRow = document.createElement('tr');
        this.createInvestmentRow(integrationRow, 'Integration', investment.integration, 0, 0, investment.integration);
        tbody.appendChild(integrationRow);
        
        // Subscription row
        const subRow = document.createElement('tr');
        this.createInvestmentRow(subRow, 'Subscription', investment.subscription.year1, investment.subscription.year2, investment.subscription.year3,
            investment.subscription.year1 + investment.subscription.year2 + investment.subscription.year3);
        tbody.appendChild(subRow);
        
        // Total row
        const totalRow = document.createElement('tr');
        totalRow.className = 'bg-slate-700/50 font-semibold';
        this.createInvestmentRow(totalRow, 'Total Investment', investment.total.year1, investment.total.year2, investment.total.year3, investment.total.threeYear, true);
        tbody.appendChild(totalRow);
    }
    
    updateCharts(investment, benefits, roi) {
        // Update ROI components chart
        this.roiComponentsChart.data.datasets[0].data = [
            benefits.hard.compliance,
            benefits.hard.operational,
            benefits.hard.security,
            benefits.hard.legal,
            benefits.soft.brand,
            benefits.soft.competitive,
            benefits.soft.customer,
            benefits.soft.leadership
        ];
        this.roiComponentsChart.update();
        
        // Update investment timeline chart
        const months = [0, 3, 6, 12, 18, 24, 30, 36];
        const cumulativeInvestment = months.map(month => {
            if (month <= 6) {
                return (investment.total.year1 * month) / 12;
            } else if (month <= 12) {
                return investment.total.year1;
            } else if (month <= 24) {
                return investment.total.year1 + ((investment.total.year2 * (month - 12)) / 12);
            } else {
                return investment.total.year1 + investment.total.year2 + ((investment.total.year3 * (month - 24)) / 12);
            }
        });
        
        const cumulativeBenefits = months.map(month => {
            if (month <= 12) {
                return (benefits.total.year1 * month) / 12;
            } else if (month <= 24) {
                return benefits.total.year1 + ((benefits.total.year2 * (month - 12)) / 12);
            } else {
                return benefits.total.year1 + benefits.total.year2 + ((benefits.total.year3 * (month - 24)) / 12);
            }
        });
        
        const netPosition = cumulativeBenefits.map((benefit, index) => benefit - cumulativeInvestment[index]);
        
        this.investmentTimelineChart.data.datasets[0].data = cumulativeInvestment;
        this.investmentTimelineChart.data.datasets[1].data = cumulativeBenefits;
        this.investmentTimelineChart.data.datasets[2].data = netPosition;
        this.investmentTimelineChart.update();
    }
    
    saveScenario() {
        const scenarioName = document.getElementById('scenarioName').value;
        if (scenarioName) {
            const inputs = this.gatherInputs();
            const investment = this.calculateInvestment(inputs);
            const benefits = this.calculateBenefits(inputs);
            const roi = this.calculateROI(investment, benefits);
            
            const scenarios = JSON.parse(this.getSecureStorage('roiScenarios') || '{}');
            scenarios[scenarioName] = {
                inputs,
                investment,
                benefits,
                roi,
                timestamp: new Date().toISOString()
            };
            
            this.setSecureStorage('roiScenarios', JSON.stringify(scenarios));
            alert('Scenario saved successfully!');
        }
    }
    
    getSecureStorage(key) {
        const encrypted = localStorage.getItem(key);
        if (!encrypted) return null;
        try {
            // Simple XOR encryption - in production use proper encryption
            const decrypted = atob(encrypted).split('').map((char, i) => 
                String.fromCharCode(char.charCodeAt(0) ^ 42)
            ).join('');
            return decrypted;
        } catch {
            return null;
        }
    }
    
    setSecureStorage(key, value) {
        // Simple XOR encryption - in production use proper encryption
        const encrypted = btoa(value.split('').map((char, i) => 
            String.fromCharCode(char.charCodeAt(0) ^ 42)
        ).join(''));
        localStorage.setItem(key, encrypted);
    }
    
    generateReport() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Add title
        doc.setFontSize(20);
        doc.text('C2 Concierge ROI Analysis Report', 20, 20);
        
        // Add executive summary
        doc.setFontSize(14);
        doc.text('Executive Summary', 20, 40);
        doc.setFontSize(11);
        doc.text(`Total ROI: ${document.getElementById('totalROI').textContent}`, 20, 50);
        doc.text(`Net Present Value: ${document.getElementById('netPresentValue').textContent}`, 20, 60);
        doc.text(`Payback Period: ${document.getElementById('paybackPeriod').textContent} months`, 20, 70);
        doc.text(`Internal Rate of Return: ${document.getElementById('irr').textContent}`, 20, 80);
        
        // Add detailed analysis
        doc.setFontSize(14);
        doc.text('Investment Breakdown', 20, 100);
        doc.setFontSize(11);
        doc.text(`Total Investment: ${document.getElementById('totalInvestment').textContent}`, 20, 110);
        doc.text(`Annualized Cost: ${document.getElementById('annualizedCost').textContent}`, 20, 120);
        
        // Save the PDF
        doc.save('c2-concierge-roi-analysis.pdf');
    }
    
    scheduleConsultation() {
        // Redirect to consultation scheduling page or open modal
        window.location.href = '/schedule-consultation';
    }
}

// Initialize calculator when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ExecutiveROICalculator();
});
```

---

## Advanced ROI Features

### Industry Benchmarking

```javascript
const industryBenchmarks = {
    media: {
        averageROI: 185,
        implementationTime: 6,
        adoptionRate: 0.75
    },
    ecommerce: {
        averageROI: 165,
        implementationTime: 4,
        adoptionRate: 0.85
    },
    finance: {
        averageROI: 220,
        implementationTime: 8,
        adoptionRate: 0.65
    },
    healthcare: {
        averageROI: 195,
        implementationTime: 10,
        adoptionRate: 0.70
    }
};
```

### Sensitivity Analysis

```javascript
class SensitivityAnalysis {
    constructor(baseInputs) {
        this.baseInputs = baseInputs;
        this.sensitivityFactors = {
            growthRate: { min: -0.5, max: 1.0, step: 0.1 },
            complianceCosts: { min: 0.5, max: 2.0, step: 0.25 },
            securityIncidents: { min: 0.5, max: 3.0, step: 0.5 }
        };
    }
    
    calculateSensitivity() {
        const results = {};
        
        for (const [factor, config] of Object.entries(this.sensitivityFactors)) {
            results[factor] = [];
            
            for (let value = config.min; value <= config.max; value += config.step) {
                const modifiedInputs = { ...this.baseInputs };
                modifiedInputs[factor] = this.baseInputs[factor] * value;
                
                const roi = this.calculateROI(modifiedInputs);
                results[factor].push({
                    factorValue: value,
                    roi: roi.totalROI,
                    npv: roi.npv
                });
            }
        }
        
        return results;
    }
}
```

---

*Last Updated: November 5, 2025*  
**Target Users**: C-level executives and decision makers  
**Integration**: CRM for lead scoring and follow-up  
**Analytics**: Executive dashboard for real-time ROI tracking
