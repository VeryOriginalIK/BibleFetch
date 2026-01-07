import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class StudyService {
  // A kiválasztott Strong szám (pl. "H430")
  private activeStrongIdSubject = new BehaviorSubject<string | null>(null);
  public activeStrongId$ = this.activeStrongIdSubject.asObservable();

  // Oldalsáv állapota
  private isSidebarOpenSubject = new BehaviorSubject<boolean>(false);
  public isSidebarOpen$ = this.isSidebarOpenSubject.asObservable();

  openStrongDefinition(strongId: string) {
    this.activeStrongIdSubject.next(strongId);
    this.isSidebarOpenSubject.next(true);
  }

  closeSidebar() {
    this.isSidebarOpenSubject.next(false);
    this.activeStrongIdSubject.next(null);
  }
}
