import { TestBed } from '@angular/core/testing';

import { StrongsDataService } from './strongs-data-service';

describe('StrongsDataService', () => {
  let service: StrongsDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StrongsDataService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
