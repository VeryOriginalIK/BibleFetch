import { TestBed } from '@angular/core/testing';

import { BibleDataService } from './data-service';

describe('BibleDataService', () => {
  let service: BibleDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BibleDataService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
