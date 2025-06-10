import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { AuthService } from '../service.service';
import { AnalysisResult, Prediction } from '../../Environ';
import { faFontAwesome } from '@fortawesome/free-solid-svg-icons';
Chart.register(...registerables);

@Component({
  selector: 'app-ai-insights',
  templateUrl: './ai-insights.component.html',
  styleUrls: ['./ai-insights.component.scss']
})
export class AiInsightsComponent implements OnInit {
  roomId: string = 'MVBA-GF1';
  period: number = 7;
  days: number = 7;
  predictions: Prediction[]=[]
  current_results: any[] = [];
  error: string = '';
  charts: { [key: string]: Chart } = {};
  selectedTab: number = 0;

  constructor(private http: HttpClient, public router: Router, private service:AuthService) {}

  ngOnInit(): void {}

  fetchInsights(): void {
    this.error = '';
    this.current_results = [];
    this.predictions = [];

    // Fetch current utilization
  

    // Fetch predictions
    this.service.predictUtilization(this.roomId,this.period)
      .subscribe({
        next: (response: any) => {
          this.predictions = response.predictions
          console.log(this.roomId, this.current_results);
          console.log(this.predictions);
          if (this.selectedTab === 1) {
            setTimeout(() => this.renderCharts(), 100);
            this.getTooltip(response.demand_levels)
          }
        },
        error: (err) => {
          this.error = err.error?.message || 'Failed to fetch predictions.';
        
          
          
        }
      });

     this.service.currentUtilization(this.roomId, this.days)
     .subscribe(
      (results: AnalysisResult[]) => {
        this.current_results = results; // Assign the results array directly
        this.renderCharts();
      },
      (err) => {
        this.error = err.error?.message || 'Failed to fetch current utilization.';
        console.log('Results', this.current_results);
        
      }
    );


  }

   getStatusClass(status: string): string {
    switch (status.toLowerCase()) {
      case 'over-utilized':
        return 'status-over';
      case 'under-utilized':
        return 'status-under';
      case 'optimal':
        return 'status-optimal';
      default:
        return 'status-default';
    }
  }

  clearInsights(): void {
    this.roomId = 'MVBA-GF1';
    this.period = 7;
    this.days = 7;
    this.predictions = [];
    this.current_results = [];
    this.error = '';
    Object.values(this.charts).forEach(chart => chart.destroy());
    this.charts = {};
  }

  switchTab(tabIndex: number): void {
    this.selectedTab = tabIndex;
    if (tabIndex === 1) {
      setTimeout(() => this.renderCharts(), 100);
    }
  }

  renderCharts(): void {
    Object.values(this.charts).forEach(chart => chart.destroy());
    this.charts = {};

    this.predictions.forEach(pred => {
      const ctx = document.getElementById(`chart-${pred.room_id}`) as HTMLCanvasElement;
      if (ctx) {
        this.charts[pred.room_id] = new Chart(ctx, {
          type: 'line',
          data: {
            labels: pred.dates.map((date: string) => date.split('-').slice(1).join('/')),
            datasets: [{
              label: 'Predicted Utilization (%)',
              data: pred.utilization,
              borderColor: '#4361ee',
              backgroundColor: 'rgba(67, 97, 238, 0.1)',
              borderWidth: 3,
              fill: true,
              tension: 0.4,
              pointBackgroundColor: '#4361ee',
              pointBorderColor: '#ffffff',
              pointBorderWidth: 2,
              pointRadius: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true,
                max: 100,
                title: { display: true, text: 'Utilization (%)' }
              },
              x: { title: { display: true, text: 'Date' } }
            }
          }
        });
      }
    });
  }

  getTooltip(demandLevel: string): string {
    switch (demandLevel) {
      case 'Critical': return 'Immediate action required: High risk of overbooking.';
      case 'Very High': return 'High demand: Consider block bookings or overflow rooms.';
      case 'High': return 'Elevated demand: Monitor closely and adjust schedules.';
      case 'Moderate': return 'Normal demand: Standard scheduling applies.';
      case 'Low': return 'Low demand: Suitable for maintenance or flexible bookings.';
      default: return 'No specific action required.';
    }
  }

  

  getDemandClass(demand: string): string {
    return demand.toLowerCase();
  }
}