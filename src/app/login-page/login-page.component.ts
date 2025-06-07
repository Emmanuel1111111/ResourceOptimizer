import { Component, OnInit } from '@angular/core';
import { Form, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Validator } from '@angular/forms';
import { Router } from '@angular/router';
import { last } from 'rxjs';
import { AuthService } from '../service.service';
import { RoomAvailabilityRespone, UserInfo } from '../../Environ';

@Component({
  selector: 'app-login-page',
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.css'
})
export class LoginPageComponent implements OnInit {
isloading = false;
Profile!: FormGroup;
user!:UserInfo
SignUpProfile!: FormGroup
  ngOnInit(): void {
   

  }

 constructor(private formBuilder: FormBuilder, private router: Router, private authService: AuthService) {

  
 this.Profile= this.formBuilder.group({
  username: ['', [Validators.required, Validators.minLength(3), ]],
  password: ['', [Validators.required, Validators.minLength(6)]],
  

 }) 

 this.SignUpProfile = this.formBuilder.group({
  username: ['', [Validators.required, Validators.minLength(3), ]],
  password: ['', [Validators.required, Validators.minLength(6)]],
  email: ['', [Validators.required, Validators.email]],
  rememberMe: [false]
 })

 } 


 logIn(){
  if(this.Profile.valid){
    console.log('Form Sumitted', this.Profile.value)
    this.isloading=true
    this.authService.login(this.Profile.value.username, this.Profile.value.password ).subscribe({

      next: (response)=>{
        if (response){
        const ID= response.Id
        const token= response.token || ''
        console.log('Lofin Ressponse', response.token);
        
        localStorage.setItem('userId', ID)
        localStorage.setItem('token', token)
        alert ('Login Sucessful')
        this.isloading=false
        this.router.navigate(['/admin-dashboard'])

        
      }
      
    },

    error: (err)=>{
      console.log('Login unsucesful');
      alert(`Invalid credentials ${err}`)
      


    }

    })
  }
  else{
    console.log('Login unsucesful');
    
  }
 }




 
    

SingUp() {
    if (this.SignUpProfile.valid) {
      console.log('Sign Up Form Submitted!', this.SignUpProfile.value);
      this.authService.signup(
        this.SignUpProfile.value.username,
        this.SignUpProfile.value.email,
        this.SignUpProfile.value.password
      ).subscribe({
        next: (response) => {
          if (response) {
            const id = response.Id;
            const token = response.token || '';
            console.log('Sign Up successful', response);
            localStorage.setItem('token', token);
            localStorage.setItem('userId', id || '');
            this.user = {
              ...response,
              username: response.username ?? '',
              email: response.email ?? '',
              token: response.token ?? ''
            };
            alert('Sign Up successful');
            this.router.navigate(['/admin-dashboard']);
          } else {
            console.error('Sign Up failed', response);
            alert('Sign Up failed');
          }
        },
        error: (error) => {
          console.error('Sign Up failed', error);
          alert('Sign Up failed: ' + (error?.message || 'Unknown error'));
        }
      });
    } else {
      console.log('Sign Up Form is invalid');
    }
  }

  



}
