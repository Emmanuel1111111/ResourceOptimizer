import { Component, OnInit } from '@angular/core';
import { Chart, ChartConfiguration, ChartType } from 'chart.js';
import { AuthService } from '../service.service';

@Component({
  selector: 'app-ai-insights',
  templateUrl: './ai-insights.component.html',
  styleUrls: ['./ai-insights.component.css']
})
export class AiInsightsComponent implements OnInit {
  // Form inputs
  roomId: string = '';
  period: number = 7;
  
  // UI state
  selectedTab: number = 0;
  error: string = '';
  loading: boolean = false;
  

  predictions: any[] = [];
  current_results: any[] = [];
  

  private charts: { [key: string]: Chart } = {};

  constructor(private service: AuthService) {} 
  ngOnInit(): void {
   
  }

  fetchInsights(): void {
    this.error = '';
    this.loading = true;
    this.current_results = [];
    this.predictions = [];


    this.service.predictUtilization(this.roomId, this.period)
      .subscribe({
        next: (response: any) => {
          console.log('Predictions Response:', response);
          
      
          if (response.predictions && Array.isArray(response.predictions)) {
            this.predictions = response.predictions;
          } else {
       
            this.predictions = [response.predictions || response];
          }
          
    
          if (this.selectedTab === 1) {
            setTimeout(() => this.renderCharts(), 100);
          }
          
          this.loading = false;
        },
        error: (err) => {
          this.error = err.error?.message || 'Failed to fetch predictions.';
          this.loading = false;
          console.error('Predictions Error:', err);
        }
      });


    this.service.currentUtilization(this.roomId)
      .subscribe({
        next: (response: any) => {
          console.log('Current Utilization Response:', response);
          
        
          if (response.results && Array.isArray(response.results)) {
            this.current_results = response.results;
            console.log( 'Ai Insights',this.current_results);
            
          } else if (response.results) {
           
            this.current_results = [response.results];
            console.log('Ai insights:', this.current_results);
            
          } else {
     
            this.current_results = [response];
          }
          
          this.loading = false;
        },
        error: (error) => {
          this.error = error.error?.message || 'Failed to fetch current utilization.';
          this.loading = false;
          console.error('Current Utilization Error:', error);
        }
      });
  }

  switchTab(tabIndex: number): void {
    this.selectedTab = tabIndex;
    

    if (tabIndex === 1 && this.predictions.length > 0) {
      setTimeout(() => this.renderCharts(), 100);
    }
  }


  renderCharts(): void {
    this.predictions.forEach((pred) => {
      const chartId = `chart-${pred.room_id}`;
      const canvas = document.getElementById(chartId) as HTMLCanvasElement;
      
      if (!canvas) {
        console.warn(`Chart canvas not found: ${chartId}`);
        return;
      }


      if (this.charts[chartId]) {
        this.charts[chartId].destroy();
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const gradient = ctx.createLinearGradient(0, 0, 0, 300);
      gradient.addColorStop(0, 'rgba(102, 126, 234, 0.8)');
      gradient.addColorStop(1, 'rgba(102, 126, 234, 0.1)');

      const chartConfig: ChartConfiguration = {
        type: 'line' as ChartType,
        data: {
          labels: pred.dates?.map((date: string) => {
        
            return new Date(date).toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric' 
            });
          }) || [],
          datasets: [{
            label: 'Predicted Utilization %',
            data: pred.utilization || [],
            borderColor: '#667eea',
            backgroundColor: gradient,
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#667eea',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: {
                font: {
                  family: 'Poppins',
                  size: 12,
                  weight: 500
                },
                color: '#555'
              }
            },
            tooltip: {
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              titleColor: '#333',
              bodyColor: '#666',
              borderColor: '#667eea',
              borderWidth: 1,
              cornerRadius: 8,
              displayColors: false,
              callbacks: {
                title: (context) => {
                  const index = context[0].dataIndex;
                  return `${pred.dates[index]} - ${pred.demand_levels[index]} Demand`;
                },
                label: (context) => {
                  return `Utilization: ${context.parsed.y.toFixed(1)}%`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: {
                display: false
              },
              ticks: {
                font: {
                  family: 'Poppins',
                  size: 11
                },
                color: '#666'
              }
            },
            y: {
              beginAtZero: true,
              max: 100,
              grid: {
                color: 'rgba(0, 0, 0, 0.05)'
              },
              ticks: {
                callback: (value) => `${value}%`,
                font: {
                  family: 'Poppins',
                  size: 11
                },
                color: '#666'
              }
            }
          },
          elements: {
            point: {
              hoverBackgroundColor: '#667eea',
              hoverBorderColor: '#ffffff'
            }
          }
        }
      };

      this.charts[chartId] = new Chart(ctx, chartConfig);
    });
  }


  getStatusClass(status: string): string {
    const statusLower = status?.toLowerCase() || '';
    if (statusLower.includes('optimal')) return 'optimal';
    if (statusLower.includes('over')) return 'over-utilized';
    if (statusLower.includes('under')) return 'under-utilized';
    return 'under-utilized'; 
  }

  getDemandClass(demand: string): string {
    const demandLower = demand?.toLowerCase() || '';
    if (demandLower === 'low') return 'low';
    if (demandLower === 'medium') return 'medium';
    if (demandLower === 'high') return 'high';
    return 'low'; 
  }


  clearInsights(): void {
    this.current_results = [];
    this.predictions = [];
    this.error = '';
    
      Object.values(this.charts).forEach(chart => chart.destroy());
    this.charts = {};
  }

 
  getTooltip(demandLevels: string[]): string {
    const demandCount = demandLevels.reduce((acc, level) => {
      acc[level.toLowerCase()] = (acc[level.toLowerCase()] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    return `Demand Distribution: ${Object.entries(demandCount)
      .map(([level, count]) => `${level}: ${count} days`)
      .join(', ')}`;
  }

  hasCurrentData(): boolean {
    return this.current_results && this.current_results.length > 0;
  }

  hasPredictionData(): boolean {
    return this.predictions && this.predictions.length > 0;
  }

  
  getUtilizationColor(utilization: number): string {
    if (utilization >= 70) return '#f44336'; 
    if (utilization >= 30) return '#4caf50'; 
    return '#ff9800'; 
  }

  
  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  }

 
  getTrendIcon(trend: string): string {
    const trendLower = trend?.toLowerCase() || '';
    if (trendLower.includes('increasing')) return 'bi-arrow-up';
    if (trendLower.includes('decreasing')) return 'bi-arrow-down';
    return 'bi-arrow-right';
  }


  getRecommendationPriority(tip: string): 'high' | 'medium' | 'low' {
    const tipLower = tip?.toLowerCase() || '';
    if (tipLower.includes('urgent') || tipLower.includes('critical')) return 'high';
    if (tipLower.includes('consider') || tipLower.includes('recommended')) return 'medium';
    return 'low';
  }



  getMaxUtilization(utilization: number[]): number {
  if (!utilization || utilization.length === 0) return 0;
  return Math.max(...utilization);
}

// Get minimum utilization from array
getMinUtilization(utilization: number[]): number {
  if (!utilization || utilization.length === 0) return 0;
  return Math.min(...utilization);
}

// Count demand levels of specific type
getDemandCount(demandLevels: string[], targetLevel: string): number {
  if (!demandLevels || !Array.isArray(demandLevels)) return 0;
  return demandLevels.filter(level => {
    const match = level.toLowerCase() === targetLevel.toLowerCase();
    console.log(`Counting demand level: ${level}, found: ${targetLevel}`);
    return match;
  }).length;
}

// Get count of high demand days (combining High, Very High, Critical)
getHighDemandCount(demandLevels: string[]): number {
  if (!demandLevels || !Array.isArray(demandLevels)) return 0;
  const highDemandTypes = ['high', 'very high', 'critical'];
  return demandLevels.filter(level => 
    highDemandTypes.includes(level.toLowerCase()),
   
    
  ).length

}

// Get CSS class for demand badge
getDemandBadgeClass(demand: string): string {
  if (!demand) return 'badge-secondary';
  
  const demandLower = demand.toLowerCase();
  switch (demandLower) {
    case 'low':
      return 'badge-success';
    case 'moderate':
    case 'medium':
      return 'badge-warning';
    case 'high':
    case 'very high':
      return 'badge-danger';
    case 'critical':
      return 'badge-dark';
    default:
      return 'badge-secondary';
  }
}
}