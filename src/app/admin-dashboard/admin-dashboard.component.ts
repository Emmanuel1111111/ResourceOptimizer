import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatChipsModule } from '@angular/material/chips'
import { AuthService } from '../service.service';
import { HttpClient } from '@angular/common/http';
import { api } from '../../api.config';
@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css'
})
export class AdminDashboardComponent implements OnInit {
  ngOnInit(): void {
    
  }

   sidebarOpen: boolean = false;

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }
  constructor(private route:Router){

  }

 Id= localStorage.getItem('userId')


}
