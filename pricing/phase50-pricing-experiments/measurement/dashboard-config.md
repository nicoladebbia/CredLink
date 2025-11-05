# Dashboard Configuration

**Real-Time Metrics Visualization and Monitoring**

**Version**: 1.0.0  
**Implementation Date**: November 5, 2025  
**Refresh Rate**: Real-time (5-second) + Batch (5-minute)

---

## Dashboard Architecture

### Component Structure

```
Pricing Dashboard System
├── Executive Dashboard
│   ├── Key Performance Indicators
│   ├── Revenue Overview
│   └── Experiment Status
├── Operations Dashboard
│   ├── Usage Monitoring
│   ├── Billing Health
│   └── Alert Management
├── Finance Dashboard
│   ├── Gross Margin Analysis
│   ├── Revenue Recognition
│   └── Forecasting
├── Customer Success Dashboard
│   ├── Retention Metrics
│   ├── Churn Risk
│   └── Expansion Opportunities
└── Experiment Dashboard
    ├── A/B Test Results
    ├── Statistical Analysis
    └── Cohort Performance
```

### Data Flow Architecture

```
Data Sources → Processing Layer → Storage Layer → API Layer → Frontend Dashboard
     ↓               ↓                ↓           ↓              ↓
┌─────────┐   ┌─────────────┐   ┌──────────┐  ┌─────────┐  ┌─────────────┐
│ Stripe  │ → │ Real-time   │ → │ ClickHouse│ → │ GraphQL │ → │ React/Chart │
│Amplitude│   │ Processing  │   │ PostgreSQL│   │ API     │ │   JS        │
│ Zendesk │   │ Kafka Streams│   │ Redis    │  └─────────┘  └─────────────┘
│ Internal │   │             │   │          │
│ Systems │   │             │   │          │
└─────────┘   └─────────────┘   └──────────┘
```

---

## Executive Dashboard

### Key Performance Indicators

```javascript
// Executive Dashboard Configuration
const executiveDashboardConfig = {
  layout: 'grid_4x2',
  refreshInterval: 30000, // 30 seconds
  widgets: [
    {
      id: 'total_revenue',
      type: 'metric_card',
      title: 'Total Monthly Revenue',
      value: '$2,847,392',
      change: '+12.3%',
      changePeriod: 'vs last month',
      trend: 'up',
      format: 'currency',
      size: 'large',
      color: 'green'
    },
    {
      id: 'gross_margin',
      type: 'metric_card',
      title: 'Gross Margin',
      value: '73.2%',
      change: '+2.1%',
      changePeriod: 'vs last month',
      trend: 'up',
      format: 'percentage',
      size: 'large',
      color: 'blue',
      target: 70,
      status: 'above_target'
    },
    {
      id: 'active_customers',
      type: 'metric_card',
      title: 'Active Customers',
      value: '3,847',
      change: '+156',
      changePeriod: 'vs last month',
      trend: 'up',
      format: 'number',
      size: 'medium',
      color: 'purple'
    },
    {
      id: 'conversion_rate',
      type: 'metric_card',
      title: 'Trial-to-Paid Conversion',
      value: '27.8%',
      change: '+1.2%',
      changePeriod: 'vs last month',
      trend: 'up',
      format: 'percentage',
      size: 'medium',
      color: 'orange',
      target: 25,
      status: 'above_target'
    },
    {
      id: 'revenue_growth',
      type: 'line_chart',
      title: 'Revenue Growth (6 Months)',
      dataSource: 'stripe_revenue',
      timeRange: '6_months',
      metrics: ['mrr', 'arr'],
      format: 'currency',
      size: 'wide',
      annotations: [
        { date: '2025-08-15', text: 'Price increase launched' },
        { date: '2025-09-01', text: 'Enterprise plan released' }
      ]
    },
    {
      id: 'plan_distribution',
      type: 'donut_chart',
      title: 'Revenue by Plan',
      dataSource: 'subscription_plans',
      metrics: ['starter', 'growth', 'scale'],
      size: 'medium',
      colors: ['#10B981', '#3B82F6', '#8B5CF6']
    },
    {
      id: 'experiment_status',
      type: 'status_grid',
      title: 'Active Experiments',
      dataSource: 'optimizely_experiments',
      size: 'medium',
      experiments: [
        { name: 'Caps Experiment', status: 'running', lift: '+5.2%', significance: '95%' },
        { name: 'Bundle Experiment', status: 'running', lift: '+3.1%', significance: '87%' },
        { name: 'Overage Experiment', status: 'completed', lift: '+7.8%', significance: '99%' }
      ]
    },
    {
      id: 'geographic_breakdown',
      type: 'world_map',
      title: 'Revenue by Geography',
      dataSource: 'customer_locations',
      size: 'medium',
      metrics: ['revenue', 'customers']
    }
  ]
};
```

### Executive Dashboard Implementation

```javascript
class ExecutiveDashboard {
  constructor(config) {
    this.config = config;
    this.apiClient = new DashboardAPIClient();
    this.chartLibrary = new ChartManager();
    this.refreshTimer = null;
  }
  
  async initialize() {
    await this.loadInitialData();
    this.setupEventListeners();
    this.startAutoRefresh();
    this.initializeRealTimeUpdates();
  }
  
  async loadInitialData() {
    try {
      const data = await this.apiClient.fetchDashboardData(this.config.widgets);
      this.renderWidgets(data);
      this.setupDrilldowns();
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      this.showErrorState();
    }
  }
  
  renderWidgets(data) {
    this.config.widgets.forEach(widget => {
      const container = document.getElementById(`widget_${widget.id}`);
      const widgetRenderer = this.getWidgetRenderer(widget.type);
      
      widgetRenderer.render(container, widget, data[widget.id]);
    });
  }
  
  getWidgetRenderer(type) {
    const renderers = {
      metric_card: new MetricCardRenderer(),
      line_chart: new LineChartRenderer(),
      donut_chart: new DonutChartRenderer(),
      status_grid: new StatusGridRenderer(),
      world_map: new WorldMapRenderer()
    };
    
    return renderers[type] || new DefaultRenderer();
  }
  
  setupDrilldowns() {
    // Set up click handlers for detailed views
    document.querySelectorAll('[data-drilldown]').forEach(element => {
      element.addEventListener('click', (e) => {
        const drilldownType = e.target.dataset.drilldown;
        const drilldownParams = JSON.parse(e.target.dataset.drilldownParams);
        this.openDrilldown(drilldownType, drilldownParams);
      });
    });
  }
  
  openDrilldown(type, params) {
    const modal = new DrilldownModal(type, params);
    modal.show();
  }
}

// Metric Card Renderer
class MetricCardRenderer {
  render(container, config, data) {
    const trendIcon = config.trend === 'up' ? '↑' : '↓';
    const trendColor = config.trend === 'up' ? 'text-green-600' : 'text-red-600';
    const statusColor = config.status === 'above_target' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';
    
    // Clear container
    container.innerHTML = '';
    
    // Create main container
    const mainDiv = document.createElement('div');
    mainDiv.className = 'bg-white rounded-lg shadow p-6';
    
    // Create header section
    const headerDiv = document.createElement('div');
    headerDiv.className = 'flex items-center justify-between';
    
    // Create left section
    const leftDiv = document.createElement('div');
    
    const titleP = document.createElement('p');
    titleP.className = 'text-sm font-medium text-gray-600';
    titleP.textContent = config.title;
    leftDiv.appendChild(titleP);
    
    const valueP = document.createElement('p');
    valueP.className = 'text-2xl font-semibold text-gray-900';
    valueP.textContent = data.value;
    leftDiv.appendChild(valueP);
    
    // Create trend section
    const trendDiv = document.createElement('div');
    trendDiv.className = 'flex items-center mt-2';
    
    const trendSpan = document.createElement('span');
    trendSpan.className = `${trendColor} text-sm font-medium`;
    trendSpan.textContent = `${trendIcon} ${data.change}`;
    trendDiv.appendChild(trendSpan);
    
    const periodSpan = document.createElement('span');
    periodSpan.className = 'text-sm text-gray-500 ml-2';
    periodSpan.textContent = config.changePeriod;
    trendDiv.appendChild(periodSpan);
    
    leftDiv.appendChild(trendDiv);
    headerDiv.appendChild(leftDiv);
    
    // Create right section
    const rightDiv = document.createElement('div');
    rightDiv.className = 'flex flex-col items-end';
    
    if (config.target) {
      const statusSpan = document.createElement('span');
      statusSpan.className = `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}`;
      statusSpan.textContent = config.status === 'above_target' ? 'Above Target' : 'Below Target';
      rightDiv.appendChild(statusSpan);
    }
    
    const targetDiv = document.createElement('div');
    targetDiv.className = 'mt-2';
    
    const targetSpan = document.createElement('span');
    targetSpan.className = 'text-xs text-gray-500';
    targetSpan.textContent = `Target: ${config.target}${config.format === 'percentage' ? '%' : ''}`;
    targetDiv.appendChild(targetSpan);
    
    rightDiv.appendChild(targetDiv);
    headerDiv.appendChild(rightDiv);
    mainDiv.appendChild(headerDiv);
    container.appendChild(mainDiv);
  }
}
```

---

## Operations Dashboard

### Usage Monitoring Widget

```javascript
const operationsDashboardConfig = {
  layout: 'grid_3x3',
  refreshInterval: 5000, // 5 seconds for real-time
  widgets: [
    {
      id: 'real_time_usage',
      type: 'real_time_metrics',
      title: 'Real-Time Usage',
      metrics: [
        { name: 'Verify Operations', current: 1247, ratePerSecond: 0.21, dailyLimit: 15000 },
        { name: 'Sign Operations', current: 342, ratePerSecond: 0.06, dailyLimit: 1000 },
        { name: 'Storage Used', current: '2.4 TB', ratePerMinute: '15 MB', dailyLimit: '5 TB' }
      ],
      alerts: [
        { type: 'warning', message: 'Verify operations at 85% of daily limit' }
      ]
    },
    {
      id: 'system_health',
      type: 'health_grid',
      title: 'System Health',
      services: [
        { name: 'API Gateway', status: 'healthy', responseTime: '45ms', uptime: '99.99%' },
        { name: 'Verification Engine', status: 'healthy', responseTime: '120ms', uptime: '99.97%' },
        { name: 'Signing Service', status: 'degraded', responseTime: '340ms', uptime: '99.95%' },
        { name: 'Storage Layer', status: 'healthy', responseTime: '23ms', uptime: '99.99%' },
        { name: 'TSA Service', status: 'healthy', responseTime: '89ms', uptime: '99.98%' },
        { name: 'Billing Engine', status: 'healthy', responseTime: '156ms', uptime: '99.96%' }
      ]
    },
    {
      id: 'alert_center',
      type: 'alert_list',
      title: 'Active Alerts',
      maxItems: 10,
      severity: ['critical', 'warning', 'info'],
      filters: {
        timeRange: '24_hours',
        services: ['all']
      }
    },
    {
      id: 'usage_heatmap',
      type: 'heatmap',
      title: 'Usage Patterns (Last 24 Hours)',
      dataSource: 'usage_metrics',
      timeGranularity: 'hour',
      metrics: ['verifies', 'signs', 'storage']
    },
    {
      id: 'customer_usage_top',
      type: 'leaderboard',
      title: 'Top Customers by Usage',
      metric: 'total_operations',
      limit: 10,
      columns: ['customer', 'verifies', 'signs', 'storage', 'plan']
    },
    {
      id: 'overage_monitoring',
      type: 'overage_tracker',
      title: 'Overage Monitoring',
      thresholds: {
        warning: 0.8,
        critical: 0.95,
        exceeded: 1.0
      },
      customers: [
        { name: 'Acme Corp', usage: 0.87, status: 'warning', projectedOverage: '$2,340' },
        { name: 'Global Media', usage: 0.92, status: 'critical', projectedOverage: '$5,670' }
      ]
    }
  ]
};

// Real-time Usage Widget
class RealTimeUsageWidget {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.authToken = this.getAuthToken();
    this.webSocket = new WebSocket(`wss://api.c2concierge.com/realtime/usage?token=${this.authToken}`);
    this.setupWebSocket();
  }
  
  getAuthToken() {
    // Retrieve token from secure storage or session
    return sessionStorage.getItem('authToken') || localStorage.getItem('authToken') || '';
  }
  
  setupWebSocket() {
    this.webSocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.updateUsage(data);
    };
    
    this.webSocket.onopen = () => {
      console.log('Real-time usage connection established');
    };
    
    this.webSocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.showConnectionError();
    };
  }
  
  updateUsage(data) {
    this.config.metrics.forEach((metric, index) => {
      const metricElement = document.getElementById(`metric_${index}`);
      const currentUsage = data[metric.name.toLowerCase().replace(' ', '_')];
      const utilization = currentUsage / metric.dailyLimit;
      
      // Clear existing content
      while (metricElement.firstChild) {
        metricElement.removeChild(metricElement.firstChild);
      }
      
      // Create metric display with secure DOM manipulation
      const mainDiv = document.createElement('div');
      mainDiv.className = 'flex justify-between items-center';
      
      const leftDiv = document.createElement('div');
      
      const nameP = document.createElement('p');
      nameP.className = 'text-sm font-medium text-gray-600';
      nameP.textContent = metric.name;
      leftDiv.appendChild(nameP);
      
      const usageP = document.createElement('p');
      usageP.className = 'text-lg font-semibold text-gray-900';
      usageP.textContent = currentUsage.toLocaleString();
      leftDiv.appendChild(usageP);
      
      const rateP = document.createElement('p');
      rateP.className = 'text-xs text-gray-500';
      rateP.textContent = `${metric.ratePerSecond}/sec`;
      leftDiv.appendChild(rateP);
      
      const rightDiv = document.createElement('div');
      rightDiv.className = 'text-right';
            // Create utilization display
      const relativeDiv = document.createElement('div');
      relativeDiv.className = 'relative pt-1';
      
      const flexDiv = document.createElement('div');
      flexDiv.className = 'flex mb-2 items-center justify-between';
      
      const innerDiv = document.createElement('div');
      
      const utilizationSpan = document.createElement('span');
      utilizationSpan.className = `text-xs font-semibold inline-block ${this.getUtilizationColor(utilization)}`;
      utilizationSpan.textContent = `${Math.round(utilization * 100)}%`;
      innerDiv.appendChild(utilizationSpan);
      
      flexDiv.appendChild(innerDiv);
      relativeDiv.appendChild(flexDiv);
      
      const progressDiv = document.createElement('div');
      progressDiv.className = 'overflow-hidden h-2 mb-4 text-xs flex rounded bg-gray-200';
      
      const progressBar = document.createElement('div');
      progressBar.style.width = `${utilization * 100}%`;
      progressBar.className = `shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center ${this.getProgressBarColor(utilization)}`;
      progressDiv.appendChild(progressBar);
      
      relativeDiv.appendChild(progressDiv);
      rightDiv.appendChild(relativeDiv);
      
      mainDiv.appendChild(leftDiv);
      mainDiv.appendChild(rightDiv);
      metricElement.appendChild(mainDiv);
    });
  }
  
  getUtilizationColor(utilization) {
    if (utilization >= 0.95) return 'text-red-600';
    if (utilization >= 0.8) return 'text-yellow-600';
    return 'text-green-600';
  }
  
  getProgressBarColor(utilization) {
    if (utilization >= 0.95) return 'bg-red-500';
    if (utilization >= 0.8) return 'bg-yellow-500';
    return 'bg-green-500';
  }
}
```

---

## Finance Dashboard

### Gross Margin Analysis

```javascript
const financeDashboardConfig = {
  layout: 'grid_2x4',
  refreshInterval: 300000, // 5 minutes
  widgets: [
    {
      id: 'gross_margin_trend',
      type: 'trend_chart',
      title: 'Gross Margin Trend (90 Days)',
      dataSource: 'financial_metrics',
      metrics: ['gross_margin', 'target_margin'],
      timeRange: '90_days',
      format: 'percentage',
      targetLine: 70
    },
    {
      id: 'cogs_breakdown',
      type: 'stacked_area',
      title: 'COGS Breakdown',
      dataSource: 'cogs_metrics',
      components: ['compute', 'tsa', 'support', 'infrastructure'],
      format: 'currency',
      timeRange: '30_days'
    },
    {
      id: 'margin_by_plan',
      type: 'grouped_bar',
      title: 'Margin by Plan Type',
      dataSource: 'plan_metrics',
      plans: ['starter', 'growth', 'scale'],
      metrics: ['revenue', 'cogs', 'margin'],
      format: 'currency'
    },
    {
      id: 'unit_economics',
      type: 'table',
      title: 'Unit Economics',
      columns: [
        { key: 'metric', label: 'Metric' },
        { key: 'starter', label: 'Starter', format: 'currency' },
        { key: 'growth', label: 'Growth', format: 'currency' },
        { key: 'scale', label: 'Scale', format: 'currency' }
      ],
      data: [
        { metric: 'ARPU', starter: 199, growth: 699, scale: 2000 },
        { metric: 'COGS per Customer', starter: 59, growth: 209, scale: 600 },
        { metric: 'Gross Margin per Customer', starter: 140, growth: 490, scale: 1400 },
        { metric: 'LTV (12 months)', starter: 1680, growth: 5880, scale: 16800 }
      ]
    },
    {
      id: 'revenue_recognition',
      type: 'waterfall',
      title: 'Monthly Revenue Recognition',
      dataSource: 'revenue_recognition',
      components: [
        'starting_revenue',
        'new_customers',
        'expansion',
        'contraction',
        'churn',
        'ending_revenue'
      ]
    },
    {
      id: 'forecast_vs_actual',
      type: 'variance_chart',
      title: 'Forecast vs Actual Revenue',
      dataSource: 'revenue_forecast',
      timeRange: '6_months',
      metrics: ['forecast', 'actual', 'variance']
    }
  ]
};

// Gross Margin Analysis Widget
class GrossMarginAnalysisWidget {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.chart = null;
  }
  
  async render() {
    const data = await this.fetchMarginData();
    this.createChart(data);
    this.setupInteractions();
  }
  
  createChart(data) {
    const ctx = document.getElementById('margin_chart').getContext('2d');
    
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.dates,
        datasets: [
          {
            label: 'Actual Gross Margin',
            data: data.actualMargin,
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.4
          },
          {
            label: 'Target Margin (70%)',
            data: data.targetMargin,
            borderColor: 'rgb(239, 68, 68)',
            borderDash: [5, 5],
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: false,
            min: 60,
            max: 80,
            ticks: {
              callback: function(value) {
                return value + '%';
              }
            }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function(context) {
                return context.dataset.label + ': ' + context.parsed.y.toFixed(1) + '%';
              }
            }
          }
        }
      }
    });
  }
  
  setupInteractions() {
    // Add drilldown for detailed margin analysis
    this.chart.options.onClick = (event, elements) => {
      if (elements.length > 0) {
        const index = elements[0].index;
        const date = data.dates[index];
        this.openMarginDrilldown(date);
      }
    };
  }
  
  openMarginDrilldown(date) {
    const modal = new MarginDrilldownModal(date);
    modal.show();
  }
}
```

---

## Customer Success Dashboard

### Retention and Churn Monitoring

```javascript
const customerSuccessDashboardConfig = {
  layout: 'grid_3x3',
  refreshInterval: 60000, // 1 minute
  widgets: [
    {
      id: 'retention_cohorts',
      type: 'cohort_heatmap',
      title: 'Customer Retention Cohorts',
      dataSource: 'retention_analysis',
      cohortPeriod: 'weekly',
      retentionPeriods: [7, 14, 30, 60, 90],
      colorScale: 'green_to_red'
    },
    {
      id: 'churn_risk',
      type: 'risk_list',
      title: 'High Churn Risk Customers',
      riskThreshold: 0.7,
      maxItems: 20,
      columns: ['customer', 'risk_score', 'risk_factors', 'last_activity', 'recommended_action']
    },
    {
      id: 'expansion_opportunities',
      type: 'opportunity_list',
      title: 'Expansion Opportunities',
      opportunityScore: 0.6,
      maxItems: 15,
      columns: ['customer', 'current_plan', 'usage_trend', 'opportunity_type', 'potential_revenue']
    },
    {
      id: 'health_scores',
      type: 'health_distribution',
      title: 'Customer Health Distribution',
      categories: ['green', 'yellow', 'red'],
      thresholds: { green: 80, yellow: 60, red: 0 }
    },
    {
      id: 'nps_trends',
      type: 'trend_chart',
      title: 'NPS Trends',
      dataSource: 'customer_surveys',
      timeRange: '90_days',
      metrics: ['nps_score', 'response_rate']
    },
    {
      id: 'support_tickets',
      type: 'ticket_analysis',
      title: 'Support Ticket Analysis',
      dataSource: 'zendesk',
      timeRange: '30_days',
      breakdown: ['priority', 'category', 'resolution_time']
    }
  ]
};

// Churn Risk Prediction Widget
class ChurnRiskWidget {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.riskModel = new ChurnRiskModel();
  }
  
  async render() {
    const atRiskCustomers = await this.getAtRiskCustomers();
    this.renderRiskList(atRiskCustomers);
    this.setupRiskActions();
  }
  
  renderRiskList(customers) {
    const listContainer = document.getElementById('risk_list');
    
    // Clear existing content
    while (listContainer.firstChild) {
      listContainer.removeChild(listContainer.firstChild);
    }
    
    // Create customer risk items with secure DOM manipulation
    customers.forEach(customer => {
      const customerDiv = document.createElement('div');
      customerDiv.className = `border-l-4 ${this.getRiskBorderColor(customer.risk_score)} bg-white p-4 mb-2`;
      
      const flexDiv = document.createElement('div');
      flexDiv.className = 'flex justify-between items-start';
      
      const leftDiv = document.createElement('div');
      leftDiv.className = 'flex-1';
      
      const headerDiv = document.createElement('div');
      headerDiv.className = 'flex items-center';
      
      const nameH4 = document.createElement('h4');
      nameH4.className = 'text-sm font-medium text-gray-900';
      nameH4.textContent = customer.name;
      headerDiv.appendChild(nameH4);
      
      const riskSpan = document.createElement('span');
      riskSpan.className = `ml-2 px-2 py-1 text-xs rounded-full ${this.getRiskBadgeColor(customer.risk_score)}`;
      riskSpan.textContent = `${Math.round(customer.risk_score * 100)}% risk`;
      headerDiv.appendChild(riskSpan);
      
      leftDiv.appendChild(headerDiv);
      
      const planP = document.createElement('p');
      planP.className = 'text-sm text-gray-600 mt-1';
      planP.textContent = `${customer.plan} • ${customer.industry}`;
      leftDiv.appendChild(planP);
            // Add risk factors
      if (customer.risk_factors && Array.isArray(customer.risk_factors)) {
        const factorsDiv = document.createElement('div');
        factorsDiv.className = 'mt-2';
        
        const flexDiv = document.createElement('div');
        flexDiv.className = 'flex flex-wrap gap-1';
        
        customer.risk_factors.forEach(factor => {
          const factorSpan = document.createElement('span');
          factorSpan.className = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800';
          factorSpan.textContent = factor;
          flexDiv.appendChild(factorSpan);
        });
        
        factorsDiv.appendChild(flexDiv);
        leftDiv.appendChild(factorsDiv);
      }
      
      flexDiv.appendChild(leftDiv);
      
      // Add right section with action button
      const rightDiv = document.createElement('div');
      rightDiv.className = 'ml-4 text-right';
      
      const lastActivityP = document.createElement('p');
      lastActivityP.className = 'text-xs text-gray-500';
      lastActivityP.textContent = 'Last activity';
      rightDiv.appendChild(lastActivityP);
      
      const activityP = document.createElement('p');
      activityP.className = 'text-sm font-medium text-gray-900';
      activityP.textContent = this.formatLastActivity(customer.last_activity);
      rightDiv.appendChild(activityP);
      
      const actionButton = document.createElement('button');
      actionButton.className = 'mt-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700';
      actionButton.textContent = 'Take Action';
      actionButton.addEventListener('click', () => this.initiateIntervention(customer.id));
      rightDiv.appendChild(actionButton);
      
      flexDiv.appendChild(rightDiv);
      customerDiv.appendChild(flexDiv);
      listContainer.appendChild(customerDiv);
    });
  }
  
  getRiskBorderColor(riskScore) {
    if (riskScore >= 0.8) return 'border-red-500';
    if (riskScore >= 0.6) return 'border-yellow-500';
    return 'border-green-500';
  }
  
  getRiskBadgeColor(riskScore) {
    if (riskScore >= 0.8) return 'bg-red-100 text-red-800';
    if (riskScore >= 0.6) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  }
  
  setupRiskActions() {
    // Set up intervention workflows
    document.querySelectorAll('[data-action="intervention"]').forEach(button => {
      button.addEventListener('click', (e) => {
        const customerId = e.target.dataset.customerId;
        this.openInterventionModal(customerId);
      });
    });
  }
  
  openInterventionModal(customerId) {
    const modal = new InterventionModal(customerId);
    modal.show();
  }
}
```

---

## Experiment Dashboard

### A/B Test Results Visualization

```javascript
const experimentDashboardConfig = {
  layout: 'grid_2x3',
  refreshInterval: 120000, // 2 minutes
  widgets: [
    {
      id: 'experiment_overview',
      type: 'experiment_grid',
      title: 'Active Experiments',
      experiments: [
        {
          id: 'caps_experiment',
          name: 'Usage Caps Experiment',
          status: 'running',
          startDate: '2025-10-01',
          endDate: '2025-11-30',
          primaryMetric: 'gross_margin',
          lift: '+5.2%',
          confidence: '95%',
          sampleSize: 2847
        },
        {
          id: 'bundle_experiment',
          name: 'Bundle Pricing Experiment',
          status: 'running',
          startDate: '2025-10-15',
          endDate: '2025-12-15',
          primaryMetric: 'conversion_rate',
          lift: '+3.1%',
          confidence: '87%',
          sampleSize: 1523
        }
      ]
    },
    {
      id: 'statistical_power',
      type: 'power_analysis',
      title: 'Statistical Power Analysis',
      experiments: ['caps_experiment', 'bundle_experiment'],
      metrics: ['power', 'mde', 'sample_size_required']
    },
    {
      id: 'cohort_performance',
      type: 'cohort_comparison',
      title: 'Cohort Performance Comparison',
      experiments: ['caps_experiment'],
      cohorts: ['control', 'variant_a', 'variant_b'],
      metrics: ['gross_margin', 'conversion_rate', 'retention_90_day']
    },
    {
      id: 'sequential_analysis',
      type: 'sequential_chart',
      title: 'Sequential Analysis',
      experiments: ['caps_experiment'],
      boundaries: ['upper', 'lower'],
      current_position: 'continuing'
    }
  ]
};

// Experiment Results Widget
class ExperimentResultsWidget {
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.optimizelyClient = new OptimizelyClient();
  }
  
  async render() {
    const experimentData = await this.fetchExperimentData();
    this.renderExperimentGrid(experimentData);
    this.setupExperimentInteractions();
  }
  
  renderExperimentGrid(experiments) {
    const gridContainer = document.getElementById('experiment_grid');
    
    // Clear existing content
    while (gridContainer.firstChild) {
      gridContainer.removeChild(gridContainer.firstChild);
    }
    
    // Create experiment cards with secure DOM manipulation
    experiments.forEach(experiment => {
      const experimentDiv = document.createElement('div');
      experimentDiv.className = 'bg-white rounded-lg shadow p-6 mb-4';
      
      const headerDiv = document.createElement('div');
      headerDiv.className = 'flex justify-between items-start mb-4';
      
      const leftDiv = document.createElement('div');
      
      const nameH3 = document.createElement('h3');
      nameH3.className = 'text-lg font-medium text-gray-900';
      nameH3.textContent = experiment.name;
      leftDiv.appendChild(nameH3);
      
      const dateP = document.createElement('p');
      dateP.className = 'text-sm text-gray-600';
      dateP.textContent = `Started: ${this.formatDate(experiment.startDate)}`;
      leftDiv.appendChild(dateP);
      
      headerDiv.appendChild(leftDiv);
      
      const statusSpan = document.createElement('span');
      statusSpan.className = `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${this.getStatusColor(experiment.status)}`;
      statusSpan.textContent = experiment.status;
      headerDiv.appendChild(statusSpan);
      
      experimentDiv.appendChild(headerDiv);
        
      // Add metrics grid
      const metricsGrid = document.createElement('div');
      metricsGrid.className = 'grid grid-cols-2 md:grid-cols-4 gap-4 mb-4';
      
      // Primary metric
      const primaryMetricDiv = document.createElement('div');
      const primaryMetricLabel = document.createElement('p');
      primaryMetricLabel.className = 'text-sm font-medium text-gray-600';
      primaryMetricLabel.textContent = 'Primary Metric';
      primaryMetricDiv.appendChild(primaryMetricLabel);
      
      const primaryMetricValue = document.createElement('p');
      primaryMetricValue.className = 'text-lg font-semibold text-gray-900';
      primaryMetricValue.textContent = this.formatMetric(experiment.primaryMetric);
      primaryMetricDiv.appendChild(primaryMetricValue);
      metricsGrid.appendChild(primaryMetricDiv);
      
      // Lift
      const liftDiv = document.createElement('div');
      const liftLabel = document.createElement('p');
      liftLabel.className = 'text-sm font-medium text-gray-600';
      liftLabel.textContent = 'Lift';
      liftDiv.appendChild(liftLabel);
      
      const liftValue = document.createElement('p');
      liftValue.className = `text-lg font-semibold ${experiment.lift > 0 ? 'text-green-600' : 'text-red-600'}`;
      liftValue.textContent = `${experiment.lift > 0 ? '+' : ''}${experiment.lift}`;
      liftDiv.appendChild(liftValue);
      metricsGrid.appendChild(liftDiv);
      
      // Confidence
      const confidenceDiv = document.createElement('div');
      const confidenceLabel = document.createElement('p');
      confidenceLabel.className = 'text-sm font-medium text-gray-600';
      confidenceLabel.textContent = 'Confidence';
      confidenceDiv.appendChild(confidenceLabel);
      
      const confidenceValue = document.createElement('p');
      confidenceValue.className = 'text-lg font-semibold text-gray-900';
      confidenceValue.textContent = experiment.confidence;
      confidenceDiv.appendChild(confidenceValue);
      metricsGrid.appendChild(confidenceDiv);
      
      // Sample size
      const sampleSizeDiv = document.createElement('div');
      const sampleSizeLabel = document.createElement('p');
      sampleSizeLabel.className = 'text-sm font-medium text-gray-600';
      sampleSizeLabel.textContent = 'Sample Size';
      sampleSizeDiv.appendChild(sampleSizeLabel);
      
      const sampleSizeValue = document.createElement('p');
      sampleSizeValue.className = 'text-lg font-semibold text-gray-900';
      sampleSizeValue.textContent = experiment.sampleSize.toLocaleString();
      sampleSizeDiv.appendChild(sampleSizeValue);
      metricsGrid.appendChild(sampleSizeDiv);
      
      experimentDiv.appendChild(metricsGrid);
      
      // Add action buttons
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'flex justify-between items-center';
      
      const buttonContainer = document.createElement('div');
      buttonContainer.className = 'flex space-x-2';
      
      const detailsButton = document.createElement('button');
      detailsButton.className = 'px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700';
      detailsButton.textContent = 'View Details';
      detailsButton.addEventListener('click', () => this.viewExperimentDetails(experiment.id));
      buttonContainer.appendChild(detailsButton);
      
      const downloadButton = document.createElement('button');
      downloadButton.className = 'px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700';
      downloadButton.textContent = 'Download Data';
      downloadButton.addEventListener('click', () => this.downloadExperimentData(experiment.id));
      buttonContainer.appendChild(downloadButton);
      
      actionsDiv.appendChild(buttonContainer);
      
      if (experiment.status === 'running') {
        const stopButton = document.createElement('button');
        stopButton.className = 'px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700';
        stopButton.textContent = 'Stop Experiment';
        stopButton.addEventListener('click', () => this.stopExperiment(experiment.id));
        actionsDiv.appendChild(stopButton);
      }
      
      experimentDiv.appendChild(actionsDiv);
      
      gridContainer.appendChild(experimentDiv);
    });
  }
  
  getStatusColor(status) {
    const colors = {
      running: 'bg-green-100 text-green-800',
      completed: 'bg-blue-100 text-blue-800',
      paused: 'bg-yellow-100 text-yellow-800',
      failed: 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  }
}
```

---

## Real-Time Data Integration

### WebSocket Implementation

```javascript
class RealTimeDashboardIntegration {
  constructor() {
    this.connections = new Map();
    this.reconnectAttempts = new Map();
    this.maxReconnectAttempts = 5;
    this.authToken = this.getAuthToken();
  }
  
  getAuthToken() {
    // Retrieve token from secure storage or session
    return sessionStorage.getItem('authToken') || localStorage.getItem('authToken') || '';
  }
  
  connectToDataSource(source, callback) {
    const wsUrl = this.getWebSocketUrl(source);
    const ws = new WebSocket(`${wsUrl}?token=${this.authToken}`);
    
    ws.onopen = () => {
      console.log(`Connected to ${source}`);
      this.reconnectAttempts.set(source, 0);
      this.connections.set(source, ws);
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      callback(data);
    };
    
    ws.onerror = (error) => {
      console.error(`WebSocket error for ${source}:`, error.message);
      this.handleReconnection(source, callback);
    };
    
    ws.onclose = () => {
      console.log(`Disconnected from ${source}`);
      this.handleReconnection(source, callback);
    };
  }
  
  handleReconnection(source, callback) {
    const attempts = this.reconnectAttempts.get(source) || 0;
    
    if (attempts < this.maxReconnectAttempts) {
      this.reconnectAttempts.set(source, attempts + 1);
      
      const delay = Math.pow(2, attempts) * 1000; // Exponential backoff
      setTimeout(() => {
        console.log(`Attempting to reconnect to ${source} (attempt ${attempts + 1})`);
        this.connectToDataSource(source, callback);
      }, delay);
    } else {
      console.error(`Max reconnection attempts reached for ${source}`);
      this.showConnectionError(source);
    }
  }
  
  getWebSocketUrl(source) {
    const urls = {
      usage_metrics: 'wss://api.c2concierge.com/realtime/usage',
      billing_events: 'wss://api.c2concierge.com/realtime/billing',
      customer_events: 'wss://api.c2concierge.com/realtime/customers',
      system_health: 'wss://api.c2concierge.com/realtime/health'
    };
    
    return urls[source] || urls.usage_metrics;
  }
}
```

---

## Mobile Dashboard

### Responsive Design

```javascript
const mobileDashboardConfig = {
  layout: 'mobile_stack',
  refreshInterval: 60000, // 1 minute to conserve battery
  widgets: [
    {
      id: 'mobile_kpis',
      type: 'mobile_metric_cards',
      title: 'Key Metrics',
      metrics: ['revenue', 'margin', 'customers', 'conversion'],
      size: 'compact'
    },
    {
      id: 'mobile_alerts',
      type: 'mobile_alert_list',
      title: 'Critical Alerts',
      maxItems: 5,
      severity: ['critical', 'warning']
    },
    {
      id: 'mobile_usage',
      type: 'mobile_usage_chart',
      title: 'Today\'s Usage',
      timeRange: '24_hours'
    }
  ]
};

// Mobile-optimized rendering
class MobileDashboardRenderer {
  render(container, config, data) {
    container.className = 'mobile-dashboard p-4 bg-gray-50';
    
    config.widgets.forEach(widget => {
      const widgetContainer = document.createElement('div');
      widgetContainer.className = 'mobile-widget bg-white rounded-lg shadow-sm p-4 mb-4';
      
      const mobileRenderer = this.getMobileRenderer(widget.type);
      mobileRenderer.render(widgetContainer, widget, data[widget.id]);
      
      container.appendChild(widgetContainer);
    });
  }
  
  getMobileRenderer(type) {
    return {
      mobile_metric_cards: new MobileMetricCardsRenderer(),
      mobile_alert_list: new MobileAlertListRenderer(),
      mobile_usage_chart: new MobileUsageChartRenderer()
    }[type] || new DefaultMobileRenderer();
  }
}
```

---

*Last Updated: November 5, 2025*  
**Technology Stack**: React + Chart.js + WebSocket + GraphQL API  
**Deployment**: Cloudflare Workers for edge performance  
**Monitoring**: Real-time health checks and automated failover
