import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DefinitionModal } from './definition-modal';

describe('DefinitionModal', () => {
  let component: DefinitionModal;
  let fixture: ComponentFixture<DefinitionModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DefinitionModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DefinitionModal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
