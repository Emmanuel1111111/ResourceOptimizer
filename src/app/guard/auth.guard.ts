import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../service.service';


export const canActivate: CanActivateFn= (route,state)=>{
const router=inject(Router)
const authService= inject(AuthService)
 if (authService.isLoggedIn()) {
 return true
 }
 else{
  router.navigate(['/login'])
  return false
 }

}




