import { Component } from '@angular/core';
import { OnInit} from '@angular/core';
import { AuthService } from '../../service.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-callback',
  templateUrl: './callback.component.html',
  styleUrls: ['./callback.component.css']
})
export class CallbackComponent implements OnInit {

 async ngOnInit(){

  const  {data}=  await this.auth.supabase.auth.getSession()

   if(data?.session?.user){
    console.log("User logged in:",data?.session?.user);
     this.router.navigate(['/dashboard']);

    

   }

  else{
    console.log("No user session found, redirecting to login.");
    this.router.navigate(['/login']);

  }
 }
  constructor(private auth:AuthService, private router:Router){}

}
