# Pricing Calculator

**Public-Facing Transparent Cost Estimation Tool**

**Version**: 1.0.0  
**Launch Date**: November 5, 2025  
**Access**: Public (no login required)

---

## Calculator Overview

### Design Principles

1. **Complete Transparency**: Show all costs, overages, and calculations
2. **No Dark Patterns**: Clear pricing, hidden fees eliminated
3. **Real-Time Updates**: Instant feedback on all input changes
4. **Educational**: Help customers understand value metrics
5. **Mobile Responsive**: Works seamlessly on all devices

### User Experience Flow

```
1. Input Usage Estimates
   ↓
2. Select Plan Preferences
   ↓
3. View Cost Breakdown
   ↓
4. Compare Options
   ↓
5. Export/Share Results
```

---

## Calculator Implementation

### HTML Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>C2 Concierge Pricing Calculator</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
</head>
<body class="bg-gray-50">
    <!-- Header -->
    <header class="bg-white shadow-sm border-b">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between items-center py-4">
                <div class="flex items-center">
                    <img src="/logo.svg" alt="C2 Concierge" class="h-8 w-auto">
                    <h1 class="ml-3 text-xl font-semibold text-gray-900">Pricing Calculator</h1>
                </div>
                <nav class="hidden md:flex space-x-8">
                    <a href="#calculator" class="text-gray-700 hover:text-blue-600">Calculator</a>
                    <a href="#plans" class="text-gray-700 hover:text-blue-600">Plans</a>
                    <a href="#faq" class="text-gray-700 hover:text-blue-600">FAQ</a>
                    <a href="/contact-sales" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">Contact Sales</a>
                </nav>
            </div>
        </div>
    </header>

    <!-- Main Calculator -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <!-- Introduction -->
        <div class="text-center mb-8">
            <h2 class="text-3xl font-bold text-gray-900 mb-4">
                Estimate Your C2PA-as-a-Service Costs
            </h2>
            <p class="text-lg text-gray-600 max-w-3xl mx-auto">
                Get transparent pricing for content verification and signing. 
                No hidden fees, no surprises. Calculate your monthly costs based on actual usage.
            </p>
        </div>

        <!-- Calculator Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- Input Panel -->
            <div class="lg:col-span-1">
                <div class="bg-white rounded-lg shadow-md p-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">
                        <i class="fas fa-sliders-h mr-2"></i>
                        Usage Estimates
                    </h3>
                    
                    <!-- Monthly Assets -->
                    <div class="mb-6">
                        <label class="block text-sm font-medium text-gray-700 mb-2">
                            Monthly Content Assets
                            <span class="text-gray-500 font-normal ml-1">
                                (images, videos, documents)
                            </span>
                        </label>
                        <input type="range" id="monthlyAssets" min="100" max="100000" value="5000" 
                               class="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer">
                        <div class="flex justify-between text-sm text-gray-600 mt-1">
                            <span>100</span>
                            <span id="monthlyAssetsValue" class="font-semibold text-blue-600">5,000</span>
                            <span>100,000</span>
                        </div>
                    </div>

                    <!-- Verification Rate -->
                    <div class="mb-6">
                        <label class="block text-sm font-medium text-gray-700 mb-2">
                            Remote Verification Rate
                            <span class="text-gray-500 font-normal ml-1">
                                (% of assets verified monthly)
                            </span>
                        </label>
                        <input type="range" id="verificationRate" min="10" max="100" value="80" 
                               class="w-full h-2 bg-green-200 rounded-lg appearance-none cursor-pointer">
                        <div class="flex justify-between text-sm text-gray-600 mt-1">
                            <span>10%</span>
                            <span id="verificationRateValue" class="font-semibold text-green-600">80%</span>
                            <span>100%</span>
                        </div>
                    </div>

                    <!-- Signing Rate -->
                    <div class="mb-6">
                        <label class="block text-sm font-medium text-gray-700 mb-2">
                            Content Signing Rate
                            <span class="text-gray-500 font-normal ml-1">
                                (% of new assets signed)
                            </span>
                        </label>
                        <input type="range" id="signingRate" min="5" max="50" value="20" 
                               class="w-full h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer">
                        <div class="flex justify-between text-sm text-gray-600 mt-1">
                            <span>5%</span>
                            <span id="signingRateValue" class="font-semibold text-purple-600">20%</span>
                            <span>50%</span>
                        </div>
                    </div>

                    <!-- Sites -->
                    <div class="mb-6">
                        <label class="block text-sm font-medium text-gray-700 mb-2">
                            Number of Sites/Properties
                        </label>
                        <input type="range" id="numberOfSites" min="1" max="50" value="3" 
                               class="w-full h-2 bg-orange-200 rounded-lg appearance-none cursor-pointer">
                        <div class="flex justify-between text-sm text-gray-600 mt-1">
                            <span>1</span>
                            <span id="numberOfSitesValue" class="font-semibold text-orange-600">3</span>
                            <span>50</span>
                        </div>
                    </div>

                    <!-- Billing Toggle -->
                    <div class="mb-6">
                        <label class="block text-sm font-medium text-gray-700 mb-2">
                            Billing Preference
                        </label>
                        <div class="flex space-x-4">
                            <button id="monthlyBilling" class="flex-1 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                                Monthly
                            </button>
                            <button id="annualBilling" class="flex-1 py-2 px-4 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors">
                                Annual (Save 20%)
                            </button>
                        </div>
                    </div>

                    <!-- Calculate Button -->
                    <button id="calculateBtn" class="w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 transition-colors font-semibold">
                        <i class="fas fa-calculator mr-2"></i>
                        Calculate Pricing
                    </button>
                </div>

                <!-- Usage Breakdown -->
                <div class="bg-white rounded-lg shadow-md p-6 mt-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4">
                        <i class="fas fa-chart-pie mr-2"></i>
                        Estimated Usage
                    </h3>
                    <div class="space-y-3">
                        <div class="flex justify-between">
                            <span class="text-gray-600">Verify Operations:</span>
                            <span id="estimatedVerifies" class="font-semibold">4,000</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">Sign Operations:</span>
                            <span id="estimatedSigns" class="font-semibold">1,000</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">Storage Required:</span>
                            <span id="estimatedStorage" class="font-semibold">25 GB</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">Active Sites:</span>
                            <span id="estimatedSites" class="font-semibold">3</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Results Panel -->
            <div class="lg:col-span-2">
                <div class="bg-white rounded-lg shadow-md p-6">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-lg font-semibold text-gray-900">
                            <i class="fas fa-dollar-sign mr-2"></i>
                            Pricing Recommendations
                        </h3>
                        <div class="flex space-x-2">
                            <button id="exportResults" class="text-blue-600 hover:text-blue-700">
                                <i class="fas fa-download mr-1"></i>
                                Export
                            </button>
                            <button id="shareResults" class="text-blue-600 hover:text-blue-700">
                                <i class="fas fa-share-alt mr-1"></i>
                                Share
                            </button>
                        </div>
                    </div>

                    <!-- Plan Cards -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4" id="planCards">
                        <!-- Starter Plan -->
                        <div class="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                            <div class="text-center mb-4">
                                <h4 class="text-lg font-semibold text-gray-900">Starter</h4>
                                <p class="text-sm text-gray-600">Small sites</p>
                            </div>
                            <div class="text-center mb-4">
                                <span class="text-3xl font-bold text-gray-900">$<span id="starterPrice">199</span></span>
                                <span class="text-gray-600">/mo</span>
                            </div>
                            <div class="space-y-2 mb-4">
                                <div class="flex justify-between text-sm">
                                    <span>2,000 verifies included</span>
                                    <span id="starterVerifiesStatus" class="text-green-600">✓</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span>200 signs included</span>
                                    <span id="starterSignsStatus" class="text-green-600">✓</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span>2 sites included</span>
                                    <span id="starterSitesStatus" class="text-green-600">✓</span>
                                </div>
                            </div>
                            <div id="starterOverage" class="mb-4 p-3 bg-yellow-50 rounded-md hidden">
                                <p class="text-sm text-yellow-800">
                                    <i class="fas fa-exclamation-triangle mr-1"></i>
                                    +$<span id="starterOverageAmount">0</span>/mo overage
                                </p>
                            </div>
                            <button class="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-200 transition-colors">
                                Select Starter
                            </button>
                        </div>

                        <!-- Growth Plan -->
                        <div class="border-2 border-blue-500 rounded-lg p-4 relative">
                            <div class="absolute -top-3 left-1/2 transform -translate-x-1/2">
                                <span class="bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-semibold">
                                    Recommended
                                </span>
                            </div>
                            <div class="text-center mb-4">
                                <h4 class="text-lg font-semibold text-gray-900">Growth</h4>
                                <p class="text-sm text-gray-600">Newsrooms & brands</p>
                            </div>
                            <div class="text-center mb-4">
                                <span class="text-3xl font-bold text-gray-900">$<span id="growthPrice">699</span></span>
                                <span class="text-gray-600">/mo</span>
                            </div>
                            <div class="space-y-2 mb-4">
                                <div class="flex justify-between text-sm">
                                    <span>15,000 verifies included</span>
                                    <span id="growthVerifiesStatus" class="text-green-600">✓</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span>1,000 signs included</span>
                                    <span id="growthSignsStatus" class="text-green-600">✓</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span>5 sites included</span>
                                    <span id="growthSitesStatus" class="text-green-600">✓</span>
                                </div>
                            </div>
                            <div id="growthOverage" class="mb-4 p-3 bg-yellow-50 rounded-md hidden">
                                <p class="text-sm text-yellow-800">
                                    <i class="fas fa-exclamation-triangle mr-1"></i>
                                    +$<span id="growthOverageAmount">0</span>/mo overage
                                </p>
                            </div>
                            <button class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors">
                                Select Growth
                            </button>
                        </div>

                        <!-- Scale Plan -->
                        <div class="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                            <div class="text-center mb-4">
                                <h4 class="text-lg font-semibold text-gray-900">Scale</h4>
                                <p class="text-sm text-gray-600">Enterprise teams</p>
                            </div>
                            <div class="text-center mb-4">
                                <span class="text-3xl font-bold text-gray-900">$<span id="scalePrice">2000</span></span>
                                <span class="text-gray-600">/mo</span>
                            </div>
                            <div class="space-y-2 mb-4">
                                <div class="flex justify-between text-sm">
                                    <span>60,000 verifies included</span>
                                    <span id="scaleVerifiesStatus" class="text-green-600">✓</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span>5,000 signs included</span>
                                    <span id="scaleSignsStatus" class="text-green-600">✓</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span>10 sites included</span>
                                    <span id="scaleSitesStatus" class="text-green-600">✓</span>
                                </div>
                            </div>
                            <div id="scaleOverage" class="mb-4 p-3 bg-yellow-50 rounded-md hidden">
                                <p class="text-sm text-yellow-800">
                                    <i class="fas fa-exclamation-triangle mr-1"></i>
                                    +$<span id="scaleOverageAmount">0</span>/mo overage
                                </p>
                            </div>
                            <button class="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-200 transition-colors">
                                Select Scale
                            </button>
                        </div>
                    </div>

                    <!-- Detailed Breakdown -->
                    <div class="mt-8 border-t pt-6">
                        <h4 class="text-lg font-semibold text-gray-900 mb-4">
                            <i class="fas fa-list-alt mr-2"></i>
                            Detailed Cost Breakdown
                        </h4>
                        <div class="overflow-x-auto">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Plan
                                        </th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Base Price
                                        </th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Overage
                                        </th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Total Monthly
                                        </th>
                                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Annual (20% off)
                                        </th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-200" id="breakdownTable">
                                    <!-- Populated by JavaScript -->
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Value Proposition -->
                    <div class="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="bg-blue-50 rounded-lg p-4">
                            <h5 class="font-semibold text-blue-900 mb-2">
                                <i class="fas fa-shield-alt mr-2"></i>
                                Compliance & Security
                            </h5>
                            <ul class="text-sm text-blue-800 space-y-1">
                                <li>• GDPR Art. 28 compliant DPA</li>
                                <li>• SOC 2 Type II certified</li>
                                <li>• 24-month WORM evidence storage</li>
                                <li>• Enterprise-grade encryption</li>
                            </ul>
                        </div>
                        <div class="bg-green-50 rounded-lg p-4">
                            <h5 class="font-semibold text-green-900 mb-2">
                                <i class="fas fa-rocket mr-2"></i>
                                Performance & Reliability
                            </h5>
                            <ul class="text-sm text-green-800 space-y-1">
                                <li>• 99.9% uptime SLA guarantee</li>
                                <li>• Global CDN for fast verification</li>
                                <li>• Real-time usage monitoring</li>
                                <li>• 24/7 technical support</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- FAQ Section -->
        <div class="mt-12 bg-white rounded-lg shadow-md p-8">
            <h3 class="text-2xl font-bold text-gray-900 mb-6 text-center">
                Frequently Asked Questions
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <h4 class="font-semibold text-gray-900 mb-2">How accurate is this calculator?</h4>
                    <p class="text-gray-600 text-sm">
                        The calculator provides estimates based on your inputs. Actual costs may vary based on 
                        real usage patterns and any custom configurations you choose.
                    </p>
                </div>
                <div>
                    <h4 class="font-semibold text-gray-900 mb-2">What happens if I exceed my limits?</h4>
                    <p class="text-gray-600 text-sm">
                        Growth and Scale plans include soft caps with transparent overage pricing. 
                        Starter plans have hard caps to prevent unexpected charges.
                    </p>
                </div>
                <div>
                    <h4 class="font-semibold text-gray-900 mb-2">Can I change plans anytime?</h4>
                    <p class="text-gray-600 text-sm">
                        Yes! Upgrades take effect immediately with proration. 
                        Downgrades are scheduled for the next billing cycle to avoid service disruption.
                    </p>
                </div>
                <div>
                    <h4 class="font-semibold text-gray-900 mb-2">Do you offer custom pricing?</h4>
                    <p class="text-gray-600 text-sm">
                        Custom pricing is available for enterprise customers with specific requirements. 
                        Contact our sales team to discuss your needs.
                    </p>
                </div>
            </div>
        </div>
    </main>

    <!-- Footer -->
    <footer class="bg-gray-900 text-white mt-12">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div class="text-center">
                <p class="text-gray-400">
                    Questions about pricing? 
                    <a href="mailto:billing@c2concierge.com" class="text-blue-400 hover:text-blue-300">
                        billing@c2concierge.com
                    </a>
                </p>
                <p class="text-gray-500 text-sm mt-2">
                    © 2025 C2 Concierge Inc. All rights reserved.
                </p>
            </div>
        </div>
    </footer>

    <script src="calculator.js"></script>
</body>
</html>
```

### JavaScript Implementation

```javascript
// calculator.js
class PricingCalculator {
    constructor() {
        this.plans = {
            starter: {
                name: 'Starter',
                basePrice: 199,
                included: { verifies: 2000, signs: 200, sites: 2, storage: 10 },
                overage: { verifies: 0.04, signs: 0.15, sites: 50, storage: 2 }
            },
            growth: {
                name: 'Growth',
                basePrice: 699,
                included: { verifies: 15000, signs: 1000, sites: 5, storage: 50 },
                overage: { verifies: 0.03, signs: 0.12, sites: 40, storage: 1.5 }
            },
            scale: {
                name: 'Scale',
                basePrice: 2000,
                included: { verifies: 60000, signs: 5000, sites: 10, storage: 200 },
                overage: { verifies: 0.02, signs: 0.10, sites: 35, storage: 1.25 }
            }
        };
        
        this.isAnnual = false;
        this.initializeEventListeners();
        this.calculate();
    }
    
    initializeEventListeners() {
        // Range inputs
        document.getElementById('monthlyAssets').addEventListener('input', (e) => {
            document.getElementById('monthlyAssetsValue').textContent = 
                parseInt(e.target.value).toLocaleString();
            this.calculate();
        });
        
        document.getElementById('verificationRate').addEventListener('input', (e) => {
            document.getElementById('verificationRateValue').textContent = e.target.value + '%';
            this.calculate();
        });
        
        document.getElementById('signingRate').addEventListener('input', (e) => {
            document.getElementById('signingRateValue').textContent = e.target.value + '%';
            this.calculate();
        });
        
        document.getElementById('numberOfSites').addEventListener('input', (e) => {
            document.getElementById('numberOfSitesValue').textContent = e.target.value;
            this.calculate();
        });
        
        // Billing toggle
        document.getElementById('monthlyBilling').addEventListener('click', () => {
            this.setBillingMode(false);
        });
        
        document.getElementById('annualBilling').addEventListener('click', () => {
            this.setBillingMode(true);
        });
        
        // Calculate button
        document.getElementById('calculateBtn').addEventListener('click', () => {
            this.calculate();
            this.scrollToResults();
        });
        
        // Export/Share buttons
        document.getElementById('exportResults').addEventListener('click', () => {
            this.exportResults();
        });
        
        document.getElementById('shareResults').addEventListener('click', () => {
            this.shareResults();
        });
    }
    
    setBillingMode(isAnnual) {
        this.isAnnual = isAnnual;
        
        const monthlyBtn = document.getElementById('monthlyBilling');
        const annualBtn = document.getElementById('annualBilling');
        
        if (isAnnual) {
            monthlyBtn.className = 'flex-1 py-2 px-4 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors';
            annualBtn.className = 'flex-1 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors';
        } else {
            monthlyBtn.className = 'flex-1 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors';
            annualBtn.className = 'flex-1 py-2 px-4 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors';
        }
        
        this.calculate();
    }
    
    validateInput(elementId, min, max) {
        const element = document.getElementById(elementId);
        const value = parseInt(element.value);
        
        if (isNaN(value) || value < min || value > max) {
            element.classList.add('border-red-500');
            this.showError(elementId, `Value must be between ${min} and ${max}`);
            return null;
        }
        
        element.classList.remove('border-red-500');
        this.hideError(elementId);
        return value;
    }
    
    showError(elementId, message) {
        let errorElement = document.getElementById(elementId + '-error');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.id = elementId + '-error';
            errorElement.className = 'text-red-500 text-sm mt-1';
            const inputElement = document.getElementById(elementId);
            inputElement.parentNode.appendChild(errorElement);
        }
        errorElement.textContent = message;
    }
    
    hideError(elementId) {
        const errorElement = document.getElementById(elementId + '-error');
        if (errorElement) {
            errorElement.remove();
        }
    }
    
    calculate() {
        // Validate and sanitize inputs
        const monthlyAssets = this.validateInput('monthlyAssets', 1, 1000000);
        const verificationRate = this.validateInput('verificationRate', 0, 100) / 100;
        const signingRate = this.validateInput('signingRate', 0, 100) / 100;
        const numberOfSites = this.validateInput('numberOfSites', 1, 1000);
        
        if (monthlyAssets === null || verificationRate === null || signingRate === null || numberOfSites === null) {
            return;
        }
        
        // Calculate estimated usage
        const estimatedVerifies = Math.round(monthlyAssets * verificationRate);
        const estimatedSigns = Math.round(monthlyAssets * signingRate);
        const estimatedStorage = Math.round(monthlyAssets * 0.005); // 5MB per asset average
        const estimatedSites = numberOfSites;
        
        // Update usage display
        document.getElementById('estimatedVerifies').textContent = estimatedVerifies.toLocaleString();
        document.getElementById('estimatedSigns').textContent = estimatedSigns.toLocaleString();
        document.getElementById('estimatedStorage').textContent = estimatedStorage + ' GB';
        document.getElementById('estimatedSites').textContent = estimatedSites;
        
        // Calculate costs for each plan
        const results = {};
        for (const [planKey, plan] of Object.entries(this.plans)) {
            results[planKey] = this.calculatePlanCost(plan, {
                verifies: estimatedVerifies,
                signs: estimatedSigns,
                storage: estimatedStorage,
                sites: estimatedSites
            });
        }
        
        // Update UI with results
        this.updatePlanCards(results);
        this.updateBreakdownTable(results);
    }
    
    calculatePlanCost(plan, usage) {
        const overage = {
            verifies: Math.max(0, usage.verifies - plan.included.verifies),
            signs: Math.max(0, usage.signs - plan.included.signs),
            storage: Math.max(0, usage.storage - plan.included.storage),
            sites: Math.max(0, usage.sites - plan.included.sites)
        };
        
        const overageCost = 
            overage.verifies * plan.overage.verifies +
            overage.signs * plan.overage.signs +
            overage.storage * plan.overage.storage +
            overage.sites * plan.overage.sites;
        
        const monthlyTotal = plan.basePrice + overageCost;
        const annualTotal = monthlyTotal * 12 * 0.8; // 20% discount
        
        return {
            basePrice: plan.basePrice,
            overageCost: Math.round(overageCost * 100) / 100,
            monthlyTotal: Math.round(monthlyTotal * 100) / 100,
            annualTotal: Math.round(annualTotal * 100) / 100,
            overage,
            fitsInPlan: overageCost === 0
        };
    }
    
    updatePlanCards(results) {
        for (const [planKey, result] of Object.entries(results)) {
            // Update prices
            const priceElement = document.getElementById(planKey + 'Price');
            priceElement.textContent = this.isAnnual ? 
                Math.round(result.annualTotal / 12) : 
                result.monthlyTotal;
            
            // Update status indicators
            const verifiesStatus = document.getElementById(planKey + 'VerifiesStatus');
            const signsStatus = document.getElementById(planKey + 'SignsStatus');
            const sitesStatus = document.getElementById(planKey + 'SitesStatus');
            
            verifiesStatus.textContent = result.overage.verifies > 0 ? 
                `+${result.overage.verifies.toLocaleString()}` : '✓';
            verifiesStatus.className = result.overage.verifies > 0 ? 
                'text-orange-600' : 'text-green-600';
            
            signsStatus.textContent = result.overage.signs > 0 ? 
                `+${result.overage.signs.toLocaleString()}` : '✓';
            signsStatus.className = result.overage.signs > 0 ? 
                'text-orange-600' : 'text-green-600';
            
            sitesStatus.textContent = result.overage.sites > 0 ? 
                `+${result.overage.sites}` : '✓';
            sitesStatus.className = result.overage.sites > 0 ? 
                'text-orange-600' : 'text-green-600';
            
            // Show/hide overage warning
            const overageElement = document.getElementById(planKey + 'Overage');
            const overageAmount = document.getElementById(planKey + 'OverageAmount');
            
            if (result.overageCost > 0) {
                overageElement.classList.remove('hidden');
                overageAmount.textContent = result.overageCost;
            } else {
                overageElement.classList.add('hidden');
            }
        }
    }
    
    updateBreakdownTable(results) {
        const tbody = document.getElementById('breakdownTable');
        tbody.innerHTML = '';
        
        for (const [planKey, result] of Object.entries(results)) {
            const row = document.createElement('tr');
            
            const planCell = document.createElement('td');
            planCell.className = 'px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900';
            planCell.textContent = this.plans[planKey].name;
            row.appendChild(planCell);
            
            const basePriceCell = document.createElement('td');
            basePriceCell.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-500';
            basePriceCell.textContent = `$${result.basePrice}`;
            row.appendChild(basePriceCell);
            
            const overageCell = document.createElement('td');
            overageCell.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-500';
            overageCell.textContent = `$${result.overageCost}`;
            row.appendChild(overageCell);
            
            const monthlyCell = document.createElement('td');
            monthlyCell.className = 'px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900';
            monthlyCell.textContent = `$${result.monthlyTotal}`;
            row.appendChild(monthlyCell);
            
            const annualCell = document.createElement('td');
            annualCell.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-500';
            annualCell.textContent = `$${result.annualTotal}`;
            row.appendChild(annualCell);
            tbody.appendChild(row);
        }
    }
    
    scrollToResults() {
        document.getElementById('planCards').scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
        });
    }
    
    exportResults() {
        const results = this.gatherResults();
        const csv = this.convertToCSV(results);
        this.downloadCSV(csv, 'c2-concierge-pricing-estimate.csv');
    }
    
    shareResults() {
        const results = this.gatherResults();
        const url = this.createShareableUrl(results);
        
        if (navigator.share) {
            navigator.share({
                title: 'C2 Concierge Pricing Estimate',
                text: 'Check out my C2PA-as-a-Service pricing estimate',
                url: url
            });
        } else {
            navigator.clipboard.writeText(url);
            alert('Share link copied to clipboard!');
        }
    }
    
    gatherResults() {
        return {
            monthlyAssets: document.getElementById('monthlyAssets').value,
            verificationRate: document.getElementById('verificationRate').value,
            signingRate: document.getElementById('signingRate').value,
            numberOfSites: document.getElementById('numberOfSites').value,
            billingMode: this.isAnnual ? 'annual' : 'monthly',
            timestamp: new Date().toISOString()
        };
    }
    
    convertToCSV(results) {
        const headers = ['Plan', 'Base Price', 'Overage', 'Monthly Total', 'Annual Total'];
        const rows = [];
        
        for (const [planKey, plan] of Object.entries(this.plans)) {
            const result = this.calculatePlanCost(plan, {
                verifies: parseInt(results.monthlyAssets) * (parseInt(results.verificationRate) / 100),
                signs: parseInt(results.monthlyAssets) * (parseInt(results.signingRate) / 100),
                storage: parseInt(results.monthlyAssets) * 0.005,
                sites: parseInt(results.numberOfSites)
            });
            
            rows.push([
                plan.name,
                result.basePrice,
                result.overageCost,
                result.monthlyTotal,
                result.annualTotal
            ]);
        }
        
        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
    
    downloadCSV(csv, filename) {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
    }
    
    createShareableUrl(results) {
        const baseUrl = window.location.origin + window.location.pathname;
        const params = new URLSearchParams(results);
        return `${baseUrl}?${params.toString()}`;
    }
}

// Initialize calculator when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PricingCalculator();
});
```

---

## Calculator Features

### Input Validation

```javascript
const validationRules = {
    monthlyAssets: {
        min: 100,
        max: 100000,
        required: true,
        message: "Please enter between 100 and 100,000 monthly assets"
    },
    verificationRate: {
        min: 10,
        max: 100,
        required: true,
        message: "Verification rate must be between 10% and 100%"
    },
    signingRate: {
        min: 5,
        max: 50,
        required: true,
        message: "Signing rate must be between 5% and 50%"
    },
    numberOfSites: {
        min: 1,
        max: 50,
        required: true,
        message: "Number of sites must be between 1 and 50"
    }
};
```

### Analytics Integration

```javascript
// Track calculator usage
const analytics = {
    trackCalculation: (inputs, results) => {
        gtag('event', 'pricing_calculation', {
            monthly_assets: inputs.monthlyAssets,
            verification_rate: inputs.verificationRate,
            recommended_plan: results.recommendedPlan,
            estimated_monthly_cost: results.recommendedCost
        });
    },
    
    trackExport: (format) => {
        gtag('event', 'pricing_export', {
            format: format
        });
    },
    
    trackShare: (method) => {
        gtag('event', 'pricing_share', {
            method: method
        });
    }
};
```

### Mobile Optimization

```css
/* Mobile-specific styles */
@media (max-width: 768px) {
    .calculator-grid {
        grid-template-columns: 1fr;
        gap: 1rem;
    }
    
    .plan-cards {
        grid-template-columns: 1fr;
    }
    
    .range-inputs {
        padding: 0.5rem;
    }
    
    .value-display {
        font-size: 0.875rem;
    }
}
```

---

## Deployment Configuration

### Hosting Setup

```json
{
  "hosting": {
    "provider": "netlify",
    "domain": "calculator.c2concierge.com",
    "ssl": true,
    "redirects": [
      {
        "from": "/pricing",
        "to": "/calculator",
        "status": 301
      }
    ]
  },
  "performance": {
    "caching": "aggressive",
    "compression": true,
    "minification": true,
    "cdn": "cloudflare"
  },
  "analytics": {
    "google_analytics": "GA-MEASUREMENT-ID",
    "hotjar": "HOTJAR-ID",
    "custom_events": true
  }
}
```

### SEO Optimization

```html
<!-- Meta tags for SEO -->
<meta name="description" content="Calculate your C2PA-as-a-Service costs with our transparent pricing calculator. No hidden fees, real-time estimates for content verification and signing.">
<meta name="keywords" content="C2PA pricing, content verification cost, digital signing calculator, provenance pricing">
<meta property="og:title" content="C2 Concierge Pricing Calculator">
<meta property="og:description" content="Get transparent pricing for C2PA content verification and signing services">
<meta property="og:type" content="website">
<meta property="og:url" content="https://calculator.c2concierge.com">
<meta property="og:image" content="https://calculator.c2concierge.com/og-image.png">
```

---

*Last Updated: November 5, 2025*  
**Launch**: Public access, no authentication required  
**Monitoring**: Google Analytics + Hotjar for user behavior  
**Maintenance**: Monthly pricing updates and feature enhancements
