import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from './header/header';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { Home } from './home/home';
import { Footer } from "./footer/footer";
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, FontAwesomeModule, Home, Footer],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected title = 'Miqat';
}
