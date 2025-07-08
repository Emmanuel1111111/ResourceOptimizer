import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  type ElementRef,
  ViewChild,
} from "@angular/core"
import { Chart, type ChartConfiguration, type ChartType } from "chart.js"
import  { AuthService } from "../service.service"
import { Subject, fromEvent } from "rxjs"
import { takeUntil, debounceTime, distinctUntilChanged } from "rxjs/operators"

@Component({
  selector: "app-ai-insights",
  templateUrl: "./ai-insights.component.html",
  styleUrls: ["./ai-insights.component.css"],
})
export class AiInsightsComponent implements OnInit, OnDestroy {
  @ViewChild("searchInput", { static: false }) searchInput!: ElementRef

  private destroy$ = new Subject<void>()

  // Form inputs
  roomId = ""
  period = 7

  // UI state
  selectedTab = 0
  error = ""
  loading = false
  isDarkMode = false
  searchFocused = false

  // Animation states
  cardAnimationDelay = 0
  showMetrics = false

  // Data
  predictions: any[] = []
  current_results: any[] = []

  // Charts
  private charts: { [key: string]: Chart } = {}

  // Search suggestions (mock data - replace with real suggestions)
  searchSuggestions: string[] = ["SCB-SF1", "MVBA-GF1", "LIB-201", "ENG-301"]
  filteredSuggestions: string[] = []
  showSuggestions = false

  constructor(
    private service: AuthService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.setupSearchDebounce()
    this.initializeAnimations()
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
    Object.values(this.charts).forEach((chart) => chart.destroy())
  }

  private setupSearchDebounce(): void {
    // Setup debounced search after view init
    setTimeout(() => {
      if (this.searchInput) {
        fromEvent(this.searchInput.nativeElement, "input")
          .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
          .subscribe(() => {
            this.filterSuggestions()
          })
      }
    })
  }

  private initializeAnimations(): void {
    // Stagger card animations
    setTimeout(() => {
      this.showMetrics = true
      this.cdr.detectChanges()
    }, 500)
  }

  filterSuggestions(): void {
    if (this.roomId.length > 0) {
      this.filteredSuggestions = this.searchSuggestions.filter((suggestion) =>
        suggestion.toLowerCase().includes(this.roomId.toLowerCase()),
      )
      this.showSuggestions = this.filteredSuggestions.length > 0
    } else {
      this.showSuggestions = false
    }
  }

  selectSuggestion(suggestion: string): void {
    this.roomId = suggestion
    this.showSuggestions = false
    this.fetchInsights()
  }

  onSearchFocus(): void {
    this.searchFocused = true
    this.filterSuggestions()
  }

  onSearchBlur(): void {
    // Delay to allow suggestion click
    setTimeout(() => {
      this.searchFocused = false
      this.showSuggestions = false
    }, 200)
  }

  fetchInsights(): void {
    this.error = ""
    this.loading = true
    this.current_results = []
    this.predictions = []
    this.cardAnimationDelay = 0

    // Add loading animation
    this.showMetrics = false

    this.service.predictUtilization(this.roomId, this.period).subscribe({
      next: (response: any) => {
        console.log("Predictions Response:", response)

        if (response.predictions && Array.isArray(response.predictions)) {
          this.predictions = response.predictions
        } else {
          this.predictions = [response.predictions || response]
        }

        if (this.selectedTab === 1) {
          setTimeout(() => this.renderCharts(), 100)
        }

        this.loading = false
        this.initializeAnimations()
      },
      error: (err) => {
        this.error = err.error?.message || "Failed to fetch predictions."
        this.loading = false
        console.error("Predictions Error:", err)
      },
    })

    this.service.currentUtilization(this.roomId).subscribe({
      next: (response: any) => {
        console.log("Current Utilization Response:", response)

        if (response.results && Array.isArray(response.results)) {
          this.current_results = response.results
        } else if (response.results) {
          this.current_results = [response.results]
        } else {
          this.current_results = [response]
        }

        this.loading = false
        this.initializeAnimations()
      },
      error: (error) => {
        this.error = error.error?.message || "Failed to fetch current utilization."
        this.loading = false
        console.error("Current Utilization Error:", error)
      },
    })
  }

  switchTab(tabIndex: number): void {
    this.selectedTab = tabIndex

    // Add tab switch animation
    this.showMetrics = false
    setTimeout(() => {
      this.showMetrics = true
      if (tabIndex === 1 && this.predictions.length > 0) {
        setTimeout(() => this.renderCharts(), 100)
      }
    }, 200)
  }

  toggleDarkMode(): void {
    this.isDarkMode = !this.isDarkMode
    document.body.classList.toggle("dark-mode", this.isDarkMode)
  }

  renderCharts(): void {
    this.predictions.forEach((pred, index) => {
      const chartId = `chart-${pred.room_id}`
      const canvas = document.getElementById(chartId) as HTMLCanvasElement

      if (!canvas) {
        console.warn(`Chart canvas not found: ${chartId}`)
        return
      }

      if (this.charts[chartId]) {
        this.charts[chartId].destroy()
      }

      const ctx = canvas.getContext("2d")
      if (!ctx) return

      // Enhanced gradient with theme colors
      const gradient = ctx.createLinearGradient(0, 0, 0, 300)
      gradient.addColorStop(0, "rgba(102, 51, 153, 0.8)")
      gradient.addColorStop(0.5, "rgba(102, 51, 153, 0.4)")
      gradient.addColorStop(1, "rgba(102, 51, 153, 0.1)")

      // Secondary gradient for line
      const lineGradient = ctx.createLinearGradient(0, 0, canvas.width, 0)
      lineGradient.addColorStop(0, "rgb(102, 51, 153)")
      lineGradient.addColorStop(0.5, "rgb(255, 102, 0)")
      lineGradient.addColorStop(1, "rgb(102, 51, 153)")

      const chartConfig: ChartConfiguration = {
        type: "line" as ChartType,
        data: {
          labels:
            pred.dates?.map((date: string) => {
              return new Date(date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            }) || [],
          datasets: [
            {
              label: "Predicted Utilization %",
              data: pred.utilization || [],
              borderColor: lineGradient,
              backgroundColor: gradient,
              borderWidth: 4,
              fill: true,
              tension: 0.4,
              pointBackgroundColor: "rgb(255, 102, 0)",
              pointBorderColor: "#ffffff",
              pointBorderWidth: 3,
              pointRadius: 8,
              pointHoverRadius: 12,
              pointHoverBackgroundColor: "rgb(255, 102, 0)",
              pointHoverBorderColor: "#ffffff",
              pointHoverBorderWidth: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            intersect: false,
            mode: "index",
          },
          plugins: {
            legend: {
              display: true,
              position: "top",
              labels: {
                font: {
                  family: "Inter, system-ui, sans-serif",
                  size: 14,
                  weight: 600,
                },
                color: this.isDarkMode ? "#ffffff" : "rgb(0, 0, 0)",
                usePointStyle: true,
                pointStyle: "circle",
                padding: 20,
              },
            },
            tooltip: {
              backgroundColor: "rgba(255, 255, 255, 0.98)",
              titleColor: "rgb(0, 0, 0)",
              bodyColor: "rgb(0, 51, 102)",
              borderColor: "rgb(102, 51, 153)",
              borderWidth: 2,
              cornerRadius: 12,
              displayColors: true,
              padding: 16,
              titleFont: {
                size: 14,
                weight: 600,
              },
              bodyFont: {
                size: 13,
                weight: 500,
              },
              callbacks: {
                title: (context) => {
                  const index = context[0].dataIndex
                  return `${pred.dates[index]} - ${pred.demand_levels[index]} Demand`
                },
                label: (context) => {
                  return `Utilization: ${context.parsed.y.toFixed(1)}%`
                },
                afterLabel: (context) => {
                  const index = context.dataIndex
                  return `Tip: ${pred.optimization_tips[index]}`
                },
              },
            },
          },
          scales: {
            x: {
              grid: {
                display: true,
                color: this.isDarkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                lineWidth: 1,
              },
              ticks: {
                font: {
                  family: "Inter, system-ui, sans-serif",
                  size: 12,
                  weight: 500,
                },
                color: this.isDarkMode ? "rgba(255, 255, 255, 0.8)" : "rgb(0, 51, 102)",
                padding: 8,
              },
            },
            y: {
              beginAtZero: true,
              max: 100,
              grid: {
                color: this.isDarkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                lineWidth: 1,
              },
              ticks: {
                callback: (value) => `${value}%`,
                font: {
                  family: "Inter, system-ui, sans-serif",
                  size: 12,
                  weight: 500,
                },
                color: this.isDarkMode ? "rgba(255, 255, 255, 0.8)" : "rgb(0, 51, 102)",
                padding: 8,
              },
            },
          },
          elements: {
            point: {
              hoverBackgroundColor: "rgb(255, 102, 0)",
              hoverBorderColor: "#ffffff",
            },
          },
          animation: {
            duration: 2000,
            easing: "easeInOutCubic",
            delay: (context) => context.dataIndex * 100,
          },
        },
      }

      this.charts[chartId] = new Chart(ctx, chartConfig)
    })
  }

  // Enhanced utility methods
  getStatusClass(status: string): string {
    const statusLower = status?.toLowerCase() || ""
    if (statusLower.includes("optimal")) return "status-optimal"
    if (statusLower.includes("over")) return "status-over-utilized"
    if (statusLower.includes("under")) return "status-under-utilized"
    return "status-under-utilized"
  }

  getDemandClass(demand: string): string {
    const demandLower = demand?.toLowerCase() || ""
    if (demandLower === "low") return "demand-low"
    if (demandLower === "medium" || demandLower === "moderate") return "demand-medium"
    if (demandLower === "high") return "demand-high"
    return "demand-low"
  }

  clearInsights(): void {
    this.current_results = []
    this.predictions = []
    this.error = ""
    this.showMetrics = false

    Object.values(this.charts).forEach((chart) => chart.destroy())
    this.charts = {}
  }

  getTooltip(demandLevels: string[]): string {
    const demandCount = demandLevels.reduce(
      (acc, level) => {
        acc[level.toLowerCase()] = (acc[level.toLowerCase()] || 0) + 1
        return acc
      },
      {} as { [key: string]: number },
    )

    return `Demand Distribution: ${Object.entries(demandCount)
      .map(([level, count]) => `${level}: ${count} days`)
      .join(", ")}`
  }

  hasCurrentData(): boolean {
    return this.current_results && this.current_results.length > 0
  }

  hasPredictionData(): boolean {
    return this.predictions && this.predictions.length > 0
  }

  getUtilizationColor(utilization: number): string {
    if (utilization >= 70) return "rgb(244, 67, 54)" // Red
    if (utilization >= 30) return "rgb(76, 175, 80)" // Green
    return "rgb(255, 152, 0)" // Orange
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
  }

  getTrendIcon(trend: string): string {
    const trendLower = trend?.toLowerCase() || ""
    if (trendLower.includes("increasing")) return "bi-trending-up"
    if (trendLower.includes("decreasing")) return "bi-trending-down"
    return "bi-arrow-right"
  }

  getRecommendationPriority(tip: string): "high" | "medium" | "low" {
    const tipLower = tip?.toLowerCase() || ""
    if (tipLower.includes("urgent") || tipLower.includes("critical")) return "high"
    if (tipLower.includes("consider") || tipLower.includes("recommended")) return "medium"
    return "low"
  }

  getMaxUtilization(utilization: number[]): number {
    if (!utilization || utilization.length === 0) return 0
    return Math.max(...utilization)
  }

  getMinUtilization(utilization: number[]): number {
    if (!utilization || utilization.length === 0) return 0
    return Math.min(...utilization)
  }

  getDemandCount(demandLevels: string[], targetLevel: string): number {
    if (!demandLevels || !Array.isArray(demandLevels)) return 0
    return demandLevels.filter((level) => level.toLowerCase() === targetLevel.toLowerCase()).length
  }

  getHighDemandCount(demandLevels: string[]): number {
    if (!demandLevels || !Array.isArray(demandLevels)) return 0
    const highDemandTypes = ["high", "very high", "critical"]
    return demandLevels.filter((level) => highDemandTypes.includes(level.toLowerCase())).length
  }

  getDemandBadgeClass(demand: string): string {
    if (!demand) return "badge-secondary"

    const demandLower = demand.toLowerCase()
    switch (demandLower) {
      case "low":
        return "badge-success"
      case "moderate":
      case "medium":
        return "badge-warning"
      case "high":
      case "very high":
        return "badge-danger"
      case "critical":
        return "badge-dark"
      default:
        return "badge-secondary"
    }
  }

  // Animation helpers
  getCardAnimationDelay(index: number): string {
    return `${index * 0.1}s`
  }

  getMetricAnimationDelay(index: number): string {
    return `${0.5 + index * 0.1}s`
  }
}
