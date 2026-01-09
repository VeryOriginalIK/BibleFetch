<<<<<<< HEAD
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TopicListComponent } from './topic-list-component';

describe('TopicListComponent', () => {
  let component: TopicListComponent;
  let fixture: ComponentFixture<TopicListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TopicListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TopicListComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
=======
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TopicListComponent } from './topic-list-component';

describe('TopicListComponent', () => {
  let component: TopicListComponent;
  let fixture: ComponentFixture<TopicListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TopicListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TopicListComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
>>>>>>> 722a3c8 (add topic-viewer)
