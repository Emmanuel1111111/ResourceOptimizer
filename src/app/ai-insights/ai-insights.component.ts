import { Component } from '@angular/core';
import { AfterViewInit } from '@angular/core';
import Chart from 'chart.js/auto';
@Component({
  selector: 'app-ai-insights',
  templateUrl: './ai-insights.component.html',
  styleUrl: './ai-insights.component.css'
})
export class AiInsightsComponent implements AfterViewInit {

  ngAfterViewInit() {
    const ctx = document.getElementById('demandChart') as HTMLCanvasElement;
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Mon 9-12', 'Tue 9-12', 'Wed 9-12'],
        datasets: [{
          label: 'Predicted Demand (Classroom A)',
          data: [80, 50, 30],
          backgroundColor: ['#007bff', '#28a745', '#dc3545']
        }]
      }
    });
  }

  constructor(){
    
  }
}

