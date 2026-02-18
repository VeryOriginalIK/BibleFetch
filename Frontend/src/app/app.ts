import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DefinitionModal } from './components/definition-modal/definition-modal';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, DefinitionModal],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('frontend');
}
