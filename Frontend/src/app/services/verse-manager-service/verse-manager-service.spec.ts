import { TestBed } from '@angular/core/testing';

import { VerseManagerService } from './verse-manager-service';

describe('VerseManagerService', () => {
  let service: VerseManagerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(VerseManagerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
