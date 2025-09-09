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
import { Router } from "@angular/router"

@Component({
  selector: "app-ai-insights",
  templateUrl: "./ai-insights.component.html",
  styleUrls: ["./ai-insights.component.css"],
})
export class AiInsightsComponent implements OnInit, OnDestroy {
  @ViewChild("searchInput", { static: false }) searchInput!: ElementRef

  private destroy$ = new Subject<void>()

  
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
    private router: Router
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
  navigations(route:string){
    switch(route){
      case "dashboard":
        this.router.navigate(['/admin-dashboard']);
         break;
      case "schedules":
        this.router.navigate(['/admin/schedules']);
        break;
        case "settings":
          this.router.navigate(['/admin-dashboard']);
        break;
        case "home":
          this.router.navigate(['/admin-dashboard']);
        break;
        case "profile":
          this.router.navigate(['/admin-dashboard']);
        break;

        


    }

  }

  fetchInsights(): void {
    this.error = ""
    this.loading = true
    this.current_results = []
 
    this.cardAnimationDelay = 0

    // Add loading animation
    this.showMetrics = false

   

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
   
  }

  toggleDarkMode(): void {
    this.isDarkMode = !this.isDarkMode
    document.body.classList.toggle("dark-mode", this.isDarkMode)
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
