import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VerseCardComponent } from './verse-card-component';

describe('VerseCardComponent', () => {
  let component: VerseCardComponent;
  let fixture: ComponentFixture<VerseCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VerseCardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VerseCardComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
