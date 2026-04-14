import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProductivityChart } from './productivity-chart';

describe('ProductivityChart', () => {
  let component: ProductivityChart;
  let fixture: ComponentFixture<ProductivityChart>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductivityChart]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProductivityChart);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
