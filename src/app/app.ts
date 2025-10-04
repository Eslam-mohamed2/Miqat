import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from './header/header';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { Footer } from "./footer/footer";
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { NgIf } from '@angular/common';
@Component({
  selector: 'app-root',
  imports: [Header, FontAwesomeModule, Footer, RouterOutlet , NgIf] ,
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {

  protected title = 'Miqat';
  showLayout = true;

   constructor(private router: Router) {
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        // 👇 Hide header/footer on auth routes
        this.showLayout = !(event.url.startsWith('/auth'));
      });
  }
}
