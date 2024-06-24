import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlayalongComponent } from './playalong.component';

describe('PlayalongComponent', () => {
  let component: PlayalongComponent;
  let fixture: ComponentFixture<PlayalongComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlayalongComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(PlayalongComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
