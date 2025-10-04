import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from './header/header';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { Footer } from "./footer/footer";

@Component({
  selector: 'app-root',
  imports: [Header, FontAwesomeModule, Footer, RouterOutlet] ,
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected title = 'Miqat';
}
