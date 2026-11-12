import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProductivityChart } from './productivity-chart';
import { TEST_PROVIDERS } from '../../../../testing/test-providers';

describe('ProductivityChart', () => {
  let component: ProductivityChart;
  let fixture: ComponentFixture<ProductivityChart>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductivityChart],
      providers: TEST_PROVIDERS
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
